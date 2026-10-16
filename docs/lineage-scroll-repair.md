# Scroll-read removal: functional fix, timing admission still held

The former viewer read `scrollTop` and `clientHeight` on every scroll rAF.
A stack-enabled diagnostic identifies forced Layout at `render` line 69, called
from the scroll rAF at line 136. Asynchronous thumbnail loading can invalidate
layout before this read even when the preceding callback batched its writes.

The retained alternative uses static, fixed-size, absolutely positioned cards.
Positions are assigned only on filtering or container resize; ResizeObserver
supplies width without synchronous geometry queries. Native lazy images retain
explicit dimensions, async decoding, responsive sources, captions and alt text.
There is no scroll listener, per-card geometry read, or node recycling on scroll.
All keyboard targets stay in chronological DOM order, including Home/End and
native Tab traversal. This deliberately trades the old bounded DOM for a fixed
665-card document; image loading remains lazy. Browser contracts check initial
loaded-image bounds as well as filters, ordering, keyboard, modal, and deep links.

## Alternatives measured

Cached geometry/transform windowing still occasionally forced layout at its
scrollTop read. A CSS grid with content-visibility:auto eliminated synchronous
layout but increased layout/prepaint work. Observer-driven recycled row variants
also removed forced layout, but cost more per row update. Static absolute cards
were simpler and had the lowest measured native-image work of those alternatives.
Background-image and compositing experiments were not retained: they did not
qualify and added complexity or changed the image semantics. All private raw
trials and experimental patches are preserved; none is a fabricated success.

## Repeated v2 evidence

Ten AB/BA repeats each of baseline, candidate and deliberately bad control on
the same Chrome headless-shell binary (Playwright chromium_headless_shell-1243),
390×844/DPR1, 4× CPU, native 5760px scroll at 1440px/s, pinned owned descendants:

| Variant | Work p95 run median | IQR | Worst frame | Forced layouts |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 5.310075 ms | 0.572600 ms | 15.252 ms | 7 |
| Static native-image cards | 4.884275 ms | 0.457988 ms | 13.025 ms | 0 |

Candidate repeatability passes; baseline repeatability does not, so the full
comparative harness validation remains incomplete. The candidate still fails
the unchanged p95 ≤4 ms / max ≤8.3 ms thresholds. The bad control fails all ten
runs, with 97,380 forced events. These are headless emulation observations, not
physical-device qualification. The historical 167-event series used full Chrome
and is not directly compared as a timing improvement against headless shell.

**Do not merge this route into the integration preview on a timing-PASS claim.**
The deterministic scroll-read defect is removed and functional checks pass;
the timing acceptance item remains open. No threshold has been loosened.

The harness now records executablePath and trace categories. `TRACE_STACKS=1`
adds diagnostic stack capture; use ordinary categories for comparable timings.
