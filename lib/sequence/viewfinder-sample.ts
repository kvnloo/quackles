/** A hidden navigator is not on the color-drag path. */
export function shouldResampleViewfinder(input: { active: boolean; themeDragging: boolean }) {
  return input.active && !input.themeDragging;
}
