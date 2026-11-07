// Adulthood: the 3D person for players. Two bodies (public/models/people/man.glb and woman.glb), about 16,000 triangles each.
// Each player gets their own copy with its own walk, run, stand, sit and work poses. The hair and clothes are painted into the
// model, so for now the outfit colours of Boutique clothes do not show on the body (worn accessories still do).
// If the models cannot load, the simple built-in figure stays, so the game still works.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { captureRig, poseStand, poseSit, poseExercise, exerciseTilt } from './rig.js';

const BODIES = ['man', 'woman'];
const HEIGHT = 1.75;   // metres for the man; the woman keeps her size relative to him
const WALK_MIN = 0.4, RUN_MIN = 3.0;   // metres per second

const gltfs = {};
let loading = null, ready = false, factor = 1;
const waiting = new Set();   // avatars made before the models arrived

export function loadModel() {
  if (!loading) {
    loading = Promise.all(BODIES.map((b) => new GLTFLoader().loadAsync(`/models/people/${b}.glb`).then((g) => { gltfs[b] = g; }))).then(() => {
      gltfs.man.scene.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(gltfs.man.scene, true);
      factor = HEIGHT / (bb.max.y - bb.min.y);
      ready = true;
      for (const fn of waiting) fn();
      waiting.clear();
    }).catch(() => { /* keep the simple figure */ });
  }
  return loading;
}
export const modelReady = () => ready;
export const whenModelReady = (fn) => { if (ready) fn(); else waiting.add(fn); };

const mat = (c) => new THREE.MeshStandardMaterial({ color: c });

// Put a model inside this avatar group and hide the simple figure. Calling it again with another body swaps the body.
export function attachModel(group, body = 'man') {
  if (!ready) return;
  if (!BODIES.includes(body)) body = 'man';
  if (group.userData.model) {
    if (group.userData.model.body === body) return;
    detachModel(group);
  }
  const g = gltfs[body];
  const root = clone(g.scene);
  root.scale.setScalar(factor);
  root.traverse((o) => {
    if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); o.material.roughness = 0.85; }
  });
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root, true);
  root.position.y -= bb.min.y;
  group.add(root);
  for (const o of group.userData.legacy || []) o.visible = false;
  for (const m of group.userData.dress || []) { group.remove(m); m.geometry.dispose(); m.material.dispose(); }
  group.userData.dress = [];
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const name of ['walk', 'run']) {
    const clip = THREE.AnimationClip.findByName(g.animations, name);
    if (clip) { actions[name] = mixer.clipAction(clip); actions[name].play(); actions[name].setEffectiveWeight(0); }
  }
  const rig = captureRig(root);
  group.userData.model = { root, mixer, actions, cur: 'idle', rig, bones: rig.bones, extras: [], heading: 0, b: 1, body, phase: Math.random() * 6 };
  group.userData.lookKey = null; // dress again
}

function detachModel(group) {
  const M = group.userData.model;
  if (!M) return;
  for (const m of M.extras) { m.parent && m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }
  group.remove(M.root);
  M.root.traverse((o) => { if (o.isMesh) o.material.dispose(); });
  group.userData.model = null;
}

// Worn accessories (the Boutique's cap, shades, watch, bag and chain) are small pieces on the right bones.
// The outfit colours themselves cannot repaint the painted-in clothes yet; that needs separate clothing pieces.
export function dressModel(group, look, catalog) {
  const M = group.userData.model;
  if (!M) return;
  const acc = (look || []).map((id) => (id && catalog ? catalog.byId[id] : null))[3];
  for (const m of M.extras) { m.parent && m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }
  M.extras = [];
  if (!acc) return;
  const k = 1 / (factor || 1);   // the bones live inside the scaled model, so sizes are given in model units
  const put = (bone, mesh, x, y, z, rx = 0) => {
    const b = M.bones[bone];
    if (!b) return;
    mesh.position.set(x * k, y * k, z * k);
    mesh.scale.setScalar(k);
    mesh.rotation.x = rx;
    b.add(mesh);
    M.extras.push(mesh);
  };
  if (acc.kind === 'cap') put('Head', new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(acc.color)), 0, 0.1, 0.0);
  else if (acc.kind === 'shades') put('Head', new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.03), mat(acc.color)), 0, 0.06, 0.1);
  else if (acc.kind === 'watch') put('LeftHand', new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 12), mat(acc.color)), 0, 0.02, 0);
  else if (acc.kind === 'bag') put('Spine', new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.1), mat(acc.color)), 0.22, -0.05, 0.05);
  else if (acc.kind === 'chain') put('Spine', new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 8, 16), mat(acc.color)), 0, 0.13, 0.1, Math.PI / 2.4);
}

