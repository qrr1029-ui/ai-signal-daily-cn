import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function transpileCommonJs(path) {
  return ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
}

function loadCommonJs(source, filename, customRequire = require) {
  const cjsModule = { exports: {} };
  new Function("exports", "require", "module", "__filename", "__dirname", source)(
    cjsModule.exports,
    customRequire,
    cjsModule,
    filename,
    dirname(filename),
  );
  return cjsModule.exports;
}

const windowPath = join(root, "worker", "automation", "window.ts");
const windowModule = loadCommonJs(transpileCommonJs(windowPath), windowPath);
const generatorPath = join(root, "scripts", "generate-daily.ts");
const generatorModule = loadCommonJs(
  transpileCommonJs(generatorPath),
  generatorPath,
  (specifier) => {
    if (specifier === "../worker/automation/window") return windowModule;
    if (specifier === "../worker/automation/openai") {
      return { generateBriefWithOpenAI: async () => { throw new Error("unexpected real OpenAI call"); } };
    }
    return require(specifier);
  },
);

const { runDailyGeneration, selectBriefWindow } = generatorModule;

function makeBrief(issueId, issueNumber, window) {
  const publishedAt = `${issueId}T09:05:00+08:00`;
  return {
    schemaVersion: 1,
    issueId,
    issueNumber,
    publishedAt,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    title: `第 ${issueNumber} 期测试早报标题`,
    titleHighlight: "测试早报",
    deck: "用于验证静态发布事务的测试内容。",
    readingMinutes: 4,
    trackScan: [],
    executiveSummary: ["测试摘要一", "测试摘要二"],
    stories: Array.from({ length: 10 }, (_, index) => ({
      rank: index + 1,
      publishedAt: `${issueId}T08:00:00+08:00`,
      sourceState: "已机器核验｜09:05",
      title: `测试新闻 ${index + 1}`,
      region: index ? "美国" : "中国",
      tracks: ["AI 应用"],
      fact: "这是经过核验的测试事实。",
      analysis: "这是测试判断。",
      opportunity: "这是测试机会。",
      sources: [],
    })),
    trends: ["测试趋势一", "测试趋势二"],
    trendHighlight: { index: 0, phrase: "测试趋势" },
    quote: "这是一句用于自动化测试的原创金句。",
    quoteHighlight: "自动化测试",
    generation: { model: "test-model", verifiedAt: publishedAt },
  };
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function snapshotTree(directory) {
  if (!await exists(directory)) return [];
  const results = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else results.push([relative(directory, path), await readFile(path, "utf8")]);
    }
  }
  await walk(directory);
  return results.sort(([left], [right]) => left.localeCompare(right));
}

