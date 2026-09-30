"use client";

import { useEffect, useRef, useState } from "react";
import { frameIssues, type FrameIssue, type FrameSample } from "@/lib/sequence/frame-log";

type InspectionApi = {
  getState: () => {
    zoom: number;
    targetZoom: number;
    focusX: number;
    focusY: number;
    targetFocusX: number;
    targetFocusY: number;
    cameraMoving: boolean;
  };
  apply?: (next: {
    active: boolean;
    zoom: number;
    targetZoom: number;
    focusX: number;
    focusY: number;
    targetFocusX: number;
    targetFocusY: number;
  }) => void;
};

declare global {
  interface Window {
    __QUACKLES_INSPECTION__?: InspectionApi;
    __QUACKLES_SEQUENCE__?: { getState: () => { detailWidth?: number; detailTiles?: number } };
    __QUACKLES_FRAMES__?: {
      record: () => void;
      stop: () => FrameSample[];
      seek: (index: number) => void;
      frames: () => FrameSample[];
      issues: () => FrameIssue[];
    };
  }
}

const covers = (box: DOMRect, frame: DOMRect) =>
  box.left <= frame.left + 2 &&
  box.top <= frame.top + 2 &&
  box.right >= frame.right - 2 &&
  box.bottom >= frame.bottom - 2;

function sample(index: number, t: number, dt: number, gpRequests: number): FrameSample | null {
  const inspect = window.__QUACKLES_INSPECTION__?.getState();
  const frame = document.querySelector(".poster-frame");
  const base = document.querySelector<HTMLCanvasElement>(".sequence-base");
  const detail = document.querySelector<HTMLCanvasElement>(".sequence-detail");
  if (!inspect || !frame || !base || !detail) return null;
  const frameBox = frame.getBoundingClientRect();
  const baseVis = getComputedStyle(base).visibility !== "hidden";
  const detailVis = getComputedStyle(detail).visibility !== "hidden";
  const seq = window.__QUACKLES_SEQUENCE__?.getState();
  return {
    index,
    t,
    dt,
    zoom: inspect.zoom,
    targetZoom: inspect.targetZoom,
    focusX: inspect.focusX,
    focusY: inspect.focusY,
    targetFocusX: inspect.targetFocusX,
    targetFocusY: inspect.targetFocusY,
    cameraMoving: inspect.cameraMoving,
    baseVis,
    detailVis,
    baseCovers: baseVis && covers(base.getBoundingClientRect(), frameBox),
    detailCovers: detailVis && covers(detail.getBoundingClientRect(), frameBox),
    tier: seq?.detailWidth ?? 0,
    tiles: seq?.detailTiles ?? 0,
    gpRequests,
    rgb: null,
  };
}

export function FrameInspector() {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [frames, setFrames] = useState<FrameSample[]>([]);
  const [index, setIndex] = useState(0);
  const recordingRef = useRef(false);
  const framesRef = useRef<FrameSample[]>([]);

  const seek = (next: number) => {
    const frame = framesRef.current[next];
    if (!frame) return;
    setIndex(next);
    window.__QUACKLES_INSPECTION__?.apply?.({
      active: frame.zoom > 1.002,
      zoom: frame.zoom,
      targetZoom: frame.zoom,
      focusX: frame.focusX,
      focusY: frame.focusY,
      targetFocusX: frame.focusX,
      targetFocusY: frame.focusY,
    });
  };

  useEffect(() => {
    if (new URLSearchParams(location.search).has("frames")) setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input,textarea,select")) return;
      if (event.key === "F" && event.shiftKey) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      if (!recordingRef.current) return;
      raf = requestAnimationFrame(loop);
      const gpRequests = performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/gp/")).length;
      const next = sample(framesRef.current.length, now, last ? now - last : 0, gpRequests);
      last = now;
      if (!next || framesRef.current.length >= 720) return;
      framesRef.current.push(next);
    };
    const api = {
      record() {
        framesRef.current = [];
        performance.clearResourceTimings();
        recordingRef.current = true;
        last = 0;
        setRecording(true);
        setFrames([]);
        setIndex(0);
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      },
      stop() {
        recordingRef.current = false;
        cancelAnimationFrame(raf);
        const frozen = framesRef.current.slice();
        setRecording(false);
        setFrames(frozen);
        setOpen(true);
        return frozen;
      },
      seek,
      frames: () => framesRef.current.slice(),
      issues: () => frameIssues(framesRef.current),
    };
    window.__QUACKLES_FRAMES__ = api;
    return () => {
      recordingRef.current = false;
      cancelAnimationFrame(raf);
      if (window.__QUACKLES_FRAMES__ === api) delete window.__QUACKLES_FRAMES__;
    };
  }, []);

  if (!open) return null;
  const current = frames[index];
  const issues = frameIssues(frames);
  const here = issues.filter((issue) => issue.frame === current?.index);
  return (
    <aside
      data-testid="frame-inspector"
      style={{
        position: "fixed",
        zIndex: 40,
        left: 8,
        bottom: 8,
        width: 340,
        maxHeight: "46vh",
        overflow: "auto",
        padding: 8,
        background: "rgba(8,8,12,0.92)",
        color: "#f4f4f4",
        font: "11px/1.35 ui-monospace, monospace",
      }}
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <button type="button" onClick={() => (recording ? window.__QUACKLES_FRAMES__?.stop() : window.__QUACKLES_FRAMES__?.record())}>
          {recording ? "Stop" : "Record"}
        </button>
        <button type="button" onClick={() => seek(Math.max(0, index - 1))} disabled={!frames.length}>Prev</button>
        <button type="button" onClick={() => seek(Math.min(frames.length - 1, index + 1))} disabled={!frames.length}>Next</button>
        <span>{frames.length ? `${index + 1}/${frames.length}` : "no frames"}</span>
      </div>
      {current && (
        <div>
          {current.dt.toFixed(1)} ms · zoom {current.zoom.toFixed(2)}→{current.targetZoom.toFixed(2)} · focus {current.focusX.toFixed(3)},{current.focusY.toFixed(3)}
          <br />
          {current.cameraMoving ? "moving" : "settled"} · tier {current.tier} · tiles {current.tiles} · gp {current.gpRequests}
          <br />
          base {current.baseVis ? "up" : "hidden"}/{current.baseCovers ? "covers" : "short"} · detail {current.detailVis ? "up" : "hidden"}/{current.detailCovers ? "covers" : "short"}
        </div>
      )}
      <div style={{ marginTop: 6, color: here.length ? "#ffb4b4" : "#b7f7c8" }}>
        {here.length ? here.map((issue) => issue.code + ": " + issue.detail).join(" · ") : "no issue on this frame"}
      </div>
      <ol style={{ margin: "8px 0 0", paddingLeft: 16 }}>
        {issues.map((issue, row) => (
          <li key={`${issue.frame}-${issue.code}-${row}`}>
            <button type="button" onClick={() => seek(frames.findIndex((frame) => frame.index === issue.frame))} style={{ color: "inherit", background: "none", border: 0, padding: 0, font: "inherit" }}>
              #{issue.frame} {issue.code}: {issue.detail}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
