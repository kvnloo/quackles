#!/usr/bin/env node
import assert from "node:assert/strict";
import { syncedTheme, themeDetailReady } from "../lib/sequence/synced-theme.ts";
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
test("a theme with no detail source is ready immediately", () => {
  assert.equal(themeDetailReady({ hasDetailSource: false, planReady: false }), true);
});
test("a theme with tiles waits for its plan", () => {
  assert.equal(themeDetailReady({ hasDetailSource: true, planReady: false }), false);
  assert.equal(themeDetailReady({ hasDetailSource: true, planReady: true }), true);
});
test("zoomed swipe Blue(2) -> tile-less Dark(3) is not held", () => {
  const ready = [0, 1, 2, 3, 4].map((i) => themeDetailReady({ hasDetailSource: i === 2, planReady: i === 2 }));
  const first = syncedTheme({ requested: 3, held: 2, ready, now: 0, release: null });
  assert.ok(first.release && first.release.to === 3, "release toward Dark must start at once");
  const mid = syncedTheme({ requested: 3, held: 2, ready, now: 90, release: first.release });
  assert.ok(mid.theme > 2 && mid.theme < 3, `mid-ease ${mid.theme}`);
  assert.equal(syncedTheme({ requested: 3, held: 2, ready, now: 400, release: first.release }).theme, 3);
});
test("a tiled target theme is still held until its tiles decode", () => {
  const ready = [false, false, true, false, false];
  const r = syncedTheme({ requested: 3, held: 2, ready, now: 0, release: null });
  assert.equal(r.theme, 2); assert.equal(r.release, null);
});
console.log(`${n} passed`);
