// Adulthood: the second generation of player bodies (Quaternius Superhero male / female, CC0).
// The game's poses and animations are written for the old hidden rig, so the old rig keeps running invisibly and this file
// copies its motion onto the new skeleton every frame (retargeting): for each bone, how far the old bone has turned from
// its rest pose is applied to the new bone, starting from a rest pose that was first turned to the same arm / leg directions.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const DIR = '/models/people2/';
export const SKIN2 = ['#f3d5c0', '#ecc7a9', '#e0b190', '#d09f78', '#c08a63', '#a9744f', '#8f5f3f', '#744b32', '#5e3b28', '#4b2f20', '#3a251a', '#2c1c14'];
export const EYES2 = { brown: null, hazel: '#9a7b2f', green: '#3f8f4f', blue: '#3a7bd5', grey: '#8d9aa6', amber: '#c9822b' };
export const HAIRCOL2 = { black: '#1d1816', darkbrown: '#3a2a20', brown: '#5a3b27', chestnut: '#7a4a2a', auburn: '#8a3a22', ginger: '#c0592a', blonde: '#cfa75a', grey: '#9a9a9e', white: '#dcdad4' };
export const HAIRSTYLES2 = {
  m: [{ id: 'none', name: 'Bald' }, { id: 'buzzed', name: 'Buzz cut', file: 'hair_buzzed.glb' }, { id: 'parted', name: 'Side parting', file: 'hair_parted.glb' }],
  f: [{ id: 'none', name: 'Bald' }, { id: 'buzzedf', name: 'Buzz cut', file: 'hair_buzzedf.glb' }, { id: 'buns', name: 'Buns', file: 'hair_buns.glb' }, { id: 'long', name: 'Long', file: 'hair_long.glb' }],
};
export const BEARDS2 = [{ id: 'none', name: 'None' }, { id: 'beard', name: 'Beard', file: 'beard.glb' }];
export const DEFAULT_LOOK2 = { g: 'm', skin: 3, eyes: 'brown', hs: 'buzzed', hc: 'black', bd: 'none', ht: 0, bl: 0 };

export function cleanLook2(l) {
  l = l && typeof l === 'object' ? l : {};
  const g = l.g === 'f' ? 'f' : 'm';
  const skin = Number.isInteger(l.skin) && l.skin >= 0 && l.skin < SKIN2.length ? l.skin : 3;
  const eyes = Object.hasOwn(EYES2, l.eyes) ? l.eyes : 'brown';
  const hs = HAIRSTYLES2[g].some((h) => h.id === l.hs) ? l.hs : (g === 'f' ? 'long' : 'buzzed');
  const hc = Object.hasOwn(HAIRCOL2, l.hc) ? l.hc : 'black';
  const bd = g === 'm' && BEARDS2.some((b) => b.id === l.bd) ? l.bd : 'none';
  const cl = (v) => (Number.isInteger(v) ? Math.max(-2, Math.min(2, v)) : 0);
  return { g, skin, eyes, hs, hc, bd, ht: cl(l.ht), bl: cl(l.bl) };
}

const dec = new Map();
// The server sends each look as one short string (g.skin.eyes.hs.hc.bd.ht.bl); this turns it back into a look.
export function decodeLook2(str) {
  if (dec.has(str)) return dec.get(str);
  const a = String(str).split('.');
  const l = cleanLook2({ g: a[0], skin: Number(a[1]), eyes: a[2], hs: a[3], hc: a[4], bd: a[5], ht: Number(a[6]), bl: Number(a[7]) });
  dec.set(str, l); return l;
}

const loader = new GLTFLoader();
const bodies = {}, hairs = {};
let loadingBodies = null;
export function loadPerson2() {
  if (!loadingBodies) loadingBodies = Promise.all(['m', 'f'].map((g) => loader.loadAsync(`${DIR}body_${g}.glb`).then((x) => {
    bodies[g] = x;
    x.scene.traverse((o) => { if (!o.isSkinnedMesh) return; if (/brow/i.test(o.name)) return; if (/eye/i.test(o.name)) x.scene.userData.eyeMap = o.material.map; else x.scene.userData.skinMap = o.material.map; });
  }))).then(() => true).catch(() => false);
  return loadingBodies;
}
export const person2Ready = () => !!(bodies.m && bodies.f);
function loadHair(file) { return (hairs[file] ||= loader.loadAsync(DIR + file).catch(() => null)); }

