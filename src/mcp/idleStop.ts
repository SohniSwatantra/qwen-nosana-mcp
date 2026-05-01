import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STATE_FILE = join(homedir(), ".qwen-nosana", "current.json");

export interface AutoStopResult {
  ok: boolean;
  detail: string;
}

export function getIdleTimeoutMs(): number {
  const raw = process.env.QWEN_IDLE_TIMEOUT_MIN?.trim();
  if (raw === undefined) return 5 * 60 * 1000;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 5 * 60 * 1000;
  return n * 60 * 1000;
}

export async function stopActiveDeployment(): Promise<AutoStopResult> {
  if (!existsSync(STATE_FILE)) {
    return { ok: false, detail: "no active deployment in state file" };
  }
  const apiKey = process.env.NOSANA_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, detail: "NOSANA_API_KEY not set in MCP env — cannot auto-stop" };
  }

  let state: { job_id?: string };
  try {
    state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch (err) {
    return { ok: false, detail: `could not read state file: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!state.job_id) return { ok: false, detail: "state file has no job_id" };

  const { createNosanaClient } = await import("@nosana/kit");
  try {
    const client = createNosanaClient("mainnet", { api: { apiKey } });
    const dep = await client.api.deployments.get(state.job_id);
    await dep.stop();
  } catch (err) {
    return {
      ok: false,
      detail: `stop call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  } catch {
    // ignore — state file cleanup is best-effort
  }

  return { ok: true, detail: `deployment ${state.job_id} stopped, state cleared` };
}
