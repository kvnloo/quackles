# RFC-005 — Gaussian and neural appearance challengers

**Status:** FUTURE RESEARCH / BLOCKED BY RFC-000 + RFC-003 BASELINES  
**Tracking:** #47

## Principle

Do not replace known authored geometry with a fashionable representation by default. Quackles owns unusually rich synthetic Blender ground truth: RGB/HDR, depth/normals, material channels, object/part IDs, UV/world position, motion vectors, cameras and rigid-part transforms.

## Challengers

1. static 2DGS/3DGS Blue
2. hierarchical/progressive splat streaming
3. rigid-part-local Microduck splats
4. mesh + learned material/radiance residual
5. surface-attached high-frequency appearance

The canonical mesh retains geometry, silhouette, animation and interaction authority unless evidence says otherwise.

## References

- https://repo-sam.inria.fr/fungraph/hierarchical-3d-gaussians/
- https://github.com/hbb1/2d-gaussian-splatting
- https://websplatter.github.io/
- https://github.com/nus-vv-streams/lapis-gs
- https://repo-sam.inria.fr/nerphys/gs-texturing/
- https://research.nvidia.com/publication/2023-08_random-access-neural-compression-material-textures

## Keep gate

A challenger must beat mesh + virtual texture or exact Cycles on at least one meaningful Pareto dimension without unacceptable losses elsewhere. A prototype that merely works does not win.
