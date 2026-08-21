import type { MorningBrief, SourceLink } from "@/content/types";
import { SITE_NAME, sitePath } from "./brand";

function SourceLinks({ links }: { links: SourceLink[] }) {
  return (
    <span className="sources">
      {links.map((link) => (
        <a href={link.href} target="_blank" rel="noreferrer" key={`${link.kind}-${link.href}`}>
          <span className="source-kind">{link.kind}</span>
          {link.label}
          <span aria-hidden="true">↗</span>
        </a>
      ))}
    </span>
  );
}
function HighlightedText({
  text,
  phrase,
  className = "inline-highlight",
}: {
  text: string;
  phrase?: string;
  className?: string;
}) {
  if (!phrase) return <>{text}</>;
  const highlightAt = text.indexOf(phrase);
  if (highlightAt < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, highlightAt)}
      <mark className={className}>{phrase}</mark>
      {text.slice(highlightAt + phrase.length)}
    </>
  );
}

function StoryAudit({ publishedAt, sourceState }: { publishedAt: string; sourceState: string }) {
  const parsed = Date.parse(publishedAt);
  const displayTime = Number.isFinite(parsed) ? compactDate(publishedAt) : publishedAt;
  return (
    <div className="story-audit">
      <span>首发（北京时间）{displayTime}</span>
      <span>{sourceState}</span>
    </div>
  );
}

function compactDate(iso: string) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("month")}.${value("day")} ${value("hour")}:${value("minute")}`;
}

function issueDateParts(issueId: string) {
  const [year, month, day] = issueId.split("-");
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return { year, month: months[Number(month) - 1] ?? month, day };
}

export function BriefView({ brief }: { brief: MorningBrief }) {
  const topStories = brief.stories.slice(0, 3);
  const signalStories = brief.stories.slice(3);
  const date = issueDateParts(brief.issueId);
  const dottedDate = brief.issueId.replaceAll("-", ".");

  return (
    <div className="site-shell" id="top">
      <header className="masthead">
        <a className="wordmark" href="#top" aria-label="回到顶部">
          <span className="mark" aria-hidden="true">AI</span>
          <span>{SITE_NAME}</span>
        </a>
        <nav aria-label="本期导航">
          <a href="#top3">Top 3</a>
          <a href="#briefs">今日 10 条</a>
          <a href="#trend">趋势判断</a>
        </nav>
        <a className="issue-button" href={sitePath("/wechat.html")}>公众号排版 <span>→</span></a>
      </header>

      <main className="editorial-grid">
        <aside className="rail">
          <div className="rail-sticky">
            <p className="rail-label">ISSUE {String(brief.issueNumber).padStart(3, "0")}</p>
            <p className="rail-date">{date.year}<br />{date.month} {date.day}</p>
            <div className="rail-rule" />
            <p className="rail-label">SELECTED / 可重叠</p>
            <ul>
              {brief.trackScan.map(([name, count]) => (
                <li key={name}><span>{name}</span><small>{count}</small></li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="article-column">
          <section className="hero">
            <p className="kicker">AI 行业早报 / 决策参考型 / {dottedDate}</p>
            <h1><HighlightedText text={brief.title} phrase={brief.titleHighlight} className="highlight" /></h1>
            <p className="deck">{brief.deck}</p>
            <div className="hero-meta">
              <span>滚动窗口 {compactDate(brief.windowStart)}—{compactDate(brief.windowEnd)}</span>
              <span>{brief.stories.length} 条重点 · 约 {brief.readingMinutes} 分钟</span>
              <span>全部时间均已换算为北京时间</span>
            </div>
          </section>

          <section className="opening-note" aria-label="30 秒读懂今天">
            <p className="section-code">00 / EXECUTIVE READ</p>
            <div>
              <h2>30 秒读懂今天</h2>
              <ol>
                {brief.executiveSummary.map((summary) => <li key={summary}>{summary}</li>)}
              </ol>
            </div>
          </section>

          <section className="lead-section" id="top3">
            <div className="section-title-row">
              <p className="section-code">01–03 / MUST READ</p>
              <h2>今天最值得看</h2>
            </div>
            {topStories.map((story) => (
              <article className="lead-story" key={story.rank}>
                <div className="story-index">{String(story.rank).padStart(2, "0")}</div>
                <div className="story-body">
                  <div className="story-tags">
                    {[story.region, ...story.tracks].map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <h3>{story.title}</h3>
                  <StoryAudit publishedAt={story.publishedAt} sourceState={story.sourceState} />
                  <div className="story-grid">
                    <div><span className="micro">事实</span><p><HighlightedText text={story.fact} phrase={story.highlight?.field === "fact" ? story.highlight.phrase : undefined} /></p></div>
                    <div><span className="micro">简要解读</span><p><HighlightedText text={story.analysis} phrase={story.highlight?.field === "analysis" ? story.highlight.phrase : undefined} /></p></div>
                    <div><span className="micro">机会 / 风险</span><p><HighlightedText text={story.opportunity} phrase={story.highlight?.field === "opportunity" ? story.highlight.phrase : undefined} /></p></div>
                  </div>
                  <SourceLinks links={story.sources} />
                </div>
                {story.metric && (
                  <div className="story-metric">
                    <strong>{story.metric}</strong>
                    <span>{story.metricNote}</span>
                  </div>
                )}
              </article>
            ))}
          </section>

          <section className="brief-section" id="briefs">
            <div className="section-title-row">
              <p className="section-code">04–10 / SIGNALS</p>
              <h2>其余 7 条，压缩读完</h2>
            </div>
            <div className="brief-list">
              {signalStories.map((story) => (
                <article className="brief-row" key={story.rank}>
                  <span className="brief-number">{String(story.rank).padStart(2, "0")}</span>
                  <div className="brief-copy">
                    <h3>{story.title}</h3>
                    <StoryAudit publishedAt={story.publishedAt} sourceState={story.sourceState} />
                    <p>
                      <b>事实：</b><HighlightedText text={story.fact} phrase={story.highlight?.field === "fact" ? story.highlight.phrase : undefined} />{" "}
                      <b>判断：</b><HighlightedText text={story.analysis} phrase={story.highlight?.field === "analysis" ? story.highlight.phrase : undefined} />{" "}
                      <b>机会 / 风险：</b><HighlightedText text={story.opportunity} phrase={story.highlight?.field === "opportunity" ? story.highlight.phrase : undefined} />
                    </p>
                    <SourceLinks links={story.sources} />
                  </div>
                  <div className="brief-tags">
                    {[story.region, ...story.tracks].map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="trend-section" id="trend">
            <p className="section-code">TREND / EDITOR&apos;S VIEW</p>
            <div className="trend-copy">
              <h2>三个趋势观察</h2>
              {brief.trends.map((trend, index) => (
                <p key={trend}>
                  <HighlightedText
                    text={trend}
                    phrase={brief.trendHighlight?.index === index ? brief.trendHighlight.phrase : undefined}
                  />
                </p>
              ))}
            </div>
          </section>

          <blockquote>
            <HighlightedText text={brief.quote} phrase={brief.quoteHighlight} className="quote-highlight" />
          </blockquote>
        </div>
      </main>

      <footer>
        <span>{SITE_NAME} · DAILY INTELLIGENCE</span>
        <a href="#top">BACK TO TOP ↑</a>
      </footer>
    </div>
  );
}
