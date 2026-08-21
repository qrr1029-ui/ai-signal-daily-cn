import { createHash, randomUUID } from "node:crypto";
import {
  access,
  appendFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { MorningBrief } from "../content/types";
import type {
  BriefWindow,
  GenerationEnv,
  OpenAIGenerationResult,
  PublicationProof,
} from "../worker/automation/contracts";
import { generateBriefWithOpenAI } from "../worker/automation/openai";
import { deriveBriefWindow } from "../worker/automation/window";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface IssueIndexEntry {
  issueId: string;
  issueNumber: number;
  publishedAt: string;
  title: string;
  checksum: string;
}

interface IssueIndex {
  schemaVersion: 1;
  updatedAt: string;
  issues: IssueIndexEntry[];
}

interface PublicAudit {
  schemaVersion: 1;
  issueId: string;
  issueNumber: number;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  model: string;
  checksum: string;
  evidenceUrlCount: number;
  publicationProofs: PublicationProof[];
}

export interface DailyGenerationOptions {
  dataRoot?: string;
  issueDate?: string;
  nowMs?: number;
  env?: GenerationEnv;
  generateBrief?: (
    env: GenerationEnv,
    window: BriefWindow,
    issueNumber: number,
  ) => Promise<OpenAIGenerationResult>;
}

export interface DailyGenerationResult {
  status: "generated" | "existing";
  issueDate: string;
  checksum?: string;
  dataChanged: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeMorningBrief(value: unknown): value is MorningBrief {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1
    && typeof value.issueId === "string"
    && Number.isSafeInteger(value.issueNumber)
    && typeof value.publishedAt === "string"
    && typeof value.windowStart === "string"
    && typeof value.windowEnd === "string"
    && typeof value.title === "string"
    && Array.isArray(value.stories)
    && value.stories.length === 10;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readJsonIfPresent(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`无法读取 JSON ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readBriefIfPresent(path: string): Promise<MorningBrief | undefined> {
  const value = await readJsonIfPresent(path);
  if (value === undefined) return undefined;
  if (!looksLikeMorningBrief(value)) throw new Error(`早报 JSON 格式不合法：${path}`);
  return value;
}

function parseIndexEntry(value: unknown): IssueIndexEntry | null {
  if (!isRecord(value)) return null;
  const issueId = typeof value.issueId === "string" ? value.issueId : null;
  const issueNumber = Number.isSafeInteger(value.issueNumber) ? value.issueNumber as number : null;
  if (!issueId || issueNumber === null) return null;
  return {
    issueId,
    issueNumber,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : "",
    title: typeof value.title === "string" ? value.title : "",
    checksum: typeof value.checksum === "string" ? value.checksum : "",
  };
}

async function readIssueIndex(path: string): Promise<IssueIndexEntry[]> {
  const value = await readJsonIfPresent(path);
  if (value === undefined) return [];
  const candidates = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.issues) ? value.issues : null;
  if (!candidates) throw new Error(`期刊索引格式不合法：${path}`);
  const parsed = candidates.map(parseIndexEntry);
  if (parsed.some((entry) => entry === null)) throw new Error(`期刊索引含无效条目：${path}`);
  return parsed as IssueIndexEntry[];
}

function explicitWindow(issueDate: string): BriefWindow {
  if (!DATE_PATTERN.test(issueDate)) throw new Error("--issue-date 必须使用 YYYY-MM-DD 格式");
  const endMs = Date.parse(`${issueDate}T09:00:00+08:00`);
  if (!Number.isFinite(endMs)) throw new Error("--issue-date 不是有效日期");
  const window = deriveBriefWindow(endMs);
  if (window.issueDate !== issueDate) throw new Error("--issue-date 不是有效公历日期");
  return window;
}

export function selectBriefWindow(nowMs: number, issueDate?: string): BriefWindow {
  if (!Number.isFinite(nowMs)) throw new Error("nowMs 必须是有效时间戳");
  const latestCompleted = deriveBriefWindow(nowMs);
  if (!issueDate) return latestCompleted;
  const requested = explicitWindow(issueDate);
  if (requested.endMs > latestCompleted.endMs) {
    throw new Error(`不能生成尚未截止的刊期 ${issueDate}`);
  }
  return requested;
}

async function maximumIssueNumber(dataRoot: string, latest: MorningBrief | undefined): Promise<number> {
  let maximum = latest?.issueNumber ?? 0;
  const issueDirectory = join(dataRoot, "issues");
  let names: string[];
  try {
    names = (await readdir(issueDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "index.json")
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return maximum;
    throw error;
  }

  for (const name of names) {
    const brief = await readBriefIfPresent(join(issueDirectory, name));
    if (brief) maximum = Math.max(maximum, brief.issueNumber);
  }
  return maximum;
}

function assertGeneratedBrief(brief: MorningBrief, window: BriefWindow, issueNumber: number): void {
  if (!looksLikeMorningBrief(brief)) throw new Error("生成器未返回合法 MorningBrief");
  if (brief.issueId !== window.issueDate) throw new Error("生成结果 issueId 与目标刊期不一致");
  if (brief.issueNumber !== issueNumber) throw new Error("生成结果 issueNumber 与分配期号不一致");
  if (brief.windowStart !== window.windowStart || brief.windowEnd !== window.windowEnd) {
    throw new Error("生成结果的滚动窗口与目标窗口不一致");
  }
}

function checksumBrief(brief: MorningBrief): string {
  return createHash("sha256").update(JSON.stringify(brief), "utf8").digest("hex");
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function publicProofs(proofs: PublicationProof[]): PublicationProof[] {
  return proofs.map((proof) => ({
    rank: proof.rank,
    sourceUrl: proof.sourceUrl,
    sourceKind: proof.sourceKind,
    finalUrl: proof.finalUrl,
    publishedAt: proof.publishedAt,
    method: proof.method,
    fetchedAt: proof.fetchedAt,
  }));
}

function buildIndex(entries: IssueIndexEntry[], entry: IssueIndexEntry): IssueIndex {
  const deduplicated = new Map(entries.map((item) => [item.issueId, item]));
  deduplicated.set(entry.issueId, entry);
  const issues = [...deduplicated.values()].sort((left, right) => right.issueId.localeCompare(left.issueId));
  return {
    schemaVersion: 1,
    updatedAt: issues[0]?.publishedAt ?? entry.publishedAt,
    issues,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function repairStaticPointers(dataRoot: string, issue: MorningBrief): Promise<{ changed: boolean; checksum: string }> {
  const latestPath = join(dataRoot, "latest.json");
  const indexPath = join(dataRoot, "issues", "index.json");
  const latest = await readBriefIfPresent(latestPath);
  const currentIndexValue = await readJsonIfPresent(indexPath);
  const currentEntries = await readIssueIndex(indexPath);
  const checksum = checksumBrief(issue);
  const entry: IssueIndexEntry = {
    issueId: issue.issueId,
    issueNumber: issue.issueNumber,
    publishedAt: issue.publishedAt,
    title: issue.title,
    checksum,
  };
  const desiredIndex = buildIndex(currentEntries, entry);
  let changed = false;

  if ((!latest || issue.issueId >= latest.issueId) && !sameJson(latest, issue)) {
    await atomicWriteJson(latestPath, issue);
    changed = true;
  }
  if (!sameJson(currentIndexValue, desiredIndex)) {
    await atomicWriteJson(indexPath, desiredIndex);
    changed = true;
  }

  return { changed, checksum };
}

export async function runDailyGeneration(options: DailyGenerationOptions = {}): Promise<DailyGenerationResult> {
  const nowMs = options.nowMs ?? Date.now();
  const dataRoot = resolve(options.dataRoot ?? join(process.cwd(), "public", "data"));
  const window = selectBriefWindow(nowMs, options.issueDate);
  const issuePath = join(dataRoot, "issues", `${window.issueDate}.json`);

  if (await pathExists(issuePath)) {
    const existing = await readBriefIfPresent(issuePath);
    if (existing?.issueId !== window.issueDate) throw new Error(`已有刊期文件内容错误：${issuePath}`);
    const repair = await repairStaticPointers(dataRoot, existing);
    return {
      status: "existing",
      issueDate: window.issueDate,
      checksum: repair.checksum,
      dataChanged: repair.changed,
    };
  }

  const latestPath = join(dataRoot, "latest.json");
  const indexPath = join(dataRoot, "issues", "index.json");
  const latest = await readBriefIfPresent(latestPath);
  const existingIndex = await readIssueIndex(indexPath);
  const issueNumber = (await maximumIssueNumber(dataRoot, latest)) + 1;
  const env: GenerationEnv = options.env ?? {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  };
  const generateBrief = options.generateBrief ?? generateBriefWithOpenAI;

  // No filesystem mutation is allowed before generation and all verification pass.
  const generation = await generateBrief(env, window, issueNumber);
  assertGeneratedBrief(generation.brief, window, issueNumber);

  const checksum = checksumBrief(generation.brief);
  const indexEntry: IssueIndexEntry = {
    issueId: generation.brief.issueId,
    issueNumber: generation.brief.issueNumber,
    publishedAt: generation.brief.publishedAt,
    title: generation.brief.title,
    checksum,
  };
  const audit: PublicAudit = {
    schemaVersion: 1,
    issueId: generation.brief.issueId,
    issueNumber: generation.brief.issueNumber,
    windowStart: generation.brief.windowStart,
    windowEnd: generation.brief.windowEnd,
    generatedAt: generation.brief.generation.verifiedAt,
    model: generation.brief.generation.model ?? env.OPENAI_MODEL?.trim() ?? "unknown",
    checksum,
    evidenceUrlCount: generation.evidenceUrls.size,
    publicationProofs: publicProofs(generation.publicationProofs),
  };

  await atomicWriteJson(issuePath, generation.brief);
  await atomicWriteJson(join(dataRoot, "audits", `${window.issueDate}.json`), audit);
  await atomicWriteJson(indexPath, buildIndex(existingIndex, indexEntry));
  if (!latest || generation.brief.issueId >= latest.issueId) {
    await atomicWriteJson(latestPath, generation.brief);
  }

  return { status: "generated", issueDate: window.issueDate, checksum, dataChanged: true };
}

function parseArguments(argv: string[]): { issueDate?: string } {
  let issueDate: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--issue-date") {
      issueDate = argv[index + 1];
      if (!issueDate) throw new Error("--issue-date 缺少值");
      index += 1;
      continue;
    }
    if (argument.startsWith("--issue-date=")) {
      issueDate = argument.slice("--issue-date=".length);
      continue;
    }
    throw new Error(`未知参数：${argument}`);
  }
  return { ...(issueDate ? { issueDate } : {}) };
}

async function writeActionsOutputs(result: DailyGenerationResult): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  await appendFile(outputPath, [
    `status=${result.status}`,
    `issue_date=${result.issueDate}`,
    `data_changed=${result.dataChanged}`,
    ...(result.checksum ? [`checksum=${result.checksum}`] : []),
    "",
  ].join("\n"), "utf8");
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const result = await runDailyGeneration(parseArguments(argv));
  await writeActionsOutputs(result);
  console.log(result.status === "existing"
    ? `刊期 ${result.issueDate} 已存在；跳过 OpenAI，继续静态部署。`
    : `刊期 ${result.issueDate} 已通过核验并写入静态数据。`);
}

const invokedFile = process.argv[1] ? basename(process.argv[1]) : "";
if (invokedFile === "generate-daily.ts" || invokedFile === "generate-daily.js") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
