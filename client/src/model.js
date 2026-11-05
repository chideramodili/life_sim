// Adulthood: the 3D person for players. Two bodies (public/models/people/man.glb and woman.glb), about 16,000 triangles each.
// Each player gets their own copy with its own walk, run, stand, sit and work poses. The hair and clothes are painted into the
// model, so for now the outfit colours of Boutique clothes do not show on the body (worn accessories still do).
// If the models cannot load, the simple built-in figure stays, so the game still works.
import * as THREE from 'three';
import { NAPE } from './nape.js';
import { CLOTH } from './clothmask.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { applyHairStyle } from './hair.js';
import { attach2, detach2, retarget2, applyLook2, loadPerson2, person2Ready } from './person2.js';
import { captureRig, poseWork, poseStand, poseSit, poseExercise, exerciseTilt, poseReach, turn, fitForward } from './rig.js';

const BODIES = ['man', 'woman'];
const HEIGHT = 1.75;   // metres for the man; the woman keeps her size relative to him
const WALK_MIN = 0.4, RUN_MIN = 3.0;   // metres per second

const gltfs = {};
let loading = null, ready = false, factor = 1;
const waiting = new Set();   // avatars made before the models arrived

export function loadModel() {
  if (!loading) {
    loading = Promise.all([loadPerson2(), ...BODIES.map((b) => new GLTFLoader().loadAsync(`/models/people/${b}.glb`).then((g) => { gltfs[b] = g; }))]).then(() => {
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

// The character's looks. Skin, hair and eyes are all painted into the body texture, so each combination is baked onto a copy of
// that texture (shared by everyone with the same body and choices). The original look (skin 0, brown hair, brown eyes) needs no copy.
//  - skin: pixels that are skin coloured get a tint; hair and brows: dark brown pixels are recoloured keeping their shading;
//  - eyes: the iris discs, measured on the textures (one entry per visible iris).
export const EYE_COLOURS = { brown: null, hazel: '#9a7b2f', green: '#3f8f4f', blue: '#3a7bd5', grey: '#8d9aa6', amber: '#c9822b' };
export const HAIR_COLOURS = { brown: null, black: '#2a2523', chestnut: '#7a4a2a', auburn: '#8a3a22', ginger: '#c0592a', blonde: '#cfa75a', grey: '#8f8f93', white: '#d8d6d0' };
// 12 skin tones: 0 is the model's own, then light to deep (multiplied onto the skin pixels).
export const SKIN_TONES = [[1, 1, 1], [1.04, 0.99, 0.97], [0.97, 0.9, 0.82], [0.9, 0.78, 0.66], [0.82, 0.68, 0.55], [0.74, 0.58, 0.46], [0.66, 0.5, 0.39], [0.58, 0.43, 0.33], [0.5, 0.36, 0.28], [0.43, 0.3, 0.23], [0.36, 0.25, 0.2], [0.3, 0.2, 0.16]];
const IRIS = {
  man:   [[658, 868, 4.6], [705, 857, 3.6]],
  woman: [[734.5, 849, 5.2], [211, 961, 5.6]],
};
const BASE_SKIN = [224, 172, 142];
export const skinHex = (i) => '#' + BASE_SKIN.map((c, n) => Math.min(255, Math.round(c * SKIN_TONES[i][n])).toString(16).padStart(2, '0')).join('');
const bakes = {};
// Hue (degrees), HSV saturation and value. Skin sits at roughly 0-30 degrees; the beige and grey clothes sit above that.
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return [0, 0, mx];
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, d / mx, mx];
}
export function bakeTexture(body, look, src, cloth, tag = '') {
  const covered = !!look.style && look.style !== 'original';   // a hairstyle shell hides the model's own hair
  const key = `${tag}${body}:${look.skin}:${look.hair}:${look.eyes}:${covered ? 1 : 0}:${cloth ? cloth.top + cloth.bottom + cloth.shoes : ''}`;
  if (bakes[key]) return bakes[key];
  const img = src.image;
  const W = img.width || 1024, k = W / 1024;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = img.height || W;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  if (look.skin || look.hair !== 'brown' || covered) {
    const all = ctx.getImageData(0, 0, cv.width, cv.height), d = all.data;
    // skin patches that carry baked hair paint (nape, behind the ears) get plain skin when a hairstyle covers them
    let mask = null, avg = [0, 0, 0];
    if (covered && NAPE[body]) {
      const m = document.createElement('canvas'); m.width = cv.width; m.height = cv.height;
      const mc = m.getContext('2d'); mc.fillStyle = '#fff'; mc.strokeStyle = '#fff'; mc.lineWidth = 2 * k;
      const u = NAPE[body];
      for (let i = 0; i < u.length; i += 6) { mc.beginPath(); mc.moveTo(u[i] * cv.width, u[i + 1] * cv.height); mc.lineTo(u[i + 2] * cv.width, u[i + 3] * cv.height); mc.lineTo(u[i + 4] * cv.width, u[i + 5] * cv.height); mc.closePath(); mc.fill(); mc.stroke(); }
      mask = mc.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) { const [h, s, v] = rgb2hsv(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255); if ((h <= 30 || h >= 345) && v > 0.55 && s > 0.2 && s < 0.5) { avg[0] += d[i]; avg[1] += d[i + 1]; avg[2] += d[i + 2]; n++; } }
      if (n) avg = avg.map((c) => c / n); else avg = [224, 172, 142];
    }
    const st = SKIN_TONES[look.skin], hc = HAIR_COLOURS[look.hair] ? new THREE.Color(HAIR_COLOURS[look.hair]) : null;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
      const [h, s, v] = rgb2hsv(R, G, B);
      const warm = h <= 30 || h >= 345;
      if (!warm) continue;                    // blue/grey/beige clothes, eyes and so on
      if (mask && mask[i] > 128 && v > 0.08 && v <= 0.45 && s > 0.25) {   // baked hair paint on skin: paint skin instead
        d[i] = Math.min(255, avg[0] * st[0]); d[i + 1] = Math.min(255, avg[1] * st[1]); d[i + 2] = Math.min(255, avg[2] * st[2]);
        continue;
      }
      if (v > 0.42 && s > 0.2 && look.skin) {   // skin
        d[i] = Math.min(255, d[i] * st[0]); d[i + 1] = Math.min(255, d[i + 1] * st[1]); d[i + 2] = Math.min(255, d[i + 2] * st[2]);
      } else if (v > 0.1 && v <= 0.42 && s > 0.3 && hc) {   // hair, brows, lashes
        const f = Math.max(0.5, Math.min(2.2, v / 0.29)) * 255;
        d[i] = Math.min(255, hc.r * f); d[i + 1] = Math.min(255, hc.g * f); d[i + 2] = Math.min(255, hc.b * f);
      }
    }
    ctx.putImageData(all, 0, 0);
  }
  if (cloth && CLOTH[body]) {
    // outfit colours: the grey top and the dark trousers are painted into the texture, so recolour those pixels (keeping their shading)
    const all = ctx.getImageData(0, 0, cv.width, cv.height), d = all.data;
    for (const slot of ['top', 'bottom', 'shoes']) {
      if (!cloth[slot]) continue;
      const u = CLOTH[body][slot], t = new THREE.Color(cloth[slot]);
      const m = document.createElement('canvas'); m.width = cv.width; m.height = cv.height;
      const mc = m.getContext('2d'); mc.fillStyle = '#fff'; mc.strokeStyle = '#fff'; mc.lineWidth = 2 * k;
      for (let i = 0; i < u.length; i += 6) { mc.beginPath(); mc.moveTo(u[i] * cv.width, u[i + 1] * cv.height); mc.lineTo(u[i + 2] * cv.width, u[i + 3] * cv.height); mc.lineTo(u[i + 4] * cv.width, u[i + 5] * cv.height); mc.closePath(); mc.fill(); mc.stroke(); }
      const mk = mc.getImageData(0, 0, cv.width, cv.height).data, hit = [];
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (mk[i] < 128) continue;
        const [h, s] = rgb2hsv(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
        if (slot !== 'shoes' && (h <= 30 || h >= 345) && s > 0.2) continue;   // skin and hair stay (shoes are painted over the bare feet) (the grey top is only slightly warm)
        hit.push(i); sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      }
      if (!hit.length) continue;
      const avg = sum / hit.length;
      for (const i of hit) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const f = Math.max(0.6, Math.min(1.12, lum / avg)) * 255;
        d[i] = Math.min(255, t.r * f); d[i + 1] = Math.min(255, t.g * f); d[i + 2] = Math.min(255, t.b * f);
      }
    }
    ctx.putImageData(all, 0, 0);
  }
  if (look.eyes !== 'brown') {
    const t = new THREE.Color(EYE_COLOURS[look.eyes]);
    for (const [cx, cy, r] of IRIS[body]) {
      const x0 = Math.floor((cx - r - 1) * k), y0 = Math.floor((cy - r - 1) * k), n = Math.ceil((2 * r + 3) * k);
      const d = ctx.getImageData(x0, y0, n, n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const dist = Math.hypot((x0 + i + 0.5) / k - cx, (y0 + j + 0.5) / k - cy);
        if (dist > r) continue;
        const o = (j * n + i) * 4, R = d.data[o], G = d.data[o + 1], B = d.data[o + 2];
        const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
        if (lum < 0.1 || lum > 0.8) continue;   // keep the pupil and the white highlights
        const edge = Math.min(1, (r - dist) / 1.2);   // soft edge so no ring shows
        const f = (0.8 + 1.2 * Math.min(lum, 0.6)) * 255;
        d.data[o]     = R + (Math.min(255, t.r * f) - R) * edge;
        d.data[o + 1] = G + (Math.min(255, t.g * f) - G) * edge;
        d.data[o + 2] = B + (Math.min(255, t.b * f) - B) * edge;
      }
      ctx.putImageData(d, x0, y0);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = src.flipY; tex.colorSpace = src.colorSpace; tex.wrapS = src.wrapS; tex.wrapT = src.wrapT;
  tex.anisotropy = src.anisotropy; tex.channel = src.channel;
  return (bakes[key] = tex);
}
// Give this person their looks: { eyes, skin, hair }. Safe to call every frame: it only works when something changed.
export function applyLook(group, look = {}) {
  if (look.v2) {   // new-generation body: it has its own looks
    group.userData.lookWant = look;
    const M2 = group.userData.model;
    if (M2 && M2.p2) applyLook2(group, look.v2, group.userData.cloth);
    return;
  }
  const eyes = Object.hasOwn(EYE_COLOURS, look.eyes) ? look.eyes : 'brown';
  const hair = Object.hasOwn(HAIR_COLOURS, look.hair) ? look.hair : 'brown';
  const skin = Number.isInteger(look.skin) && look.skin >= 0 && look.skin < SKIN_TONES.length ? look.skin : 0;
  const style = look.style || 'original';
  const cloth = group.userData.cloth || null;
  const L = { eyes, hair, skin, style }, id = `${eyes}|${hair}|${skin}|${style === 'original' ? 0 : 1}|${cloth ? cloth.top + cloth.bottom + cloth.shoes : ''}`;
  const M = group.userData.model;
  group.userData.lookWant = { ...L, style, face: look.face };
  if (!M) return;
  applyHairStyle(M, style, HAIR_COLOURS[hair] || '#4a2f1d', skinHex(skin), factor);
  applyFace(group, look.face);
  if (M.lookId === id) return;
  M.lookId = id;
  M.root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (!o.userData.origMap) o.userData.origMap = o.material.map;
    const src = o.userData.origMap;
    if (!src || !src.image) return;
    o.material.map = id === 'brown|brown|0|0|' ? src : bakeTexture(M.body, L, src, cloth);
    o.material.needsUpdate = true;
  });
}

