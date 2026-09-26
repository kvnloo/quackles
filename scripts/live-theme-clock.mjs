import assert from "node:assert/strict";
import { getThemeSnapshot, subscribeTheme } from "../lib/theme.ts";
import { selectLiveTheme } from "../lib/sequence/live-theme.ts";
import { configure, snapshot } from "../lib/sequence/store.ts";

const style = new Map();
const frames = [];
globalThis.document = {
  documentElement: {
    style: { setProperty: (name, value) => style.set(name, value) },
    dataset: {},
  },
};
globalThis.requestAnimationFrame = (fn) => {
  frames.push(fn);
  return frames.length;
};
globalThis.cancelAnimationFrame = () => {};
globalThis.window = {
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
};

configure({
  defaultTheme: "blue",
  themes: [
    { id: "day", palette: { paper: "#141416", deep: "#0c0c0e", ink: "#e8e4dc", cobalt: "#3d5cff" } },
    { id: "white", palette: { paper: "#e5e1d8", deep: "#ddd9d0", ink: "#0000f2", cobalt: "#0000f2" } },
    { id: "blue", palette: { paper: "#0000f2", deep: "#0000c2", ink: "#f2f2f2", cobalt: "#f2f2f2" } },
    { id: "dark", palette: { paper: "#090b10", deep: "#050609", ink: "#f2f2f2", cobalt: "#7195ff" } },
    { id: "night", palette: { paper: "#000000", deep: "#000000", ink: "#9abaff", cobalt: "#417eff" } },
  ],
});

const before = getThemeSnapshot();
let lightTicks = 0;
const unsubscribe = subscribeTheme(() => { lightTicks += 1; });
selectLiveTheme(0);
for (const frame of [...frames]) frame(0);
unsubscribe();

assert.equal(snapshot().target, 0, "a live theme choice still selects the sequence theme");
assert.equal(getThemeSnapshot(), before, "a live theme choice must not move the unused light rig");
assert.equal(lightTicks, 0, "a live theme choice must not wake light-rig listeners");
console.log("live-theme-clock ok");
