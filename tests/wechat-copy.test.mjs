import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/wechat/page.tsx", import.meta.url);
const articleUrl = new URL("../app/wechat/wechat-article.tsx", import.meta.url);
const copyButtonUrl = new URL("../app/wechat/copy-button.tsx", import.meta.url);
const styleUrl = new URL("../app/wechat/wechat.module.css", import.meta.url);
const brandUrl = new URL("../app/brand.ts", import.meta.url);
const homeViewUrl = new URL("../app/brief-view.tsx", import.meta.url);

test("the WeChat formatter is a static noindex view of the bundled brief", async () => {
  const [page, brand, homeView] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(brandUrl, "utf8"),
    readFile(homeViewUrl, "utf8"),
  ]);

  assert.match(page, /bundledLatestBrief/);
  assert.match(page, /dynamic = "force-static"/);
  assert.match(page, /index: false/);
  assert.match(page, /follow: false/);
  assert.match(brand, /凯希的AI信号屋/);
  assert.match(brand, /NEXT_PUBLIC_BASE_PATH/);
  assert.match(homeView, /sitePath\("\/wechat\.html"\)/);
});

test("the copied article uses inline resilient formatting and keeps detailed sources on the web", async () => {
  const article = await readFile(articleUrl, "utf8");

  assert.match(article, /brief\.stories\.slice\(0, 3\)/);
  assert.match(article, /brief\.stories\.slice\(3\)/);
  assert.match(article, /backgroundColor: COLORS\.yellow/);
  assert.match(article, /完整来源与核验记录保留在网页版/);
  assert.match(article, /事实：/);
  assert.match(article, /机会 \/ 风险：/);
  assert.match(article, /boxSizing: "border-box"/);
  assert.doesNotMatch(article, /story\.sources|原文来源|fontSize: "1[12]px"/);
  assert.doesNotMatch(article, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(article, /className=/);
  assert.doesNotMatch(article, /<blockquote|<footer/);
});

test("copying prefers rich HTML and has legacy, plain-text and manual fallbacks", async () => {
  const copyButton = await readFile(copyButtonUrl, "utf8");

  assert.match(copyButton, /new ClipboardItem/);
  assert.match(copyButton, /"text\/html"/);
  assert.match(copyButton, /"text\/plain"/);
  assert.match(copyButton, /navigator\.clipboard\.write\(\[item\]\)/);
  assert.match(copyButton, /document\.execCommand\("copy"\)/);
  assert.match(copyButton, /navigator\.clipboard\.writeText/);
  assert.match(copyButton, /selectForManualCopy/);
  assert.match(copyButton, /aria-live="polite"/);
  assert.match(copyButton, /clone\.removeAttribute\("id"\)/);
});

test("the formatter remains usable on a narrow phone viewport", async () => {
  const styles = await readFile(styleUrl, "utf8");

  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /bottom: 0/);
  assert.match(styles, /position: fixed/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /\.copyButton \{[\s\S]*width: 100%/);
});