// old bone -> new bone. "aim" is the child used to read the bone's direction; bones without one borrow the turn of the bone before them.
const MAP = [
  ['Hips', 'pelvis', 'Spine02', 'spine_01'], ['Spine02', 'spine_01', 'Spine01', 'spine_02'], ['Spine01', 'spine_02', 'Spine', 'spine_03'], ['Spine', 'spine_03', 'neck', 'neck_01'],
  ['neck', 'neck_01', 'Head', 'Head'], ['Head', 'Head', null, null],
  ...['Left', 'Right'].flatMap((S) => { const s = S === 'Left' ? 'l' : 'r'; return [
    [S + 'Shoulder', 'clavicle_' + s, S + 'Arm', 'upperarm_' + s], [S + 'Arm', 'upperarm_' + s, S + 'ForeArm', 'lowerarm_' + s],
    [S + 'ForeArm', 'lowerarm_' + s, S + 'Hand', 'hand_' + s], [S + 'Hand', 'hand_' + s, null, null],
    [S + 'UpLeg', 'thigh_' + s, S + 'Leg', 'calf_' + s], [S + 'Leg', 'calf_' + s, S + 'Foot', 'foot_' + s],
    [S + 'Foot', 'foot_' + s, S + 'ToeBase', 'ball_' + s], [S + 'ToeBase', 'ball_' + s, null, null]]; }),
];

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();
const relQ = (bone, root, out) => { bone.getWorldQuaternion(out); root.getWorldQuaternion(_qr).invert(); return out.premultiply(_qr); };
const relP = (bone, root, out) => { _m.copy(root.matrixWorld).invert(); return out.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_m); };

// Build the new body inside the avatar. M is the old (hidden) model state from model.js.
export function attach2(group, M, look) {
  const g = look.g, src = bodies[g];
  if (!src) return false;
  const root = clone(src.scene);
  const P = new THREE.Group(); P.add(root);
  group.add(P);
  const bones = {}; root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  let body = null, eyes = null, brows = null;
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.frustumCulled = false; o.material = o.material.clone();
    if (/brow/i.test(o.name)) brows = o; else if (/eye/i.test(o.name)) eyes = o; else body = o;
  });
  // old rig: hide its meshes, keep its bones moving
  M.root.traverse((o) => { if (o.isSkinnedMesh) o.visible = false; });
  for (const [nm, r0] of Object.entries(M.rig.rest)) { const ob = M.rig.bones[nm]; if (ob) { ob.rotation.copy(r0.e); ob.position.copy(r0.p); } }   // the model's own rest pose
  group.updateWorldMatrix(true, true);
  const oldBox = new THREE.Box3().setFromObject(M.root, true), oldH = oldBox.max.y - oldBox.min.y;
  const newBox = new THREE.Box3().setFromObject(body, true), newH = newBox.max.y - newBox.min.y;
  const s = oldH / newH;
  P.scale.setScalar(s);
  P.position.y = -newBox.min.y * s;
  group.updateWorldMatrix(true, true);
  const oldBones = M.rig.bones;
  const pairs = [];
  const rootBone = bones.root;
  for (const [ob, nb, oc, nc] of MAP) {
    const o = oldBones[ob], n = bones[nb];
    if (!o || !n) continue;
    const e = { o, n, ob, nb, par: n.parent === rootBone ? null : n.parent.name, oRest: relQ(o, M.root, new THREE.Quaternion()), nRest: relQ(n, P, new THREE.Quaternion()), R: new THREE.Quaternion() };
    if (oc && oldBones[oc] && bones[nc]) {
      const od = relP(oldBones[oc], M.root, new THREE.Vector3()).sub(relP(o, M.root, _v2)).normalize();
      const nd = relP(bones[nc], P, new THREE.Vector3()).sub(relP(n, P, _v2)).normalize();
      e.R.setFromUnitVectors(nd, od); e.dbg = [od.toArray().map((v) => +v.toFixed(2)), nd.toArray().map((v) => +v.toFixed(2))];
    } else if (pairs.length) e.R.copy(pairs[pairs.length - 1].R);
    if (nb === 'Head') e.R.identity();
    e.aligned = new THREE.Quaternion().multiplyQuaternions(e.R, e.nRest);
    e.cur = new THREE.Quaternion();
    pairs.push(e);
  }
  const rootRest = relQ(rootBone, P, new THREE.Quaternion());
  const pelvis = bones.pelvis;
  const restHipOld = relP(oldBones.Hips, M.root, new THREE.Vector3());
  const restPelvisNew = relP(pelvis, P, new THREE.Vector3());
  const base = { oy: M.root.position.y, ox: M.root.position.x, oz: M.root.position.z };
  M.p2 = { P, root, bones, body, eyes, brows, pairs, rootRest, rootBone, restHipOld, restPelvisNew, base, s, g, hair: null, beard: null, sig: '', clothSig: '', shells: [], factor: M.root.scale.x, src, baseY: P.position.y };
  // aim-matched rest pose
  for (const e of pairs) { e.n.quaternion.copy(e.cur.copy(e.aligned)); }
  // (the quaternions above are in the root frame; the first retarget call turns them into local ones)
  retarget2(group);
  return true;
}

