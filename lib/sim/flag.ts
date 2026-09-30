// The only simulator code in the main bundle: the opt-in flag and the story
// progress at which the lazily loaded live layer may start loading.
export const SIM_LIVE_PROGRESS = 0.78;

export function simFlagEnabled(search: string) {
  return new URLSearchParams(search).get("sim") === "1";
}
