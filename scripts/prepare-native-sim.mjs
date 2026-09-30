// Deterministic, dependency-free staging for static hosting. No renderer is loaded.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const pins = JSON.parse(await readFile(new URL('../lib/sim/native/asset-manifest.json', import.meta.url)));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/prepare-native-sim.mjs [--runtime-source AUDIT_DIR | --download]\nStages public/sim/native from exact verified pins; requires no npm runtime dependencies.');
  process.exit(0);
}
let source;
let download = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--runtime-source' && args[i + 1]) source = resolve(args[++i]);
  else if (args[i] === '--download') download = true;
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
if (Boolean(source) === download) throw new Error('Choose exactly one of --runtime-source or --download');
const destination = join(root, 'public/sim/native');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const verified = (bytes, pin) => {
  if ((pin.bytes !== undefined && bytes.length !== pin.bytes) || sha256(bytes) !== pin.sha256) throw new Error(`Pin mismatch: ${pin.path ?? pin.file}`);
  return bytes;
};
const payloads = new Map();
for (const pin of pins.files) {
  let bytes;
  if (pin.vendored || !pin.path.startsWith('runtime/')) bytes = await readFile(join(root, 'lib/sim/native/assets', pin.vendored ?? pin.path));
  else if (source) bytes = await readFile(join(source, pin.source));
  else {
    // A valid generated cache permits offline rebuilds, but never bless a
    // truncated or stale sidecar merely because its filename exists.
    try { bytes = verified(await readFile(join(destination, pin.path)), pin); }
    catch {
      const response = await fetch(pin.url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${pin.url}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
  }
  payloads.set(pin.path, verified(bytes, pin));
}

// This transform is deliberately limited to the EXACT pinned XML, not an XML
// parser for arbitrary/new upstream models. Comments are retained in the source.
let xml = payloads.get('robot_allcollisions.xml').toString('utf8').replace(/<!--[\s\S]*?-->/g, '');
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
xml = xml.replace(/<geom\b[^>]*\/>/g, tag => attribute(tag, 'class') === 'visual' ? '' : tag);
const used = new Set(Array.from(xml.matchAll(/<geom\b[^>]*\/>/g), match => attribute(match[0], 'mesh')).filter(Boolean));
const meshes = [];
xml = xml.replace(/<mesh\b[^>]*\/>/g, tag => {
  const file = attribute(tag, 'file');
  if (!used.has(attribute(tag, 'name') ?? file.replace(/\.stl$/, ''))) return '';
  meshes.push(file);
  return tag;
});
if (meshes.length !== 9 || meshes.some(name => !pins.collision_meshes.some(pin => pin.file === name))) throw new Error('Unexpected collision mesh set');
xml = xml.replace('</worldbody>', '<geom name="native_floor" type="plane" size="0 0 0.05" pos="0 0 0"/></worldbody>');
xml = xml.replace('</mujoco>', '<option timestep="0.005"/></mujoco>');
payloads.set('collision.xml', verified(Buffer.from(xml), pins.prepared_model));

// Read canonical GLB position/index accessors, not a new render rig or HQ mesh.
const glb = verified(await readFile(join(root, pins.canonical_glb.path)), pins.canonical_glb);
if (glb.readUInt32LE(0) !== 0x46546c67 || glb.readUInt32LE(4) !== 2 || glb.readUInt32LE(8) !== glb.length) throw new Error('Expected canonical GLB v2');
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const binaryStart = 28 + jsonLength;
const accessor = index => {
  const acc = gltf.accessors[index], view = gltf.bufferViews[acc.bufferView];
  const types = { 5121: [1, 'readUInt8'], 5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'] };
  const [size, read] = types[acc.componentType] ?? [];
  const width = { SCALAR: 1, VEC3: 3 }[acc.type];
  if (!size || !width || acc.sparse || view.buffer !== 0) throw new Error('Unsupported canonical accessor');
  const offset = binaryStart + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return Array.from({ length: acc.count }, (_, i) => Array.from({ length: width }, (_, j) => glb[read](offset + i * (view.byteStride ?? size * width) + j * size)));
};
for (const filename of meshes) {
  const node = gltf.nodes.find(n => n.extras?.meshFile === filename || n.name === filename);
  const mesh = gltf.meshes[node?.mesh];
  if (!mesh || mesh.primitives.length !== 1) throw new Error(`Missing canonical mesh ${filename}`);
  const primitive = mesh.primitives[0];
  if ((primitive.mode ?? 4) !== 4) throw new Error('Expected triangles');
  const points = accessor(primitive.attributes.POSITION);
  const indices = primitive.indices === undefined ? points.map((_, i) => i) : accessor(primitive.indices).flat();
  if (indices.length % 3) throw new Error('Incomplete triangle');
  const stl = Buffer.alloc(84 + indices.length / 3 * 50);
  stl.writeUInt32LE(indices.length / 3, 80);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3).map(j => points[j]);
    const ab = b.map((x, j) => x - a[j]), ac = c.map((x, j) => x - a[j]);
    const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const length = Math.sqrt(normal.reduce((sum, x) => sum + x * x, 0)) || 1;
    [...normal.map(x => x / length), ...a, ...b, ...c].forEach((x, j) => stl.writeFloatLE(x, 84 + i / 3 * 50 + j * 4));
  }
  verified(stl, pins.collision_meshes.find(pin => pin.file === filename));
  payloads.set(`assets/${filename}`, stl);
}
// Validate every input before writing, and publish the manifest last.
for (const [name, bytes] of payloads) {
  const path = join(destination, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}
const manifest = { schema: 1, pins: pins.pins, model: 'collision.xml', policy: 'alpha_walking.onnx', meshes: meshes.map(name => `assets/${name}`), files: [...payloads].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })) };
await writeFile(join(destination, 'assets.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ directory: destination, files: manifest.files.length, meshes: meshes.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0) }));
