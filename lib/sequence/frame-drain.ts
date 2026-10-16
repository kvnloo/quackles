type Drainable = { readonly pending: number; drain(deadline: number, now?: () => number): number };
/** One shared deadline for all surfaces in a frame, with one upload minimum for progress. */
export function createFrameDrain(deadline: number, now: () => number = () => performance.now()) {
  let painted = 0;
  return (surface: Drainable): number => {
    if (!surface.pending || (painted > 0 && now() >= deadline)) return 0;
    const count = surface.drain(deadline, now);
    painted += count;
    return count;
  };
}
