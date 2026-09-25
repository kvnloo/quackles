import assert from "node:assert/strict";
import { applyThemeT, animateThemeLightsTo, getThemeSnapshot } from "../lib/theme.ts";
import { applyPalette, configure } from "../lib/sequence/store.ts";

const style = new Map();
const root = {
  style: { setProperty: (name, value) => style.set(name, value) },
  dataset: {},
};
globalThis.document = { documentElement: root };

const manifest = {
  defaultTheme: "blue",
  themes: [
    { id: "day", palette: { paper: "#141416", deep: "#0c0c0e", ink: "#e8e4dc", cobalt: "#3d5cff" } },
    { id: "white", palette: { paper: "#e5e1d8", deep: "#ddd9d0", ink: "#0000f2", cobalt: "#0000f2" } },
    { id: "blue", palette: { paper: "#0000f2", deep: "#0000c2", ink: "#f2f2f2", cobalt: "#f2f2f2" } },
    { id: "dark", palette: { paper: "#090b10", deep: "#050609", ink: "#f2f2f2", cobalt: "#7195ff" } },
    { id: "night", palette: { paper: "#000000", deep: "#000000", ink: "#9abaff", cobalt: "#417eff" } },
  ],
};

applyThemeT(0);
assert.equal(style.get("--paper"), "#e5e1d8");
assert.equal(root.dataset.tone, "paper");

animateThemeLightsTo(1, 0);
assert.equal(getThemeSnapshot(), 1);
assert.equal(style.get("--paper"), "#e5e1d8", "light rig must not rewrite sequence chrome");
assert.equal(root.dataset.tone, "paper");

configure(manifest);
applyPalette(0);
assert.equal(style.get("--paper"), "#141416");
assert.equal(style.get("--background"), "#141416");
assert.equal(style.get("--foreground"), "#e8e4dc");
assert.equal(root.dataset.tone, "day");

animateThemeLightsTo(0, 0);
applyPalette(4);
assert.equal(getThemeSnapshot(), 0);
assert.equal(style.get("--paper"), "#000000");
assert.equal(root.dataset.tone, "night");

console.log("theme-palette-contract ok");
