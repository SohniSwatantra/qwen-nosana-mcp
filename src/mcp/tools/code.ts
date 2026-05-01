import { z } from "zod";
import { chatCompletion } from "../client.js";
import { loadInput } from "../loadInput.js";

export const name = "qwen_code";

export const description =
  "Generate, explain, or review code using Qwen3 35B on Nosana. Best for bulk work: generating many functions, scaffolding boilerplate, generating fixtures/mock data, or first-pass review on a large diff. Pass file_path when reviewing or explaining an existing file. Sonnet should still handle nuanced refactors and architectural decisions.";

export const inputSchema = {
  type: "object" as const,
  properties: {
    task: {
      type: "string",
      enum: ["generate", "explain", "review"],
      description: "Which mode: generate new code, explain existing code, or review a diff/file.",
    },
    language: {
      type: "string",
      description: "Programming language (e.g. 'python', 'typescript', 'go'). Helps Qwen format output.",
    },
    file_path: {
      type: "string",
      description: "Path to the source file (for explain / review). Preferred over passing raw 'code'.",
    },
    code: {
      type: "string",
      description: "Raw source code (used if file_path absent).",
    },
    instructions: {
      type: "string",
      description:
        "Specific request, e.g. 'generate 100 unit tests for parseInvoice' or 'review for SQL injection'.",
    },
  },
  required: ["task", "language"],
};

const ArgsSchema = z.object({
  task: z.enum(["generate", "explain", "review"]),
  language: z.string().min(1),
  file_path: z.string().optional(),
  code: z.string().optional(),
  instructions: z.string().optional(),
});

export async function handler(rawArgs: unknown): Promise<string> {
  const args = ArgsSchema.parse(rawArgs);

  let content = "";
  if (args.task === "generate") {
    content = args.instructions ?? "Please describe the code to generate.";
  } else {
    content = loadInput({ file_path: args.file_path, text: args.code });
    if (args.instructions) content = `Instructions: ${args.instructions}\n\n---\n\n${content}`;
  }

  const systemPrompts: Record<typeof args.task, string> = {
    generate: `You are a precise ${args.language} code generator. Output ONLY runnable code (with brief inline comments where needed). No prose preamble, no markdown fences unless the user explicitly requests them.`,
    explain: `You are a code explainer. Read the ${args.language} code below and explain what it does, its inputs/outputs, and any non-obvious behavior. Be concise.`,
    review: `You are a code reviewer. Read the ${args.language} code below and report concrete issues (bugs, security risks, readability problems). For each, give: (1) location, (2) issue, (3) suggested fix. Skip nitpicks. If you find nothing, say so.`,
  };

  return chatCompletion(
    [
      { role: "system", content: systemPrompts[args.task] },
      { role: "user", content },
    ],
    { temperature: args.task === "generate" ? 0.2 : 0, max_tokens: 8192 },
  );
}