async function temporaryDataRoot(t) {
  const directory = await mkdtemp(join(tmpdir(), "ai-brief-generator-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, "public", "data");
}

test("selects the latest completed Beijing [09:00, 09:00) window", () => {
  const before = selectBriefWindow(Date.parse("2026-08-21T08:59:59+08:00"));
  assert.equal(before.issueDate, "2026-08-20");
  const after = selectBriefWindow(Date.parse("2026-08-21T09:07:00+08:00"));
  assert.equal(after.issueDate, "2026-08-21");
  assert.equal(after.windowStart, "2026-08-20T09:00:00+08:00");
  assert.equal(after.windowEnd, "2026-08-21T09:00:00+08:00");
});

test("an existing issue never invokes OpenAI and repairs static pointers once", async (t) => {
  const dataRoot = await temporaryDataRoot(t);
  const nowMs = Date.parse("2026-08-21T09:07:00+08:00");
  const window = windowModule.deriveBriefWindow(nowMs);
  await writeJson(join(dataRoot, "issues", "2026-08-21.json"), makeBrief("2026-08-21", 3, window));
  let calls = 0;

  const result = await runDailyGeneration({
    dataRoot,
    nowMs,
    generateBrief: async () => {
      calls += 1;
      throw new Error("must not run");
    },
  });

  assert.equal(result.status, "existing");
  assert.equal(result.issueDate, "2026-08-21");
  assert.equal(result.dataChanged, true);
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
  assert.equal(calls, 0);
  assert.equal(JSON.parse(await readFile(join(dataRoot, "latest.json"), "utf8")).issueId, "2026-08-21");
  assert.equal(JSON.parse(await readFile(join(dataRoot, "issues", "index.json"), "utf8")).issues[0].issueId, "2026-08-21");

  const afterRepair = await snapshotTree(dataRoot);
  const second = await runDailyGeneration({
    dataRoot,
    nowMs,
    generateBrief: async () => {
      calls += 1;
      throw new Error("must not run");
    },
  });
  assert.equal(second.dataChanged, false);
  assert.equal(calls, 0);
  assert.deepEqual(await snapshotTree(dataRoot), afterRepair);
});

test("a generation failure makes zero filesystem changes", async (t) => {
  const dataRoot = await temporaryDataRoot(t);
  const previousWindow = windowModule.deriveBriefWindow(Date.parse("2026-08-20T09:00:00+08:00"));
  const previous = makeBrief("2026-08-20", 2, previousWindow);
  await writeJson(join(dataRoot, "latest.json"), previous);
  await writeJson(join(dataRoot, "issues", "2026-08-20.json"), previous);
  await writeJson(join(dataRoot, "issues", "index.json"), [{ issueId: previous.issueId, issueNumber: 2 }]);
  const before = await snapshotTree(dataRoot);

  await assert.rejects(
    runDailyGeneration({
      dataRoot,
      nowMs: Date.parse("2026-08-21T09:07:00+08:00"),
      generateBrief: async () => { throw new Error("generation failed"); },
    }),
    /generation failed/,
  );

  assert.deepEqual(await snapshotTree(dataRoot), before);
});

test("a verified issue atomically updates issue, latest, index and public audit", async (t) => {
  const dataRoot = await temporaryDataRoot(t);
  const previousWindow = windowModule.deriveBriefWindow(Date.parse("2026-08-20T09:00:00+08:00"));
  const previous = makeBrief("2026-08-20", 2, previousWindow);
  await writeJson(join(dataRoot, "latest.json"), previous);
  await writeJson(join(dataRoot, "issues", "2026-08-20.json"), previous);
  await writeJson(join(dataRoot, "issues", "index.json"), [{ issueId: previous.issueId, issueNumber: 2 }]);

  let receivedIssueNumber;
  const result = await runDailyGeneration({
    dataRoot,
    nowMs: Date.parse("2026-08-21T09:22:00+08:00"),
    env: { OPENAI_API_KEY: "test-only", OPENAI_MODEL: "test-model" },
    generateBrief: async (_env, window, issueNumber) => {
      receivedIssueNumber = issueNumber;
      return {
        brief: makeBrief(window.issueDate, issueNumber, window),
        evidenceUrls: new Set(["https://source.example/news", "https://cross.example/news"]),
        publicationProofs: [{
          rank: 1,
          sourceUrl: "https://source.example/news",
          sourceKind: "一手",
          finalUrl: "https://source.example/news",
          publishedAt: "2026-08-21T08:00:00+08:00",
          method: "jsonld:datePublished",
          fetchedAt: "2026-08-21T09:04:00+08:00",
        }],
        responseId: "must-not-be-public",
        usage: { input_tokens: 999 },
      };
    },
  });

  assert.equal(receivedIssueNumber, 3);
  assert.equal(result.status, "generated");
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
  const latest = JSON.parse(await readFile(join(dataRoot, "latest.json"), "utf8"));
  assert.equal(latest.issueId, "2026-08-21");
  const index = JSON.parse(await readFile(join(dataRoot, "issues", "index.json"), "utf8"));
  assert.equal(index.schemaVersion, 1);
  assert.deepEqual(index.issues.map((entry) => entry.issueId), ["2026-08-21", "2026-08-20"]);
  const auditText = await readFile(join(dataRoot, "audits", "2026-08-21.json"), "utf8");
  const audit = JSON.parse(auditText);
  assert.equal(audit.evidenceUrlCount, 2);
  assert.equal(audit.publicationProofs.length, 1);
  assert.doesNotMatch(auditText, /must-not-be-public|input_tokens/);
  assert.equal((await snapshotTree(dataRoot)).some(([name]) => name.endsWith(".tmp")), false);
});

test("a future manual issue is rejected before generation", async (t) => {
  const dataRoot = await temporaryDataRoot(t);
  let calls = 0;
  await assert.rejects(
    runDailyGeneration({
      dataRoot,
      issueDate: "2026-08-22",
      nowMs: Date.parse("2026-08-21T09:07:00+08:00"),
      generateBrief: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    }),
    /尚未截止/,
  );
  assert.equal(calls, 0);
  assert.deepEqual(await snapshotTree(dataRoot), []);
});

test("workflows keep generation, commit and Pages permissions separated", async () => {
  const daily = await readFile(join(root, ".github", "workflows", "daily-brief.yml"), "utf8");
  const pages = await readFile(join(root, ".github", "workflows", "pages.yml"), "utf8");
  assert.match(daily, /cron: "7 1 \* \* \*"/);
  assert.match(daily, /cron: "22 1 \* \* \*"/);
  assert.match(daily, /workflow_dispatch:/);
  assert.match(daily, /group: daily-brief-publication\s+cancel-in-progress: false/);
  assert.match(daily, /preflight:[\s\S]*?OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}[\s\S]*?enabled=false/);
  assert.match(daily, /generate:\s+needs: preflight\s+if: \$\{\{ needs\.preflight\.outputs\.enabled == 'true' \}\}/);
  assert.match(daily, /generate:[\s\S]*?permissions:\s+contents: write/);
  assert.match(daily, /deploy:\s+needs: generate/);
  assert.match(daily, /deploy:[\s\S]*?contents: read[\s\S]*?pages: write[\s\S]*?id-token: write/);
  assert.match(daily, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(daily, /steps\.pages\.outputs\.base_path/);
  assert.match(daily, /steps\.pages\.outputs\.base_url/);
  assert.match(daily, /path: dist\/client/);
  assert.match(daily, /git add -- "\$\{paths\[@\]\}"/);
  assert.match(pages, /actions\/configure-pages@v5/);
  assert.match(pages, /actions\/upload-pages-artifact@v4/);
  assert.equal(await exists(join(root, ".github", "workflows", "deploy.yml")), false);
});
