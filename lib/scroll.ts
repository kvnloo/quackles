import { clamp01 } from "@/lib/pose";

export function readScrollProgress() {
  if (typeof window === "undefined") return 0;
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  return clamp01(window.scrollY / max);
}
