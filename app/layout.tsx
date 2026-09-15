import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Barlow_Condensed, Inter, Geist_Mono } from "next/font/google";
import { BUILD_STAMP } from "@/lib/build-info";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["200", "400", "500"],
});

export const metadata: Metadata = {
  title: "Microduck — Tiny duck. Big waddle.",
  description:
    "A 25 cm biped from Pollen Robotics. Fifteen motors, a grasping beak, trained in sim. Unofficial fan landing.",
  openGraph: {
    title: "Microduck — Tiny duck. Big waddle.",
    description: "Product shot, explode, and jump — on a cobalt studio.",
    type: "website",
  },
  other: {
    "microduck-build": BUILD_STAMP,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-tone="cobalt"
      className={`${inter.variable} ${geistMono.variable} ${barlow.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
