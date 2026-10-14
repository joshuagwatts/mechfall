// js/vrm.js — VRM / GLB / GLTF avatar import for MECHFALL.
// Same proven path as SMASHVR: real VRMs go through @pixiv/three-vrm,
// static .glb/.gltf files go through js/autorig.js and come back as a
// pseudo-VRM record so the pose code below never knows the difference.
// Adapted: our characters face +Z (root forward), so the VRM scene keeps
// rotation.y = 0 instead of SMASHVR's +X-facing PI/2.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export async function loadVRMFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'glb' || ext === 'gltf') {
    const { autoRigCharacterFile } = await import('./autorig.js');
    return autoRigCharacterFile(file);
  }
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const url = URL.createObjectURL(file);
  try {
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error('No VRM data found in this file.');
    const vrm0 = !!(vrm.meta && vrm.meta.metaVersion === '0');
    if (vrm0) VRMUtils.rotateVRM0(vrm);
    return { vrm, vrm0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// c = character from makeBiped(): { root, rig:{group,bones}|null, vrm, _vrmRest }
export function attachAvatarToChar(c, { vrm, vrm0 }) {
  detachAvatarFromChar(c);
  if (c.rig && c.rig.group) c.rig.group.visible = false;

  // Normalize to ~1.7 units tall, feet at y=0, facing +Z (our forward).
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const h = size.y > 0 ? size.y : 1.7;
  const s = 1.7 / h;
  vrm.scene.scale.setScalar(s);
  vrm.scene.rotation.y = 0;
  vrm.scene.position.set(0, -box.min.y * s, 0);

  c.root.add(vrm.scene);
  c.vrm = { vrm, vrm0: !!vrm0 };
  c._vrmRest = null; // rest cache belongs to the previous model
  c.floater = false;
}

export function detachAvatarFromChar(c) {
  if (c.vrm && c.vrm.vrm && c.vrm.vrm.scene) {
    const sc = c.vrm.vrm.scene;
    if (sc.parent) sc.parent.remove(sc);
    sc.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          for (const k of Object.keys(m)) {
            const v = m[k];
            if (v && v.isTexture) v.dispose();
          }
          m.dispose();
        });
      }
    });
    c.vrm = null;
  }
  c._vrmRest = null;
  c.floater = false;
  if (c.rig && c.rig.group) c.rig.group.visible = true;
}
