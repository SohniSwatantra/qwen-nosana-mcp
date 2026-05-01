import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface EndpointConfig {
  url: string;
  source: "env" | "state-file";
}

export const STATE_FILE = join(homedir(), ".qwen-nosana", "current.json");

export function resolveEndpoint(): EndpointConfig {
  const envUrl = process.env.NOSANA_OLLAMA_URL?.trim();
  if (envUrl) return { url: envUrl.replace(/\/+$/, ""), source: "env" };

  if (existsSync(STATE_FILE)) {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as {
      url?: string;
    };
    if (state.url) return { url: state.url.replace(/\/+$/, ""), source: "state-file" };
  }

  throw new Error(
    `No Qwen endpoint configured.\n` +
      `Run 'npx qwen-nosana deploy --timeout 1h' to deploy Qwen3 to Nosana,\n` +
      `or set NOSANA_OLLAMA_URL to point at an existing Ollama endpoint.`,
  );
}

export function getModel(): string {
  return process.env.QWEN_MODEL?.trim() || "qwen3:30b-a3b-q8_0";
}