export function detach2(group) {
  const M = group.userData.model; if (!M || !M.p2) return;
  const p = M.p2;
  group.remove(p.P);
  // geometry and textures are shared with the cache; only the per-person materials go
  p.P.traverse((o) => { if (o.isMesh && o.material) o.material.dispose(); });
  M.root.traverse((o) => { if (o.isSkinnedMesh) o.visible = true; });
  M.p2 = null;
}

const qP = new THREE.Quaternion(), qD = new THREE.Quaternion(), qC = new THREE.Quaternion(), qRoot = new THREE.Quaternion();
// Every frame, after the old rig has been posed.
export function retarget2(group) {
  const M = group.userData.model, p = M && M.p2;
  if (!p) return;
  p.P.position.set(M.root.position.x - p.base.ox, M.root.position.y - p.base.oy + p.baseY, M.root.position.z - p.base.oz);
  p.P.rotation.copy(M.root.rotation);
  group.updateWorldMatrix(true, true);
  const done = {};
  for (const e of p.pairs) {
    relQ(e.o, M.root, qC);                                   // old bone now, in the root frame
    // turn since rest, in the root frame = now * rest^-1
    qD.copy(qC).multiply(_q.copy(e.oRest).invert());
    e.cur.multiplyQuaternions(qD, e.aligned);                // wanted orientation of the new bone in the root frame
    const parentQ = e.par ? done[e.par] : p.rootRest;
    e.n.quaternion.copy(_q2.copy(parentQ).invert().multiply(e.cur));
    done[e.nb] = e.cur;
  }
  // hips: move the pelvis the way the old hips moved (the "root" bone only turns, so undo that turn)
  relP(p.pairs[0].o, M.root, _v2).sub(p.restHipOld).multiplyScalar(p.factor / p.P.scale.y);
  _v.copy(p.restPelvisNew).add(_v2).applyQuaternion(_q2.copy(p.rootRest).invert());
  p.bones.pelvis.position.copy(_v);
}

// ---- Looks ----------------------------------------------------------------------------------------------------------
const texCache = {};
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function canvasOf(img) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); return { c, x }; }
function texFrom(canvas, src) { const t = new THREE.CanvasTexture(canvas); t.flipY = src.flipY; t.colorSpace = src.colorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.anisotropy = 4; t.channel = src.channel; return t; }
const baseMean = {};
function skinTexture(g, tone) {
  const key = g + tone; if (texCache[key]) return texCache[key];
  const src = bodies[g].scene.userData.skinMap;
  const { c, x } = canvasOf(src.image);
  const d = x.getImageData(0, 0, c.width, c.height), px = d.data;
  if (!baseMean[g]) {   // average colour of the bright (skin) pixels
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 16) { if (px[i] + px[i + 1] + px[i + 2] > 330) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++; } }
    baseMean[g] = n ? [r / n, gg / n, b / n] : [200, 160, 140];
  }
  const t = hexRGB(SKIN2[tone]), m = baseMean[g], f = [t[0] / m[0], t[1] / m[1], t[2] / m[2]];
  for (let i = 0; i < px.length; i += 4) { px[i] = Math.min(255, px[i] * f[0]); px[i + 1] = Math.min(255, px[i + 1] * f[1]); px[i + 2] = Math.min(255, px[i + 2] * f[2]); }
  x.putImageData(d, 0, 0);
  return (texCache[key] = texFrom(c, src));
}
function eyeTexture(g, id) {
  const key = 'e' + g + id; if (texCache[key]) return texCache[key];
  const src = bodies[g].scene.userData.eyeMap;
  if (!EYES2[id]) return (texCache[key] = src);
  const { c, x } = canvasOf(src.image);
  const d = x.getImageData(0, 0, c.width, c.height), px = d.data;
  const tc = new THREE.Color(EYES2[id]), th = {}; tc.getHSL(th);
  const o = new THREE.Color();
  for (let i = 0; i < px.length; i += 4) {
    const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]);
    const sat = mx ? (mx - mn) / mx : 0;
    if (sat > 0.28 && mx < 235) { const v = mx / 255; o.setHSL(th.h, Math.min(1, th.s * 0.9 + 0.1), Math.min(0.9, v * (th.l / 0.4))); px[i] = o.r * 255; px[i + 1] = o.g * 255; px[i + 2] = o.b * 255; }
  }
  x.putImageData(d, 0, 0);
  return (texCache[key] = texFrom(c, src));
}

