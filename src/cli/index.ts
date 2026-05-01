#!/usr/bin/env node
import { deploy } from "./deploy.js";
import { stop, status } from "./stop.js";
import { setup } from "./setup.js";
import { listMarkets } from "./markets.js";

const HELP = `qwen-nosana — companion CLI for qwen-nosana-mcp

USAGE
  qwen-nosana <command> [options]

PREREQUISITES
  Set NOSANA_API_KEY in your environment. Get one at:
    https://deploy.nosana.com → Account → API Keys → Create Key
  No NOS tokens or wallet needed — credits on your Nosana account fund deployments.

COMMANDS
  setup [--yes] [--remove]
        Install the Claude Code Skill (~/.claude/skills/qwen-routing.md).
        Prints recommended block for ~/.codex/AGENTS.md if Codex is installed.
        Verifies NOSANA_API_KEY is present and gives instructions if not.

  markets
        List available Nosana GPU markets (with their addresses).
        Pick one with A6000-class hardware (48 GB+ VRAM) for Qwen3 35B Q8.

  deploy --timeout <MINUTES> --market <ADDRESS> [--name <NAME>]
        Deploy Qwen3 35B Q8 to Nosana on the chosen market.
        --timeout MUST be in minutes (e.g. 60 for one hour).
        --market is required — use 'qwen-nosana markets' to pick.

  stop
        Stop the active Nosana deployment and clear local state.

  status
        Show current deployment (URL, ID, time remaining).

  help
        Show this message.

EXAMPLES
  export NOSANA_API_KEY=nos_xxx_your_key
  npx qwen-nosana setup
  npx qwen-nosana markets
  npx qwen-nosana deploy --timeout 60 --market <A6000_MARKET_ADDRESS>
  npx qwen-nosana status
  npx qwen-nosana stop

DOCS
  https://github.com/SohniSwatantra/qwen-nosana-mcp
`;

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
      const market = getFlag(rest, "market");
      if (!timeoutStr) {
        process.stderr.write(`error: --timeout <MINUTES> is required (e.g. --timeout 60).\n`);
        process.exit(2);
      }
      if (!market) {
        process.stderr.write(
          `error: --market <ADDRESS> is required.\n` +
            `Run 'qwen-nosana markets' to list available markets, or browse https://deploy.nosana.com/markets.\n`,
        );
        process.exit(2);
      }
      const timeoutMinutes = parseInt(timeoutStr, 10);
      if (!Number.isFinite(timeoutMinutes) || timeoutMinutes < 1) {
        process.stderr.write(`error: --timeout must be a positive integer in minutes.\n`);
        process.exit(2);
      }
      await deploy({
        timeoutMinutes,
        market,
        name: getFlag(rest, "name"),
      });
      break;
    }
    case "stop":
      await stop();
      break;
    case "status":
      status();
      break;
    case "markets":
      await listMarkets();
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
