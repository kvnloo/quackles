"use client";
// Cast builds only: next.config.ts swaps the page's `@/components/overlay/Landing` import for this module.
// Flag-off builds never see it, so the default site compiles exactly as before.
import { Landing as SiteLanding } from "../overlay/Landing";
import { CastSender } from "./CastSender";

export function Landing() {
  return (
    <>
      <SiteLanding />
      <CastSender />
    </>
  );
}
