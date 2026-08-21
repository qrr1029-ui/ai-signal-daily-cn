import type { MorningBrief, SourceLink } from "../../content/types";
import type {
  BriefWindow,
  PublicationProof,
  PublicationVerificationMethod,
} from "./contracts";

const FIRST_PARTY = "\u4e00\u624b";
const BACKGROUND = "\u5b98\u65b9\u80cc\u666f";
const COMMUNITY = "\u793e\u533a\u4fe1\u53f7";
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_REQUESTS = 40;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const MAX_SOURCES_PER_STORY = 3;

const META_DATE_KEYS = new Set([
  "article:published_time",
  "og:published_time",
  "citation_publication_date",
  "citation_date",
  "dc.date.issued",
  "dcterms.issued",
  "datepublished",
  "date.published",
  "publishdate",
  "pubdate",
]);

export interface PublicationVerificationOptions {
  fetchFn?: typeof fetch;
  concurrency?: number;
  maxRequests?: number;
  timeoutMs?: number;
  maxBodyBytes?: number;
}

interface StoryFailure {
  rank: number;
  reason: string;
}

export class PublicationVerificationError extends Error {
  readonly failures: StoryFailure[];

  constructor(failures: StoryFailure[]) {
    super(`Publication-time verification failed: ${failures
      .map((failure) => `#${failure.rank} ${failure.reason}`)
      .join("; ")}`);
    this.name = "PublicationVerificationError";
    this.failures = failures;
  }
}

interface Candidate {
  rank: number;
  sourceIndex: number;
  source: SourceLink;
}

interface ExtractedDate {
  timestamp: number;
  method: PublicationVerificationMethod;
}

type ProbeResult =
  | { ok: true; candidate: Candidate; proof: PublicationProof; timestamp: number }
  | { ok: false; candidate: Candidate; reason: string };

class RequestBudget {
  private used = 0;

  constructor(private readonly maximum: number) {}

  take(): boolean {
    if (this.used >= this.maximum) return false;
    this.used += 1;
    return true;
  }
}

function positiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || (value as number) < 1) return fallback;
  return Math.min(value as number, maximum);
}

function formatShanghaiIso(timestamp: number): string {
  const shifted = new Date(timestamp + 8 * 60 * 60 * 1_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}T${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}:${String(shifted.getUTCSeconds()).padStart(2, "0")}+08:00`;
}

function normalizeEvidenceUrl(rawUrl: string): string | null {
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

function isIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function safeHttpUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (url.port && !((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))) {
      return null;
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname.endsWith(".local")
      || hostname.endsWith(".internal")
      || hostname.includes(":")
      || isIpv4(hostname)
    ) return null;
    if (!hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

function landingPageUrl(sourceUrl: string): { url: string; directPdf: boolean } {
  const parsed = safeHttpUrl(sourceUrl);
  if (!parsed) return { url: sourceUrl, directPdf: false };
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "arxiv.org" && parsed.pathname.startsWith("/pdf/")) {
    const id = parsed.pathname.slice("/pdf/".length).replace(/\.pdf$/i, "");
    return { url: `https://arxiv.org/abs/${id}`, directPdf: false };
  }
  if (host === "openreview.net" && parsed.pathname === "/pdf" && parsed.searchParams.get("id")) {
    return { url: `https://openreview.net/forum?id=${encodeURIComponent(parsed.searchParams.get("id")!)}`, directPdf: false };
  }
  return { url: parsed.toString(), directPdf: /\.pdf$/i.test(parsed.pathname) };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=<>`]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "").trim();
  }
  return attributes;
}

function parseExplicitTimestamp(value: string): number | null {
  const text = decodeHtml(value).trim();
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
    || /\b(?:GMT|UTC)(?:[+-]\d{1,2}(?::?\d{2})?)?\b/i.test(text);
  if (!hasZone) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function collectJsonLdDates(value: unknown, results: ExtractedDate[], state: { nodes: number }, depth = 0): void {
  if (depth > 12 || state.nodes >= 2_000 || value === null || typeof value !== "object") return;
  state.nodes += 1;
  if (Array.isArray(value)) {
    for (const child of value) collectJsonLdDates(child, results, state, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === "datepublished" && typeof child === "string") {
      const timestamp = parseExplicitTimestamp(child);
      if (timestamp !== null) results.push({ timestamp, method: "jsonld:datePublished" });
    }
    collectJsonLdDates(child, results, state, depth + 1);
  }
}

function extractPublicationDate(html: string, finalUrl: string): ExtractedDate | null {
  const dates: ExtractedDate[] = [];

  const scriptPattern = /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const jsonText = decodeHtml(match[1]).replace(/^\s*<!--|-->\s*$/g, "").trim();
    try {
      collectJsonLdDates(JSON.parse(jsonText), dates, { nodes: 0 });
    } catch {
      // Invalid JSON-LD cannot prove a publication time.
    }
  }

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const key = (attributes.property || attributes.name || attributes.itemprop || attributes["http-equiv"] || "").toLowerCase();
    if (!META_DATE_KEYS.has(key) || !attributes.content) continue;
    const timestamp = parseExplicitTimestamp(attributes.content);
    if (timestamp !== null) dates.push({ timestamp, method: `meta:${key}` });
  }

  for (const match of html.matchAll(/<time\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const semanticHint = `${attributes.itemprop ?? ""} ${attributes.class ?? ""} ${attributes.id ?? ""} ${attributes.name ?? ""}`.toLowerCase();
    if (!/datepublished|publish|posted|entry-date/.test(semanticHint) || !attributes.datetime) continue;
    const timestamp = parseExplicitTimestamp(attributes.datetime);
    if (timestamp !== null) dates.push({ timestamp, method: "time:datetime" });
  }

  const githubReleaseOrCommit = /^github\.com$/i.test(new URL(finalUrl).hostname.replace(/^www\./, ""))
    && (/\/releases\/tag\//.test(new URL(finalUrl).pathname) || /\/commit\//.test(new URL(finalUrl).pathname));
  if (githubReleaseOrCommit) {
    for (const match of html.matchAll(/<relative-time\b[^>]*>/gi)) {
      const attributes = parseAttributes(match[0]);
      if (!attributes.datetime) continue;
      const timestamp = parseExplicitTimestamp(attributes.datetime);
      if (timestamp !== null) dates.push({ timestamp, method: "github:relative-time" });
    }
  }

  const deduplicated = [...new Map(dates.map((date) => [date.timestamp, date])).values()]
    .sort((left, right) => left.timestamp - right.timestamp);
  if (!deduplicated.length) return null;
  if (deduplicated.at(-1)!.timestamp - deduplicated[0].timestamp > 24 * 60 * 60 * 1_000) {
    throw new Error("conflicting_dates");
  }
  return deduplicated[0];
}

async function readLimitedBody(response: Response, maximumBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new Error("empty_body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maximumBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      const remaining = maximumBytes - total;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
  } finally {
    if (total >= maximumBytes) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function fetchPage(
  initialUrl: string,
  fetchFn: typeof fetch,
  budget: RequestBudget,
  timeoutMs: number,
  maximumBytes: number,
): Promise<{ finalUrl: string; html: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let current = safeHttpUrl(initialUrl);
  try {
    if (!current) throw new Error("unsafe_url");
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      if (!budget.take()) throw new Error("request_budget_exhausted");
      const response = await fetchFn(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,application/pdf;q=0.2,*/*;q=0.1",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.7",
          "user-agent": "AI-Signal-Daily-Publication-Verifier/1.0",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) throw new Error("redirect_rejected");
        const redirected = safeHttpUrl(new URL(location, current).toString());
        if (!redirected) throw new Error("unsafe_redirect");
        current = redirected;
        continue;
      }
      if (!response.ok) throw new Error(`http_${response.status}`);
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/pdf")) throw new Error("pdf_unverifiable");
      const bytes = await readLimitedBody(response, maximumBytes);
      if (bytes.length >= 4 && new TextDecoder().decode(bytes.slice(0, 4)) === "%PDF") {
        throw new Error("pdf_unverifiable");
      }
      const html = new TextDecoder().decode(bytes);
      if (!contentType.includes("html") && !/<(?:!doctype|html|head|meta|script)\b/i.test(html)) {
        throw new Error("non_html_response");
      }
      return { finalUrl: current.toString(), html };
    }
    throw new Error("redirect_rejected");
  } finally {
    clearTimeout(timeout);
  }
}

async function probeCandidate(
  candidate: Candidate,
  fetchFn: typeof fetch,
  budget: RequestBudget,
  timeoutMs: number,
  maximumBytes: number,
): Promise<ProbeResult> {
  const landing = landingPageUrl(candidate.source.href);
  if (landing.directPdf) return { ok: false, candidate, reason: "pdf_unverifiable" };
  try {
    const page = await fetchPage(landing.url, fetchFn, budget, timeoutMs, maximumBytes);
    const extracted = extractPublicationDate(page.html, page.finalUrl);
    if (!extracted) return { ok: false, candidate, reason: "publication_date_missing" };
    const fetchedAt = formatShanghaiIso(Date.now());
    return {
      ok: true,
      candidate,
      timestamp: extracted.timestamp,
      proof: {
        rank: candidate.rank,
        sourceUrl: candidate.source.href,
        sourceKind: candidate.source.kind,
        finalUrl: page.finalUrl,
        publishedAt: formatShanghaiIso(extracted.timestamp),
        method: extracted.method,
        fetchedAt,
      },
    };
  } catch (error) {
    const reason = error instanceof Error
      ? (error.name === "AbortError" ? "timeout" : error.message)
      : "unknown_fetch_error";
    return { ok: false, candidate, reason };
  }
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function sourcePriority(source: SourceLink): number {
  if (source.kind === FIRST_PARTY) return 0;
  if (source.kind === "\u4ea4\u53c9\u6838\u9a8c") return 1;
  if (source.kind === "\u73b0\u573a\u8bb0\u5f55") return 2;
  return 3;
}

function selectCandidates(brief: MorningBrief, evidenceUrls: Set<string>): Candidate[] {
  const normalizedEvidence = new Set(
    [...evidenceUrls].map(normalizeEvidenceUrl).filter((value): value is string => value !== null),
  );
  return brief.stories.flatMap((story) => story.sources
    .map((source, sourceIndex) => ({ rank: story.rank, sourceIndex, source }))
    .filter(({ source }) => source.kind !== BACKGROUND && source.kind !== COMMUNITY)
    .filter(({ source }) => {
      const normalized = normalizeEvidenceUrl(source.href);
      return normalized !== null && normalizedEvidence.has(normalized);
    })
    .sort((left, right) => sourcePriority(left.source) - sourcePriority(right.source))
    .slice(0, MAX_SOURCES_PER_STORY));
}

export async function verifyBriefPublicationTimes(
  brief: MorningBrief,
  evidenceUrls: Set<string>,
  window: BriefWindow,
  options: PublicationVerificationOptions = {},
): Promise<{ brief: MorningBrief; proofs: PublicationProof[] }> {
  const fetchFn = options.fetchFn ?? fetch;
  const concurrency = positiveInteger(options.concurrency, DEFAULT_CONCURRENCY, 8);
  const maximumRequests = positiveInteger(options.maxRequests, DEFAULT_MAX_REQUESTS, 100);
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 30_000);
  const maximumBytes = positiveInteger(options.maxBodyBytes, DEFAULT_MAX_BODY_BYTES, 2 * 1024 * 1024);
  const candidates = selectCandidates(brief, evidenceUrls);
  const budget = new RequestBudget(maximumRequests);
  const results = await mapConcurrent(candidates, concurrency, (candidate) => (
    probeCandidate(candidate, fetchFn, budget, timeoutMs, maximumBytes)
  ));

  const failures: StoryFailure[] = [];
  const proofs: PublicationProof[] = [];
  const winningTimestampByRank = new Map<number, number>();
  const proofBySource = new Map<string, PublicationProof>();

  for (const story of brief.stories) {
    const storyCandidates = candidates.filter((candidate) => candidate.rank === story.rank);
    const storyResults = results.filter((result) => result.candidate.rank === story.rank);
    const successes = storyResults.filter((result): result is Extract<ProbeResult, { ok: true }> => result.ok);
    if (!storyCandidates.length) {
      failures.push({ rank: story.rank, reason: "no eligible web_search source" });
      continue;
    }
    if (!successes.length) {
      const reasons = storyResults.map((result) => result.ok ? "" : result.reason).filter(Boolean).join(", ");
      failures.push({ rank: story.rank, reason: `no machine-readable publication time (${reasons || "no result"})` });
      continue;
    }
    const outside = successes.find((result) => result.timestamp < window.startMs || result.timestamp >= window.endMs);
    if (outside) {
      failures.push({ rank: story.rank, reason: `verified source is outside window (${outside.proof.publishedAt})` });
      continue;
    }
    if (story.rank <= 3 && !successes.some((result) => result.candidate.source.kind === FIRST_PARTY)) {
      failures.push({ rank: story.rank, reason: "top-three story lacks a verified first-party publication time" });
      continue;
    }

    successes.sort((left, right) => left.timestamp - right.timestamp);
    winningTimestampByRank.set(story.rank, successes[0].timestamp);
    for (const result of successes) {
      proofs.push(result.proof);
      proofBySource.set(`${story.rank}\n${normalizeEvidenceUrl(result.candidate.source.href)}`, result.proof);
    }
  }

  if (failures.length) throw new PublicationVerificationError(failures);

  const verifiedAt = formatShanghaiIso(Date.now());
  const verifiedBrief: MorningBrief = {
    ...brief,
    publishedAt: verifiedAt,
    stories: brief.stories.map((story) => ({
      ...story,
      publishedAt: formatShanghaiIso(winningTimestampByRank.get(story.rank)!),
      sourceState: `\u5df2\u673a\u5668\u6838\u9a8c\uff5c${verifiedAt.slice(11, 16)}`,
      sources: story.sources.map((source) => {
        const proof = proofBySource.get(`${story.rank}\n${normalizeEvidenceUrl(source.href)}`);
        const withoutModelTime: SourceLink = {
          label: source.label,
          href: source.href,
          kind: source.kind,
        };
        return proof ? { ...withoutModelTime, publishedAt: proof.publishedAt } : withoutModelTime;
      }),
    })),
    generation: {
      ...brief.generation,
      verifiedAt,
    },
  };

  return { brief: verifiedBrief, proofs };
}
