/**
 * OpenAI-compatible chat client (OpenAI / Groq / DeepSeek / Ollama Cloud / …).
 * Supports primary + optional fallback provider for Uzbekistan production uptime.
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
  /** Providers that often break with response_format=json_object */
  preferPlainText: boolean;
  label: string;
}

function buildConfig(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  label: string;
}): LlmConfig | null {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) return null;
  const baseUrl = opts.baseUrl.trim().replace(/\/+$/, "");
  const model = opts.model.trim();
  if (!baseUrl || !model) return null;
  const preferPlainText = /groq\.com|ollama\.com/i.test(baseUrl);
  return {
    apiKey,
    baseUrl,
    model,
    timeoutMs: opts.timeoutMs,
    preferPlainText,
    label: opts.label,
  };
}

export function getLlmConfig(): LlmConfig | null {
  const timeoutMs = Math.max(
    5000,
    Number(process.env.VAKSINAMED_AI_TIMEOUT_MS || 35000) || 35000,
  );

  return buildConfig({
    apiKey:
      process.env.VAKSINAMED_AI_API_KEY ||
      process.env.OLLAMA_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.GROQ_API_KEY ||
      "",
    baseUrl:
      process.env.VAKSINAMED_AI_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      "https://api.openai.com/v1",
    model:
      process.env.VAKSINAMED_AI_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini",
    timeoutMs,
    label: "primary",
  });
}

export function getLlmFallbackConfig(): LlmConfig | null {
  const timeoutMs = Math.max(
    5000,
    Number(process.env.VAKSINAMED_AI_TIMEOUT_MS || 35000) || 35000,
  );

  return buildConfig({
    apiKey:
      process.env.VAKSINAMED_AI_FALLBACK_API_KEY ||
      process.env.GROQ_API_KEY ||
      "",
    baseUrl:
      process.env.VAKSINAMED_AI_FALLBACK_BASE_URL ||
      "https://api.groq.com/openai/v1",
    model:
      process.env.VAKSINAMED_AI_FALLBACK_MODEL ||
      "qwen/qwen3.8-27b",
    timeoutMs,
    label: "fallback",
  });
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
        console.warn(`[aiLlm:${cfg.label}] rescued failed_generation (`, res.status, ")");
        return { content: rescued, retryable: false };
      }
      const retryable = res.status === 429 || res.status === 503 || res.status >= 500;
      console.error(`[aiLlm:${cfg.label}] HTTP`, res.status, errText.slice(0, 400));
      return { content: null, retryable };
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string; reasoning?: string };
      }>;
    };
    const msg = data?.choices?.[0]?.message;
    const content =
      typeof msg?.content === "string" && msg.content.trim()
        ? msg.content.trim()
        : typeof msg?.reasoning === "string" && msg.reasoning.trim()
          ? msg.reasoning.trim()
          : null;
    return {
      content,
      retryable: false,
    };
  } catch (err) {
    console.error(`[aiLlm:${cfg.label}] request failed`, err);
    return { content: null, retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

async function chatWithConfig(
  cfg: LlmConfig,
  messages: LlmMessage[],
  opts?: { temperature?: number; maxTokens?: number; responseFormatJson?: boolean },
): Promise<string | null> {
  const useJson = Boolean(opts?.responseFormatJson) && !cfg.preferPlainText;

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

  if (!result.content && opts?.responseFormatJson && !cfg.preferPlainText) {
    result = await chatCompletionOnce(cfg, messages, {
      ...opts,
      responseFormatJson: false,
    });
  }

  return result.content;
}

export async function chatCompletion(
  messages: LlmMessage[],
  opts?: { temperature?: number; maxTokens?: number; responseFormatJson?: boolean },
): Promise<string | null> {
  const primary = getLlmConfig();
  if (!primary) return null;

  const content = await chatWithConfig(primary, messages, opts);
  if (content) return content;

  const fallback = getLlmFallbackConfig();
  if (!fallback) return null;
  // Avoid looping the same provider
  if (
    fallback.baseUrl === primary.baseUrl &&
    fallback.apiKey === primary.apiKey &&
    fallback.model === primary.model
  ) {
    return null;
  }

  console.warn("[aiLlm] primary failed — trying fallback provider");
  return chatWithConfig(fallback, messages, opts);
}
