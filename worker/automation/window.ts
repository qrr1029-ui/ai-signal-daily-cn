import type { BriefWindow } from "./contracts";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatShanghaiIso(timestampMs: number): string {
  const shifted = new Date(timestampMs + SHANGHAI_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
    + `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}+08:00`;
}

export function formatIssueDate(timestampMs: number): string {
  const shifted = new Date(timestampMs + SHANGHAI_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * Returns the most recently completed Beijing-time [09:00, 09:00) window.
 * A delayed cron at 09:07 still closes at 09:00; a manual run at 08:59 uses
 * the preceding day's cutoff rather than including a future boundary.
 */
export function deriveBriefWindow(scheduledAtMs: number): BriefWindow {
  if (!Number.isFinite(scheduledAtMs)) {
    throw new Error("scheduledAtMs must be a finite timestamp");
  }

  const shanghaiNow = new Date(scheduledAtMs + SHANGHAI_OFFSET_MS);
  let endMs = Date.UTC(
    shanghaiNow.getUTCFullYear(),
    shanghaiNow.getUTCMonth(),
    shanghaiNow.getUTCDate(),
    1,
    0,
    0,
  );

  if (scheduledAtMs < endMs) {
    endMs -= ONE_DAY_MS;
  }

  const startMs = endMs - ONE_DAY_MS;
  return {
    issueDate: formatIssueDate(endMs),
    startMs,
    endMs,
    windowStart: formatShanghaiIso(startMs),
    windowEnd: formatShanghaiIso(endMs),
  };
}
