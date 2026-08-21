export const SITE_NAME = "凯希的AI信号屋";
export const SITE_DESCRIPTION = "每天北京时间 09:00 更新、来源可追溯的决策参考型 AI 行业早报。";

function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const path = trimmed.replace(/^\/+|\/+$/g, "");
  return path && /^[A-Za-z0-9._~/-]+$/.test(path) ? `/${path}` : "";
}

export const SITE_BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

export function sitePath(path = "/"): string {
  const relativePath = path.replace(/^\/+/, "");
  return `${SITE_BASE_PATH}/${relativePath}`;
}
