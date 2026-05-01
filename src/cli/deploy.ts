import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeState } from "./state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PACKAGE_ROOT = resolve(__dirname, "..", "..");
const JOB_SPEC_PATH = join(PACKAGE_ROOT, "nosana", "qwen3-job.json");

const MODEL_DEFAULT = "qwen3.6:35b-a3b-q8_0";

export interface DeployOptions {
  timeoutSeconds: number;
  market?: string;
}

function checkNosanaCli(): void {
  const result = spawnSync("nosana", ["--version"], { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    throw new Error(
      `'nosana' CLI not found on PATH. Install it with:\n  npm install -g @nosana/cli\nThen run 'nosana wallet create' and fund it with NOS tokens.`,
    );
  }
}

function checkWallet(): void {
  const walletPath = join(homedir(), ".nosana", "nosana_key.json");
  if (!existsSync(walletPath)) {
    throw new Error(
      `Nosana wallet not found at ${walletPath}.\nRun 'nosana wallet create' to create one, then fund it with NOS tokens.`,
    );
  }
}

async function pollHealth(url: string, deadlineMs: number): Promise<void> {
  const start = Date.now();
  let lastErr = "";
  while (Date.now() < deadlineMs) {
    try {
      const res = await fetch(`${url}/api/tags`);
      if (res.ok) return;
      lastErr = `${res.status} ${res.statusText}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 5000));
    process.stderr.write(`  ...still waiting (${Math.round((Date.now() - start) / 1000)}s elapsed, last: ${lastErr})\n`);
  }
  throw new Error(`Endpoint at ${url} did not become healthy within ${(deadlineMs - start) / 1000}s. Last error: ${lastErr}`);
}

export async function deploy(opts: DeployOptions): Promise<void> {
  process.stderr.write(`[qwen-nosana] Pre-flight checks...\n`);
  checkNosanaCli();
  checkWallet();

  if (!existsSync(JOB_SPEC_PATH)) {
    throw new Error(`Bundled job spec missing at ${JOB_SPEC_PATH}. Reinstall qwen-nosana-mcp.`);
  }

  const args = ["job", "post", "-f", JOB_SPEC_PATH, "--timeout", String(opts.timeoutSeconds)];
  if (opts.market) args.push("--market", opts.market);

  process.stderr.write(`[qwen-nosana] Running: nosana ${args.join(" ")}\n`);
  process.stderr.write(`[qwen-nosana] (this triggers a paid Nosana job — cost ~$1.50–$3 / hour for A6000-class GPU)\n`);

  const result = spawnSync("nosana", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`nosana job post failed (exit ${result.status}):\n${result.stderr || result.stdout}`);
  }

  const stdout = result.stdout;
  process.stdout.write(stdout);

  const urlMatch = stdout.match(/https:\/\/[a-z0-9.-]+\.node\.k8s\.[a-z]+\.nos\.ci/i);
  const idMatch = stdout.match(/job\s*id[:\s]+([a-zA-Z0-9_-]+)/i) || stdout.match(/\b([0-9A-HJ-NP-Za-km-z]{43,44})\b/);

  if (!urlMatch || !idMatch) {
    throw new Error(
      `Job posted but could not parse URL/ID from nosana CLI output. Capture them manually and run:\n  echo '{"url":"<URL>","job_id":"<ID>",...}' > ~/.qwen-nosana/current.json\n\nFull output above.`,
    );
  }

  const url = urlMatch[0].replace(/\/+$/, "");
  const jobId = idMatch[1];

  process.stderr.write(`[qwen-nosana] Job posted (id=${jobId}). Polling endpoint health (cold start: 1–3 min)...\n`);
  await pollHealth(url, Date.now() + 4 * 60 * 1000);

  const now = new Date();
  writeState({
    url,
    job_id: jobId,
    deployed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + opts.timeoutSeconds * 1000).toISOString(),
    market: opts.market ?? "default",
    model: MODEL_DEFAULT,
  });

  process.stderr.write(
    `\n[qwen-nosana] ✅ Deployed!\n` +
      `    Endpoint: ${url}\n` +
      `    Job ID:   ${jobId}\n` +
      `    Auto-stops at: ${new Date(now.getTime() + opts.timeoutSeconds * 1000).toLocaleString()}\n` +
      `    State written to ~/.qwen-nosana/current.json\n\n` +
      `    The MCP will pick this up automatically. Use Claude Code or Codex normally.\n` +
      `    Run 'npx qwen-nosana stop' to terminate early and save remaining hours.\n`,
  );
}