const mat = (c) => new THREE.MeshStandardMaterial({ color: c });

// Put a model inside this avatar group and hide the simple figure. Calling it again with another body swaps the body.
export function attachModel(group, body = 'man', look2 = null) {
  if (!ready) return;
  if (look2) body = look2.g === 'f' ? 'woman' : 'man';
  if (!BODIES.includes(body)) body = 'man';
  if (group.userData.model) {
    if (group.userData.model.body === body && !!group.userData.model.p2 === !!look2 && (!look2 || group.userData.model.p2.g === look2.g)) return;
    if (group.userData.model.body === body && look2 && !group.userData.model.p2) { if (person2Ready() && attach2(group, group.userData.model, look2)) applyLook(group, { ...(group.userData.lookWant || {}), v2: look2 }); return; }
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
  const skinned = []; root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  const rig = captureRig(root);
  group.userData.model = { hairMesh: skinned.length > 1 ? skinned[1] : null, root, mixer, actions, cur: 'idle', rig, bones: rig.bones, extras: [], heading: 0, b: 1, body, phase: Math.random() * 6 };
  group.userData.lookKey = null; // dress again
  if (look2 && person2Ready()) attach2(group, group.userData.model, look2);
  if (look2) group.userData.lookWant = { ...(group.userData.lookWant || {}), v2: look2 };
  if (group.userData.lookWant) applyLook(group, group.userData.lookWant);
}

function detachModel(group) {
  const M = group.userData.model;
  if (!M) return;
  for (const m of M.extras) { m.parent && m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }
  if (M.p2) detach2(group);
  group.remove(M.root);
  M.root.traverse((o) => { if (o.isMesh) o.material.dispose(); });
  group.userData.model = null;
}

// Worn accessories (the Boutique's cap, shades, watch, bag and chain) are small pieces on the right bones.
// The outfit colours themselves cannot repaint the painted-in clothes yet; that needs separate clothing pieces.
export function dressModel(group, look, catalog) {
  const M = group.userData.model;
  if (!M) return;
  const worn = (look || []).map((id) => (id && catalog ? catalog.byId[id] : null));
  const acc = worn[3];
  const cl = { top: worn[0] ? worn[0].color : null, bottom: worn[1] ? worn[1].color : null, shoes: worn[2] ? worn[2].color : null };
  const nk = (cl.top || '') + (cl.bottom || '') + (cl.shoes || '');
  if (nk !== (group.userData.cloth ? group.userData.cloth.top + group.userData.cloth.bottom + group.userData.cloth.shoes : '')) {
    group.userData.cloth = nk ? { top: cl.top || '', bottom: cl.bottom || '', shoes: cl.shoes || '' } : null;
    M.lookId = null;   // rebake with the new colours
    if (group.userData.lookWant) applyLook(group, group.userData.lookWant);
  }
  for (const m of M.extras) { m.parent && m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }
  M.extras = [];
  if (!acc) return;
  M.root.updateMatrixWorld(true);
  const put = (bone, mesh, x, y, z, rx = 0) => {
    const b = M.p2 ? M.p2.bones[{ Head: 'Head', LeftHand: 'hand_l', Spine: 'spine_03' }[bone]] : M.bones[bone];
    if (!b) return;
    // The bones sit inside an armature that is scaled down (centimetres), so measure the real scale of this bone.
    const k = (factor || 1) / (new THREE.Vector3().setFromMatrixScale(b.matrixWorld).x || 1);
    mesh.position.set(x * k, y * k, z * k);
    mesh.scale.setScalar(k);
    mesh.rotation.x = rx;
    b.add(mesh);
    M.extras.push(mesh);
  };
  if (!acc) return;
  if (acc.kind === 'cap') {
    const g = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(0.098, 0.105, 0.115);
    put('Head', new THREE.Mesh(g, mat(acc.color)), 0, 0.165, 0.004, -0.06);
  }
  else if (acc.kind === 'shades') put('Head', new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.03), mat(acc.color)), 0, 0.128, 0.118);
  else if (acc.kind === 'watch') put('LeftHand', new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 12), mat(acc.color)), 0, 0.02, 0);
  else if (acc.kind === 'bag') put('Spine', new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.1), mat(acc.color)), 0.22, -0.05, 0.05);
  else if (acc.kind === 'chain') put('Spine', new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 8, 16), mat(acc.color)), 0, 0.13, 0.1, Math.PI / 2.4);
}

