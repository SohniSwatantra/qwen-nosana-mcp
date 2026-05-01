#!/usr/bin/env node
import { deploy, DEFAULT_TIMEOUT_MIN, HARD_CAP_TIMEOUT_MIN } from "./deploy.js";
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
        List available Nosana GPU markets (with their addresses, GPUs, prices).

  deploy [--timeout <MINUTES>] [--market <ADDRESS>] [--name <NAME>] [--allow-long-deploy]
        Deploy Qwen3 30B-A3B Q8 to Nosana.
        --timeout    Defaults to ${DEFAULT_TIMEOUT_MIN} minutes if omitted.
                     Hard-capped at ${HARD_CAP_TIMEOUT_MIN} minutes (4 hours) for safety;
                     pass --allow-long-deploy to override.
        --market     Defaults to NVIDIA Pro 6000 SOC2 if omitted (auto-detected
                     from your account's available markets). Pass an address to override.
        --name       Optional friendly deployment name.
        --allow-long-deploy
                     Bypass the ${HARD_CAP_TIMEOUT_MIN}-minute timeout safety cap.

  stop
        Stop the active Nosana deployment and clear local state.

  status
        Show current deployment (URL, ID, time remaining).

  help
        Show this message.

SAFETY DEFAULTS (no flags needed)
  • Cost-bounded: default ${DEFAULT_TIMEOUT_MIN}-min timeout × ~\$1/hr Pro 6000 = ~\$1 max per deploy
  • Auto-stop: MCP server stops the GPU after 5 min idle (override via QWEN_IDLE_TIMEOUT_MIN env var; 0 disables)
  • Hard cap: --timeout > ${HARD_CAP_TIMEOUT_MIN} requires explicit --allow-long-deploy

EXAMPLES
  export NOSANA_API_KEY=nos_xxx_your_key
  npx qwen-nosana setup
  npx qwen-nosana deploy                     # Pro 6000 SOC2, 60 min, ~\$1 max
  npx qwen-nosana deploy --timeout 30        # 30 min on Pro 6000
  npx qwen-nosana deploy --market <ADDR>     # Different GPU market
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
      const allowLongDeploy = hasFlag(rest, "allow-long-deploy");

      let timeoutMinutes: number;
      if (!timeoutStr) {
        timeoutMinutes = DEFAULT_TIMEOUT_MIN;
        process.stderr.write(
          `[qwen-nosana] --timeout not specified, defaulting to ${DEFAULT_TIMEOUT_MIN} minutes (safe default).\n`,
        );
      } else {
        timeoutMinutes = parseInt(timeoutStr, 10);
        if (!Number.isFinite(timeoutMinutes) || timeoutMinutes < 1) {
          process.stderr.write(`error: --timeout must be a positive integer (minutes).\n`);
          process.exit(2);
        }
      }

      if (timeoutMinutes > HARD_CAP_TIMEOUT_MIN && !allowLongDeploy) {
        process.stderr.write(
          `error: --timeout ${timeoutMinutes} exceeds the safety cap of ${HARD_CAP_TIMEOUT_MIN} minutes ` +
            `(~$${(HARD_CAP_TIMEOUT_MIN / 60).toFixed(0)} of credits at ~$1/hr).\n` +
            `Pass --allow-long-deploy to override if you really mean it.\n`,
        );
        process.exit(2);
      }

      await deploy({
        timeoutMinutes,
        market,
        name: getFlag(rest, "name"),
        allowLongDeploy,
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