// Clothing is drawn as thin coloured shells cut from the body itself (a tee, shorts, shoes), so the skinning is identical.
const REGION = {
  top: (x, y) => y > 1.0 && (y < 1.5 || (Math.abs(x) > 0.1 && y < 1.57)) && Math.abs(x) < 0.33,
  bottom: (x, y) => y > 0.6 && y <= 1.02,
  shoes: (x, y) => y < 0.105,
};
const OFFSET = { top: 0.0075, bottom: 0.0075, shoes: 0.011 };
const shellGeos = {};
function shellGeo(g, kind, body) {
  const key = g + kind; if (shellGeos[key]) return shellGeos[key];
  const geo = body.geometry, pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index;
  const inside = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) inside[i] = REGION[kind](pos.getX(i), pos.getY(i)) ? 1 : 0;
  const keep = [];
  for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2); if (inside[a] && inside[b] && inside[c]) keep.push(a, b, c); }
  const np = new Float32Array(pos.count * 3), off = OFFSET[kind];
  for (let i = 0; i < pos.count; i++) { np[i * 3] = pos.getX(i) + nor.getX(i) * off; np[i * 3 + 1] = pos.getY(i) + nor.getY(i) * off; np[i * 3 + 2] = pos.getZ(i) + nor.getZ(i) * off; }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(np, 3));
  sg.setAttribute('normal', nor); sg.setAttribute('skinIndex', geo.attributes.skinIndex); sg.setAttribute('skinWeight', geo.attributes.skinWeight);
  sg.setIndex(keep);
  return (shellGeos[key] = sg);
}
const DEFAULT_CLOTH = { top: '#d9d4cc', bottom: '#46566e', shoes: '#3a3a3a' };

// Apply a look (cleaned look2) and optional worn colours. Safe to call every frame.
export function applyLook2(group, look, cloth) {
  const M = group.userData.model, p = M && M.p2;
  if (!p) return;
  look = cleanLook2(look);
  const cl = { top: (cloth && cloth.top) || DEFAULT_CLOTH.top, bottom: (cloth && cloth.bottom) || DEFAULT_CLOTH.bottom, shoes: (cloth && cloth.shoes) || DEFAULT_CLOTH.shoes };
  const sig = [look.g, look.skin, look.eyes, look.hs, look.hc, look.bd, look.ht, look.bl, cl.top, cl.bottom, cl.shoes].join('|');
  if (p.sig === sig) return;
  const prev = p.look || {};
  p.sig = sig; p.look = look;
  const g = look.g;
  if (prev.skin !== look.skin || !prev.g) p.body.material.map = skinTexture(g, look.skin), p.body.material.needsUpdate = true;
  if (prev.eyes !== look.eyes || !prev.g) { p.eyes.material.map = eyeTexture(g, look.eyes); p.eyes.material.needsUpdate = true; }
  const hc = new THREE.Color(HAIRCOL2[look.hc]);
  if (p.brows) p.brows.material.color.copy(hc).multiplyScalar(0.8);
  // build and height
  const bw = 1 + 0.045 * look.bl, hh = 1 + 0.03 * look.ht;
  p.P.scale.set(p.s * bw * hh, p.s * hh, p.s * bw * hh);
  // hair and beard (load on demand)
  const setPiece = (slot, entry) => {
    const want = entry && entry.file ? entry.file : null;
    if (p[slot] && p[slot].file === want) { p[slot].mesh.material.color.copy(hc); return; }
    if (p[slot]) { p[slot].mesh.removeFromParent(); p[slot].mesh.material.dispose(); p[slot] = null; }
    if (!want) return;
    const token = (p[slot + 'Tok'] = (p[slot + 'Tok'] || 0) + 1);
    loadHair(want).then((gl) => {
      if (!gl || M.p2 !== p || p[slot + 'Tok'] !== token) return;
      const sc = clone(gl.scene); let m = null; sc.traverse((o) => { if (o.isSkinnedMesh && !m) m = o; });
      if (!m) return;
      const bs = m.skeleton.bones.map((b) => p.bones[b.name]);
      if (bs.some((b) => !b)) return;
      m.removeFromParent();
      m.bind(new THREE.Skeleton(bs, m.skeleton.boneInverses.map((x) => x.clone())), m.bindMatrix);
      m.frustumCulled = false; m.material = m.material.clone(); m.material.color.copy(p.hairCol || hc);
      p.P.add(m); p[slot] = { file: want, mesh: m };
    });
  };
  p.hairCol = hc;
  setPiece('hair', HAIRSTYLES2[g].find((h) => h.id === look.hs));
  setPiece('beard', BEARDS2.find((b) => b.id === look.bd));
  // clothes
  for (const kind of ['top', 'bottom', 'shoes']) {
    let sh = p.shells.find((x) => x.kind === kind);
    if (!sh) {
      const mesh = new THREE.SkinnedMesh(shellGeo(g, kind, p.body), new THREE.MeshStandardMaterial({ color: cl[kind], roughness: 0.9 }));
      mesh.frustumCulled = false; mesh.bind(p.body.skeleton, p.body.bindMatrix); p.P.add(mesh);
      p.shells.push((sh = { kind, mesh }));
    }
    sh.mesh.material.color.set(cl[kind]);
  }
}
