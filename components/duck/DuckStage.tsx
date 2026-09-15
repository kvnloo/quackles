"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { detectWebGL } from "@/lib/webgl";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { DuckFallback } from "./DuckFallback";

const LiveCanvas = dynamic(
  () => import("./DuckCanvas").then((module) => module.DuckCanvas),
  { ssr: false },
);

export function DuckStage() {
  const { setReady, setWebgl } = useExperience();
  const [supported] = useState(() => detectWebGL());

  useEffect(() => {
    const id = window.setTimeout(() => {
      setWebgl(supported);
      // Cycles plates are the first frame; do not hold the hatch on WebGL.
      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [supported, setReady, setWebgl]);

  if (!supported) return <DuckFallback />;
  return <LiveCanvas />;
}
