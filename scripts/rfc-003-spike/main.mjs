// RFC-003 spike page (research only; not part of the site build).
// Renders the Blender-exported Blue hero at the exact plate camera in one of:
//   mode=bake   unlit, Cycles-baked lighting atlas (best-case parity for a static pose)
//   mode=pbr    B1 conventional: baked albedo + Principled scalars, live three.js area lights + HDRI, Neutral tonemap
//   mode=mask   robot white / set black, for silhouette IoU
// Options: assets=<url of export dir>  w,h (CSS px)  dpr  zoom=x,y,w,h (normalised plate rect)  vt=1 (stream robot
// detail pages, bake mode)  anim=1 (orbit +-8 deg for frame timing)  frames=N
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

const q = new URLSearchParams(location.search);
const ASSETS = (q.get("assets") || "/assets/") .replace(/\/?$/, "/");
const MODE = q.get("mode") || "bake";
const W = +(q.get("w") || 1024), H = +(q.get("h") || 1536), DPR = +(q.get("dpr") || 1);
const ZOOM = q.get("zoom") ? q.get("zoom").split(",").map(Number) : null;
const VT_ON = q.get("vt") === "1" && MODE === "bake";
const ANIM = q.get("anim") === "1", FRAMES = +(q.get("frames") || 240);
const state = { ready: false, vt: null, frames: [], gpuMs: [], error: null };
window.__rfc003 = state;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(DPR); renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();

const tex = (url, srgb = true) => new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => {
  t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t);
}, undefined, rej));
const json = (u) => fetch(u).then((r) => r.json());

