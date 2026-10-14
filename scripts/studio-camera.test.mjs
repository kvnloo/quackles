import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeHeroCamera} from '../lib/studio/camera.ts';
import info from '../public/studio/scene.json' with {type:'json'};
test('hero camera is an explicit PerspectiveCamera preserving the Blender pose, not R3F lookAt(0)',()=>{
  const camera=makeHeroCamera(info.camera);
  assert.equal(camera.isPerspectiveCamera,true);
  assert.deepEqual(camera.position.toArray(),info.camera.position);
  assert.deepEqual(camera.quaternion.toArray(),info.camera.quaternion);
  assert.equal(camera.aspect,2/3);
  assert.equal(camera.fov,info.camera.fov);
});
