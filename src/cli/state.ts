import { mkdirSync, readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const STATE_DIR = join(homedir(), ".qwen-nosana");
export const STATE_FILE = join(STATE_DIR, "current.json");

export interface DeployState {
  url: string;
  job_id: string;
  deployed_at: string;
  expires_at: string;
  market: string;
  model: string;
}

export function readState(): DeployState | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as DeployState;
  } catch {
    return null;
  }
}

export function writeState(state: DeployState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function clearState(): void {
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
}