// Called every frame. speed is how fast the person is moving (m/s), heading the way they face,
// working true while on a shift, sitting true while seated.
export function animateModel(group, dt, speed, heading, working, t, sitting = false, exercise = 0) {
  const M = group.userData.model;
  if (!M) return;
  M.root.rotation.order = 'YXZ';
  if (exercise && !sitting) {
    for (const a of Object.values(M.actions)) a.setEffectiveWeight(0);
    M.mixer.update(dt);
    const tl = exerciseTilt(exercise, t);
    M.root.rotation.x += (tl.x - M.root.rotation.x) * Math.min(1, dt * 8);
    M.root.position.y += (tl.y - M.root.position.y) * Math.min(1, dt * 8);
    poseStand(M.rig, t, 1, false, M.phase);
    poseExercise(M.rig, exercise, t, 1);
    if (!M.weights) M.weights = [];
    if (exercise === 1 && !M.weights.length) for (const hand of ['LeftHand', 'RightHand']) {
      const bone = M.rig.bones[hand]; if (!bone) continue;
      const w = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8), new THREE.MeshStandardMaterial({ color: '#888' }));
      bar.rotation.z = Math.PI / 2;
      for (const sx of [-0.1, 0.1]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), new THREE.MeshStandardMaterial({ color: '#222' })); pl.rotation.z = Math.PI / 2; pl.position.x = sx; w.add(pl); }
      w.add(bar); const ws = new THREE.Vector3(); bone.getWorldScale(ws); w.scale.setScalar(1 / (ws.y || 1)); bone.add(w); M.weights.push(w);
    }
    return;
  }
  if (M.weights && M.weights.length) { for (const w of M.weights) w.parent && w.parent.remove(w); M.weights = []; }
  if (M.root.rotation.x !== 0 || M.root.position.y !== 0) { M.root.rotation.x += (0 - M.root.rotation.x) * Math.min(1, dt * 10); M.root.position.y += (0 - M.root.position.y) * Math.min(1, dt * 10); if (Math.abs(M.root.rotation.x) < 0.01) M.root.rotation.x = 0; if (Math.abs(M.root.position.y) < 0.01) M.root.position.y = 0; }
  if (sitting) {
    for (const a of Object.values(M.actions)) a.setEffectiveWeight(0);
    M.mixer.update(dt);
    poseSit(M.rig, group, 0.45, 0);
    return;
  }
  const want = speed > RUN_MIN ? 'run' : speed > WALK_MIN ? 'walk' : 'idle';
  const target = want === 'idle' ? 1 : 0;
  M.b += (target - M.b) * Math.min(1, dt * 9);
  if (want !== 'idle') M.cur = want;
  const move = M.actions[M.cur === 'run' ? 'run' : 'walk'];
  for (const [n, a] of Object.entries(M.actions)) a.setEffectiveWeight(n === (M.cur === 'run' ? 'run' : 'walk') ? 1 - M.b : 0);
  if (move) move.timeScale = M.cur === 'run' ? Math.max(0.7, Math.min(1.4, speed / 4.5)) : Math.max(0.6, Math.min(1.4, speed / 1.4));
  M.mixer.update(dt);
  // Turn to face where you are going.
  if (speed > WALK_MIN) {
    const d = ((heading - M.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    M.root.rotation.y += d * Math.min(1, dt * 10);
  }
  poseStand(M.rig, t, M.b, working && M.b > 0.5, M.phase);
}