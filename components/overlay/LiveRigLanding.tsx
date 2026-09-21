"use client";

import { DuckStage } from "@/components/duck/DuckStage";
import { FeelEngine } from "@/components/feel/FeelEngine";
import { PosterBeats } from "@/components/poster/PosterBeats";
import { PosterHeroCopy } from "@/components/poster/PosterHeroCopy";
import { PosterNav } from "@/components/poster/PosterNav";
import { ExperienceProvider } from "@/components/providers/ExperienceProvider";
import { SequenceScroll } from "@/components/sequence/SequenceScroll";

/**
 * Reconciliation surface for the live official-rig runtime.
 *
 * Intentional scope:
 * - KEEP the accepted Lenis SequenceScroll input kernel.
 * - KEEP the current nightly-source pose/camera choreography.
 * - KEEP the current official rig + StudioSet render stack.
 * - DO NOT bring back the historical simulator iframe.
 * - DO NOT bring back the obsolete three-theme controller.
 *
 * The live stack currently renders its established poster-blue studio look.
 * Five-theme live material parity is a separate integration gate.
 */
function LiveRigShell() {
  return (
    <main id="top" className="phone-shell" data-testid="live-rig-candidate">
      <SequenceScroll />
      <FeelEngine />

      <div className="poster-stage">
        <div className="poster-frame">
          <div className="duck-slot">
            <DuckStage />
          </div>

          <PosterNav />
          <PosterHeroCopy />
          <PosterBeats />
        </div>

        <div className="scene-dock">
          <div className="scroll-line">
            <span>LIVE RIG · SCROLL TO EXPLORE</span>
            <span aria-hidden>↓</span>
          </div>
          <div className="scroll-progress">
            <div className="scroll-progress-fill" />
          </div>
          <p className="credit">
            RECONCILIATION CANDIDATE <span>OFFICIAL RIG · NO IFRAME</span>
          </p>
        </div>
      </div>

      <div className="scroll-space" aria-hidden />
    </main>
  );
}

export function LiveRigLanding() {
  return (
    <ExperienceProvider>
      <LiveRigShell />
    </ExperienceProvider>
  );
}
