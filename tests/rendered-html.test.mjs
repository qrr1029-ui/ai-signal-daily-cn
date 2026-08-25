import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const latestUrl = new URL("../public/data/latest.json", import.meta.url);
const viewUrl = new URL("../app/brief-view.tsx", import.meta.url);
const pageUrl = new URL("../app/page.tsx", import.meta.url);
const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const brandUrl = new URL("../app/brand.ts", import.meta.url);
const nextConfigUrl = new URL("../next.config.ts", import.meta.url);
const viteConfigUrl = new URL("../vite.config.ts", import.meta.url);
const policyUrl = new URL("../EDITORIAL_POLICY.md", import.meta.url);
const buildWrapperUrl = new URL("../scripts/build-static.mjs", import.meta.url);

async function exists(url) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

async function readLatestIssue() {
  const latest = JSON.parse(await readFile(latestUrl, "utf8"));
  const issueUrl = new URL(`../public/data/issues/${latest.issueId}.json`, import.meta.url);
  const issue = JSON.parse(await readFile(issueUrl, "utf8"));
  return { latest, issue };
}

test("the bundled JSON contains one complete, source-verified issue", async () => {
  const { latest, issue } = await readLatestIssue();

  assert.deepEqual(latest, issue);
  assert.equal(issue.issueId, issue.windowEnd.slice(0, 10));
  assert.equal(Date.parse(issue.windowEnd) - Date.parse(issue.windowStart), 24 * 60 * 60 * 1_000);
  assert.match(issue.windowStart, /^\d{4}-\d{2}-\d{2}T09:00:00\+08:00$/);
  assert.match(issue.windowEnd, /^\d{4}-\d{2}-\d{2}T09:00:00\+08:00$/);
  assert.equal(issue.stories.length, 10);
  assert.deepEqual(issue.stories.map((story) => story.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(issue.stories.every((story) => (
    Date.parse(story.publishedAt) >= Date.parse(issue.windowStart)
      && Date.parse(story.publishedAt) < Date.parse(issue.windowEnd)
  )));
  assert.ok(issue.stories.every((story) => story.sources.length >= 2));
  assert.ok(issue.stories.slice(0, 3).every((story) => (
    story.sources.some((source) => source.kind === "一手")
      && story.sources.some((source) => source.kind === "交叉核验")
  )));
});

test("highlights only a few genuinely important story phrases", async () => {
  const { issue } = await readLatestIssue();
  const highlighted = issue.stories.filter((story) => story.highlight);

  assert.ok(highlighted.length >= 2 && highlighted.length <= 4);
  assert.ok(highlighted.some((story) => story.rank <= 3));
  assert.ok(highlighted.some((story) => story.rank >= 4));
  for (const story of highlighted) {
    assert.ok(story[story.highlight.field].includes(story.highlight.phrase));
  }
  assert.ok(issue.title.includes(issue.titleHighlight));
  assert.ok(issue.trends[issue.trendHighlight.index].includes(issue.trendHighlight.phrase));
  assert.ok(issue.quote.includes(issue.quoteHighlight));
});

test("the public app is a branded static export with Pages-safe paths", async () => {
  const [view, page, layout, brand, nextConfig, viteConfig, buildWrapper] = await Promise.all([
    readFile(viewUrl, "utf8"),
    readFile(pageUrl, "utf8"),
    readFile(layoutUrl, "utf8"),
    readFile(brandUrl, "utf8"),
    readFile(nextConfigUrl, "utf8"),
    readFile(viteConfigUrl, "utf8"),
    readFile(buildWrapperUrl, "utf8"),
  ]);

  assert.match(brand, /凯希的AI信号屋/);
  assert.match(brand, /NEXT_PUBLIC_BASE_PATH/);
  assert.match(view, /SITE_NAME/);
  assert.match(view, /sitePath\("\/wechat\.html"\)/);
  assert.doesNotMatch(view, />AI Signal</);
  assert.match(page, /bundledLatestBrief/);
  assert.match(page, /const socialImage = "og-v4\.png"/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_BASE_PATH/);
  assert.doesNotMatch(page, /force-dynamic|getLatestMorningBrief/);
  assert.match(layout, /SITE_NAME/);
  assert.ok(layout.includes('replace(/\\/+$/, "")}/`'));
  assert.match(nextConfig, /output: "export"/);
  assert.match(nextConfig, /trailingSlash: false/);
  assert.match(viteConfig, /NEXT_PUBLIC_BASE_PATH/);
  assert.doesNotMatch(viteConfig, /cloudflare|wrangler|sites\(/i);
  assert.match(buildWrapper, /Build complete\./);
  assert.match(buildWrapper, /fresh\.every\(Boolean\)/);
  assert.equal(await exists(new URL("../app/api/brief/latest/route.ts", import.meta.url)), false);
  assert.equal(await exists(new URL("../app/api/health/route.ts", import.meta.url)), false);
  assert.equal(await exists(new URL("../public/og-v4.png", import.meta.url)), true);
});

test("keeps the source-first editorial method internal", async () => {
  const [view, policy] = await Promise.all([
    readFile(viewUrl, "utf8"),
    readFile(policyUrl, "utf8"),
  ]);
  assert.doesNotMatch(view, /方法与口径|时间闸门|来源链|社区只作信号/);
  assert.match(policy, /\[前一日 09:00, 当日 09:00\)/);
  assert.match(policy, /GitHub/);
  assert.match(policy, /社区信号/);
  assert.match(policy, /不得用旧闻/);
  assert.match(policy, /本期生成失败并保留上一期/);
});
