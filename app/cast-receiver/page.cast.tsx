// Compiled only in cast builds (next.config.ts adds the "cast.tsx" page extension). URL: <site>/cast-receiver/
import type { Metadata } from "next";
import { CastReceiver } from "@/components/cast/CastReceiver";

export const metadata: Metadata = { title: "Quackles · Cast receiver", robots: { index: false } };

export default function CastReceiverPage() {
  return <CastReceiver />;
}