// ---- Things held while working: rag, mop and bucket, tray, book. Each is stuck to a hand bone but kept at a fixed angle relative to the body. ----
const always_props = (style) => style === 'mop' || style === 'tray' || style === 'shelve' || style === 'carry' || style === 'coach';
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
function clearProps(group, M) {
  for (const pr of M.props || []) { pr.obj.parent && pr.obj.parent.remove(pr.obj); }
  if (M.bucket) { M.bucket.parent && M.bucket.parent.remove(M.bucket); M.bucket = null; }
  M.props = []; M.propStyle = null;
}
function buildProp(style) {
  const out = [];
  const grp = new THREE.Group();
  if (style === 'wash') {
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.12), mat('#f2d046')));
    out.push({ bone: 'RightHand', grp, q: [0, 0, 0] });
  } else if (style === 'mop') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.35, 8), mat('#a77b4b')); pole.position.y = -0.4;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.12), mat('#e6e1d0')); head.position.y = -1.05;
    grp.add(pole, head);
    out.push({ bone: 'RightHand', grp, q: [-0.6, 0, 0] });
  } else if (style === 'tray') {
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 16), mat('#c9ced6')); tray.position.y = 0.08;
    grp.add(tray);
    for (const [x, z, c] of [[-0.07, 0, '#e8e8e8'], [0.07, 0.03, '#d9453d'], [0, -0.07, '#e8e8e8']]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.08, 8), mat(c)); cup.position.set(x, 0.13, z); grp.add(cup); }
    out.push({ bone: 'RightHand', grp, q: [0, 0, 0] });
  } else if (style === 'shelve') {
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), mat('#3a6ea5')));
    out.push({ bone: 'RightHand', grp, q: [0, 0, 0] });
  } else if (style === 'carry') {          // a cardboard parcel with a label, held at the chest
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.26), mat('#b98a52')));
    const lab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.005, 0.09), mat('#f4f4f0')); lab.position.set(0, 0.103, 0); grp.add(lab);
    grp.children.forEach((c) => c.position.add(new THREE.Vector3(0.13, 0.08, 0.14)));
    out.push({ bone: 'RightHand', grp, q: [0, 0, 0] });
  } else if (style === 'coach') {          // clipboard
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.26), mat('#6b4a2f')); board.position.set(-0.08, 0.1, 0.1);
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.005, 0.22), mat('#f4f4f0')); sheet.position.set(-0.08, 0.112, 0.1);
    grp.add(board, sheet);
    out.push({ bone: 'LeftHand', grp, q: [0.5, 0, 0] });
  } else if (style === 'mic') {            // microphone
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat('#2a2a2e')); hd.position.y = 0.12;
    const hdl = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.13, 8), mat('#555a62')); hdl.position.y = 0.04;
    grp.add(hd, hdl);
    out.push({ bone: 'RightHand', grp, q: [-0.2, 0, 0] });
  } else if (style === 'type') {           // open laptop resting on the left forearm
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.21), mat('#b8bcc4')); base.position.set(-0.1, 0.05, 0.1);
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.012), mat('#1c2030')); scr.position.set(-0.1, 0.16, 0.2); scr.rotation.x = -0.25;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16), new THREE.MeshBasicMaterial({ color: '#5ab0ff' })); glow.position.set(-0.1, 0.16, 0.19); glow.rotation.x = Math.PI - 0.25; glow.rotation.y = Math.PI;
    grp.add(base, scr, glow);
    out.push({ bone: 'LeftHand', grp, q: [0, 0, 0] });
  } else if (style === 'desk') {
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), mat('#1c2f6b')); pen.position.y = -0.05;
    grp.add(pen);
    out.push({ bone: 'RightHand', grp, q: [-0.9, 0, 0] });
  }
  return out;
}
function syncProps(group, M, style, dt, t) {
  if ((M.propStyle || null) !== style) {
    clearProps(group, M);
    if (style) {
      M.root.updateMatrixWorld(true);
      for (const d of buildProp(style)) {
        const b = M.bones[d.bone]; if (!b) continue;
        const k = (factor || 1) / (new THREE.Vector3().setFromMatrixScale(b.matrixWorld).x || 1);
        d.grp.scale.setScalar(k);
        d.grp.position.set(0, 0.07 * k, 0);
        b.add(d.grp);
        M.props.push({ obj: d.grp, bone: b, rootQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(...d.q)) });
      }
      if (style === 'mop') {   // a yellow mop bucket on wheels that moves along beside the cleaner
        const bk = new THREE.Group();
        const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.32, 14), mat('#f2c230')); tub.position.y = 0.2;
        const wr = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.12), mat('#555')); wr.position.set(0, 0.42, -0.14);
        bk.add(tub, wr); group.add(bk); M.bucket = bk;
      }
    }
    M.propStyle = style;
  }
  if (!style) return;
  M.root.updateMatrixWorld(true);
  M.root.getWorldQuaternion(_qa);
  for (const pr of M.props) {
    pr.bone.getWorldQuaternion(_qb);
    _qc.copy(_qa).multiply(pr.rootQ);
    pr.obj.quaternion.copy(_qb.invert()).multiply(_qc);
  }
  if (M.bucket) {
    const ry = M.root.rotation.y;
    M.bucket.position.set(Math.cos(ry) * 0.6 + Math.sin(ry) * 0.45, 0, -Math.sin(ry) * 0.6 + Math.cos(ry) * 0.45);
  }
}

