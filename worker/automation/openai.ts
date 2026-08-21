import type { BriefWindow, GenerationEnv, OpenAIGenerationResult } from "./contracts";
import { buildBriefInput } from "./prompt";
import { verifyBriefPublicationTimes } from "./publication-time";
import { morningBriefJsonSchema } from "./schema";
import { normalizeAndValidateBrief } from "./validation";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const REQUEST_TIMEOUT_MS = 5 * 60 * 1_000;
const MAX_WEB_SEARCH_CALLS = 30;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function extractOutputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const parts: string[] = [];
  if (!Array.isArray(payload.output)) return "";
  for (const rawItem of payload.output) {
    const item = asRecord(rawItem);
    if (!item || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const rawContent of item.content) {
      const content = asRecord(rawContent);
      if (!content) continue;
      if (content.type === "refusal") {
        throw new Error(`OpenAI 拒绝生成：${String(content.refusal ?? "未说明原因")}`);
      }
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("");
}

function addUrl(value: unknown, urls: Set<string>): void {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) urls.add(value);
}

/** Collect only tool evidence/citation metadata, never URLs copied from JSON text. */
function extractEvidenceUrls(payload: Record<string, unknown>): Set<string> {
  const urls = new Set<string>();
  if (!Array.isArray(payload.output)) return urls;

  for (const rawItem of payload.output) {
    const item = asRecord(rawItem);
    if (!item) continue;

    if (item.type === "web_search_call") {
      const action = asRecord(item.action);
      if (action && Array.isArray(action.sources)) {
        for (const rawSource of action.sources) {
          const source = asRecord(rawSource);
          if (source) addUrl(source.url, urls);
        }
      }
    }

    if (item.type === "message" && Array.isArray(item.content)) {
      for (const rawContent of item.content) {
        const content = asRecord(rawContent);
        if (!content || !Array.isArray(content.annotations)) continue;
        for (const rawAnnotation of content.annotations) {
          const annotation = asRecord(rawAnnotation);
          if (!annotation || annotation.type !== "url_citation") continue;
          addUrl(annotation.url, urls);
        }
      }
    }
  }
  return urls;
}

async function readResponseBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI 返回了非 JSON 响应（HTTP ${response.status}）`);
  }
  const record = asRecord(parsed);
  if (!record) throw new Error("OpenAI 响应根对象格式错误");
  if (!response.ok) {
    const error = asRecord(record.error);
    const message = typeof error?.message === "string" ? error.message.slice(0, 500) : `HTTP ${response.status}`;
    throw new Error(`OpenAI 请求失败：${message}`);
  }
  return record;
}

export async function generateBriefWithOpenAI(
  env: GenerationEnv,
  window: BriefWindow,
  issueNumber: number,
): Promise<OpenAIGenerationResult> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("缺少 OPENAI_API_KEY，无法执行云端采集与生成");
  const model = env.OPENAI_MODEL?.trim() || "gpt-5.6-terra";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        store: false,
        input: buildBriefInput(window, issueNumber, model),
        tools: [
          {
            type: "web_search",
            search_context_size: "high",
            user_location: {
              type: "approximate",
              country: "CN",
              city: "Shanghai",
              region: "Shanghai",
              timezone: "Asia/Shanghai",
            },
          },
        ],
        tool_choice: "required",
        max_tool_calls: MAX_WEB_SEARCH_CALLS,
        include: ["web_search_call.action.sources"],
        max_output_tokens: 16_000,
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "ai_industry_morning_brief",
            description: "A source-verified, decision-oriented Chinese AI industry morning brief.",
            strict: true,
            schema: morningBriefJsonSchema,
          },
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenAI 采集与生成超过 5 分钟，已中止且不会替换旧版");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await readResponseBody(response);
  if (payload.status === "incomplete") {
    throw new Error(`OpenAI 生成未完成：${JSON.stringify(payload.incomplete_details ?? {})}`);
  }
  if (payload.status === "failed") {
    throw new Error("OpenAI 生成失败");
  }

  const outputText = extractOutputText(payload).trim();
  if (!outputText) throw new Error("OpenAI 未返回结构化早报正文");
  let rawBrief: unknown;
  try {
    rawBrief = JSON.parse(outputText);
  } catch {
    throw new Error("OpenAI 的结构化早报不是有效 JSON");
  }

  const evidenceUrls = extractEvidenceUrls(payload);
  const normalizedBrief = normalizeAndValidateBrief(rawBrief, {
    window,
    issueNumber,
    model,
    evidenceUrls,
  });
  const publicationVerification = await verifyBriefPublicationTimes(
    normalizedBrief,
    evidenceUrls,
    window,
  );

  return {
    brief: publicationVerification.brief,
    evidenceUrls,
    publicationProofs: publicationVerification.proofs,
    ...(typeof payload.id === "string" ? { responseId: payload.id } : {}),
    ...(payload.usage !== undefined ? { usage: payload.usage } : {}),
  };
}
