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

const tools = [chat, summarize, extract, code];

const server = new Server(
  { name: "qwen-nosana-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  try {
    const result = await tool.handler(args);
    return { content: [{ type: "text", text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const ping = await pingEndpoint();
  if (ping.ok) {
    process.stderr.write(`[qwen-nosana-mcp] ${ping.detail}\n`);
  } else {
    process.stderr.write(
      `[qwen-nosana-mcp] WARNING: ${ping.detail}\n` +
        `[qwen-nosana-mcp] Tools will fail until you run 'npx qwen-nosana deploy --timeout 1h' or set NOSANA_OLLAMA_URL.\n`,
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `[qwen-nosana-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
