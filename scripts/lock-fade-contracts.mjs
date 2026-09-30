#!/usr/bin/env node
import assert from "node:assert/strict";
import { lockFadeMs, LOCK_FADE_MS } from "../lib/sequence/lock-fade.ts";
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
test("reduced motion is instant", () => assert.equal(lockFadeMs(true), 0));
test("normal dissolve is short (100-250 ms)", () => { assert.ok(LOCK_FADE_MS >= 100 && LOCK_FADE_MS <= 250); assert.equal(lockFadeMs(false), LOCK_FADE_MS); });
console.log(`${n} passed`);
