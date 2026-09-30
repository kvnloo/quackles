# RFC-003 — Blue real-time 3D + virtual surface detail

**Status:** FUTURE R&D / BLOCKED BY RFC-000  
**Tracking / umbrella:** #42

## Incumbent hypothesis

```text
Blender
-> real geometry + animation
-> glTF/GLB + mesh compression
-> resident KTX2 PBR materials
-> Three.js/R3F
-> streamed UV/UDIM high-detail pages
-> gigapixel-class perceived macro fidelity
```

A 1GP scene means gigapixel-class authored surface texel space with only visible high-frequency pages resident. It does **not** mean one 1GP framebuffer per camera pose.

## Blue vertical slice

Prove exact Blue hero camera, arbitrary orbit, one cinematic transition, robot jump/action, macro inspection, and exact reverse to hero. Use the same geometry, camera trace and device across variants.

Tournament: B1 conventional 2K/4K/8K KTX2; C0 one streamed macro UV patch; C1 bounded page pool/page table; RFC-004 exact Cycles anchor; RFC-005 Gaussian/neural challenger. Do not scale to five themes before Blue wins.

## Virtual-texture rule

```text
mesh UV -> virtual page + mip -> page table -> resident?
yes -> high-detail sample
no  -> resident coarse material
```

The camera never waits. Related material channels promote atomically as a page group.

## References

- https://dev.epicgames.com/documentation/unreal-engine/streaming-virtual-texturing-in-unreal-engine
- https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html
- https://threejs.org/docs/pages/KTX2Loader.html
- https://threejs.org/docs/pages/WebGPURenderer.html

## Keep gate

Add camera/animation freedom while preserving acceptable Cycles fidelity, bounded memory/bytes and motion-first frame pacing. Merely rotating the camera is not a win.
