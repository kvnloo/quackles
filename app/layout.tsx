import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { BUILD_STAMP } from "@/lib/build-info";
import { PREVIEW } from "@/lib/preview";
import { THEME_IDS } from "@/lib/sequence/manifest";
import { previewStartTheme } from "@/lib/sequence/preview-policy";
import sequence from "@/public/preview-scene/sequence/manifest.json";
const display = localFont({
  src: "../public/preview-scene/fonts/RulesGothicCnd-Light.woff2",
  variable: "--font-display",
  display: "swap",
});
const mono = localFont({
  src: "../public/preview-scene/fonts/AeonikFono-Regular.woff2",
  variable: "--font-mono",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Quackles · Microduck",
  description:
    "A study of Microduck, the open source biped by Pollen Robotics. Product, exploded view, and jump.",
  other: { "microduck-build": BUILD_STAMP },
};
// The start scene's chrome in the static HTML (build time, server only), so the page never paints another scene's colours
// before the manifest arrives and store.applyPalette takes over.
const TONE = THEME_IDS[previewStartTheme(PREVIEW)];
const PALETTE = sequence.themes.find((theme) => theme.id === TONE)!.palette;
const CHROME = { "--paper": PALETTE.paper, "--paper-deep": PALETTE.deep, "--ink": PALETTE.ink, "--cobalt": PALETTE.cobalt } as CSSProperties;
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-tone={TONE}
      style={CHROME}
      className={`${display.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
