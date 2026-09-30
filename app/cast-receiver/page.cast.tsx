// Compiled only in cast builds (next.config.ts adds the "cast.tsx" page extension). URL: <site>/cast-receiver/
import type { Metadata } from "next";
import { preload } from "react-dom";
import { CastReceiver } from "@/components/cast/CastReceiver";
import { RECEIVER_SDK } from "@/lib/cast/config";

export const metadata: Metadata = { title: "Quackles · Cast receiver", robots: { index: false } };

export default function CastReceiverPage() {
  // Start the CAF download while the HTML parses, not after hydration (Chromecast CPUs are slow; launch has a timeout).
  preload(RECEIVER_SDK, { as: "script" });
  return <CastReceiver />;
}
