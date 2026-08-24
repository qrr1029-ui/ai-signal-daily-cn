import type { Metadata } from "next";
import { bundledLatestBrief } from "@/content/latest";
import { SITE_NAME, sitePath } from "../brand";
import { CopyButton } from "./copy-button";
import { WechatArticle } from "./wechat-article";
import styles from "./wechat.module.css";

const COPY_TARGET_ID = "wechat-article-copy";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "公众号排版",
  description: `${SITE_NAME}微信公众号复制排版页。`,
  robots: {
    index: false,
    follow: false,
  },
};

export default function WechatPage() {
  const brief = bundledLatestBrief;

  return (
    <div className={styles.pageShell}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarInner}>
          <a className={styles.backLink} href={sitePath("/")}>
            <span aria-hidden="true">←</span> 返回公开早报
          </a>
          <div className={styles.toolbarTitle}>
            <strong>公众号排版</strong>
            <span>{brief.issueId.replaceAll("-", ".")}</span>
          </div>
          <CopyButton targetId={COPY_TARGET_ID} />
        </div>
      </header>

      <main className={styles.workspace}>
        <section className={styles.instructions} aria-label="使用说明">
          <p className={styles.eyebrow}>WECHAT EDITOR</p>
          <h1>复制一次，粘贴后再预览确认</h1>
          <p>
            下方正文已改成公众号更容易保留的单栏内联排版。逐条来源仍完整保留在公开网页，公众号版不重复展示。复制后请在后台新建图文、直接粘贴，并检查封面和手机预览。
          </p>
        </section>

        <div className={styles.previewLabel}>
          <span>以下区域会被完整复制</span>
          <span>{brief.stories.length} 条信息 · 约 {brief.readingMinutes} 分钟</span>
        </div>

        <div className={styles.previewFrame}>
          <WechatArticle brief={brief} targetId={COPY_TARGET_ID} />
        </div>
      </main>
    </div>
  );
}
