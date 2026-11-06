/**
 * OpenAI-compatible chat client (OpenAI / Groq / DeepSeek / NeuronAI / CoreAI / Ollama).
 * Production notes:
 * - Groq JSON mode often fails with usable text in `failed_generation` — we rescue it.
 * - For Groq we prefer plain completions (more reliable) unless forced.
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
  isGroq: boolean;
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

  return {
    apiKey,
    baseUrl,
    model,
    timeoutMs,
    isGroq: /groq\.com/i.test(baseUrl),
  };
}

export function isLlmConfigured(): boolean {
  return getLlmConfig() != null;
}

export function extractFailedGeneration(errText: string): string | null {
  try {
    const parsed = JSON.parse(errText) as {
      error?: { failed_generation?: string; message?: string };
    };
    const fg = parsed?.error?.failed_generation;
    if (typeof fg === "string" && fg.trim()) return fg.trim();
  } catch {
    // ignore
  }
  const m = errText.match(/"failed_generation"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (m?.[1]) {
    try {
      return JSON.parse(`"${m[1]}"`);
    } catch {
      return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  }
  return null;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function chatCompletionOnce(
  cfg: LlmConfig,
  messages: LlmMessage[],
  opts?: { temperature?: number; maxTokens?: number; responseFormatJson?: boolean },
): Promise<{ content: string | null; retryable: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      temperature: opts?.temperature ?? 0.35,
      max_tokens: opts?.maxTokens ?? 1000,
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
      const rescued = extractFailedGeneration(errText);
      if (rescued) {
        console.warn("[aiLlm] rescued failed_generation (", res.status, ")");
        return { content: rescued, retryable: false };
      }
      const retryable = res.status === 429 || res.status === 503 || res.status >= 500;
      console.error("[aiLlm] HTTP", res.status, errText.slice(0, 400));
      return { content: null, retryable };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    return {
      content: typeof content === "string" && content.trim() ? content.trim() : null,
      retryable: false,
    };
  } catch (err) {
    console.error("[aiLlm] request failed", err);
    return { content: null, retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

export async function chatCompletion(
  messages: LlmMessage[],
  opts?: { temperature?: number; maxTokens?: number; responseFormatJson?: boolean },
): Promise<string | null> {
  const cfg = getLlmConfig();
  if (!cfg) return null;

  // Groq JSON mode often drops good answers — never force json_object on Groq
  const useJson = Boolean(opts?.responseFormatJson) && !cfg.isGroq;

  let result = await chatCompletionOnce(cfg, messages, {
    ...opts,
    responseFormatJson: useJson,
  });

  if (!result.content && result.retryable) {
    await sleep(600);
    result = await chatCompletionOnce(cfg, messages, {
      ...opts,
      responseFormatJson: useJson,
    });
  }

  // If plain failed and caller wanted structure, one more plain attempt is already default for Groq.
  // If OpenAI JSON failed without rescue, try plain once.
  if (!result.content && opts?.responseFormatJson && !cfg.isGroq) {
    result = await chatCompletionOnce(cfg, messages, {
      ...opts,
      responseFormatJson: false,
    });
  }

  return result.content;
}
