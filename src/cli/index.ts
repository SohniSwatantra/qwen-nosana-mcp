#!/usr/bin/env node
import { deploy } from "./deploy.js";
import { stop, status } from "./stop.js";
import { setup } from "./setup.js";

const HELP = `qwen-nosana — companion CLI for qwen-nosana-mcp

USAGE
  qwen-nosana <command> [options]

COMMANDS
  deploy    Deploy Qwen3 35B Q8 to Nosana on an A6000-class GPU and configure the MCP.
            Options:
              --timeout <DURATION>   Required. e.g. 1h, 30m, 3600 (seconds)
              --market <NAME>        Optional. Nosana market to target.

  stop      Stop the active Nosana deployment and clear local state.

  status    Show current deployment (URL, job ID, time remaining).

  setup     Install the Claude Code Skill and print the Codex AGENTS.md block.
            Options:
              --yes                  Skip confirmation prompts.
              --remove               Uninstall the skill (does not edit user configs).

  help      Show this message.

EXAMPLES
  npx qwen-nosana setup
  npx qwen-nosana deploy --timeout 1h
  npx qwen-nosana status
  npx qwen-nosana stop

DOCS
  https://github.com/SohniSwatantra/qwen-nosana-mcp
`;

function parseDuration(d: string): number {
  const m = d.match(/^(\d+)([smh]?)$/i);
  if (!m) throw new Error(`Invalid duration: ${d}. Use e.g. 1h, 30m, 3600`);
  const n = parseInt(m[1], 10);
  const unit = (m[2] || "s").toLowerCase();
  return unit === "h" ? n * 3600 : unit === "m" ? n * 60 : n;
}

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return args[i + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "deploy": {
      const timeoutStr = getFlag(rest, "timeout");
      if (!timeoutStr) {
        process.stderr.write(`error: --timeout is required (e.g. --timeout 1h). Without it you risk a runaway GPU bill.\n`);
        process.exit(2);
      }
      await deploy({
        timeoutSeconds: parseDuration(timeoutStr),
        market: getFlag(rest, "market"),
      });
      break;
    }
    case "stop":
      await stop();
      break;
    case "status":
      status();
      break;
    case "setup":
      await setup({ autoYes: hasFlag(rest, "yes"), remove: hasFlag(rest, "remove") });
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      process.stdout.write(HELP);
      break;
    default:
      process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}`);
      process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
