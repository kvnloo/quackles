import assert from "node:assert/strict";
import { syncedTheme } from "../lib/sequence/synced-theme.ts";

const notReady = [false, false, true, false, false];
const held = syncedTheme({ requested: 1.4, held: 2, ready: notReady, now: 1000, release: null });
assert.equal(held.theme, 2, "chrome and tiles hold together until the next color is decoded");
assert.equal(held.release, null);

const live = syncedTheme({ requested: 1.4, held: 2, ready: [false, true, true, false, false], now: 1000, release: null });
assert.equal(live.theme, 1.4, "a drag follows the pointer once both colors are decoded");
assert.equal(live.release, null);

const catchup = syncedTheme({ requested: 1, held: 2, ready: [false, true, true, false, false], now: 2000, release: null });
assert.equal(catchup.theme, 2, "a finished click does not snap the picture ahead of the tiles");
assert.equal(catchup.release?.from, 2);
assert.equal(catchup.release?.to, 1);
assert.equal(catchup.release?.start, 2000);

const mid = syncedTheme({
  requested: 1,
  held: 2,
  ready: [false, true, true, false, false],
  now: 2090,
  release: { from: 2, to: 1, start: 2000 },
});
assert.ok(mid.theme < 2 && mid.theme > 1, "the catch-up is the same 180ms ease as the rest of the page");
assert.ok(mid.release);

const done = syncedTheme({
  requested: 1,
  held: 1.2,
  ready: [false, true, true, false, false],
  now: 2200,
  release: { from: 2, to: 1, start: 2000 },
});
assert.equal(done.theme, 1);
assert.equal(done.release, null);
console.log("synced-theme ok");
