#!/usr/bin/env node
// Cast state protocol contracts (lib/cast/protocol.ts): the phone sends only small state messages; the TV
// runs its own engine. Encode/decode, clamping, ordering + stale-seq dropping, the send pacer (frame-coalesced,
// rate-capped, trailing edge always sent) and the receiver's fixed-latency, timestamp-aligned jitter buffer.
// Run: node --import ./scripts/register-ts-resolve.mjs scripts/cast-protocol-contracts.mjs
import assert from "node:assert/strict";
const P = await import("../lib/cast/protocol.ts");
const { THEME_IDS } = await import("../lib/sequence/manifest.ts");
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
const view = (o = {}) => ({ progress: 0.25, theme: 2.5, zoom: 3.2, focusX: 0.31, focusY: 0.72, inspecting: true, ...o });
const state = (o = {}) => ({ kind: "state", sid: "abc123", seq: 7, t: 1000.5, snapshot: false, view: view(), ...o });
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ""} ${a} vs ${b} (eps ${eps})`);

test("namespace is a urn:x-cast custom namespace", () => {
  assert.match(P.CAST_NAMESPACE, /^urn:x-cast:[a-z0-9.]+$/);
});
test("theme range matches the engine's THEME_IDS", () => { assert.equal(P.THEME_MAX, THEME_IDS.length - 1); });

test("state round-trips (string form) within quantisation", () => {
  const raw = P.encode(state({ snapshot: true, preview: "production", build: "0123456789abcdef" }));
  assert.equal(typeof raw, "string");
  const back = P.decode(raw);
  assert.equal(back.kind, "state"); assert.equal(back.sid, "abc123"); assert.equal(back.seq, 7); assert.equal(back.snapshot, true);
  assert.equal(back.preview, "production"); assert.equal(back.build, "0123456789abcdef");
  near(back.t, 1000.5, 0.05); near(back.view.progress, 0.25, 1e-5); near(back.view.theme, 2.5, 1e-4);
  near(back.view.zoom, 3.2, 1e-4); near(back.view.focusX, 0.31, 1e-5); near(back.view.focusY, 0.72, 1e-5);
  assert.equal(back.view.inspecting, true);
});
test("state messages are small (no pixels ever cross the channel)", () => {
  const snap = P.encode(state({ snapshot: true, preview: "production", build: "f".repeat(40), view: view({ progress: 0.123456789, focusX: 0.987654321 }) }));
  const delta = P.encode(state({ seq: 123456, t: 1727712345678.9 }));
  assert.ok(snap.length <= 220, `snapshot ${snap.length} B`);
  assert.ok(delta.length <= 120, `state ${delta.length} B`);
});
test("decode accepts the parsed-object form (CAF JSON namespace delivers objects)", () => {
  const back = P.decode(JSON.parse(P.encode(state())));
  assert.equal(back?.kind, "state"); assert.equal(back.seq, 7);
});
test("hello round-trips", () => {
  const back = P.decode(P.encode({ kind: "hello", build: "sha1" }));
  assert.deepEqual(back, { kind: "hello", build: "sha1" });
});
test("decode clamps out-of-range values instead of passing them to the engine", () => {
  const raw = JSON.parse(P.encode(state()));
  raw.s = [1.7, 9, 400, -3, 5, 1];
  const back = P.decode(raw);
  assert.deepEqual([back.view.progress, back.view.theme, back.view.zoom, back.view.focusX, back.view.focusY], [1, P.THEME_MAX, P.ZOOM_MAX, 0, 1]);
  raw.s = [-1, -2, 0.2, 0.5, 0.5, 0];
  const low = P.decode(raw);
  assert.deepEqual([low.view.progress, low.view.theme, low.view.zoom, low.view.inspecting], [0, 0, 1, false]);
});
test("decode rejects malformed input (never throws)", () => {
  const good = JSON.parse(P.encode(state()));
  const bad = [
    null, undefined, 42, "", "not json", "[]", "{}",
    { ...good, v: 2 }, { ...good, k: "x" }, { ...good, n: -1 }, { ...good, n: 1.5 }, { ...good, n: "7" },
    { ...good, t: "soon" }, { ...good, t: Infinity }, { ...good, i: "" }, { ...good, i: "x".repeat(65) }, { ...good, i: 5 },
    { ...good, s: [0, 0, 1, 0.5] }, { ...good, s: [NaN, 0, 1, 0.5, 0.5, 0] }, { ...good, s: [0, 0, null, 0.5, 0.5, 0] }, { ...good, s: "0,0" },
    { ...good, pv: 5 }, { ...good, b: "x".repeat(200) },
    { v: 1, k: "h", b: 7 },
  ];
  for (const input of bad) {
    let out;
    assert.doesNotThrow(() => { out = P.decode(typeof input === "object" && input !== null ? JSON.stringify(input) : input); });
    assert.equal(out, null, `accepted ${JSON.stringify(input)}`);
  }
  assert.equal(P.decode(JSON.stringify({ ...good, s: [0, 0, 1, 0.5, 0.5, 0] }).replace("0.5,0.5", "NaN,0.5")), null);
});

test("ordering: same session accepts only increasing seq; duplicates and older seq are dropped", () => {
  const gate = new P.SeqGate();
  assert.equal(gate.accept(state({ seq: 1, snapshot: true })), "reset");
  assert.equal(gate.accept(state({ seq: 2 })), "accept");
  assert.equal(gate.accept(state({ seq: 2 })), "stale");
  assert.equal(gate.accept(state({ seq: 1 })), "stale");
  assert.equal(gate.accept(state({ seq: 5 })), "accept"); // gaps are fine: every message is a full state
  assert.equal(gate.accept(state({ seq: 4 })), "stale");
});
test("ordering: first message of an unseen receiver is adopted; a new sender session needs a snapshot", () => {
  const gate = new P.SeqGate();
  assert.equal(gate.accept(state({ sid: "a", seq: 40 })), "reset");
  assert.equal(gate.accept(state({ sid: "b", seq: 1 })), "stale"); // late/foreign non-snapshot
  assert.equal(gate.accept(state({ sid: "b", seq: 0, snapshot: true })), "reset"); // phone reloaded
  assert.equal(gate.accept(state({ sid: "a", seq: 41 })), "stale"); // old session's straggler
  assert.equal(gate.accept(state({ sid: "b", seq: 1 })), "accept");
});
test("sameView ignores sub-quantum noise but not real motion", () => {
  assert.equal(P.sameView(view(), view({ zoom: 3.2 + 1e-7 })), true);
  assert.equal(P.sameView(view(), view({ zoom: 3.21 })), false);
  assert.equal(P.sameView(view(), view({ inspecting: false })), false);
});

test("pacer: frame-coalesced, capped at SEND_HZ, trailing edge always sent", () => {
  assert.ok(P.SEND_HZ >= 30 && P.SEND_HZ <= 60, `SEND_HZ ${P.SEND_HZ}`);
  const pacer = new P.Pacer();
  let sent = [], t = 0;
  for (; t < 1000; t += 1000 / 60) { const out = pacer.tick(t, view({ zoom: 1 + t / 100 })); if (out) sent.push({ t, out }); }
  const last = view({ zoom: 1 + (t - 1000 / 60) / 100 });
  for (let k = 0; k < 12; k++, t += 1000 / 60) { const out = pacer.tick(t, last); if (out) sent.push({ t, out }); }
  assert.ok(sent.length <= P.SEND_HZ + 1, `${sent.length} msgs in ~1s`);
  assert.ok(sent.length >= P.SEND_HZ * 0.9, `only ${sent.length} msgs in ~1s`);
  assert.ok(P.sameView(sent.at(-1).out, last), "final state must be delivered");
  for (let i = 1; i < sent.length; i++) assert.ok(sent[i].t - sent[i - 1].t >= 1000 / P.SEND_HZ - 0.001, "interval below the cap");
  assert.equal(pacer.tick(t + 500, last), null, "unchanged state is not re-sent");
  assert.equal(pacer.pending, false);
});
test("pacer: force() makes the next tick send even when unchanged (snapshot/resync)", () => {
  const pacer = new P.Pacer();
  assert.ok(pacer.tick(0, view()));
  pacer.force();
  assert.ok(pacer.tick(1, view()) === null, "still rate-capped");
  assert.ok(pacer.tick(40, view()), "sent after the interval");
});

// Receiver jitter buffer: sender clock and receiver clock differ by an unknown offset; network latency jitters.
const signal = (t) => ({ progress: 0, theme: 2, zoom: 1 + 0.004 * t, focusX: Math.min(1, t / 2000), focusY: 0.5, inspecting: true });
function run({ jitter = 0, latency = 20, offset = 123456, delay = P.RECEIVER_DELAY_MS, seed = 1 } = {}) {
  let s = seed; const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const buffer = new P.JitterBuffer({ delayMs: delay });
  const arrivals = [];
  for (let t = 0; t <= 2000; t += 1000 / P.SEND_HZ) arrivals.push({ t, recv: t + offset + latency + rand() * jitter });
  arrivals.sort((a, b) => a.recv - b.recv);
  const errors = []; let i = 0;
  for (let now = offset; now <= offset + 2000; now += 1000 / 60) {
    while (i < arrivals.length && arrivals[i].recv <= now) { buffer.push(arrivals[i].t, arrivals[i].recv, signal(arrivals[i].t)); i++; }
    const out = buffer.sample(now);
    const senderNow = now - offset;
    if (out && senderNow > 400) errors.push({ senderNow, out });
  }
  return { buffer, errors };
}
test("jitter buffer: fixed latency, timestamp-aligned (clock offset removed), smooth under 0-40 ms jitter", () => {
  assert.ok(P.RECEIVER_DELAY_MS >= 50 && P.RECEIVER_DELAY_MS <= 100, `delay ${P.RECEIVER_DELAY_MS}`);
  const { errors } = run({ jitter: 40 });
  assert.ok(errors.length > 50);
  for (const { senderNow, out } of errors) {
    // Shown state = sender state at (now - fixed delay) with the best-case latency folded in; zoom is linear in time here.
    const lagMs = senderNow - (out.zoom - 1) / 0.004;
    // lag = delay + latency(20) + the fastest packet's jitter; never more than that, whatever a late packet did.
    assert.ok(lagMs >= P.RECEIVER_DELAY_MS + 20 - 1 && lagMs <= P.RECEIVER_DELAY_MS + 20 + 5, `lag ${lagMs.toFixed(1)} ms`);
  }
  // Smoothness: frame-to-frame steps are uniform (no stutter from late packets).
  const steps = errors.slice(1).map((e, k) => e.out.zoom - errors[k].out.zoom);
  const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
  const worst = Math.max(...steps.map((d) => Math.abs(d - mean)));
  assert.ok(worst <= mean * 0.35, `step deviation ${worst.toExponential(2)} vs mean ${mean.toExponential(2)}`);
});
test("jitter buffer: without jitter the lag is exactly delay + one-way latency (clock offset cancels)", () => {
  for (const offset of [123456, -98765]) {
    const { errors } = run({ jitter: 0, latency: 20, offset });
    for (const { senderNow, out } of errors) near(senderNow - (out.zoom - 1) / 0.004, P.RECEIVER_DELAY_MS + 20, 0.5, "lag");
  }
});
test("jitter buffer: holds the newest state when the stream stops (no extrapolation overshoot)", () => {
  const buffer = new P.JitterBuffer({ delayMs: 80 });
  buffer.push(0, 1000, view({ zoom: 2 })); buffer.push(33, 1033, view({ zoom: 3 }));
  assert.equal(buffer.sample(5000).zoom, 3);
  assert.equal(buffer.sample(900).zoom, 2, "before the first sample: first state");
});
test("jitter buffer: after an idle gap a change is not pre-played across the gap", () => {
  const buffer = new P.JitterBuffer({ delayMs: 80 });
  buffer.push(0, 10, view({ zoom: 2 }));
  buffer.push(10000, 10010, view({ zoom: 4 }));
  // Playhead 9950 (sender time): the change happened near 10000; the idle interval must not be interpolated.
  assert.equal(buffer.sample(10040).zoom, 2);
  const mid = buffer.sample(10010 + 80 - 10).zoom;
  assert.ok(mid > 2 && mid < 4, `mid ${mid}`);
  assert.equal(buffer.sample(10010 + 80).zoom, 4);
});
test("jitter buffer: zoom interpolates geometrically, booleans step, reset clears", () => {
  const buffer = new P.JitterBuffer({ delayMs: 0 });
  buffer.push(0, 0, view({ zoom: 2, inspecting: false })); buffer.push(20, 20, view({ zoom: 8, inspecting: true }));
  const out = buffer.sample(10);
  near(out.zoom, 4, 1e-9, "geometric midpoint"); assert.equal(out.inspecting, false);
  buffer.reset(); assert.equal(buffer.sample(10), null);
});
test("jitter buffer: bounded memory", () => {
  const buffer = new P.JitterBuffer({ delayMs: 80 });
  for (let t = 0; t < 60000; t += 33) { buffer.push(t, t + 5, view({ zoom: 1 + (t % 1000) / 1000 })); buffer.sample(t + 5); }
  assert.ok(buffer.size <= 64, `size ${buffer.size}`);
});
console.log(`${n} passed`);
