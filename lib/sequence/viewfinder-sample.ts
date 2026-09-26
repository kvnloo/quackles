/** A hidden navigator is not on the color-drag path. */
export function shouldResampleViewfinder(input: { active: boolean; themeDragging: boolean }) {
  return input.active && !input.themeDragging;
}

/** The 1024 plate is a different render from the gigapixel. Never show it under a zoom. */
export function zoomedViewSource(input: { inspecting: boolean; detailReady: boolean }): "detail" | "none" | "plate" {
  if (!input.inspecting) return "plate";
  return input.detailReady ? "detail" : "none";
}
