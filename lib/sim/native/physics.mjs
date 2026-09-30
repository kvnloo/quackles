import { JOINT_NAMES, TIMESTEP, finiteVector } from './contract.mjs';

function resolveMapping(mj, model) {
  const id = (kind, name) => {
    const value = mj.mj_name2id(model, mj.mjtObj[kind].value, name);
    if (value < 0) throw new Error(`Missing ${name}`);
    return value;
  };
  const opt = model.opt;
  try {
    if (Math.abs(opt.timestep - TIMESTEP) > 1e-12) throw new Error('Expected timestep 0.005');
  } finally { opt.delete(); }
  if (model.nu !== 14 || model.nq !== 21 || model.nv !== 20 || model.nbody !== 16) throw new Error('Unsupported Microduck model dimensions');
  const joints = JOINT_NAMES.map(name => {
    const joint = id('mjOBJ_JOINT', name), actuator = id('mjOBJ_ACTUATOR', name);
    if (model.jnt_type[joint] !== mj.mjtJoint.mjJNT_HINGE.value) throw new Error(`Expected hinge ${name}`);
    if (model.actuator_trntype[actuator] !== mj.mjtTrn.mjTRN_JOINT.value || model.actuator_trnid[2 * actuator] !== joint) throw new Error(`Incorrect actuator transmission ${name}`);
    return Object.freeze({ name, joint, actuator, qpos: model.jnt_qposadr[joint], dof: model.jnt_dofadr[joint] });
  });
  for (const key of ['joint', 'actuator', 'qpos', 'dof']) {
    if (new Set(joints.map(j => j[key])).size !== 14) throw new Error(`Duplicate ${key} mapping`);
  }
  const trunk = id('mjOBJ_BODY', 'trunk_base');
  const free = id('mjOBJ_JOINT', 'trunk_base_freejoint');
  if (model.jnt_type[free] !== mj.mjtJoint.mjJNT_FREE.value || model.jnt_bodyid[free] !== trunk) throw new Error('Invalid trunk freejoint');
  const rootQpos = model.jnt_qposadr[free], rootDof = model.jnt_dofadr[free];
  if (rootQpos !== 0 || rootDof !== 0 || joints.some(j => j.qpos < 7 || j.qpos >= model.nq || j.dof < 6 || j.dof >= model.nv)) throw new Error('Overlapping root/joint addresses');
  const gyro = id('mjOBJ_SENSOR', 'imu_ang_vel');
  if (model.sensor_dim[gyro] !== 3 || model.sensor_type[gyro] !== mj.mjtSensor.mjSENS_GYRO.value) throw new Error('Expected 3-axis imu_ang_vel gyro');
  return Object.freeze({ joints: Object.freeze(joints), trunk, rootQpos, rootDof, gyro: model.sensor_adr[gyro] });
}

// Embind model/data/VFS ownership stays here. Never hand heap views to callers.
export function createPhysics({ mujoco: mj, xml, meshes }) {
  let vfs, model, data, mapping;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      try { data?.delete(); } finally { try { model?.delete(); } finally { vfs?.delete(); } }
    } finally {
      // A disposed backend may remain referenced by React. Do not retain its
      // model/data wrappers or the per-instance MuJoCo WASM heap through it.
      data = null; model = null; vfs = null; mj = null;
    }
  };
  const check = () => { if (disposed) throw new Error('Native physics disposed'); };
  try {
    if (mj.mj_versionString() !== '3.11.0') throw new Error('Expected MuJoCo 3.11.0');
    vfs = new mj.MjVFS();
    for (const [name, bytes] of meshes) {
      if (!/^assets\/[a-z0-9_]+\.stl$/.test(name)) throw new Error('Invalid collision VFS path');
      vfs.addBuffer(name, bytes);
    }
    model = mj.MjModel.from_xml_string(xml, vfs);
    mapping = resolveMapping(mj, model);
    data = new mj.MjData(model);
  } catch (error) { dispose(); throw error; }
  const read = () => {
    check();
    return {
      angularVelocity: new Float64Array(data.sensordata.slice(mapping.gyro, mapping.gyro + 3)),
      quaternion: new Float64Array(data.xquat.slice(mapping.trunk * 4, mapping.trunk * 4 + 4)),
      positions: Float64Array.from(mapping.joints, j => data.qpos[j.qpos]),
      velocities: Float64Array.from(mapping.joints, j => data.qvel[j.dof]),
    };
  };
  const snapshot = () => {
    check();
    return {
      time: data.time, position: new Float64Array(data.qpos.slice(0, 3)),
      quaternion: new Float64Array(data.qpos.slice(3, 7)),
      joints: Float64Array.from(mapping.joints, j => data.qpos[j.qpos]),
      qpos: new Float64Array(data.qpos), velocity: new Float64Array(data.qvel),
      controls: Float64Array.from(mapping.joints, j => data.ctrl[j.actuator]),
    };
  };
  return {
    mapping,
    dimensions: Object.freeze({ nq: model.nq, nv: model.nv, nu: model.nu, nbody: model.nbody }),
    read, snapshot, dispose,
    seed({ position, quaternion, joints, velocity }) {
      check();
      const p = finiteVector(position, 3, 'position'), q = finiteVector(quaternion, 4, 'quaternion');
      const angles = finiteVector(joints, 14, 'joints'), speed = finiteVector(velocity, 20, 'velocity');
      if (Math.abs(Math.hypot(...q) - 1) > 1e-6) throw new TypeError('quaternion must be unit length');
      mj.mj_resetData(model, data);
      data.qpos.set(p, 0); data.qpos.set(q, 3); data.qvel.set(speed);
      mapping.joints.forEach((j, i) => { data.qpos[j.qpos] = angles[i]; data.ctrl[j.actuator] = angles[i]; });
      mj.mj_forward(model, data);
    },
    control(targets) {
      check();
      const values = finiteVector(targets, 14, 'controls');
      mapping.joints.forEach((j, i) => { data.ctrl[j.actuator] = values[i]; });
    },
    step() { check(); mj.mj_step(model, data); },
    forward() { check(); mj.mj_forward(model, data); },
  };
}
