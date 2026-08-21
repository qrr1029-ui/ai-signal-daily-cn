import type { Metadata, Viewport } from "next";
import { SITE_DESCRIPTION, SITE_NAME, sitePath } from "./brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    `${(process.env.PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/`,
  ),
  title: {
    default: `${SITE_NAME}｜每日人工智能行业情报`,
    template: `%s｜${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  icons: {
    icon: sitePath("/favicon.svg"),
    shortcut: sitePath("/favicon.svg"),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f2ec",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
