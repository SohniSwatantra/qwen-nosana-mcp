import { createNosanaClient } from "@nosana/kit";
import { clearState, readState } from "./state.js";

function getApiKey(): string {
  const key = process.env.NOSANA_API_KEY?.trim();
  if (!key) {
    throw new Error(
      `NOSANA_API_KEY env var not set. Get one at https://deploy.nosana.com → Account → API Keys.`,
    );
  }
  return key;
}

export async function stop(): Promise<void> {
  const state = readState();
  if (!state) {
    process.stderr.write(`[qwen-nosana] No active deployment recorded. Nothing to stop.\n`);
    return;
  }

  const client = createNosanaClient("mainnet", { api: { apiKey: getApiKey() } });

  process.stderr.write(`[qwen-nosana] Stopping deployment ${state.job_id}...\n`);
  try {
    const dep = await client.api.deployments.get(state.job_id);
    await dep.stop();
  } catch (err) {
    process.stderr.write(
      `[qwen-nosana] WARNING: stop call failed (${err instanceof Error ? err.message : String(err)}). ` +
        `The deployment may already be stopped or expired. Clearing local state anyway.\n`,
    );
  }
  clearState();
  process.stderr.write(`[qwen-nosana] ✅ Stopped. State cleared.\n`);
}

export function status(): void {
  const state = readState();
  if (!state) {
    process.stderr.write(`[qwen-nosana] No active deployment.\n`);
    return;
  }
  const expiresAt = new Date(state.expires_at);
  const remainingMs = expiresAt.getTime() - Date.now();
  const remainingMin = Math.floor(remainingMs / 60000);
  process.stderr.write(
    `[qwen-nosana] Active deployment:\n` +
      `    Endpoint: ${state.url}\n` +
      `    ID:       ${state.job_id}\n` +
      `    Model:    ${state.model}\n` +
      `    Market:   ${state.market}\n` +
      `    Deployed: ${new Date(state.deployed_at).toLocaleString()}\n` +
      `    Expires:  ${expiresAt.toLocaleString()} (${remainingMin > 0 ? `${remainingMin} min remaining` : "EXPIRED"})\n`,
  );
}
