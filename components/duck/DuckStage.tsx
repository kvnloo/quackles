"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { detectWebGL } from "@/lib/webgl";
import { useExperience } from "@/components/providers/ExperienceProvider";


const LiveCanvas = dynamic(
  () => import("./DuckCanvas").then((module) => module.DuckCanvas),
  { ssr: false },
);

export function DuckStage() {
  const { setWebgl } = useExperience();
  const [supported] = useState(() => detectWebGL());
  const [fault, setFault] = useState(false);
  useEffect(() => {
    window.__QUACKLES_FAIL_CANVAS__ = () => setFault(true);
    return () => { delete window.__QUACKLES_FAIL_CANVAS__; };
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setWebgl(supported);
    }, 0);
    return () => window.clearTimeout(id);
  }, [supported, setWebgl]);

  if (fault) throw new Error("Quackles controlled canvas error");
  if (!supported) return null;
  return <LiveCanvas />;
}
