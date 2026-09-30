"use client";
import { useEffect } from "react";
import { armFeel, driveFeel } from "@/lib/feel/drive";
import { snapshot, subscribe } from "@/lib/sequence/store";

export function FeelEngine() {
  useEffect(() => {
    const arm = () => armFeel();
    addEventListener("pointerdown", arm, { once: true });
    addEventListener("keydown", arm, { once: true });
    const drive = () => { const s = snapshot(); driveFeel(s.progress, s.reducedMotion); };
    drive();
    const off = subscribe(drive);
    return () => { off(); removeEventListener("pointerdown", arm); removeEventListener("keydown", arm); };
  }, []);
  return null;
}
