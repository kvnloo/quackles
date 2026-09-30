"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { LiveSimController } from "@/lib/sim/live-controller";

/** Runs inside the one R3F render loop, before DuckScene (camera, -2) and
 * OfficialDuck (rig, -1): advances hand-off transitions and writes the pose.
 * It never steps physics; snapshots arrive from the Worker by message. */
export function SimDirector({ controller }: { controller: LiveSimController }) {
  const { invalidate, scene, gl } = useThree();
  useEffect(() => {
    controller.bindRenderer({ invalidate, scene, gl });
    return () => controller.bindRenderer(null);
  }, [controller, invalidate, scene, gl]);
  useFrame(() => {
    if (controller.frame()) invalidate();
  }, -3);
  return null;
}
