import type { Metadata } from "next";
import { JsonLd, SITE_URL } from "@/components/seo/JsonLd";
import { Landing } from "@/components/overlay/Landing";

export const metadata: Metadata = { alternates: { canonical: SITE_URL }, openGraph: { type: "website", url: SITE_URL, title: "Quackles · Microduck", description: "Five rendered worlds, a deep-zoom poster and the production evidence behind them." } };
export default function Home() {
  return <><JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: "Quackles · Microduck", url: SITE_URL, isPartOf: { "@id": SITE_URL + "#website" }, about: { "@type": "CreativeWork", name: "Microduck rendered-world study" } }} /><Landing /></>;
}