// Called every frame. speed is how fast the person is moving (m/s), heading the way they face,
// working true while on a shift, sitting true while seated.
export function animateModel(group, dt, speed, heading, working, t, sitting = false, exercise = 0) {
  animateOld(group, dt, speed, heading, working, t, sitting, exercise);
  if (group.userData.model && group.userData.model.p2) retarget2(group);
}
function animateOld(group, dt, speed, heading, working, t, sitting = false, exercise = 0) {
  const M = group.userData.model;
  if (!M) return;
  M.root.rotation.order = 'YXZ';
  if (exercise && !sitting) {
    for (const a of Object.values(M.actions)) a.setEffectiveWeight(0);
    M.mixer.update(dt);
    if (exercise === 9) M.root.rotation.y += (0 - M.root.rotation.y) * Math.min(1, dt * 10);   // lie along the bed
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
  if (M.root.position.x !== 0 || M.root.position.z !== 0) { M.root.position.x *= 1 - Math.min(1, dt * 10); M.root.position.z *= 1 - Math.min(1, dt * 10); if (Math.abs(M.root.position.x) + Math.abs(M.root.position.z) < 0.01) M.root.position.x = M.root.position.z = 0; }
  if (M.root.rotation.x !== 0 || M.root.position.y !== 0) { M.root.rotation.x += (0 - M.root.rotation.x) * Math.min(1, dt * 10); M.root.position.y += (0 - M.root.position.y) * Math.min(1, dt * 10); if (Math.abs(M.root.rotation.x) < 0.01) M.root.rotation.x = 0; if (Math.abs(M.root.position.y) < 0.01) M.root.position.y = 0; }
  if (sitting) {
    for (const a of Object.values(M.actions)) a.setEffectiveWeight(0);
    M.mixer.update(dt);
    if (sitting === 'bike') {
      // Riding a motorbike: sit on the seat (a little behind the middle), face the way the bike goes, hands on the handlebars.
      const d = ((heading - M.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      M.root.rotation.y += d * Math.min(1, dt * 12);
      M.root.position.y += (0.42 - M.root.position.y) * Math.min(1, dt * 10);
      M.root.position.x += (-Math.sin(heading) * 0.18 - M.root.position.x) * Math.min(1, dt * 10);
      M.root.position.z += (-Math.cos(heading) * 0.18 - M.root.position.z) * Math.min(1, dt * 10);
      poseSit(M.rig, group, 0.45, 0.45);
      for (const side of ['Left', 'Right']) {
        turn(M.rig, side + 'UpLeg', -1.2, 0, side === 'Left' ? -0.2 : 0.2, 1); turn(M.rig, side + 'Leg', 1.1, 0, 0, 1);
      }
      if (M.fwd === undefined) M.fwd = fitForward(M.root, M.rig);
      if (M.fwd) for (const side of ['Left', 'Right']) { turn(M.rig, side + 'Arm', ...M.fwd[side].a, 1); turn(M.rig, side + 'ForeArm', ...M.fwd[side].f, 1); }
      turn(M.rig, 'Head', -0.2, 0, 0, 1);
      return;
    }
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
  const wk = group.userData.work;   // { style, face } while on a shift with a work routine
  if (wk && wk.face != null && speed <= WALK_MIN) {   // standing at the work station: turn to face it
    const d = ((wk.face - M.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    M.root.rotation.y += d * Math.min(1, dt * 8);
  }
  poseStand(M.rig, t, M.b, working && !wk && M.b > 0.5, M.phase);
  if (wk) {
    const always = always_props(wk.style);   // these keep their arms while walking
    poseWork(M.rig, wk.style, t, always ? 1 : M.b);
  }
  syncProps(group, M, wk && (always_props(wk.style) || M.b > 0.5) ? wk.style : null, dt, t);
  // Reaching for a door handle (set by the street view while you are right at a door).
  const rw = group.userData.reach || 0;
  if (rw > 0.02) poseReach(M.rig, rw);
}

// ---- Face shape sliders -------------------------------------------------------------------------------------------
// Each slider is a whole number from -3 to 3 (0 = the model's own face). They gently reshape the head mesh around
// landmarks (nose tip, mouth, chin). Every person gets their own copy of the head geometry the first time it changes.
export const FACE_KEYS = ['noseW', 'noseL', 'lipFull', 'mouthW', 'jawW', 'chinL', 'faceW'];
const marks = {};
function faceMarks(body, pos) {
  if (marks[body]) return marks[body];
  let miny = 1e9, maxy = -1e9;
  for (let i = 1; i < pos.length; i += 3) { miny = Math.min(miny, pos[i]); maxy = Math.max(maxy, pos[i]); }
  const H = maxy - miny; let nose = -1;
  for (let i = 0; i < pos.length; i += 3) {
    if ((pos[i + 1] - miny) / H > 0.86 && Math.abs(pos[i]) < 0.02 && (nose < 0 || pos[i + 2] > pos[nose + 2])) nose = i;
  }
  return (marks[body] = { ny: pos[nose + 1], nz: pos[nose + 2], H });
}
const g2 = (d, s) => Math.exp(-(d * d) / (s * s));
export function applyFace(group, face) {
  const M = group.userData.model;
  if (!M) return;
  const f = FACE_KEYS.map((_, i) => (Array.isArray(face) && Number.isInteger(face[i]) ? Math.max(-3, Math.min(3, face[i])) : 0));
  const id = f.join(',');
  group.userData.faceWant = f;
  if (M.faceId === id || (M.faceId === undefined && !f.some(Boolean))) { M.faceId = id; return; }
  M.faceId = id;
  const [nW, nL, lF, mW, jW, cL, fW] = f;
  M.root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const geo = o.geometry;
    if (!geo.userData.faceBase) {   // first change: take a private plain copy of the positions (the shared one may be interleaved)
      const a = geo.attributes.position, flat = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { flat[i * 3] = a.getX(i); flat[i * 3 + 1] = a.getY(i); flat[i * 3 + 2] = a.getZ(i); }
      geo.userData.faceBase = { array: flat };
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flat), 3));
    }
    const base = geo.userData.faceBase.array, out = geo.attributes.position.array;
    const m = faceMarks(M.body, base), ny = m.ny, nz = m.nz;
    const my = ny - 0.032, cy = ny - 0.075;
    for (let i = 0; i < base.length; i += 3) {
      let x = base[i], y = base[i + 1], z = base[i + 2];
      const dy = y - ny;
      if (dy > -0.16 && dy < 0.2 && z > nz - 0.13) {   // only the head's face side; the neck and the back are left alone
        const front = Math.max(0, Math.min(1, (z - (nz - 0.13)) / 0.1));
        if (nW) { const w = g2(dy + 0.012, 0.028) * g2(x, 0.032) * front; x *= 1 + 0.22 * nW / 3 * w; }
        if (nL) { const w = g2(dy + 0.004, 0.022) * g2(x, 0.02) * front; z += 0.016 * nL / 3 * w; y -= 0.003 * nL / 3 * w; }
        if (lF) { const w = g2(y - my, 0.013) * g2(x, 0.034) * front; z += 0.005 * lF / 3 * w; y = my + (y - my) * (1 + 0.45 * lF / 3 * w); }
        if (mW) { const w = g2(y - my, 0.014) * g2(x, 0.05) * front; x *= 1 + 0.24 * mW / 3 * w; }
        if (jW) { const w = g2(y - (my - 0.018), 0.034) * Math.min(1, Math.abs(x) / 0.03) * front; x *= 1 + 0.15 * jW / 3 * w; }
        if (cL) { const w = g2(y - cy, 0.024) * g2(x, 0.045) * front; y -= 0.02 * cL / 3 * w; z += 0.004 * cL / 3 * w; }
      }
      if (fW) { const w = Math.max(0, Math.min(1, (dy + 0.1) / 0.06)) * Math.max(0, Math.min(1, (0.2 - dy) / 0.08)); x *= 1 + 0.05 * fW / 3 * w; }
      out[i] = x; out[i + 1] = y; out[i + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
  });
}
