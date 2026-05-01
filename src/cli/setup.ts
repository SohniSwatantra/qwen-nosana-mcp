import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..", "..");
const SKILL_SOURCE = join(PACKAGE_ROOT, "skills", "qwen-routing.md");

const CLAUDE_DIR = join(homedir(), ".claude");
const CLAUDE_SKILLS_DIR = join(CLAUDE_DIR, "skills");
const CLAUDE_SKILL_DEST = join(CLAUDE_SKILLS_DIR, "qwen-routing.md");

const CODEX_DIR = join(homedir(), ".codex");
const NOSANA_WALLET = join(homedir(), ".nosana", "nosana_key.json");

async function confirm(question: string, autoYes: boolean): Promise<boolean> {
  if (autoYes) return true;
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(`${question} [Y/n] `)).trim().toLowerCase();
  rl.close();
  return answer === "" || answer === "y" || answer === "yes";
}

export async function setup(opts: { autoYes: boolean; remove: boolean }): Promise<void> {
  if (opts.remove) {
    if (existsSync(CLAUDE_SKILL_DEST)) {
      unlinkSync(CLAUDE_SKILL_DEST);
      process.stderr.write(`[qwen-nosana setup] Removed ${CLAUDE_SKILL_DEST}\n`);
    } else {
      process.stderr.write(`[qwen-nosana setup] Skill not installed. Nothing to remove.\n`);
    }
    process.stderr.write(`[qwen-nosana setup] Note: ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md were never modified by this package.\n`);
    return;
  }

  process.stderr.write(`[qwen-nosana setup] Detecting installed agents...\n\n`);

  if (existsSync(CLAUDE_DIR)) {
    process.stderr.write(`✓ Found Claude Code at ${CLAUDE_DIR}\n`);
    if (existsSync(CLAUDE_SKILL_DEST)) {
      process.stderr.write(`  → Skill already installed at ${CLAUDE_SKILL_DEST}. Skipping.\n\n`);
    } else if (await confirm(`  Install qwen-routing skill to ${CLAUDE_SKILL_DEST}?`, opts.autoYes)) {
      mkdirSync(CLAUDE_SKILLS_DIR, { recursive: true });
      copyFileSync(SKILL_SOURCE, CLAUDE_SKILL_DEST);
      process.stderr.write(`  ✓ Installed.\n\n`);
    } else {
      process.stderr.write(`  Skipped.\n\n`);
    }
  } else {
    process.stderr.write(`✗ Claude Code not detected (no ${CLAUDE_DIR}). Skipping skill install.\n\n`);
  }

  if (existsSync(CODEX_DIR)) {
    process.stderr.write(`✓ Found Codex CLI at ${CODEX_DIR}\n`);
    process.stderr.write(`  Codex has no skill mechanism. To enable Qwen routing in Codex, paste this block into ~/.codex/AGENTS.md:\n\n`);
    const skillContent = readFileSync(SKILL_SOURCE, "utf8");
    const body = skillContent.replace(/^---[\s\S]+?---\s*/, "");
    process.stderr.write("─".repeat(60) + "\n");
    process.stdout.write(body);
    process.stderr.write("─".repeat(60) + "\n\n");
  } else {
    process.stderr.write(`✗ Codex CLI not detected (no ${CODEX_DIR}). Skipping AGENTS.md hint.\n\n`);
  }

  if (existsSync(NOSANA_WALLET)) {
    process.stderr.write(`✓ Nosana wallet found at ${NOSANA_WALLET}\n\n`);
  } else {
    process.stderr.write(
      `✗ Nosana wallet missing.\n` +
        `  To enable 'qwen-nosana deploy', run:\n` +
        `      npm install -g @nosana/cli\n` +
        `      nosana wallet create\n` +
        `      (then fund the wallet with NOS tokens — see https://docs.nosana.io)\n\n`,
    );
  }

  process.stderr.write(`[qwen-nosana setup] Done.\n`);
  process.stderr.write(`Next: 'npx qwen-nosana deploy --timeout 1h' to spin up Qwen3 on Nosana.\n`);
}
