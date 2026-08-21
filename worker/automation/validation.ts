import type { BriefStory, MorningBrief, SourceLink, StoryHighlight } from "../../content/types";
import type { BriefWindow } from "./contracts";
import { formatShanghaiIso } from "./window";

const TRACKS = ["AI 应用", "物理 AI", "AI+硬件", "AI 大模型", "Vibe Coding", "AI Agent"] as const;
const SOURCE_KINDS = new Set(["一手", "交叉核验", "官方背景", "现场记录", "社区信号"]);
const MULTI_LEVEL_SUFFIXES = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
const INDEPENDENT_MEDIA_DOMAINS = new Set([
  "36kr.com",
  "apnews.com",
  "bbc.com",
  "caixin.com",
  "ft.com",
  "marketscreener.com",
  "reuters.com",
  "techcrunch.com",
  "theverge.com",
  "yahoo.com",
]);
const BAD_BOUNDARY_CHARACTERS = new Set([
  "\"", "'", "“", "”", "‘", "’", "《", "》", "〈", "〉", "【", "】", "（", "）", "(", ")",
  "[", "]", "{", "}", "，", "。", "！", "!", "？", "?", "：", ":", "；", ";", "、", ",", ".",
  "…", "—", "-", " ", "\n", "\t",
]);

interface ValidationContext {
  window: BriefWindow;
  issueNumber: number;
  model: string;
  verifiedAtMs?: number;
  evidenceUrls: Set<string>;
}

