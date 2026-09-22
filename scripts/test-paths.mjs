#!/usr/bin/env node
/** Unit tests for lib/paths.ts asset URL resolution.

Usage: node scripts/test-paths.mjs

Set NEXT_PUBLIC_ASSET_ORIGIN to test different configurations.
*/

import { resolveAssetUrl, assertAllowedAssetOrigin, getAssetOrigin } from "../lib/paths.ts";

const FAIL = "\x1b[31mFAIL\x1b[0m";
const PASS = "\x1b[32mPASS\x1b[0m";
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${PASS} ${name}`);
    passed++;
  } catch (error) {
    console.log(`${FAIL} ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEq(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}\n  expected: ${expected}\n  actual:   ${actual}`);
}

// ── Same-origin local paths ──────────────────────────────────────────────

test("same-origin relative path resolves against manifest base", () => {
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const result = resolveAssetUrl("cinematic-proof-v2/blue/p0000000-1024.webp", base);
  assertEq(result, "https://quackles-v0.vercel.app/preview-scene/sequence/cinematic-proof-v2/blue/p0000000-1024.webp",
    "relative path should resolve against manifest base");
});

test("same-origin absolute path preserves origin", () => {
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const result = resolveAssetUrl("/preview-scene/foo.webp", base);
  assertEq(result, "https://quackles-v0.vercel.app/preview-scene/foo.webp",
    "absolute same-origin path should preserve origin");
});

test("same-origin path passes allowed-origin check", () => {
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const resolved = resolveAssetUrl("/preview-scene/foo.webp", base);
  assertAllowedAssetOrigin(resolved, base);
});

// ── GitHub Pages external assets ─────────────────────────────────────────

test("GitHub Pages logical path resolves with ASSET_ORIGIN set", () => {
  process.env.NEXT_PUBLIC_ASSET_ORIGIN = "https://kvnloo.github.io/quackles-assets";
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const result = resolveAssetUrl("/quackles-assets/blue/p0000000/0/0_0.webp", base);
  assertEq(result, "https://kvnloo.github.io/quackles-assets/blue/p0000000/0/0_0.webp",
    "logical /quackles-assets path should resolve to GitHub Pages");
  delete process.env.NEXT_PUBLIC_ASSET_ORIGIN;
});

test("GitHub Pages resolved URL passes allowed-origin check", () => {
  process.env.NEXT_PUBLIC_ASSET_ORIGIN = "https://kvnloo.github.io/quackles-assets";
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const resolved = resolveAssetUrl("/quackles-assets/blue/p0000000/0/0_0.webp", base);
  assertAllowedAssetOrigin(resolved, base);
  delete process.env.NEXT_PUBLIC_ASSET_ORIGIN;
});

// ── Vercel Blob external assets ──────────────────────────────────────────

test("Vercel Blob logical path resolves with Blob ASSET_ORIGIN", () => {
  process.env.NEXT_PUBLIC_ASSET_ORIGIN = "https://vaoufth4m77kv3ss.public.blob.vercel-storage.com/quackles";
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const result = resolveAssetUrl("/quackles-assets/blue/p0000000/0/0_0.webp", base);
  assertEq(result, "https://vaoufth4m77kv3ss.public.blob.vercel-storage.com/quackles/blue/p0000000/0/0_0.webp",
    "logical /quackles-assets path should resolve to Blob origin");
  delete process.env.NEXT_PUBLIC_ASSET_ORIGIN;
});

test("Blob resolved URL passes allowed-origin check", () => {
  process.env.NEXT_PUBLIC_ASSET_ORIGIN = "https://vaoufth4m77kv3ss.public.blob.vercel-storage.com/quackles";
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const resolved = resolveAssetUrl("/quackles-assets/blue/p0000000/0/0_0.webp", base);
  assertAllowedAssetOrigin(resolved, base);
  delete process.env.NEXT_PUBLIC_ASSET_ORIGIN;
});

// ── Malicious/unconfigured origin rejection ──────────────────────────────

test("evil origin URL is rejected", () => {
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const resolved = resolveAssetUrl("https://evil.example/foo.webp", base);
  assertEq(resolved, "https://evil.example/foo.webp",
    "absolute evil URL should resolve as-is");
  try {
    assertAllowedAssetOrigin(resolved, base);
    throw new Error("Should have thrown for evil origin");
  } catch (error) {
    assert(error.message.includes("not allowed"), "Should reject with 'not allowed' message");
  }
});

test("unconfigured cross-origin is rejected", () => {
  // No ASSET_ORIGIN set — any cross-origin should be rejected
  delete process.env.NEXT_PUBLIC_ASSET_ORIGIN;
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const resolved = resolveAssetUrl("https://other.example/foo.webp", base);
  assertEq(resolved, "https://other.example/foo.webp",
    "absolute cross-origin URL should resolve as-is");
  try {
    assertAllowedAssetOrigin(resolved, base);
    throw new Error("Should have thrown for unconfigured cross-origin");
  } catch (error) {
    assert(error.message.includes("not allowed"), "Should reject with 'not allowed' message");
  }
});

// ── Path normalization ────────────────────────────────────────────────────

test("trailing slash on ASSET_ORIGIN is stripped", () => {
  process.env.NEXT_PUBLIC_ASSET_ORIGIN = "https://kvnloo.github.io/quackles-assets/";
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const result = resolveAssetUrl("/quackles-assets/blue/p0000000/0/0_0.webp", base);
  assertEq(result, "https://kvnloo.github.io/quackles-assets/blue/p0000000/0/0_0.webp",
    "trailing slash on ASSET_ORIGIN should not cause double slash");
  delete process.env.NEXT_PUBLIC_ASSET_ORIGIN;
});

test("logical path without leading slash is still handled", () => {
  process.env.NEXT_PUBLIC_ASSET_ORIGIN = "https://kvnloo.github.io/quackles-assets";
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  // This shouldn't match the /quackles-assets/ prefix (no leading slash)
  const result = resolveAssetUrl("quackles-assets/blue/p0000000/0/0_0.webp", base);
  // Falls through to relative resolution
  assertEq(result, "https://quackles-v0.vercel.app/preview-scene/sequence/quackles-assets/blue/p0000000/0/0_0.webp",
    "path without leading slash should resolve as relative");
  delete process.env.NEXT_PUBLIC_ASSET_ORIGIN;
});

// ── No ASSET_ORIGIN (fallback to same-origin) ────────────────────────────

test("logical path without ASSET_ORIGIN resolves to same-origin", () => {
  delete process.env.NEXT_PUBLIC_ASSET_ORIGIN;
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const result = resolveAssetUrl("/quackles-assets/blue/p0000000/0/0_0.webp", base);
  assertEq(result, "https://quackles-v0.vercel.app/quackles-assets/blue/p0000000/0/0_0.webp",
    "logical path without ASSET_ORIGIN should resolve to app origin");
});

test("logical path without ASSET_ORIGIN passes allowed-origin check", () => {
  delete process.env.NEXT_PUBLIC_ASSET_ORIGIN;
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  const resolved = resolveAssetUrl("/quackles-assets/blue/p0000000/0/0_0.webp", base);
  assertAllowedAssetOrigin(resolved, base);
});

// ── Malformed ASSET_ORIGIN ────────────────────────────────────────────────

test("malformed ASSET_ORIGIN does not crash resolveAssetUrl", () => {
  process.env.NEXT_PUBLIC_ASSET_ORIGIN = "not-a-valid-url";
  const base = "https://quackles-v0.vercel.app/preview-scene/sequence/manifest.json";
  // With malformed origin, should fall through to relative resolution
  const result = resolveAssetUrl("/quackles-assets/blue/p0000000/0/0_0.webp", base);
  assertEq(result, "https://quackles-v0.vercel.app/quackles-assets/blue/p0000000/0/0_0.webp",
    "malformed origin should fall back to same-origin resolution");
  delete process.env.NEXT_PUBLIC_ASSET_ORIGIN;
});

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
