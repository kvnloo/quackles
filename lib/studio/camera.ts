import {PerspectiveCamera} from 'three';
export function makeHeroCamera(c: {fov:number;aspect:number;near:number;far:number;position:number[];quaternion:number[]}): PerspectiveCamera {
  // Passing an instance prevents R3F's default lookAt(0,0,0) from replacing the locked quaternion.
  const camera = new PerspectiveCamera(c.fov,c.aspect,c.near,c.far);
  camera.position.fromArray(c.position);
  camera.quaternion.fromArray(c.quaternion);
  camera.updateMatrixWorld();
  return camera;
}
