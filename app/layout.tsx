import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrument = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Microduck — Tiny duck. Big waddle.",
  description:
    "A 3D scrollytelling landing page for Microduck, the 25 cm open-source-software biped from Pollen Robotics. Fifteen motors, a grasping beak, trained in sim.",
  openGraph: {
    title: "Microduck — Tiny duck. Big waddle.",
    description:
      "Scroll a 3D duck through walk, grab, recover, and roller-skate. Fan-made page for pollen-robotics/microduck.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
