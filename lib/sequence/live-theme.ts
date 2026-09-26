import { THEME_IDS } from "./manifest";
import { selectTheme } from "./store";

/** Live page theme choice. The 3-anchor light rig is not mounted here. */
export function selectLiveTheme(index: number) {
  const id = THEME_IDS[index];
  if (!id) return;
  selectTheme(id);
}
