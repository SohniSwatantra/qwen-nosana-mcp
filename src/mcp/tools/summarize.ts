import { z } from "zod";
import { chatCompletion } from "../client.js";
import { loadInput } from "../loadInput.js";

export const name = "qwen_summarize";

export const description =
  "Summarize a long document, PDF, log, transcript, or any text >5K tokens using Qwen3 35B on Nosana. ALWAYS prefer file_path over text — the MCP reads the file directly so the bulk content never enters Sonnet's context. Use this instead of reading and summarizing long files yourself.";

export const inputSchema = {
  type: "object" as const,
  properties: {
    file_path: {
      type: "string",
      description:
        "Absolute or relative path to the file to summarize. STRONGLY PREFERRED over passing 'text' — keeps bulk content out of your context.",
    },
    text: {
      type: "string",
      description:
        "Raw text to summarize. Only use when the content isn't in a file. If both file_path and text are supplied, file_path wins.",
    },
    style: {
      type: "string",
      enum: ["bullet", "paragraph", "tldr"],
      description: "Output format. Defaults to 'bullet'.",
    },
    focus: {
      type: "string",
      description:
        "Optional focus area, e.g. 'termination clauses' or 'security issues'. Narrows the summary.",
    },
    max_words: {
      type: "integer",
      minimum: 50,
      maximum: 5000,
      description: "Approximate word budget for the summary. Defaults to 500.",
    },
  },
};

const ArgsSchema = z.object({
  file_path: z.string().optional(),
  text: z.string().optional(),
  style: z.enum(["bullet", "paragraph", "tldr"]).default("bullet"),
  focus: z.string().optional(),
  max_words: z.number().int().min(50).max(5000).default(500),
});

export async function handler(rawArgs: unknown): Promise<string> {
  const args = ArgsSchema.parse(rawArgs);
  const content = loadInput({ file_path: args.file_path, text: args.text });

  const styleInstruction = {
    bullet: "Respond with a concise bullet-point summary.",
    paragraph: "Respond with a flowing prose summary.",
    tldr: "Respond with a one-paragraph TL;DR followed by 5-10 key bullets.",
  }[args.style];

  const focusLine = args.focus ? `\n\nFocus specifically on: ${args.focus}` : "";

  return chatCompletion(
    [
      {
        role: "system",
        content: `You are a precise summarizer. ${styleInstruction} Aim for roughly ${args.max_words} words.${focusLine}`,
      },
      { role: "user", content },
    ],
    { max_tokens: Math.min(args.max_words * 4, 8192) },
  );
}
