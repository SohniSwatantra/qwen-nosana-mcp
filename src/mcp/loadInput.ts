import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const MAX_BYTES = 50 * 1024 * 1024;

export function loadInput(args: { file_path?: string; text?: string }): string {
  if (args.file_path) {
    const path = resolve(args.file_path);
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error(`Not a file: ${path}`);
    if (stat.size > MAX_BYTES) {
      throw new Error(
        `File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB > ${MAX_BYTES / 1024 / 1024} MB). ` +
          `Split or pre-process before passing to Qwen.`,
      );
    }
    return readFileSync(path, "utf8");
  }
  if (args.text) return args.text;
  throw new Error("Either 'file_path' or 'text' is required.");
}