function fail(message: string): never {
  throw new Error(`早报校验失败：${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, field: string, min = 1, max = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") fail(`${field} 必须是字符串`);
  const text = value.trim();
  if (text.length < min || text.length > max) fail(`${field} 长度应为 ${min}–${max} 字符`);
  return text;
}

function integerValue(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    fail(`${field} 必须是 ${min}–${max} 的整数`);
  }
  return value as number;
}

function parseTimestamp(value: string, field: string): number {
  if (!/T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail(`${field} 必须包含明确时区`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(`${field} 不是有效时间`);
  return timestamp;
}

function timestampInWindow(value: string, field: string, window: BriefWindow): number {
  const timestamp = parseTimestamp(value, field);
  if (timestamp < window.startMs || timestamp >= window.endMs) {
    fail(`${field}=${value} 不在 [${window.windowStart}, ${window.windowEnd}) 内`);
  }
  return timestamp;
}

export function normalizeEvidenceUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!hostname.includes(".") || hostname === "example.com" || hostname.endsWith(".example.com")) return null;
    let pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    if (!pathname) pathname = "/";
    return `${hostname}${pathname}`;
  } catch {
    return null;
  }
}

function sourceOrganization(rawUrl: string): string {
  const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const suffix = parts.at(-1)!;
  const secondLevel = parts.at(-2)!;
  const labelCount = suffix.length === 2 && MULTI_LEVEL_SUFFIXES.has(secondLevel) ? 3 : 2;
  return parts.slice(-labelCount).join(".");
}

function parseSource(value: unknown, field: string, window: BriefWindow): SourceLink {
  if (!isRecord(value)) fail(`${field} 必须是对象`);
  const label = stringValue(value.label, `${field}.label`, 2, 40);
  const href = stringValue(value.href, `${field}.href`, 10, 2_000);
  if (!normalizeEvidenceUrl(href)) fail(`${field}.href 不是可公开访问的 HTTP(S) 来源`);
  const kind = stringValue(value.kind, `${field}.kind`);
  if (!SOURCE_KINDS.has(kind)) fail(`${field}.kind 不在允许列表中`);
  if (kind === "一手" && INDEPENDENT_MEDIA_DOMAINS.has(sourceOrganization(href))) {
    fail(`${field} 将独立媒体误标为一手来源`);
  }

  let publishedAt: string | undefined;
  if (value.publishedAt !== null && value.publishedAt !== undefined) {
    publishedAt = stringValue(value.publishedAt, `${field}.publishedAt`, 10, 40);
    parseTimestamp(publishedAt, `${field}.publishedAt`);
    // Background sources may predate the window; selection evidence is checked per story below.
    if (kind !== "官方背景" && Date.parse(publishedAt) > window.endMs + 12 * 60 * 60 * 1_000) {
      fail(`${field}.publishedAt 晚于截稿时间过多`);
    }
  }

  return { label, href, kind: kind as SourceLink["kind"], ...(publishedAt ? { publishedAt } : {}) };
}

function parseHighlight(value: unknown, field: string): StoryHighlight | undefined {
  if (value === null || value === undefined) return undefined;
  if (!isRecord(value)) fail(`${field} 必须是对象或 null`);
  const target = stringValue(value.field, `${field}.field`);
  if (target !== "fact" && target !== "analysis" && target !== "opportunity") {
    fail(`${field}.field 不合法`);
  }
  const phrase = stringValue(value.phrase, `${field}.phrase`, 4, 28);
  return { field: target, phrase };
}

function validateMeaningfulHighlight(text: string, phrase: string, field: string): void {
  if (!text.includes(phrase)) fail(`${field} 必须逐字出现在对应正文中`);
  const chars = [...phrase];
  if (!chars.length || BAD_BOUNDARY_CHARACTERS.has(chars[0]) || BAD_BOUNDARY_CHARACTERS.has(chars.at(-1)!)) {
    fail(`${field} 不能以引号、标点或空格开头/结尾`);
  }
  if (![...phrase].some((char) => /[0-9A-Za-z\u3400-\u9fff]/.test(char))) {
    fail(`${field} 不能只包含标点`);
  }
  if (phrase === text.trim() && text.length > 12) fail(`${field} 不能高亮整段文字`);
}

function parseStory(
  value: unknown,
  index: number,
  window: BriefWindow,
  verifiedSourceState: string,
): BriefStory {
  const field = `stories[${index}]`;
  if (!isRecord(value)) fail(`${field} 必须是对象`);

  const rank = integerValue(value.rank, `${field}.rank`, 1, 10);
  if (rank !== index + 1) fail(`${field}.rank 必须按 1–10 的重要性顺序排列`);
  const publishedAt = stringValue(value.publishedAt, `${field}.publishedAt`, 10, 40);
  const storyPublishedAtMs = timestampInWindow(publishedAt, `${field}.publishedAt`, window);
  // The model-provided value is deliberately ignored. Verification time is
  // stamped by the Worker after the response and evidence checks complete.
  const sourceState = verifiedSourceState;
  const title = stringValue(value.title, `${field}.title`, 6, 42);
  const region = stringValue(value.region, `${field}.region`, 2, 16);

  if (!Array.isArray(value.tracks) || value.tracks.length < 1 || value.tracks.length > 3) {
    fail(`${field}.tracks 应包含 1–3 个赛道`);
  }
  const tracks = value.tracks.map((track, trackIndex) => {
    const parsed = stringValue(track, `${field}.tracks[${trackIndex}]`);
    if (!(TRACKS as readonly string[]).includes(parsed)) fail(`${field}.tracks 含未知赛道 ${parsed}`);
    return parsed;
  });
  if (new Set(tracks).size !== tracks.length) fail(`${field}.tracks 不得重复`);

  const fact = stringValue(value.fact, `${field}.fact`, 12, index < 3 ? 180 : 110);
  const analysis = stringValue(value.analysis, `${field}.analysis`, 10, index < 3 ? 120 : 85);
  const opportunity = stringValue(value.opportunity, `${field}.opportunity`, 8, index < 3 ? 100 : 75);
  const highlight = parseHighlight(value.highlight, `${field}.highlight`);

  if (!Array.isArray(value.sources) || value.sources.length < 2 || value.sources.length > 5) {
    fail(`${field}.sources 必须有 2–5 个来源`);
  }
  const sources = value.sources.map((source, sourceIndex) => parseSource(source, `${field}.sources[${sourceIndex}]`, window));
  const sourceUrls = sources.map((source) => normalizeEvidenceUrl(source.href)!);
  if (new Set(sourceUrls).size !== sourceUrls.length) fail(`${field}.sources 存在重复链接`);
  const sourceOrganizations = new Set(sources.map((source) => sourceOrganization(source.href)));
  if (sourceOrganizations.size < 2) fail(`${field}.sources 必须来自至少两个独立机构`);

  const nonCommunity = sources.filter((source) => source.kind !== "社区信号");
  if (nonCommunity.length < 2) fail(`${field} 不能由社区信号单独支撑`);
  if (index < 3) {
    if (!sources.some((source) => source.kind === "一手")) fail(`${field} 前三条必须含一手来源`);
    if (!sources.some((source) => source.kind === "交叉核验")) fail(`${field} 前三条必须含交叉核验来源`);
  }
  const hasWindowSource = sources.some((source) => source.publishedAt
    && Date.parse(source.publishedAt) >= window.startMs
    && Date.parse(source.publishedAt) < window.endMs
    && source.kind !== "官方背景");
  if (!hasWindowSource) fail(`${field} 至少需要一个窗口内发布的非背景来源`);
  const windowSourceTimes = sources
    .filter((source) => source.publishedAt && source.kind !== "官方背景")
    .map((source) => Date.parse(source.publishedAt!))
    .filter((timestamp) => timestamp >= window.startMs && timestamp < window.endMs);
  const nearestSourceDelta = Math.min(...windowSourceTimes.map((timestamp) => Math.abs(timestamp - storyPublishedAtMs)));
  if (nearestSourceDelta > 12 * 60 * 60 * 1_000) {
    fail(`${field}.publishedAt 与窗口内来源时间相差超过 12 小时`);
  }

  let metric: string | undefined;
  let metricNote: string | undefined;
  if (value.metric !== null && value.metric !== undefined) {
    metric = stringValue(value.metric, `${field}.metric`, 1, 30);
    metricNote = stringValue(value.metricNote, `${field}.metricNote`, 2, 60);
    if (!fact.includes(metric)) fail(`${field}.metric 必须能在事实段中找到`);
  } else if (value.metricNote !== null && value.metricNote !== undefined) {
    fail(`${field}.metricNote 不能在 metric 为空时单独存在`);
  }

  const story: BriefStory = {
    rank,
    publishedAt,
    sourceState,
    title,
    region,
    tracks,
    fact,
    analysis,
    opportunity,
    ...(highlight ? { highlight } : {}),
    sources,
    ...(metric ? { metric, metricNote } : {}),
  };

  if (highlight) validateMeaningfulHighlight(story[highlight.field], highlight.phrase, `${field}.highlight.phrase`);
  return story;
}

function buildTrackScan(stories: BriefStory[]): Array<[string, string]> {
  return TRACKS.map((track) => [track, `${stories.filter((story) => story.tracks.includes(track)).length} 条`]);
}

function assertEvidence(stories: BriefStory[], evidenceUrls: Set<string>): void {
  const normalizedEvidence = new Set(
    [...evidenceUrls].map(normalizeEvidenceUrl).filter((url): url is string => Boolean(url)),
  );
  if (!normalizedEvidence.size) fail("OpenAI web_search 未返回可核验的来源 URL");

  stories.forEach((story, index) => {
    const evidenceRequired = story.sources.filter(
      (source) => source.kind !== "官方背景" && source.kind !== "社区信号",
    );
    const unmatched = evidenceRequired.filter((source) => {
      const normalized = normalizeEvidenceUrl(source.href);
      return normalized === null || !normalizedEvidence.has(normalized);
    });
    if (unmatched.length) {
      fail(
        `stories[${index}].sources 有 ${unmatched.length} 个关键来源未出现在 web_search 证据中：`
        + unmatched.map((source) => source.label).join("、"),
      );
    }
  });
}

export function normalizeAndValidateBrief(raw: unknown, context: ValidationContext): MorningBrief {
  if (!isRecord(raw)) fail("根对象格式错误");
  if (!Array.isArray(raw.stories) || raw.stories.length !== 10) fail("必须恰好输出 10 条新闻");
  const verifiedAt = formatShanghaiIso(context.verifiedAtMs ?? Date.now());
  const verifiedSourceState = `已检索核对｜${verifiedAt.slice(11, 16)}`;
  const stories = raw.stories.map((story, index) => (
    parseStory(story, index, context.window, verifiedSourceState)
  ));

  const title = stringValue(raw.title, "title", 10, 32);
  if (title.includes(context.window.issueDate) || title.includes("AI 行业早报")) {
    fail("title 应概括当日主线，日期与早报栏目标识会由页面单独展示");
  }
  const titleHighlight = stringValue(raw.titleHighlight, "titleHighlight", 4, 24);
  validateMeaningfulHighlight(title, titleHighlight, "titleHighlight");

  const deck = stringValue(raw.deck, "deck", 16, 100);
  const readingMinutes = integerValue(raw.readingMinutes, "readingMinutes", 3, 8);

  if (!Array.isArray(raw.executiveSummary) || raw.executiveSummary.length < 2 || raw.executiveSummary.length > 3) {
    fail("executiveSummary 应有 2–3 条");
  }
  const executiveSummary = raw.executiveSummary.map((item, index) => stringValue(item, `executiveSummary[${index}]`, 12, 90));

  if (!Array.isArray(raw.trends) || raw.trends.length < 2 || raw.trends.length > 3) fail("trends 应有 2–3 条");
  const trends = raw.trends.map((item, index) => stringValue(item, `trends[${index}]`, 15, 120));
  if (!isRecord(raw.trendHighlight)) fail("trendHighlight 必须标出真正重要的趋势短语");
  const trendIndex = integerValue(raw.trendHighlight.index, "trendHighlight.index", 0, trends.length - 1);
  const trendPhrase = stringValue(raw.trendHighlight.phrase, "trendHighlight.phrase", 4, 28);
  validateMeaningfulHighlight(trends[trendIndex], trendPhrase, "trendHighlight.phrase");

  const quote = stringValue(raw.quote, "quote", 16, 90);
  const quoteHighlight = stringValue(raw.quoteHighlight, "quoteHighlight", 4, 28);
  validateMeaningfulHighlight(quote, quoteHighlight, "quoteHighlight");

  const highlightedStories = stories.filter((story) => story.highlight);
  if (highlightedStories.length < 2 || highlightedStories.length > 4) fail("新闻正文只能挑 2–4 个真正重点高亮");
  if (!highlightedStories.some((story) => story.rank <= 3)) fail("前三条中至少应有一个正文重点高亮");
  if (!highlightedStories.some((story) => story.rank >= 4)) fail("第 4–10 条中至少应有一个正文重点高亮");

  const uniqueTitles = new Set(stories.map((story) => story.title));
  if (uniqueTitles.size !== stories.length) fail("新闻标题不得重复");
  const selectedTracks = new Set(stories.flatMap((story) => story.tracks));
  if (selectedTracks.size < 4) fail("入选信息过度集中，至少应覆盖四个赛道");
  for (const track of TRACKS) {
    const count = stories.filter((story) => story.tracks.includes(track)).length;
    if (count > 4) fail(`${track} 入选 ${count} 条，信息过度集中`);
  }
  if (!stories.some((story) => story.region.includes("中国"))) fail("至少需要一条中国动态");
  if (!stories.some((story) => !story.region.includes("中国"))) fail("至少需要一条海外动态");

  const bodyLength = stories.reduce(
    (total, story) => total + story.fact.length + story.analysis.length + story.opportunity.length,
    0,
  );
  if (bodyLength > 2_600) fail(`新闻正文共 ${bodyLength} 字，超过 2600 字的精简上限`);

  assertEvidence(stories, context.evidenceUrls);

  return {
    schemaVersion: 1,
    issueId: context.window.issueDate,
    issueNumber: context.issueNumber,
    publishedAt: verifiedAt,
    windowStart: context.window.windowStart,
    windowEnd: context.window.windowEnd,
    title,
    titleHighlight,
    deck,
    readingMinutes,
    trackScan: buildTrackScan(stories),
    executiveSummary,
    stories,
    trends,
    trendHighlight: { index: trendIndex, phrase: trendPhrase },
    quote,
    quoteHighlight,
    generation: { model: context.model, verifiedAt },
  };
}