async function main() {
  const cam = await json(ASSETS + "camera.json");
  const camera = new THREE.PerspectiveCamera(cam.vfov_deg, cam.width / cam.height, cam.clip[0], cam.clip[1]);
  camera.matrixAutoUpdate = true;
  camera.position.fromArray(cam.position);
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...cam.x_axis), new THREE.Vector3(...cam.y_axis), new THREE.Vector3(...cam.z_axis));
  camera.quaternion.setFromRotationMatrix(basis);
  if (ZOOM) {
    const [zx, zy, zw, zh] = ZOOM, fw = W / zw, fh = H / zh;
    camera.setViewOffset(fw, fh, zx * fw, zy * fh, W, H);
  } else camera.aspect = W / H;
  camera.updateProjectionMatrix();

  const draco = new DRACOLoader().setDecoderPath("/node_modules/three/examples/jsm/libs/draco/gltf/");
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const parts = await Promise.all(["robot.glb", "set.glb"].map((f) => loader.loadAsync(ASSETS + f)));
  const scene = new THREE.Scene();
  const gltf = { scene: new THREE.Group() };
  for (const p of parts) gltf.scene.add(p.scene);
  scene.add(gltf.scene);
  const groupOf = (o) => { for (let p = o; p; p = p.parent) { const m = /^(robot|set)__/.exec(p.name); if (m) return [m[1], p.name]; } return [null, null]; };
  const meshes = []; gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });

  if (MODE === "density") {
    // Robot atlas texel density: R = (log2(texels per framebuffer pixel at a 8192 atlas) + 8) / 16, set black.
    renderer.setClearColor(0x000000, 1);
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const dens = new THREE.ShaderMaterial({ vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec2 vUv; void main(){ vec2 dx = dFdx(vUv * 8192.0), dy = dFdy(vUv * 8192.0); float d = sqrt(abs(dx.x * dy.y - dx.y * dy.x)); gl_FragColor = vec4((log2(max(d, 1e-4)) + 8.0) / 16.0, 0.0, 0.0, 1.0); }" });
    for (const m of meshes) m.material = groupOf(m)[0] === "robot" ? dens : black;
  } else if (MODE === "mask") {
    renderer.setClearColor(0x000000, 1);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const m of meshes) m.material = groupOf(m)[0] === "robot" ? white : black;
  } else if (MODE === "bake") {
    renderer.setClearColor(new THREE.Color(0.001, 0.006, 0.65), 1);
    // Resident robot atlas: res=2k (default, also the VT base) | 4k | 8k (B1 conventional ladder).
    const maps = { robot: await tex(ASSETS + `robot-light-${q.get("res") || "2k"}.png`), set: await tex(ASSETS + "set-light.png") };
    const vt = VT_ON ? await createVT(ASSETS + "vt/robot/", maps.robot) : null;
    state.vt = vt && vt.stats;
    const basic = { robot: new THREE.MeshBasicMaterial({ map: maps.robot }), set: new THREE.MeshBasicMaterial({ map: maps.set }) };
    for (const m of meshes) { const g = groupOf(m)[0]; m.material = g === "robot" && vt ? vt.material : basic[g]; }
    if (vt) vt.attach(scene, camera, meshes.filter((m) => groupOf(m)[0] === "robot"));
    state.vtObj = vt;
  } else if (MODE === "pbr") {
    renderer.setClearColor(new THREE.Color(0.001, 0.006, 0.65), 1);
    renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1;
    RectAreaLightUniformsLib.init();
    const [mats, lights] = await Promise.all([json(ASSETS + "materials.json"), json(ASSETS + "lights.json")]);
    const alb = { robot: await tex(ASSETS + "robot-albedo.png"), set: await tex(ASSETS + "set-albedo.png") };
    const hdr = await new HDRLoader().loadAsync(ASSETS + "env-1k.hdr");
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(hdr).texture;
    scene.environmentIntensity = 0.4; scene.environmentRotation.y = 0.78;  // world: glossy rays see HDRI x0.4
    const flatDiffuse = (s) => { // world: diffuse rays see a flat cobalt background (0.02,0.035,1) x 0.12
      s.fragmentShader = s.fragmentShader.replace("#include <lights_fragment_maps>",
        THREE.ShaderChunk.lights_fragment_maps.replace("iblIrradiance += getIBLIrradiance( geometryNormal );",
          "iblIrradiance += PI * vec3( 0.0024, 0.0042, 0.12 );"));
    };
    const cache = new Map();
    for (const m of meshes) {
      const g = groupOf(m)[0], key = `${g}/${m.material.name}`, p = mats[m.material.name] || {};
      if (!cache.has(key)) {
        const mat = new THREE.MeshPhysicalMaterial({ map: alb[g], roughness: p.roughness ?? 0.5, metalness: p.metallic ?? 0,
          transmission: p.transmission ?? 0, ior: p.ior ?? 1.45, clearcoat: p.coat ?? 0, thickness: 0.05 });
        if (p.emission_strength) { mat.emissive.set(0xffffff); mat.emissiveMap = alb[g]; mat.emissiveIntensity = p.emission_strength; }
        mat.onBeforeCompile = flatDiffuse; cache.set(key, mat);
      }
      m.material = cache.get(key);
    }
    for (const L of lights) {
      if (L.type !== "AREA") continue;
      const a = L.shape === "RECTANGLE" ? L.size : L.shape === "SQUARE" ? L.size : L.size * Math.sqrt(Math.PI) / 2;
      const b = L.shape === "RECTANGLE" ? L.size_y : L.shape === "ELLIPSE" ? L.size_y * Math.sqrt(Math.PI) / 2 : a;
      const radiance = L.energy_w / (Math.PI * a * b);  // Cycles area light: L = P / (pi A)
      const rl = new THREE.RectAreaLight(new THREE.Color(...L.color), radiance, a, b);
      rl.position.fromArray(L.position);
      rl.lookAt(new THREE.Vector3().fromArray(L.position).add(new THREE.Vector3().fromArray(L.direction)));
      scene.add(rl);
    }
  }

  // Stats for the report.
  renderer.render(scene, camera);
  state.info = { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls,
    textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
    maxTex: renderer.capabilities.maxTextureSize, gpu: gl.getParameter(gl.RENDERER) };
  const timerExt = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const pendingQ = [];
  const target = new THREE.Vector3(0.0039, 0.205 - 0.125 + 0.125, -0.365); // orbit pivot ~ robot (three coords)
  const base = camera.position.clone().sub(target);
  let n = 0, last = performance.now();
  state.ready = !ANIM && !VT_ON;
  function frame(now) {
    if (ANIM) {
      const a = Math.sin(n / 60 * Math.PI) * THREE.MathUtils.degToRad(8);
      camera.position.copy(target).add(base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a));
      camera.lookAt(target);
    }
    if (state.vtObj) state.vtObj.update();
    let qy = null;
    if (timerExt && ANIM) { qy = gl.createQuery(); gl.beginQuery(timerExt.TIME_ELAPSED_EXT, qy); }
    renderer.render(scene, camera);
    if (qy) { gl.endQuery(timerExt.TIME_ELAPSED_EXT); pendingQ.push(qy); }
    while (pendingQ.length && gl.getQueryParameter(pendingQ[0], gl.QUERY_RESULT_AVAILABLE)) {
      const r = pendingQ.shift(); if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) state.gpuMs.push(gl.getQueryParameter(r, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(r);
    }
    if (ANIM) { state.frames.push(now - last); last = now; n++; if (n >= FRAMES) { state.ready = true; return; } }
    if (VT_ON && !ANIM && state.vtObj.settled()) { state.ready = true; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------------------------------------------
// Virtual texture (C1 prototype): virtual 8192^2 robot lighting atlas in 256 px pages (L0 32x32, L1 16x16), a 2048^2
// resident base (L2 + hardware mips), a 12x12-slot physical page cache (264 px slots, 4 px gutters), a 32x32 page table
// (nearest), and a 1/8-res feedback pass that reports the page each pixel wants. The camera never waits: missing
// pages fall back to the parent page, then to the resident base; at most 2 page uploads per frame.
async function createVT(url, baseTex) {
  const meta = await json(url + "meta.json");
  const { virtualSize: V, pageSize: P, border: B, levels } = meta; // levels: number of streamed levels (2)
  const pagesL0 = V / P, SLOTS = 12, SLOT = P + 2 * B, CACHE = SLOTS * SLOT;
  const cache = new THREE.DataTexture(new Uint8Array(CACHE * CACHE * 4), CACHE, CACHE);
  cache.colorSpace = THREE.SRGBColorSpace; cache.minFilter = cache.magFilter = THREE.LinearFilter; cache.generateMipmaps = false; cache.flipY = false; cache.needsUpdate = true;
  const tableData = new Uint8Array(pagesL0 * pagesL0 * 4);
  const table = new THREE.DataTexture(tableData, pagesL0, pagesL0);
  table.minFilter = table.magFilter = THREE.NearestFilter; table.flipY = false; table.needsUpdate = true;
  const common = /* glsl */`
    varying vec2 vUv;
    uniform float uV, uPagesL0, uLodBias;
    float vtLod() { vec2 t = vUv * uV; vec2 dx = dFdx(t), dy = dFdy(t); return 0.5 * log2(max(dot(dx, dx), dot(dy, dy))) + uLodBias; }`;
  const vert = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const material = new THREE.ShaderMaterial({
    uniforms: { uV: { value: V }, uPagesL0: { value: pagesL0 }, uLodBias: { value: 0 }, uBase: { value: baseTex }, uCache: { value: cache },
      uTable: { value: table }, uSlot: { value: SLOT }, uCacheSize: { value: CACHE }, uBorder: { value: B }, uPage: { value: P }, uShow: { value: 0 } },
    vertexShader: vert,
    fragmentShader: common + /* glsl */`
      uniform sampler2D uBase, uCache, uTable; uniform float uSlot, uCacheSize, uBorder, uPage, uShow;
      void main() {
        float lod = vtLod();
        vec4 c = texture2D(uBase, vUv);
        vec4 e = texture2D(uTable, vUv);
        if (lod < float(${levels}) && e.a > 0.5) {
          float lvl = floor(e.b * 255.0 + 0.5);
          float n = uPagesL0 / exp2(lvl);
          vec2 local = fract(vUv * n);
          vec2 slot = floor(e.rg * 255.0 + 0.5);
          c = texture2D(uCache, (slot * uSlot + uBorder + local * uPage) / uCacheSize);
          if (uShow > 0.5) c.rgb = mix(c.rgb, lvl < 0.5 ? vec3(1., 0., 0.) : vec3(0., 1., 0.), 0.35);
        }
        gl_FragColor = c;
        #include <colorspace_fragment>
      }`,
  });
  const fbScale = 8;
  const fbMat = new THREE.ShaderMaterial({ uniforms: { uV: { value: V }, uPagesL0: { value: pagesL0 }, uLodBias: { value: -Math.log2(fbScale) } },
    vertexShader: vert, fragmentShader: common + /* glsl */`
      void main() {
        float lvl = clamp(floor(vtLod()), 0.0, float(${levels}));
        if (lvl >= float(${levels})) { gl_FragColor = vec4(0.0); return; }
        vec2 pg = floor(vUv * uPagesL0 / exp2(lvl));
        gl_FragColor = vec4(pg / 255.0, lvl / 255.0, 1.0);
      }` });
  const black = new THREE.MeshBasicMaterial({ color: 0, colorWrite: true });
  let fbTarget = null, fbBuf = null, scene, camera, robot = [];
  const resident = new Map();   // key -> {slot, used}
  const pending = new Map();    // key -> promise
  const ready = [];             // decoded, awaiting upload
  const queued = new Set();     // keys in ready
  const free = Array.from({ length: SLOTS * SLOTS }, (_, i) => i);
  const stats = { requested: 0, uploaded: 0, evicted: 0, bytes: 0, feedbackMs: 0, lastWanted: 0, frame: 0 };
  let wanted = new Set(), quiet = 0;
  const key = (l, x, y) => `${l}/${x}/${y}`;

  function rebuildTable() {
    for (let y = 0; y < pagesL0; y++) for (let x = 0; x < pagesL0; x++) {
      let hit = null;
      for (let l = 0; l < levels && !hit; l++) { const r = resident.get(key(l, x >> l, y >> l)); if (r) hit = [r.slot, l]; }
      const i = (y * pagesL0 + x) * 4;
      if (hit) { tableData[i] = hit[0] % SLOTS; tableData[i + 1] = Math.floor(hit[0] / SLOTS); tableData[i + 2] = hit[1]; tableData[i + 3] = 255; }
      else tableData[i + 3] = 0;
    }
    table.needsUpdate = true;
  }
  function request(k) {
    if (resident.has(k) || pending.has(k) || queued.has(k) || pending.size >= 6) return;
    stats.requested++;
    const [l, x, y] = k.split("/");
    pending.set(k, fetch(`${url}L${l}/${x}_${y}.webp`).then(async (r) => {
      const blob = await r.blob(); stats.bytes += blob.size;
      const bmp = await createImageBitmap(blob, { imageOrientation: "none", premultiplyAlpha: "none", colorSpaceConversion: "none" });
      ready.push([k, bmp]); queued.add(k);
    }).finally(() => pending.delete(k)));
  }
  function upload(renderer) {
    let n = 0;
    while (ready.length && n < 2) {
      const [k, bmp] = ready.shift(); queued.delete(k);
      if (!wanted.has(k)) { bmp.close(); continue; }  // stale async work never affects pixels
      let slot = free.pop();
      if (slot === undefined) {
        let lru = null; for (const [rk, r] of resident) if (!wanted.has(rk) && (!lru || r.used < lru[1].used)) lru = [rk, r];
        if (!lru) { bmp.close(); continue; }
        resident.delete(lru[0]); slot = lru[1].slot; stats.evicted++;
      }
      const src = new THREE.Texture(bmp); src.flipY = false; src.premultiplyAlpha = false; src.colorSpace = THREE.SRGBColorSpace; src.needsUpdate = true;
      renderer.copyTextureToTexture(src, cache, null, new THREE.Vector2((slot % SLOTS) * SLOT, Math.floor(slot / SLOTS) * SLOT));
      src.dispose(); bmp.close();
      resident.set(k, { slot, used: stats.frame }); stats.uploaded++; n++;
    }
    if (n) rebuildTable();
  }
  function feedback(renderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const fw = Math.ceil(size.x / fbScale), fh = Math.ceil(size.y / fbScale);
    if (!fbTarget || fbTarget.width !== fw) { fbTarget = new THREE.WebGLRenderTarget(fw, fh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }); fbBuf = new Uint8Array(fw * fh * 4); }
    const t0 = performance.now();
    const saved = new Map(); scene.traverse((o) => { if (o.isMesh) { saved.set(o, o.material); o.material = robot.includes(o) ? fbMat : black; } });
    const clear = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0, 0); renderer.setRenderTarget(fbTarget); renderer.render(scene, camera); renderer.setRenderTarget(null);
    renderer.setClearColor(clear, ca);
    for (const [o, m] of saved) o.material = m;
    renderer.readRenderTargetPixels(fbTarget, 0, 0, fw, fh, fbBuf);
    stats.feedbackMs = performance.now() - t0;
    const w = new Set();
    for (let i = 0; i < fbBuf.length; i += 4) if (fbBuf[i + 3]) {
      const l = fbBuf[i + 2], x = fbBuf[i], y = fbBuf[i + 1];
      for (let k = l; k < levels; k++) w.add(key(k, x >> (k - l), y >> (k - l)));  // coarse-to-fine: parents too
    }
    wanted = w; stats.lastWanted = w.size;
    for (const k of w) { const r = resident.get(k); if (r) r.used = stats.frame; }
    // Coarse levels first, and never more than the cache can hold: a request with no slot to land in would only
    // be decoded, dropped and re-requested (the parent page keeps serving those texels).
    let budget = free.length + [...resident.keys()].filter((k) => !w.has(k)).length - pending.size - ready.length;
    stats.overflow = Math.max(0, w.size - SLOTS * SLOTS);
    for (const k of [...w].sort((a, b) => b[0] - a[0])) { if (resident.has(k)) continue; if (budget-- <= 0) break; request(k); }
  }
  return {
    material, stats,
    attach(s, c, r) { scene = s; camera = c; robot = r; },
    update() {
      stats.frame++;
      if (stats.frame % 4 === 1) feedback(renderer);
      upload(renderer);
      const missing = [...wanted].filter((k) => !resident.has(k)).length;
      stats.missing = missing; stats.resident = resident.size;
      // Settled: nothing in flight and either everything wanted is resident or the cache is full of wanted pages.
      const full = resident.size >= SLOTS * SLOTS;
      quiet = stats.frame > 8 && (missing === 0 || full) && !pending.size && !ready.length ? quiet + 1 : 0;
      stats.settledFrame = quiet === 1 ? stats.frame : stats.settledFrame;
    },
    settled: () => quiet > 8,
    showLevels(on) { material.uniforms.uShow.value = on ? 1 : 0; },
  };
}

main().catch((e) => { state.error = String(e.stack || e); console.error(e); });
