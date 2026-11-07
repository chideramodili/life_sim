// Adulthood: the people who are not players: street pedestrians, waiting passengers, and the staff and customers inside buildings.
// They use the real models (public/models/people/*-lite.glb): man, woman, elder and baby, each cut down to a few thousand triangles.
// People are told apart by body, and by skin tone (the base skin is light, so a tint gives the other tones). Standing, sitting
// and walking are in rig.js. If the models cannot load, the simple boxy figures stay.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { captureRig, poseStand, poseSit } from './rig.js';

const BODIES = ['man', 'woman', 'elder', 'baby'];
const url = (b) => `/models/people/${b}-lite.glb`;
const HEIGHT = 1.75;   // metres for the man; the others keep their size relative to him
let ready = false, loading = null, factor = 1;
const gltfs = {};
const waiting = new Set();
const mats = new Map();

// Skin tints multiplied onto the base texture (light to dark). Weighted towards the tones of the cities in the game.
const TINTS = [[1, 1, 1], [0.96, 0.88, 0.8], [0.88, 0.74, 0.62], [0.78, 0.62, 0.5], [0.68, 0.52, 0.41], [0.58, 0.44, 0.35]];
const TINT_W = [0.04, 0.1, 0.2, 0.3, 0.25, 0.11];

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (h, w) => { let r = (h % 1000) / 1000, i = 0; for (; i < w.length - 1; i++) { if (r < w[i]) break; r -= w[i]; } return i; };

export function loadNpc() {
  if (!loading) {
    loading = Promise.all(BODIES.map((b) => new GLTFLoader().loadAsync(url(b)).then((g) => { gltfs[b] = g; }))).then(() => {
      const man = gltfs.man.scene;
      man.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(man, true);
      factor = HEIGHT / (bb.max.y - bb.min.y);
      ready = true;
      for (const fn of waiting) fn();
      waiting.clear();
    }).catch(() => { /* keep the simple figures */ });
  }
  return loading;
}
export const whenNpcReady = (fn) => { if (ready) fn(); else waiting.add(fn); };

function material(body, tint, base) {
  const key = body + tint;
  let m = mats.get(key);
  if (!m) { m = base.clone(); m.color = new THREE.Color(...TINTS[tint]); m.roughness = 0.85; mats.set(key, m); }
  return m;
}

// Replace the simple figure in this group with a real person. `look` can say { body } ('man', 'woman', 'elder', 'baby') and { tone } (0 to 5);
// otherwise both come from the colours, so the same person always looks the same.
export function upgradeToNpc(group, look = {}) {
  if (!ready || group.userData.npc) return;
  const h = hash([look.skin, look.top, look.bottom, look.shoes].join('|'));
  const body = BODIES.includes(look.body) ? look.body : ['man', 'woman', 'elder'][pick(h >>> 3, [0.42, 0.42, 0.16])];
  const tint = Number.isInteger(look.tone) ? look.tone : pick(h >>> 7, TINT_W);
  const g = gltfs[body];
  const root = clone(g.scene);
  root.scale.setScalar(factor);
  root.traverse((o) => { if (o.isMesh) { o.material = material(body, tint, o.material); o.frustumCulled = false; } });
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root, true);
  root.position.y -= bb.min.y;
  for (const c of group.children) c.visible = false;   // the simple figure
  group.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const walk = THREE.AnimationClip.findByName(g.animations, 'walk');
  const action = walk ? mixer.clipAction(walk) : null;
  if (action) { action.play(); action.time = Math.random() * walk.duration; }
  const rig = captureRig(root);
  group.userData.npc = { root, mixer, action, rig, bones: rig.bones, b: 1, phase: Math.random() * 6, seated: false, body };
}

// Every frame: walk when moving (speed in m/s), stand when not.
export function moveNpc(group, dt, speed) {
  const M = group.userData.npc;
  if (!M) return;
  if (M.seated) { poseSit(M.rig, group, M.drop, M.lean); return; }
  const target = speed > 0.3 ? 0 : 1;
  M.b += (target - M.b) * Math.min(1, dt * 8);
  if (M.action) {
    M.action.setEffectiveWeight(1 - M.b);
    M.action.timeScale = Math.max(0.6, Math.min(1.5, speed / 1.4)) || 1;
  }
  M.mixer.update(dt);
  poseStand(M.rig, performance.now() / 1000, M.b, false, M.phase);
}

// Sit this person down (a passenger in a bus, train or plane). The pose is applied every frame by moveNpc, and once now.
export function seatNpc(group, { drop = 0.45, lean = 0 } = {}) {
  const M = group.userData.npc;
  if (!M || M.seated) return;
  M.seated = true; M.drop = drop; M.lean = lean;
  if (M.action) M.action.stop();
  poseSit(M.rig, group, drop, lean);
}