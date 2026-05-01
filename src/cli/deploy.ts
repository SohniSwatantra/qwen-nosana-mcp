import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNosanaClient } from "@nosana/kit";
import type { JobDefinition } from "@nosana/kit";
import { writeState } from "./state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PACKAGE_ROOT = resolve(__dirname, "..", "..");
const JOB_SPEC_PATH = join(PACKAGE_ROOT, "nosana", "qwen3-job.json");

const MODEL_DEFAULT = "qwen3.6:35b-a3b-q8_0";

export interface DeployOptions {
  timeoutMinutes: number;
  market: string;
  name?: string;
}

function getApiKey(): string {
  const key = process.env.NOSANA_API_KEY?.trim();
  if (!key) {
    throw new Error(
      `NOSANA_API_KEY env var not set.\n` +
        `Get an API key at https://deploy.nosana.com → Account → API Keys → Create Key.\n` +
        `Then set it in your shell:\n` +
        `    export NOSANA_API_KEY=nos_xxx_your_key`,
    );
  }
  return key;
}

function loadJobDefinition(): JobDefinition {
  if (!existsSync(JOB_SPEC_PATH)) {
    throw new Error(`Bundled job spec missing at ${JOB_SPEC_PATH}. Reinstall qwen-nosana-mcp.`);
  }
  return JSON.parse(readFileSync(JOB_SPEC_PATH, "utf8")) as JobDefinition;
}

async function pollUntilRunning(
  client: ReturnType<typeof createNosanaClient>,
  id: string,
  deadlineMs: number,
): Promise<{ url: string; status: string }> {
  let lastStatus = "STARTING";
  while (Date.now() < deadlineMs) {
    const dep = await client.api.deployments.get(id);
    lastStatus = dep.status;
    if (dep.status === "RUNNING" && dep.endpoints?.length > 0) {
      const url = dep.endpoints[0].url;
      return { url, status: dep.status };
    }
    if (dep.status === "ERROR" || dep.status === "STOPPED" || dep.status === "ARCHIVED") {
      throw new Error(`Deployment ${id} entered terminal status ${dep.status} before becoming healthy.`);
    }
    if (dep.status === "INSUFFICIENT_FUNDS") {
      throw new Error(
        `Deployment ${id} stopped: INSUFFICIENT_FUNDS. Top up credits at https://deploy.nosana.com/account.`,
      );
    }
    process.stderr.write(`  ...status=${lastStatus} (${Math.round((Date.now() - (deadlineMs - 5 * 60 * 1000)) / 1000)}s elapsed)\n`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(
    `Deployment ${id} did not become RUNNING within timeout. Last status: ${lastStatus}. ` +
      `Check https://deploy.nosana.com/deployments/${id} for details.`,
  );
}

export async function deploy(opts: DeployOptions): Promise<void> {
  const apiKey = getApiKey();

  process.stderr.write(`[qwen-nosana] Connecting to Nosana API...\n`);
  const client = createNosanaClient("mainnet", { api: { apiKey } });

  let balance: { credits: number } | undefined;
  try {
    const b = await client.api.credits.balance();
    balance = b as unknown as { credits: number };
    process.stderr.write(`[qwen-nosana] Credits balance: ${JSON.stringify(b)}\n`);
  } catch (err) {
    process.stderr.write(
      `[qwen-nosana] WARNING: Could not fetch credits balance (${err instanceof Error ? err.message : String(err)}). Continuing.\n`,
    );
  }

  const jobDefinition = loadJobDefinition();
  const name = opts.name ?? `qwen-nosana-${Date.now()}`;

  process.stderr.write(
    `\n[qwen-nosana] Creating deployment:\n` +
      `    name:     ${name}\n` +
      `    market:   ${opts.market}\n` +
      `    timeout:  ${opts.timeoutMinutes} min\n` +
      `    strategy: SIMPLE\n` +
      `    model:    ${MODEL_DEFAULT}\n\n` +
      `[qwen-nosana] (this draws down your credit balance — ~$1.50–$3 / hour for A6000-class GPU)\n\n`,
  );

  const deployment = await client.api.deployments.create({
    name,
    market: opts.market,
    replicas: 1,
    timeout: opts.timeoutMinutes,
    strategy: "SIMPLE",
    job_definition: jobDefinition,
  });

  process.stderr.write(`[qwen-nosana] Deployment created (id=${deployment.id}). Starting and polling...\n`);
  process.stderr.write(`[qwen-nosana] Cold start typically 1–3 min (Ollama pulling Qwen3 35B Q8 weights).\n`);

  await deployment.start();

  const { url } = await pollUntilRunning(client, deployment.id, Date.now() + 5 * 60 * 1000);

  const now = new Date();
  writeState({
    url,
    job_id: deployment.id,
    deployed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + opts.timeoutMinutes * 60 * 1000).toISOString(),
    market: opts.market,
    model: MODEL_DEFAULT,
  });

  process.stderr.write(
    `\n[qwen-nosana] ✅ Deployed!\n` +
      `    Endpoint:  ${url}\n` +
      `    ID:        ${deployment.id}\n` +
      `    Auto-stops: ${new Date(now.getTime() + opts.timeoutMinutes * 60 * 1000).toLocaleString()}\n` +
      `    State written to ~/.qwen-nosana/current.json\n\n` +
      `    The MCP will pick this up automatically. Use Claude Code or Codex normally.\n` +
      `    Run 'npx qwen-nosana stop' to terminate early and preserve credits.\n`,
  );
}
