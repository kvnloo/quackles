#!/usr/bin/env node
// Theme store must never publish a theme/target outside [0, 4] or NaN:
// render() indexes THEME_IDS[floor/ceil(theme)] and crashed ("reading 'filter'").
import assert from "node:assert/strict";
globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
const { dragTheme, selectTheme, presentTheme, snapshot, themeIndices } = await import("../lib/sequence/store.ts");
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
const ok = (v) => Number.isFinite(v) && v >= 0 && v <= 4;
test("dragTheme(NaN) keeps a finite theme", () => { dragTheme(1); dragTheme(NaN); assert.ok(ok(snapshot().theme) && ok(snapshot().target)); });
test("dragTheme(±Infinity) clamps", () => { dragTheme(Infinity); assert.equal(snapshot().theme, 4); dragTheme(-Infinity); assert.equal(snapshot().theme, 0); });
test("selectTheme(unknown id) is a no-op", () => { dragTheme(2); selectTheme("bogus"); assert.equal(snapshot().target, 2); });
test("presentTheme(NaN) ignored", () => { presentTheme(3); presentTheme(NaN); assert.ok(ok(snapshot().presented)); });
test("themeIndices always yields valid indices", () => {
  for (const t of [0, 1.5, 4, 4 + 1e-12, -1e-12, NaN, 7, -3]) for (const i of themeIndices(t).indices) assert.ok(Number.isInteger(i) && i >= 0 && i <= 4, `t=${t} i=${i}`);
  assert.deepEqual(themeIndices(2.25), { indices: [2, 3], mix: 0.25 });
  assert.deepEqual(themeIndices(3), { indices: [3], mix: 0 });
});
console.log(`${n} passed`);
