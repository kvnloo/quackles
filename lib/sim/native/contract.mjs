// Independently implemented numeric contract; see NOTICE.md for provenance.
import * as constants from '../../../vendor/microduck-simulator/constants.js';

// Do not expose the vendor's mutable arrays as backend-owned state.
export const JOINT_NAMES = Object.freeze([...constants.JOINT_NAMES]);
export const DEFAULT_POSE = Object.freeze(Array.from(constants.DEFAULT_POSE));
export const TIMESTEP = constants.TIMESTEP;
export const DECIMATION = constants.DECIMATION;
export const CONTROL_DT = constants.CTRL_DT;

export function finiteVector(values, size, name, Type = Float64Array) {
  if (!values || values.length !== size) throw new TypeError(`${name} length must be ${size}`);
  const result = Type.from(values);
  if (!Array.from(values).every(x => typeof x === 'number' && Number.isFinite(x)) || !result.every(Number.isFinite)) {
    throw new TypeError(`${name} must contain finite numbers`);
  }
  return result;
}

export function actionTargets(action) {
  const raw = finiteVector(action, 14, 'action', Float32Array);
  return Float64Array.from(DEFAULT_POSE, (pose, i) => pose + raw[i]);
}

export function buildObservation({ angularVelocity, quaternion, positions, velocities, previousAction, command }) {
  finiteVector(angularVelocity, 3, 'angularVelocity', Float32Array);
  finiteVector(positions, 14, 'positions', Float32Array);
  finiteVector(velocities, 14, 'velocities', Float32Array);
  finiteVector(previousAction, 14, 'previousAction', Float32Array);
  finiteVector(command, 13, 'command', Float32Array);
  const [w, x, y, z] = finiteVector(quaternion, 4, 'quaternion');
  if (Math.abs(Math.hypot(w, x, y, z) - 1) > 1e-6) throw new TypeError('quaternion must be unit length');
  const obs = new Float32Array(61);
  obs.set(angularVelocity, 0);
  // R(q)^T * (0, 0, -1), with MuJoCo's WXYZ convention.
  obs.set([2 * (w * y - x * z), -2 * (y * z + w * x), 2 * (x * x + y * y) - 1], 3);
  for (let i = 0; i < 14; i++) obs[6 + i] = positions[i] - DEFAULT_POSE[i];
  obs.set(velocities, 20);
  obs.set(previousAction, 34);
  obs.set(command, 48);
  return obs;
}
