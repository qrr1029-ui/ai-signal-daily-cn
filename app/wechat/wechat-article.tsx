import type { CSSProperties, ReactNode } from "react";
import type { BriefStory, MorningBrief } from "@/content/types";
import { SITE_NAME } from "../brand";

const COLORS = {
  paper: "#f4f2ec",
  ink: "#181817",
  muted: "#6f6d67",
  line: "#c9c5b9",
  yellow: "#e8ff25",
};

const bodyFont = '"PingFang SC", "Microsoft YaHei", Arial, sans-serif';
const titleFont = '"Songti SC", STSong, SimSun, serif';

function compactDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value ?? ""
  );
  return `${value("month")}.${value("day")} ${value("hour")}:${value("minute")}`;
}

function HighlightedText({ text, phrase }: { text: string; phrase?: string }) {
  if (!phrase) return <>{text}</>;
  const highlightAt = text.indexOf(phrase);
  if (highlightAt < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, highlightAt)}
      <span style={{ backgroundColor: COLORS.yellow, color: COLORS.ink, padding: "0 2px" }}>
        {phrase}
      </span>
      {text.slice(highlightAt + phrase.length)}
    </>
  );
}

function TagList({ story }: { story: BriefStory }) {
  return (
    <p style={{ margin: "0 0 12px", lineHeight: 1.8 }}>
      {[story.region, ...story.tracks].map((tag) => (
        <span
          key={tag}
          style={{
            display: "inline-block",
            margin: "0 6px 5px 0",
            padding: "2px 7px",
            border: `1px solid ${COLORS.line}`,
            borderRadius: "999px",
            color: "#55534e",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          {tag}
        </span>
      ))}
    </p>
  );
}

function AuditLine({ story }: { story: BriefStory }) {
  const parsed = Date.parse(story.publishedAt);
  const displayTime = Number.isFinite(parsed) ? compactDate(story.publishedAt) : story.publishedAt;
  return (
    <p style={{ margin: "8px 0 0", color: COLORS.muted, fontSize: "13px", lineHeight: 1.75 }}>
      首发（北京时间）{displayTime} · {story.sourceState}
    </p>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section style={{ margin: "17px 0 0" }}>
      <p style={{ margin: "0 0 5px", color: COLORS.muted, fontSize: "13px", fontWeight: 700, letterSpacing: "0.06em" }}>
        {label}
      </p>
      <p style={{ margin: 0, color: "#373632", fontSize: "15px", lineHeight: 1.85 }}>
        {children}
      </p>
    </section>
  );
}

function LeadStory({ story }: { story: BriefStory }) {
  const titleStyle: CSSProperties = {
    margin: "0",
    color: COLORS.ink,
    fontFamily: titleFont,
    fontSize: "24px",
    fontWeight: 700,
    lineHeight: 1.5,
  };

  return (
    <section style={{ padding: "30px 0 32px", borderTop: `1px solid ${COLORS.ink}` }}>
      <p style={{ margin: "0 0 13px", color: COLORS.muted, fontSize: "13px", fontWeight: 700, letterSpacing: "0.1em" }}>
        {String(story.rank).padStart(2, "0")} / MUST READ
      </p>
      <TagList story={story} />
      <h2 style={titleStyle}>{story.title}</h2>
      <AuditLine story={story} />
      {story.metric && (
        <p style={{ margin: "18px 0 0", color: COLORS.ink, fontSize: "13px", lineHeight: 1.6 }}>
          <strong style={{ marginRight: "8px", fontSize: "22px" }}>{story.metric}</strong>
          {story.metricNote}
        </p>
      )}
      <Field label="事实">
        <HighlightedText text={story.fact} phrase={story.highlight?.field === "fact" ? story.highlight.phrase : undefined} />
      </Field>
      <Field label="简要解读">
        <HighlightedText text={story.analysis} phrase={story.highlight?.field === "analysis" ? story.highlight.phrase : undefined} />
      </Field>
      <Field label="机会 / 风险">
        <HighlightedText text={story.opportunity} phrase={story.highlight?.field === "opportunity" ? story.highlight.phrase : undefined} />
      </Field>
    </section>
  );
}

function SignalStory({ story }: { story: BriefStory }) {
  return (
    <section style={{ padding: "23px 0 25px", borderTop: `1px solid ${COLORS.line}` }}>
      <p style={{ margin: "0 0 10px", color: COLORS.muted, fontSize: "13px", fontWeight: 700, letterSpacing: "0.08em" }}>
        {String(story.rank).padStart(2, "0")} / SIGNAL
      </p>
      <TagList story={story} />
      <h2 style={{ margin: 0, fontFamily: titleFont, fontSize: "20px", fontWeight: 700, lineHeight: 1.55 }}>
        {story.title}
      </h2>
      <AuditLine story={story} />
      <p style={{ margin: "14px 0 0", color: "#373632", fontSize: "15px", lineHeight: 1.85 }}>
        <strong>事实：</strong>
        <HighlightedText text={story.fact} phrase={story.highlight?.field === "fact" ? story.highlight.phrase : undefined} />{" "}
        <strong>判断：</strong>
        <HighlightedText text={story.analysis} phrase={story.highlight?.field === "analysis" ? story.highlight.phrase : undefined} />{" "}
        <strong>机会 / 风险：</strong>
        <HighlightedText text={story.opportunity} phrase={story.highlight?.field === "opportunity" ? story.highlight.phrase : undefined} />
      </p>
    </section>
  );
}

export function WechatArticle({ brief, targetId }: { brief: MorningBrief; targetId: string }) {
  const dottedDate = brief.issueId.replaceAll("-", ".");

  return (
    <article
      id={targetId}
      aria-label={`${dottedDate} AI 行业早报公众号正文`}
      style={{
        width: "100%",
        maxWidth: "677px",
        margin: "0 auto",
        padding: "42px 26px 38px",
        boxSizing: "border-box",
        backgroundColor: COLORS.paper,
        color: COLORS.ink,
        fontFamily: bodyFont,
        wordBreak: "break-word",
      }}
    >
      <header style={{ paddingBottom: "30px" }}>
        <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px", fontWeight: 700, letterSpacing: "0.1em" }}>
          {SITE_NAME} · {dottedDate}
        </p>
        <p style={{ margin: "10px 0 0", color: COLORS.muted, fontSize: "13px", lineHeight: 1.7 }}>
          AI 行业早报 / 决策参考型
        </p>
        <h1 style={{ margin: "24px 0 0", fontFamily: titleFont, fontSize: "32px", fontWeight: 700, lineHeight: 1.4 }}>
          <HighlightedText text={brief.title} phrase={brief.titleHighlight} />
        </h1>
        <p style={{ margin: "20px 0 0", color: "#45433f", fontFamily: titleFont, fontSize: "16px", lineHeight: 1.9 }}>
          {brief.deck}
        </p>
        <p style={{ margin: "22px 0 0", paddingTop: "13px", borderTop: `1px solid ${COLORS.ink}`, color: COLORS.muted, fontSize: "13px", lineHeight: 1.8 }}>
          滚动窗口 {compactDate(brief.windowStart)}—{compactDate(brief.windowEnd)}<br />
          {brief.stories.length} 条重点 · 约 {brief.readingMinutes} 分钟 · 全部时间均为北京时间
        </p>
      </header>

      <section style={{ padding: "24px 0 26px", borderTop: `1px solid ${COLORS.ink}`, borderBottom: `1px solid ${COLORS.ink}` }}>
        <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px", fontWeight: 700, letterSpacing: "0.1em" }}>
          30 秒读懂今天
        </p>
        {brief.executiveSummary.map((summary, index) => (
          <p key={summary} style={{ margin: "14px 0 0", fontSize: "15px", lineHeight: 1.85 }}>
            <strong style={{ marginRight: "7px" }}>{index + 1}.</strong>{summary}
          </p>
        ))}
      </section>

      <section style={{ paddingTop: "36px" }}>
        <p style={{ margin: "0 0 18px", color: COLORS.muted, fontSize: "13px", fontWeight: 700, letterSpacing: "0.1em" }}>
          01–03 / 今天最值得看
        </p>
        {brief.stories.slice(0, 3).map((story) => <LeadStory story={story} key={story.rank} />)}
      </section>

      <section style={{ paddingTop: "34px" }}>
        <p style={{ margin: "0 0 18px", color: COLORS.muted, fontSize: "13px", fontWeight: 700, letterSpacing: "0.1em" }}>
          04–10 / 其余信号，压缩读完
        </p>
        {brief.stories.slice(3).map((story) => <SignalStory story={story} key={story.rank} />)}
      </section>

      <section style={{ marginTop: "38px", padding: "28px 0", borderTop: `1px solid ${COLORS.ink}`, borderBottom: `1px solid ${COLORS.ink}` }}>
        <p style={{ margin: "0 0 17px", color: COLORS.muted, fontSize: "13px", fontWeight: 700, letterSpacing: "0.1em" }}>
          三个趋势观察
        </p>
        {brief.trends.map((trend, index) => (
          <p key={trend} style={{ margin: index === 0 ? 0 : "15px 0 0", fontFamily: titleFont, fontSize: "16px", lineHeight: 1.85 }}>
            <strong style={{ marginRight: "7px" }}>{index + 1}.</strong>
            <HighlightedText text={trend} phrase={brief.trendHighlight?.index === index ? brief.trendHighlight.phrase : undefined} />
          </p>
        ))}
      </section>

      <section aria-label="今日金句" style={{ margin: "34px 0 0", padding: "4px 0 4px 17px", borderLeft: `3px solid ${COLORS.ink}`, fontFamily: titleFont, fontSize: "22px", fontWeight: 700, lineHeight: 1.75 }}>
        “<HighlightedText text={brief.quote} phrase={brief.quoteHighlight} />”
      </section>

      <section aria-label="版权与免责声明" style={{ marginTop: "34px", paddingTop: "18px", borderTop: `1px solid ${COLORS.line}`, color: COLORS.muted, fontSize: "13px", lineHeight: 1.8 }}>
        <p style={{ margin: 0 }}>{SITE_NAME} · 每日 AI 行业情报</p>
        <p style={{ margin: "5px 0 0" }}>完整来源与核验记录保留在网页版。</p>
        <p style={{ margin: "5px 0 0" }}>本内容仅作行业信息整理，不构成投资、法律或其他专业建议。</p>
      </section>
    </article>
  );
}
