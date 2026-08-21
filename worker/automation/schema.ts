const nullableString = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const;

const sourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "href", "kind", "publishedAt"],
  properties: {
    label: { type: "string" },
    href: { type: "string" },
    kind: {
      type: "string",
      enum: ["一手", "交叉核验", "官方背景", "现场记录", "社区信号"],
    },
    publishedAt: nullableString,
  },
} as const;

const highlightSchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["field", "phrase"],
      properties: {
        field: { type: "string", enum: ["fact", "analysis", "opportunity"] },
        phrase: { type: "string" },
      },
    },
    { type: "null" },
  ],
} as const;

const storySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "rank",
    "publishedAt",
    "sourceState",
    "title",
    "region",
    "tracks",
    "fact",
    "analysis",
    "opportunity",
    "highlight",
    "sources",
    "metric",
    "metricNote",
  ],
  properties: {
    rank: { type: "integer", minimum: 1, maximum: 10 },
    publishedAt: { type: "string" },
    sourceState: { type: "string" },
    title: { type: "string" },
    region: { type: "string" },
    tracks: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "string",
        enum: ["AI 应用", "物理 AI", "AI+硬件", "AI 大模型", "Vibe Coding", "AI Agent"],
      },
    },
    fact: { type: "string" },
    analysis: { type: "string" },
    opportunity: { type: "string" },
    highlight: highlightSchema,
    sources: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: sourceSchema,
    },
    metric: nullableString,
    metricNote: nullableString,
  },
} as const;

export const morningBriefJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "issueId",
    "issueNumber",
    "publishedAt",
    "windowStart",
    "windowEnd",
    "title",
    "titleHighlight",
    "deck",
    "readingMinutes",
    "trackScan",
    "executiveSummary",
    "stories",
    "trends",
    "trendHighlight",
    "quote",
    "quoteHighlight",
    "generation",
  ],
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    issueId: { type: "string" },
    issueNumber: { type: "integer", minimum: 1 },
    publishedAt: { type: "string" },
    windowStart: { type: "string" },
    windowEnd: { type: "string" },
    title: { type: "string" },
    titleHighlight: { type: "string" },
    deck: { type: "string" },
    readingMinutes: { type: "integer", minimum: 3, maximum: 8 },
    trackScan: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: { type: "string" },
      },
    },
    executiveSummary: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string" },
    },
    stories: {
      type: "array",
      minItems: 10,
      maxItems: 10,
      items: storySchema,
    },
    trends: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string" },
    },
    trendHighlight: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["index", "phrase"],
          properties: {
            index: { type: "integer", minimum: 0, maximum: 2 },
            phrase: { type: "string" },
          },
        },
        { type: "null" },
      ],
    },
    quote: { type: "string" },
    quoteHighlight: { type: "string" },
    generation: {
      type: "object",
      additionalProperties: false,
      required: ["model", "verifiedAt"],
      properties: {
        model: { type: "string" },
        verifiedAt: { type: "string" },
      },
    },
  },
} as const;
