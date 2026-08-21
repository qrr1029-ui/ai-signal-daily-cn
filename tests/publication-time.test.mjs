import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifierSource = fs.readFileSync(path.join(root, "worker/automation/publication-time.ts"), "utf8");
const output = ts.transpileModule(verifierSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const publicationModule = { exports: {} };
new Function("exports", "module", output)(publicationModule.exports, publicationModule);
const { verifyBriefPublicationTimes, PublicationVerificationError } = publicationModule.exports;

const FIRST_PARTY = "\u4e00\u624b";
const CROSS_CHECK = "\u4ea4\u53c9\u6838\u9a8c";
const BACKGROUND = "\u5b98\u65b9\u80cc\u666f";
const window = {
  issueDate: "2026-08-21",
  startMs: Date.parse("2026-08-20T09:00:00+08:00"),
  endMs: Date.parse("2026-08-21T09:00:00+08:00"),
  windowStart: "2026-08-20T09:00:00+08:00",
  windowEnd: "2026-08-21T09:00:00+08:00",
};
const PAGE_TIME = "2026-08-20T12:34:56+08:00";

function sourceUrl(rank) {
  return `https://source-${rank}.news.test/article`;
}

function source(rank, overrides = {}) {
  return {
    label: `source ${rank}`,
    href: sourceUrl(rank),
    kind: FIRST_PARTY,
    publishedAt: "2026-08-20T10:00:00+08:00",
    ...overrides,
  };
}

function makeBrief(sourceFactory = (rank) => [source(rank)]) {
  return {
    schemaVersion: 1,
    issueId: "2026-08-21",
    issueNumber: 42,
    publishedAt: "2026-08-21T09:00:00+08:00",
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    title: "Test brief",
    titleHighlight: "Test",
    deck: "deck",
    readingMinutes: 4,
    trackScan: [],
    executiveSummary: [],
    stories: Array.from({ length: 10 }, (_, index) => {
      const rank = index + 1;
      return {
        rank,
        publishedAt: "2026-08-20T10:00:00+08:00",
        sourceState: "model authored",
        title: `Story ${rank}`,
        region: "global",
        tracks: ["AI Agent"],
        fact: "fact",
        analysis: "analysis",
        opportunity: "opportunity",
        sources: sourceFactory(rank),
      };
    }),
    trends: [],
    quote: "quote",
    quoteHighlight: "quote",
    generation: { model: "test", verifiedAt: "2026-08-21T09:00:00+08:00" },
  };
}

function evidenceFor(brief) {
  return new Set(brief.stories.flatMap((story) => story.sources.map((item) => item.href)));
}

function jsonLdHtml(timestamp = PAGE_TIME) {
  return `<!doctype html><script type="application/ld+json">${JSON.stringify({
    "@type": "NewsArticle",
    datePublished: timestamp,
    dateModified: "2026-08-21T08:59:00+08:00",
  })}</script>`;
}

function htmlResponse(body, init = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": "text/html; charset=utf-8", ...(init.headers ?? {}) },
  });
}

test("uses page metadata instead of model-authored time and records audit proofs", async () => {
  const brief = makeBrief((rank) => {
    if (rank === 1) {
      return [
        source(rank),
        source(rank, {
          label: "background",
          href: "https://background.news.test/history",
          kind: BACKGROUND,
          publishedAt: "2020-01-01T00:00:00+08:00",
        }),
      ];
    }
    if (rank === 2) {
      return [source(rank, { href: "https://arxiv.org/pdf/2608.12345.pdf" })];
    }
    return [source(rank)];
  });
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(String(url));
    if (String(url).includes("source-3")) {
      return htmlResponse(`<meta content="${PAGE_TIME}" property="article:published_time">`);
    }
    return htmlResponse(jsonLdHtml());
  };

  const result = await verifyBriefPublicationTimes(brief, evidenceFor(brief), window, { fetchFn });

  assert.equal(result.brief.stories[0].publishedAt, PAGE_TIME);
  assert.match(result.brief.stories[0].sourceState, /^\u5df2\u673a\u5668\u6838\u9a8c\uff5c\d{2}:\d{2}$/);
  assert.equal(result.brief.publishedAt, result.brief.generation.verifiedAt);
  assert.equal(result.brief.stories[0].sources[1].publishedAt, undefined);
  assert.equal(result.proofs.length, 10);
  assert.ok(calls.includes("https://arxiv.org/abs/2608.12345"));
  assert.equal(result.proofs.find((proof) => proof.rank === 3).method, "meta:article:published_time");
});

test("fails closed when a page proves the story predates the window", async () => {
  const brief = makeBrief();
  const fetchFn = async (url) => htmlResponse(jsonLdHtml(
    String(url).includes("source-5") ? "2026-08-19T12:00:00+08:00" : PAGE_TIME,
  ));

  await assert.rejects(
    verifyBriefPublicationTimes(brief, evidenceFor(brief), window, { fetchFn }),
    (error) => error instanceof PublicationVerificationError
      && /#5 verified source is outside window/.test(error.message),
  );
});

test("does not treat dateModified as publication evidence", async () => {
  const brief = makeBrief();
  const fetchFn = async (url) => htmlResponse(
    String(url).includes("source-6")
      ? '<script type="application/ld+json">{"@type":"NewsArticle","dateModified":"2026-08-20T12:00:00+08:00"}</script>'
      : jsonLdHtml(),
  );

  await assert.rejects(
    verifyBriefPublicationTimes(brief, evidenceFor(brief), window, { fetchFn }),
    (error) => error instanceof PublicationVerificationError
      && /#6 no machine-readable publication time/.test(error.message),
  );
});

test("a blocked source may fall back to another independently dated source", async () => {
  const blockedUrl = "https://blocked.news.test/story";
  const fallbackUrl = "https://fallback.news.test/story";
  const brief = makeBrief((rank) => rank === 4
    ? [
        source(rank, { href: blockedUrl }),
        source(rank, { href: fallbackUrl, kind: CROSS_CHECK }),
      ]
    : [source(rank)]);
  const fetchFn = async (url) => String(url) === blockedUrl
    ? htmlResponse("forbidden", { status: 403 })
    : htmlResponse(jsonLdHtml());

  const result = await verifyBriefPublicationTimes(brief, evidenceFor(brief), window, { fetchFn });
  assert.equal(result.brief.stories[3].publishedAt, PAGE_TIME);
  assert.equal(result.proofs.filter((proof) => proof.rank === 4).length, 1);
  assert.equal(result.proofs.find((proof) => proof.rank === 4).sourceUrl, fallbackUrl);
});

test("an unknown direct PDF cannot supply a model-trusted timestamp", async () => {
  const brief = makeBrief((rank) => rank === 7
    ? [source(rank, { href: "https://papers.news.test/research.pdf" })]
    : [source(rank)]);
  let pdfFetched = false;
  const fetchFn = async (url) => {
    if (String(url).endsWith(".pdf")) pdfFetched = true;
    return htmlResponse(jsonLdHtml());
  };

  await assert.rejects(
    verifyBriefPublicationTimes(brief, evidenceFor(brief), window, { fetchFn }),
    (error) => error instanceof PublicationVerificationError
      && /#7 no machine-readable publication time \(pdf_unverifiable\)/.test(error.message),
  );
  assert.equal(pdfFetched, false);
});
