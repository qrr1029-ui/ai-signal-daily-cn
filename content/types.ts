export type SourceKind = "一手" | "交叉核验" | "官方背景" | "现场记录" | "社区信号";

export interface SourceLink {
  label: string;
  href: string;
  kind: SourceKind;
  publishedAt?: string;
}
export interface StoryHighlight {
  field: "fact" | "analysis" | "opportunity";
  phrase: string;
}

export interface BriefStory {
  rank: number;
  publishedAt: string;
  sourceState: string;
  title: string;
  region: string;
  tracks: string[];
  fact: string;
  analysis: string;
  opportunity: string;
  highlight?: StoryHighlight;
  sources: SourceLink[];
  metric?: string;
  metricNote?: string;
}

export interface MorningBrief {
  schemaVersion: 1;
  issueId: string;
  issueNumber: number;
  publishedAt: string;
  windowStart: string;
  windowEnd: string;
  title: string;
  titleHighlight: string;
  deck: string;
  readingMinutes: number;
  trackScan: Array<[string, string]>;
  executiveSummary: string[];
  stories: BriefStory[];
  trends: string[];
  trendHighlight?: { index: number; phrase: string };
  quote: string;
  quoteHighlight: string;
  generation: {
    model?: string;
    verifiedAt: string;
  };
}
