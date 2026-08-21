import type { MorningBrief, SourceKind } from "../../content/types";

export interface GenerationEnv {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

export interface BriefWindow {
  issueDate: string;
  startMs: number;
  endMs: number;
  windowStart: string;
  windowEnd: string;
}

export interface OpenAIGenerationResult {
  brief: MorningBrief;
  evidenceUrls: Set<string>;
  publicationProofs: PublicationProof[];
  responseId?: string;
  usage?: unknown;
}

export type PublicationVerificationMethod =
  | "jsonld:datePublished"
  | `meta:${string}`
  | "time:datetime"
  | "github:relative-time";

/** Machine-produced publication proof persisted in the public audit JSON. */
export interface PublicationProof {
  rank: number;
  sourceUrl: string;
  sourceKind: SourceKind;
  finalUrl: string;
  publishedAt: string;
  method: PublicationVerificationMethod;
  fetchedAt: string;
}
