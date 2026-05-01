import { resolveEndpoint, getModel } from "./endpoint.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const { url } = resolveEndpoint();
  const model = getModel();

  const res = await fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens ?? 4096,
      ...(opts.response_format ? { response_format: opts.response_format } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Qwen endpoint returned ${res.status} ${res.statusText} (${url}): ${body.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Qwen endpoint returned no content");
  return content;
}

export async function pingEndpoint(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { url, source } = resolveEndpoint();
    const res = await fetch(`${url}/api/tags`, { method: "GET" });
    if (res.ok) {
      return { ok: true, detail: `Connected to Qwen endpoint at ${url} (source: ${source}, model: ${getModel()})` };
    }
    return { ok: false, detail: `Endpoint at ${url} returned ${res.status} ${res.statusText}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
