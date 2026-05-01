import { z } from "zod";
import { chatCompletion } from "../client.js";
import { loadInput } from "../loadInput.js";

export const name = "qwen_extract";

export const description =
  "Extract structured JSON from unstructured text using Qwen3 35B on Nosana. Provide a JSON Schema describing the desired output shape. ALWAYS prefer file_path over text for large inputs. Useful for pulling entities, fields, or records out of logs, scraped pages, exports, or any messy text >5K tokens.";

export const inputSchema = {
  type: "object" as const,
  properties: {
    file_path: {
      type: "string",
      description: "Path to the file to extract from. Preferred over 'text' for large inputs.",
    },
    text: { type: "string", description: "Raw text to extract from. Used if file_path absent." },
    schema: {
      type: "object",
      description:
        "JSON Schema describing the desired output structure (e.g. an array of objects with named fields).",
    },
    instruction: {
      type: "string",
      description: "Optional natural-language instruction, e.g. 'extract every email and company name'.",
    },
  },
  required: ["schema"],
};

const ArgsSchema = z.object({
  file_path: z.string().optional(),
  text: z.string().optional(),
  schema: z.record(z.string(), z.unknown()),
  instruction: z.string().optional(),
});

export async function handler(rawArgs: unknown): Promise<string> {
  const args = ArgsSchema.parse(rawArgs);
  const content = loadInput({ file_path: args.file_path, text: args.text });

  const schemaStr = JSON.stringify(args.schema, null, 2);
  const instructionLine = args.instruction
    ? `\n\nInstruction: ${args.instruction}`
    : "";

  const raw = await chatCompletion(
    [
      {
        role: "system",
        content:
          `You are a precise structured-data extractor. Read the user's text and return ONLY valid JSON ` +
          `that conforms to this JSON Schema:\n\n${schemaStr}\n\n` +
          `Do not include markdown fences, commentary, or anything outside the JSON.${instructionLine}`,
      },
      { role: "user", content },
    ],
    { temperature: 0, response_format: { type: "json_object" } },
  );

  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Qwen returned invalid JSON: ${err instanceof Error ? err.message : String(err)}\n\nRaw output:\n${cleaned.slice(0, 1000)}`,
    );
  }
  return cleaned;
}
