#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as chat from "./tools/chat.js";
import * as summarize from "./tools/summarize.js";
import * as extract from "./tools/extract.js";
import * as code from "./tools/code.js";
import { pingEndpoint } from "./client.js";
import { getIdleTimeoutMs, stopActiveDeployment } from "./idleStop.js";

const tools = [chat, summarize, extract, code];

const server = new Server(
  { name: "qwen-nosana-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

let lastActivityAt = Date.now();
let endpointStoppedReason: string | null = null;

const idleTimeoutMs = getIdleTimeoutMs();
const idleTimeoutMin = idleTimeoutMs / 60000;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (endpointStoppedReason) {
    return {
      content: [
        {
          type: "text",
          text:
            `Qwen endpoint is no longer available: ${endpointStoppedReason}.\n` +
            `Run 'npx qwen-nosana deploy' to redeploy, or handle this task directly without offloading.`,
        },
      ],
      isError: true,
    };
  }

  lastActivityAt = Date.now();

  const { name, arguments: args } = request.params;
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  try {
    const result = await tool.handler(args);
    lastActivityAt = Date.now();
    return { content: [{ type: "text", text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

function startIdleWatcher(): NodeJS.Timeout | null {
  if (idleTimeoutMs === 0) {
    process.stderr.write(`[qwen-nosana-mcp] Auto-stop on idle DISABLED (QWEN_IDLE_TIMEOUT_MIN=0).\n`);
    return null;
  }
  if (!process.env.NOSANA_API_KEY) {
    process.stderr.write(
      `[qwen-nosana-mcp] WARNING: NOSANA_API_KEY not set — auto-stop on idle disabled. ` +
        `Set the env var to enable credit protection.\n`,
    );
    return null;
  }
  process.stderr.write(
    `[qwen-nosana-mcp] Auto-stop on idle: ${idleTimeoutMin} min (override via QWEN_IDLE_TIMEOUT_MIN, set to 0 to disable).\n`,
  );
  const interval = setInterval(async () => {
    if (endpointStoppedReason) return;
    const idleMs = Date.now() - lastActivityAt;
    if (idleMs >= idleTimeoutMs) {
      process.stderr.write(
        `[qwen-nosana-mcp] No tool calls for ${Math.round(idleMs / 60000)} min — auto-stopping deployment to save credits.\n`,
      );
      const result = await stopActiveDeployment();
      if (result.ok) {
        endpointStoppedReason = `auto-stopped after ${Math.round(idleMs / 60000)} min idle`;
        process.stderr.write(`[qwen-nosana-mcp] ✅ ${result.detail}\n`);
      } else {
        process.stderr.write(`[qwen-nosana-mcp] auto-stop attempt failed: ${result.detail}\n`);
        // Reset activity timer so we don't hammer the API every interval if this keeps failing.
        lastActivityAt = Date.now();
      }
    }
  }, 30 * 1000);
  // Don't keep the process alive solely for this timer — let stdio control the lifecycle.
  interval.unref();
  return interval;
}

async function main() {
  const ping = await pingEndpoint();
  if (ping.ok) {
    process.stderr.write(`[qwen-nosana-mcp] ${ping.detail}\n`);
  } else {
    process.stderr.write(
      `[qwen-nosana-mcp] WARNING: ${ping.detail}\n` +
        `[qwen-nosana-mcp] Tools will fail until you run 'npx qwen-nosana deploy' or set NOSANA_OLLAMA_URL.\n`,
    );
  }

  startIdleWatcher();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `[qwen-nosana-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
