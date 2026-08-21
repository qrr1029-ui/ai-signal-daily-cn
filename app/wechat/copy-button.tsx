"use client";

import { useState } from "react";
import styles from "./wechat.module.css";

type CopyState = "idle" | "copying" | "rich" | "legacy" | "plain" | "manual" | "error";

const STATUS_TEXT: Record<CopyState, string> = {
  idle: "同时复制富文本与纯文本备用",
  copying: "正在准备排版…",
  rich: "已复制，粘贴后请预览",
  legacy: "已用兼容模式复制，请粘贴预览",
  plain: "浏览器只允许复制纯文本",
  manual: "内容已选中，请按 Ctrl+C 或长按复制",
  error: "未找到可复制正文，请刷新后重试",
};

function cloneArticle(target: HTMLElement): { html: string; plainText: string } {
  const clone = target.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.querySelectorAll('[data-copy-ignore="true"]').forEach((node) => node.remove());
  return {
    html: clone.outerHTML,
    plainText: target.innerText.trim(),
  };
}

async function copyRichText(html: string, plainText: string): Promise<boolean> {
  if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    return false;
  }

  try {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plainText], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return false;
  }
}

function copyRichTextLegacy(html: string): boolean {
  if (typeof document.execCommand !== "function") return false;

  const selection = window.getSelection();
  if (!selection) return false;

  const savedRanges: Range[] = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    savedRanges.push(selection.getRangeAt(index).cloneRange());
  }
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const container = document.createElement("div");
  container.contentEditable = "true";
  container.setAttribute("aria-hidden", "true");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.opacity = "0";
  container.style.pointerEvents = "none";
  container.innerHTML = html;
  document.body.appendChild(container);

  let copied = false;
  try {
    const range = document.createRange();
    range.selectNodeContents(container);
    selection.removeAllRanges();
    selection.addRange(range);
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    container.remove();
    selection.removeAllRanges();
    savedRanges.forEach((range) => selection.addRange(range));
    activeElement?.focus({ preventScroll: true });
  }
  return copied;
}

async function copyPlainText(plainText: string): Promise<boolean> {
  if (!window.isSecureContext || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(plainText);
    return true;
  } catch {
    return false;
  }
}

function selectForManualCopy(target: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.selectNodeContents(target);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function CopyButton({ targetId }: { targetId: string }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function handleCopy() {
    const target = document.getElementById(targetId);
    if (!(target instanceof HTMLElement)) {
      setCopyState("error");
      return;
    }

    setCopyState("copying");
    const { html, plainText } = cloneArticle(target);

    if (await copyRichText(html, plainText)) {
      setCopyState("rich");
      return;
    }
    if (copyRichTextLegacy(html)) {
      setCopyState("legacy");
      return;
    }
    if (await copyPlainText(plainText)) {
      setCopyState("plain");
      return;
    }
    setCopyState(selectForManualCopy(target) ? "manual" : "error");
  }

  const buttonLabel = copyState === "copying"
    ? "正在复制…"
    : copyState === "rich" || copyState === "legacy" || copyState === "plain"
      ? "重新复制"
      : "复制公众号全文";

  return (
    <div className={styles.copyControl}>
      <button
        className={styles.copyButton}
        type="button"
        onClick={handleCopy}
        disabled={copyState === "copying"}
      >
        {buttonLabel}
      </button>
      <span className={styles.copyStatus} role="status" aria-live="polite">
        {STATUS_TEXT[copyState]}
      </span>
    </div>
  );
}
