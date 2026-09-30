import { finiteVector } from './contract.mjs';

export async function createPolicy({ ort, bytes, wasmBinary, wasmUrl, signal }) {
  signal?.throwIfAborted();
  if (ort.env.versions.web !== '1.27.0') throw new Error('Expected ONNX Runtime Web 1.27.0');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  if (wasmBinary) ort.env.wasm.wasmBinary = wasmBinary;
  else if (wasmUrl) ort.env.wasm.wasmPaths = { wasm: wasmUrl };
  else throw new Error('An explicit pinned ORT WASM source is required');
  let session;
  try { session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }); }
  finally {
    // ORT's module caches its initialized WASM runtime; the source-byte copy
    // is no longer needed after session creation and need not be pinned too.
    if (ort.env.wasm.wasmBinary === wasmBinary) ort.env.wasm.wasmBinary = undefined;
  }
  let disposed = false;
  try {
    signal?.throwIfAborted();
    const valid = (names, metadata, name, width) => names.length === 1 && names[0] === name && metadata.length === 1 && metadata[0].isTensor && metadata[0].type === 'float32' && metadata[0].shape.length === 2 && metadata[0].shape[0] === 1 && metadata[0].shape[1] === width;
    if (!valid(session.inputNames, session.inputMetadata, 'obs', 61) || !valid(session.outputNames, session.outputMetadata, 'actions', 14)) throw new Error('Expected obs float32[1,61] -> actions float32[1,14]');
  } catch (error) { await session.release(); throw error; }
  const metadata = Object.freeze({
    input: Object.freeze({ name: 'obs', type: 'float32', shape: Object.freeze([1, 61]) }),
    output: Object.freeze({ name: 'actions', type: 'float32', shape: Object.freeze([1, 14]) }),
  });
  return {
    metadata,
    get disposed() { return disposed; },
    async infer(observation) {
      if (disposed) throw new Error('Native policy disposed');
      const input = new ort.Tensor('float32', finiteVector(observation, 61, 'observation', Float32Array), [1, 61]);
      let outputs;
      try {
        outputs = await session.run({ obs: input });
        const action = outputs.actions;
        if (action?.type !== 'float32' || action.dims.length !== 2 || action.dims[0] !== 1 || action.dims[1] !== 14) throw new Error('Invalid policy output tensor');
        return finiteVector(action.data, 14, 'actions', Float32Array);
      } finally {
        input.dispose();
        for (const tensor of Object.values(outputs ?? {})) tensor.dispose();
      }
    },
    async dispose() {
      if (!disposed) {
        disposed = true;
        try { await session.release(); } finally { session = null; }
      }
    },
  };
}
