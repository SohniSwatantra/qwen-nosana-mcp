import { spawnSync } from "node:child_process";
import { clearState, readState } from "./state.js";

export async function stop(): Promise<void> {
  const state = readState();
  if (!state) {
    process.stderr.write(`[qwen-nosana] No active deployment recorded. Nothing to stop.\n`);
    return;
  }

  process.stderr.write(`[qwen-nosana] Stopping job ${state.job_id}...\n`);
  const result = spawnSync("nosana", ["job", "stop", state.job_id], { encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    process.stderr.write(
      `[qwen-nosana] WARNING: 'nosana job stop' exited with code ${result.status}. ` +
        `The job may already be stopped or expired. Clearing local state anyway.\n`,
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
      `    Job ID:   ${state.job_id}\n` +
      `    Model:    ${state.model}\n` +
      `    Deployed: ${new Date(state.deployed_at).toLocaleString()}\n` +
      `    Expires:  ${expiresAt.toLocaleString()} (${remainingMin > 0 ? `${remainingMin} min remaining` : "EXPIRED"})\n`,
  );
}
