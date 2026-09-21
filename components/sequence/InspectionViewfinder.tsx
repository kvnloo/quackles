"use client";

import { useEffect, useRef } from "react";
import {
  inspectionSnapshot,
  subscribeInspection,
} from "@/lib/sequence/inspection";
import {
  inspectionCrop,
  viewportCrop,
  type Crop,
} from "@/lib/sequence/render";
import { sequencePerfProfile } from "@/lib/sequence/perf-profile";

type ViewfinderState = {
  active: boolean;
  crop: Crop;
  backingBytes: number;
  snapshotCount: number;
  profile: ReturnType<typeof sequencePerfProfile>["id"];
};

declare global {
  interface Window {
    __QUACKLES_VIEWFINDER__?: {
      getState: () => ViewfinderState;
    };
  }
}

const EMPTY_CROP: Crop = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  scale: 1,
};

export function InspectionViewfinder() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rectRef = useRef<SVGRectElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const viewportRect = rectRef.current;
    const frame = document.querySelector<HTMLElement>(".poster-frame");
    const source = document.querySelector<HTMLCanvasElement>(".sequence-base");
    if (!host || !canvas || !viewportRect || !frame || !source) return;

    const profile = sequencePerfProfile();
    let raf = 0;
    let snapshotCount = 0;
    let backingBytes = 0;
    let lastState: ViewfinderState = {
      active: false,
      crop: EMPTY_CROP,
      backingBytes: 0,
      snapshotCount: 0,
      profile: profile.id,
    };

    const copySource = () => {
      if (source.width < 2 || source.height < 2) return false;
      const width = profile.viewfinderBackingWidth;
      const height = Math.max(
        1,
        Math.round(width * (source.height / source.width)),
      );
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return false;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(source, 0, 0, width, height);
      snapshotCount++;
      backingBytes = width * height * 4;
      return true;
    };

    const currentCrop = () => {
      const inspection = inspectionSnapshot();
      if (inspection.active || inspection.zoom > 1.0005) {
        return inspectionCrop(
          inspection.zoom,
          inspection.focusX,
          inspection.focusY,
        );
      }
      return viewportCrop(frame);
    };

    const update = () => {
      raf = 0;
      const inspection = inspectionSnapshot();
      const nativeScale = window.visualViewport?.scale ?? 1;
      const active = inspection.zoom > 1.02 || nativeScale > 1.02;
      const crop = active ? currentCrop() : EMPTY_CROP;

      if (active && snapshotCount === 0) copySource();

      host.dataset.active = active ? "true" : "false";
      viewportRect.setAttribute("x", String(crop.x));
      viewportRect.setAttribute("y", String(crop.y));
      viewportRect.setAttribute("width", String(crop.width));
      viewportRect.setAttribute("height", String(crop.height));

      lastState = {
        active,
        crop,
        backingBytes,
        snapshotCount,
        profile: profile.id,
      };
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    const onBasePainted = () => {
      copySource();
      schedule();
    };

    const unsubscribeInspection = subscribeInspection(schedule);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("quackles:base-painted", onBasePainted);

    window.__QUACKLES_VIEWFINDER__ = {
      getState: () => lastState,
    };

    // The sequence may paint before this component's effect runs.
    requestAnimationFrame(() => {
      copySource();
      update();
    });

    return () => {
      cancelAnimationFrame(raf);
      unsubscribeInspection();
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("quackles:base-painted", onBasePainted);
      delete window.__QUACKLES_VIEWFINDER__;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="inspection-viewfinder"
      data-testid="inspection-viewfinder"
      data-active="false"
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        className="inspection-viewfinder-canvas"
      />
      <svg
        className="inspection-viewfinder-overlay"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <rect
          ref={rectRef}
          className="inspection-viewfinder-rect"
          x="0"
          y="0"
          width="1"
          height="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
