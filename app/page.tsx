import type { Metadata } from "next";
import { BriefView } from "./brief-view";
import { bundledLatestBrief } from "@/content/latest";
import { SITE_NAME } from "./brand";

export function generateMetadata(): Metadata {
  const brief = bundledLatestBrief;
  const description = `${SITE_NAME} ${brief.issueId.replaceAll("-", ".")} 早报：${brief.deck}`;
  const socialImage = "og-v4.png";

  return {
    title: brief.title,
    description,
    openGraph: {
      title: brief.title,
      description,
      type: "article",
      images: [{ url: socialImage, width: 1731, height: 909 }],
    },
    twitter: {
      card: "summary_large_image",
      title: brief.title,
      description,
      images: [socialImage],
    },
  };
}

export default function Home() {
  return <BriefView brief={bundledLatestBrief} />;
}
