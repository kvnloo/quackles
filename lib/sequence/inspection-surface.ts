/** Hide the plate only once a usable detail canvas is already showing. */
export function shouldHidePlate(input: { inspecting: boolean; detailReady: boolean }): boolean {
  return input.inspecting && input.detailReady;
}

/** Clear the tile overlay only after inspection and native pinch have both ended. */
export function shouldReleaseDetailOverlay(input: { inspecting: boolean; nativeScale: number }): boolean {
  return !input.inspecting && input.nativeScale <= 1.02;
}
