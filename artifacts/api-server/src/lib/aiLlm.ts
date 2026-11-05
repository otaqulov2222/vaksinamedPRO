/**
 * OpenAI-compatible chat client (OpenAI / Groq / DeepSeek / NeuronAI / CoreAI / Ollama).
 * Configure via env — no hardcoded vendor lock-in.
 */

export type ChatRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: ChatRole;
  content: string;
}

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export function getLlmConfig(): LlmConfig | null {
  const apiKey = (
    process.env.VAKSINAMED_AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    ""
  ).trim();
  if (!apiKey) return null;

  const baseUrl = (
    process.env.VAKSINAMED_AI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1"
  )
    .trim()
    .replace(/\/+$/, "");

  const model = (
    process.env.VAKSINAMED_AI_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini"
  ).trim();

  const timeoutMs = Math.max(
    5000,
    Number(process.env.VAKSINAMED_AI_TIMEOUT_MS || 25000) || 25000,
  );

  return { apiKey, baseUrl, model, timeoutMs };
}

export function isLlmConfigured(): boolean {
  return getLlmConfig() != null;
}

export async function chatCompletion(
  messages: LlmMessage[],
  opts?: { temperature?: number; maxTokens?: number; responseFormatJson?: boolean },
): Promise<string | null> {
  const cfg = getLlmConfig();
  if (!cfg) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 900,
    };
    if (opts?.responseFormatJson) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[aiLlm] HTTP", res.status, errText.slice(0, 400));
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
  } catch (err) {
    console.error("[aiLlm] request failed", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
