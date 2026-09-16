import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { BUILD_STAMP } from "@/lib/build-info";
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
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-tone="cobalt"
      className={`${display.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
