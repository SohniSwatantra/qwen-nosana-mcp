import { z } from "zod";
import { chatCompletion, type ChatMessage } from "../client.js";

export const name = "qwen_chat";

export const description =
  "Open-ended chat completion against Qwen3 35B on Nosana. Use for short prompts, free-form Q&A, translation of long documents, or any case that doesn't fit summarize/extract/code. For long inputs, prefer qwen_summarize or qwen_extract.";

export const inputSchema = {
  type: "object" as const,
  properties: {
    messages: {
      type: "array",
      description: "Chat messages in OpenAI format.",
      items: {
        type: "object",
        properties: {
          role: { type: "string", enum: ["system", "user", "assistant"] },
          content: { type: "string" },
        },
        required: ["role", "content"],
      },
    },
    temperature: { type: "number", minimum: 0, maximum: 2 },
    max_tokens: { type: "integer", minimum: 1, maximum: 32768 },
  },
  required: ["messages"],
};

const ArgsSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(32768).optional(),
});

export async function handler(rawArgs: unknown): Promise<string> {
  const args = ArgsSchema.parse(rawArgs);
  const messages: ChatMessage[] = args.messages;
  return chatCompletion(messages, {
    temperature: args.temperature,
    max_tokens: args.max_tokens,
  });
}
