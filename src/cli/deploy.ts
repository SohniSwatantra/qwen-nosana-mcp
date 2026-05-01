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

const MODEL_DEFAULT = "qwen3:30b-a3b-q8_0";

export const DEFAULT_TIMEOUT_MIN = 60;
export const HARD_CAP_TIMEOUT_MIN = 240;
export const PRO_6000_HOURLY_USD_ESTIMATE = 1.0;

export interface DeployOptions {
  timeoutMinutes: number;
  market?: string;
  name?: string;
  allowLongDeploy?: boolean;
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

interface MarketLite {
  address: string;
  name: string;
  gpu_types?: string[];
  usd_reward_per_hour?: unknown;
  nodes?: unknown[];
}

function priceUsd(m: MarketLite): number {
  const v = m.usd_reward_per_hour;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : Infinity;
  }
  return Infinity;
}

async function findDefaultMarket(
  client: ReturnType<typeof createNosanaClient>,
): Promise<MarketLite> {
  const list = (await client.api.markets.list()) as unknown as MarketLite[];

  // Prefer Pro 6000 SOC2 (the user's validated choice). Fall back to any Pro 6000.
  // Final fallback: A6000-class.
  const pro6000Soc2 = list.filter(
    (m) => /pro\s*6000/i.test(m.name) && /soc\s*2/i.test(m.name),
  );
  const pro6000Any = list.filter((m) => /pro\s*6000/i.test(m.name));
  const a6000 = list.filter((m) => /a6000/i.test(m.name));

  const tier = pro6000Soc2.length ? pro6000Soc2 : pro6000Any.length ? pro6000Any : a6000;

  if (tier.length === 0) {
    throw new Error(
      `Could not auto-select a default market. None of the available markets match "Pro 6000" or "A6000". ` +
        `Run 'qwen-nosana markets' to see your options and pass --market <ADDRESS> explicitly.`,
    );
  }

  // Prefer cheapest within the chosen tier; ties broken by name length (shorter first as a heuristic).
  tier.sort((a, b) => priceUsd(a) - priceUsd(b) || a.name.length - b.name.length);
  return tier[0];
}

async function pollUntilRunning(
  client: ReturnType<typeof createNosanaClient>,
  id: string,
  deadlineMs: number,
): Promise<{ url: string; status: string }> {
  const startedAt = Date.now();
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
    process.stderr.write(`  ...status=${lastStatus} (${Math.round((Date.now() - startedAt) / 1000)}s elapsed)\n`);
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

  try {
    const b = await client.api.credits.balance();
    process.stderr.write(`[qwen-nosana] Credits balance: ${JSON.stringify(b)}\n`);
  } catch (err) {
    process.stderr.write(
      `[qwen-nosana] WARNING: Could not fetch credits balance (${err instanceof Error ? err.message : String(err)}). Continuing.\n`,
    );
  }

  let market: MarketLite;
  if (opts.market) {
    market = { address: opts.market, name: "(user-specified)" };
    process.stderr.write(`[qwen-nosana] Using user-specified market: ${opts.market}\n`);
  } else {
    process.stderr.write(`[qwen-nosana] No --market specified, auto-selecting Pro 6000 SOC2...\n`);
    market = await findDefaultMarket(client);
    const price = priceUsd(market);
    process.stderr.write(
      `[qwen-nosana] Selected: ${market.name} (${market.address})${
        Number.isFinite(price) ? ` — ~$${price.toFixed(2)}/hr` : ""
      }\n`,
    );
  }

  const hourlyEstimate = Number.isFinite(priceUsd(market))
    ? priceUsd(market)
    : PRO_6000_HOURLY_USD_ESTIMATE;
  const maxCostUsd = (opts.timeoutMinutes / 60) * hourlyEstimate;

  process.stderr.write(
    `\n[qwen-nosana] 💰 Cost estimate: up to ~$${maxCostUsd.toFixed(2)} of credits ` +
      `(${opts.timeoutMinutes} min × ~$${hourlyEstimate.toFixed(2)}/hr).\n` +
      `[qwen-nosana]    Cost is per-second so 'qwen-nosana stop' refunds unused time.\n` +
      `[qwen-nosana]    The MCP also auto-stops after 5 min idle by default (override via QWEN_IDLE_TIMEOUT_MIN).\n\n`,
  );

  const jobDefinition = loadJobDefinition();
  const name = opts.name ?? `qwen-nosana-${Date.now()}`;

  process.stderr.write(
    `[qwen-nosana] Creating deployment:\n` +
      `    name:     ${name}\n` +
      `    market:   ${market.address}\n` +
      `    timeout:  ${opts.timeoutMinutes} min\n` +
      `    strategy: SIMPLE\n` +
      `    model:    ${MODEL_DEFAULT}\n\n`,
  );

  const deployment = await client.api.deployments.create({
    name,
    market: market.address,
    replicas: 1,
    timeout: opts.timeoutMinutes,
    strategy: "SIMPLE",
    job_definition: jobDefinition,
  });

  process.stderr.write(`[qwen-nosana] Deployment created (id=${deployment.id}). Starting and polling...\n`);
  process.stderr.write(`[qwen-nosana] Cold start typically 1–3 min (Ollama pulling Qwen3 30B-A3B Q8 weights).\n`);

  await deployment.start();

  const { url } = await pollUntilRunning(client, deployment.id, Date.now() + 15 * 60 * 1000);

  const now = new Date();
  writeState({
    url,
    job_id: deployment.id,
    deployed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + opts.timeoutMinutes * 60 * 1000).toISOString(),
    market: market.address,
    model: MODEL_DEFAULT,
  });

  process.stderr.write(
    `\n[qwen-nosana] ✅ Deployed!\n` +
      `    Endpoint:  ${url}\n` +
      `    ID:        ${deployment.id}\n` +
      `    GPU:       ${market.name}\n` +
      `    Auto-stops: ${new Date(now.getTime() + opts.timeoutMinutes * 60 * 1000).toLocaleString()}\n` +
      `    State written to ~/.qwen-nosana/current.json\n\n` +
      `    The MCP will pick this up automatically. Use Claude Code or Codex normally.\n` +
      `    Run 'npx qwen-nosana stop' to terminate early and preserve credits.\n`,
  );
}
