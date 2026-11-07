// Adulthood: seats on buses, trains and planes. You sit in your own seat, look around freely (drag), and cannot walk.
// Three cabins are built from boxes: bus (also the coach), train, plane. Passengers sit in the seats around you.
// Two ways to use a cabin:
//   world bus: the cabin IS the bus driving through the city, so you see the real street out of the windows.
//   detached:  for trips between places (train, coach, flight) the cabin sits far away from the city, and the windows show
//              scenery that streams past (poles and trees for the road and rail, clouds and a wing for the plane).
import * as THREE from 'three';
import { whenNpcReady, upgradeToNpc, seatNpc } from './npc.js';

const SPECS = {
  bus:   { w: 2.5, len: 9,  h: 2.35, seatX: [-0.92, -0.46, 0.46, 0.92],                rows: 8,  pitch: 1.0, wallIn: '#c9c2b0', wallOut: '#f2b705', floor: '#3b3b44', seat: '#2f5f9e', winLo: 0.95, winHi: 1.9, winW: 0.82, front: 'glass', eyeCol: 0, eyeRow: 4, speed: 16 },
  train: { w: 3.0, len: 14, h: 2.6,  seatX: [-1.1, -0.62, 0.62, 1.1],                   rows: 10, pitch: 1.2, wallIn: '#d8d4cc', wallOut: '#3a5a8a', floor: '#4a4a52', seat: '#a8432f', winLo: 0.9,  winHi: 2.0, winW: 1.0,  front: 'wall',  eyeCol: 0, eyeRow: 5, speed: 38 },
  plane: { w: 3.5, len: 16, h: 2.3,  seatX: [-1.3, -0.86, -0.42, 0.42, 0.86, 1.3],      rows: 12, pitch: 1.0, wallIn: '#e6e8ec', wallOut: '#dfe3ea', floor: '#5a5f6b', seat: '#2a4f7a', winLo: 1.0,  winHi: 1.5, winW: 0.4,  front: 'wall',  eyeCol: 0, eyeRow: 6, speed: 0 },
};
SPECS.taxi = { w: 1.8, len: 4.3, h: 1.5, seatX: [-0.45, 0.45], rows: 2, pitch: 1.2, wallIn: '#cfc8b8', wallOut: '#f7c600', floor: '#2f2f36', seat: '#3a3a42', winLo: 0.75, winHi: 1.3, winW: 0.95, front: 'glass', eyeCol: 1, eyeRow: 0, speed: 0, driver: { row: 1, col: 0 }, randomShare: 0.15, small: true };
SPECS.car = { ...SPECS.taxi, wallOut: '#c0392b', seat: '#4a3a30' };
export const CABIN_KINDS = Object.keys(SPECS);

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const mats = new Map();
const mat = (c, o) => { const k = c + JSON.stringify(o || {}); if (!mats.has(k)) mats.set(k, lam(c, o)); return mats.get(k); };
const box = (g, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };

const SKIN = ['#f1c9a5', '#d9a47a', '#b07a54', '#8a5a3c', '#6b4129', '#4a2c1c'];
const CLOTH = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400', '#7f8c8d', '#e8e8e8', '#2c3e50'];
const seeded = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// Build one cabin. Returns { group, eye, forward, seats }. The group faces +Z (the way it travels). The origin is the middle of the floor.
export function buildCabin(kind, { seed = 1, passengers = true, exterior = false } = {}) {
  const S = SPECS[kind];
  const r = seeded(seed * 7919 + 13);
  const g = new THREE.Group();
  const z0 = -S.len / 2, z1 = S.len / 2;
  const inM = mat(S.wallIn), outM = mat(S.wallOut), trim = mat('#222', {});
  // Walls: the inside face is wallIn, the outside face wallOut. BoxGeometry face order: +x, -x, +y, -y, +z, -z.
  const wallMats = (side) => (side > 0 ? [outM, inM, outM, outM, outM, outM] : [inM, outM, outM, outM, outM, outM]);
  // floor, ceiling, back wall
  box(g, S.w, 0.1, S.len, mat(S.floor), 0, -0.05, 0);
  box(g, S.w, 0.1, S.len, inM, 0, S.h + 0.05, 0);
  if (exterior) box(g, S.w - 0.1, 0.06, S.len - 0.1, outM, 0, S.h + 0.11, 0);
  box(g, S.w, S.h, 0.1, inM, 0, S.h / 2, z0 - 0.05);
  // front: windscreen for the bus (so you can see the road ahead), a plain wall otherwise
  if (S.front === 'glass') {
    box(g, S.w, S.winLo, 0.1, inM, 0, S.winLo / 2, z1 + 0.05);
    box(g, S.w, S.h - S.winHi, 0.1, inM, 0, (S.winHi + S.h) / 2, z1 + 0.05);
  } else box(g, S.w, S.h, 0.1, inM, 0, S.h / 2, z1 + 0.05);
  // side walls with window gaps
  for (const side of [-1, 1]) {
    const x = side * (S.w / 2 + 0.05);
    const wm = wallMats(side);
    for (let i = 0; i < S.rows; i++) {
      const zc = z0 + (S.len - S.rows * S.pitch) / 2 + S.pitch * (i + 0.5);
      box(g, 0.1, S.winLo, S.winW, wm, x, S.winLo / 2, zc);
      box(g, 0.1, S.h - S.winHi, S.winW, wm, x, (S.winHi + S.h) / 2, zc);
      // the post between this window and the next
      box(g, 0.1, S.h, S.pitch - S.winW, wm, x, S.h / 2, zc + S.pitch / 2);
    }
    // the ends of the wall before the first and after the last window
    const first = z0 + (S.len - S.rows * S.pitch) / 2;
    box(g, 0.1, S.h, Math.max(0.05, first - z0), wm, x, S.h / 2, (z0 + first) / 2);
    const lastEnd = first + S.rows * S.pitch;
    box(g, 0.1, S.h, Math.max(0.05, z1 - lastEnd), wm, x, S.h / 2, (lastEnd + z1) / 2);
  }
  // ceiling lights
  for (let i = 0; i < Math.ceil(S.len / 3); i++) box(g, 0.5, 0.04, 1.0, mat('#fff8e0', { emissive: '#fff2c0' }), 0, S.h - 0.03, z0 + 1.5 + i * 3);
  // luggage racks (train, plane)
  if (kind !== 'bus') for (const side of [-1, 1]) box(g, S.w * 0.2, 0.3, S.len - 1, mat('#bfc4cc'), side * (S.w / 2 - S.w * 0.12), S.h - 0.35, 0);
  // seats
  const seats = [];
  const seatM = mat(S.seat), headM = mat('#d8d8dc');
  const rowZ = (i) => z0 + (S.len - S.rows * S.pitch) / 2 + S.pitch * (i + 0.5);
  for (let i = 0; i < S.rows; i++) for (let c = 0; c < S.seatX.length; c++) {
    const x = S.seatX[c], z = rowZ(i);
    box(g, 0.42, 0.12, 0.44, seatM, x, S.small ? 0.4 : 0.45, z);
    box(g, 0.1, 0.45, 0.4, trim, x, 0.2, z);
    box(g, 0.42, 0.55, 0.1, seatM, x, 0.75, z - 0.22);
    box(g, 0.26, 0.12, 0.08, headM, x, 1.09, z - 0.22);
    seats.push({ x, z, row: i, col: c });
  }
  // the bus driver and wheel
  const extras = [];
  if (S.driver) {
    const ds = seats.find((s) => s.row === S.driver.row && s.col === S.driver.col);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 6, 14), trim);
    wheel.position.set(ds.x, 0.95, ds.z + 0.5); wheel.rotation.x = -0.9; g.add(wheel);
    extras.push({ x: ds.x, z: ds.z, driver: true, seat: ds });
  } else if (kind === 'bus') {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 6, 14), trim);
    wheel.position.set(-0.7, 1.0, z1 - 0.9); wheel.rotation.x = -0.6; g.add(wheel);
    box(g, 0.45, 0.12, 0.44, seatM, -0.7, 0.45, z1 - 1.6);
    box(g, 0.45, 0.62, 0.1, seatM, -0.7, 0.78, z1 - 1.82);
    extras.push({ x: -0.7, z: z1 - 1.6, driver: true });
  }
  // your seat
  const mine = seats.find((s) => s.row === S.eyeRow && s.col === S.eyeCol);
  const eye = new THREE.Vector3(S.small ? 0 : mine.x, S.small ? 1.05 : 1.42, mine.z + 0.05);
  // passengers: always the seat next to you, the one in front, then a random share of the rest
  const people = [];
  if (passengers) {
    const isDriver = (s) => S.driver && s.row === S.driver.row && s.col === S.driver.col;
    const share = S.randomShare === undefined ? 0.45 : S.randomShare;
    const want = (s) => s !== mine && !isDriver(s) && (
      (!S.small && ((s.row === mine.row && s.col === mine.col + 1) || (s.row === mine.row + 1 && s.col === mine.col) || (s.row === mine.row - 1 && s.col === mine.col + 1))) ||
      r() < share);
    const list = seats.filter(want).concat(extras);
    for (const s of list) {
      const p = new THREE.Group();
      // simple seated figure (shown until the 3D person loads)
      const look = { skin: SKIN[Math.floor(r() * SKIN.length)], top: CLOTH[Math.floor(r() * CLOTH.length)], bottom: ['#2c3e50', '#3a3a48', '#5a4a3a', '#1f2a3a'][Math.floor(r() * 4)], shoes: '#222222' };
      box(p, 0.42, 0.55, 0.26, mat(look.top), 0, 0.85, 0);
      box(p, 0.4, 0.16, 0.5, mat(look.bottom), 0, 0.55, 0.2);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat(look.skin)); head.position.set(0, 1.28, 0); p.add(head);
      p.position.set(s.x, 0, s.z + 0.05);
      p.userData.look = look; p.userData.sit = true;
      g.add(p);
      people.push(p);
    }
    whenNpcReady(() => { for (const p of people) { upgradeToNpc(p, p.userData.look); seatNpc(p); } });
  }
  return { group: g, eye, forward: new THREE.Vector3(0, 0, 1), spec: S, people };
}

// A bus for the real street: a yellow shell with seats and passengers inside, so the person riding it sees the city out of the windows.
export function makeWorldBus(seed = 5, kind = 'bus') {
  const c = buildCabin(kind, { seed, exterior: true });
  const g = new THREE.Group();
  g.add(c.group);
  // wheels and lights, like the plain bus
  const tyre = mat('#151515');
  const wz = kind === 'bus' ? 2.8 : 1.35, wx = c.spec.w / 2 + 0.05, wr = kind === 'bus' ? 0.45 : 0.36;
  for (const z of [-wz, wz]) for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, 0.3, 12), tyre); w.rotation.z = Math.PI / 2; w.position.set(s * wx, wr, z); g.add(w); }
  c.group.position.y = kind === 'bus' ? 0.35 : 0.3; // the floor sits above the wheels
  g.userData.cabin = { eye: c.eye.clone().add(new THREE.Vector3(0, kind === 'bus' ? 0.35 : 0.3, 0)) };
  return g;
}

// ---------- Scenery for the detached cabins ----------
function makeScenery(kind) {
  const g = new THREE.Group();
  const movers = [];
  const add = (obj, speedMul = 1) => { g.add(obj); movers.push({ obj, speedMul }); };
  const rr = seeded(99);
  if (kind === 'plane') {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat('#587a40'));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -600; g.add(ground);
    for (let i = 0; i < 40; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(80 + rr() * 200, 80 + rr() * 200), mat(['#8a7a50', '#4c6a38', '#6d8a4a', '#9a8a60'][i % 4])); p.rotation.x = -Math.PI / 2; p.position.set((rr() - 0.5) * 2400, -599, (rr() - 0.5) * 2400); add(p, 0.08); }
    for (let i = 0; i < 40; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(7 + rr() * 8, 8, 6), mat('#ffffff', { emissive: '#aab4c8' })); s.scale.y = 0.45; s.position.set((k - 1.5) * 9, rr() * 2, rr() * 5); c.add(s); }
      c.position.set((rr() - 0.5) * 500, -40 - rr() * 120, (rr() - 0.5) * 500);
      add(c, 0.5);
    }
    // the wing, outside the left windows
    const wing = new THREE.Group();
    box(wing, 9, 0.3, 3.2, mat('#c9ced6'), 0, 0, 0);
    box(wing, 0.2, 0.7, 2.0, mat('#c9ced6'), 4.4, 0.4, -0.2);
    wing.position.set(-6.2, 0.55, 1.8); wing.rotation.z = 0.06; wing.rotation.y = 0.18;
    g.add(wing);
    g.userData.length = 250;
  } else {
    // road or rail: a long ground with things streaming past
    const L = 140;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 2 * L), mat(kind === 'train' ? '#6b6a5e' : '#587a40'));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.35, 0); g.add(ground);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(kind === 'train' ? 6 : 14, 2 * L), mat(kind === 'train' ? '#4a4540' : '#2b2b30'));
    bed.rotation.x = -Math.PI / 2; bed.position.set(0, -0.33, 0); g.add(bed);
    for (let i = 0; i < 60; i++) {
      const z = -L + (i / 60) * 2 * L;
      if (kind === 'train') { const sl = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.3), mat('#3a2a1a')); sl.position.set(0, -0.28, z); add(sl); }
      else { const dash = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 2.2), mat('#e8e8e0')); dash.position.set(-1.6 + 0, -0.31, z); add(dash); }
    }
    for (let i = 0; i < 80; i++) {
      const z = -L + (i / 80) * 2 * L + rr() * 2;
      const side = rr() > 0.5 ? 1 : -1;
      const d = 8 + rr() * 40;
      const t = rr();
      const o = new THREE.Group();
      if (t < 0.4) { box(o, 0.4, 5 + rr() * 3, 0.4, mat('#5a3a1e'), 0, 3, 0); const k = new THREE.Mesh(new THREE.SphereGeometry(2 + rr() * 1.5, 8, 6), mat('#2e7d32')); k.position.y = 6.5; o.add(k); }
      else if (t < 0.65) { box(o, 4 + rr() * 5, 3 + rr() * 3, 4 + rr() * 4, mat(['#d9c8a8', '#c8a888', '#b8c8d8'][i % 3]), 0, 2, 0); box(o, 5, 0.3, 5, mat('#8a3a2a'), 0, 4.2, 0); }
      else { box(o, 0.25, 8, 0.25, mat('#6b6055'), 0, 4, 0); box(o, 2.6, 0.2, 0.2, mat('#6b6055'), 0, 7.4, 0); }
      o.position.set(side * (kind === 'train' ? 5 + d * 0.5 : 8 + d * 0.5), -0.3, z);
      add(o);
    }
    g.userData.length = L;
  }
  g.userData.movers = movers;
  return g;
}

// A railway platform on the left of the train, with a canopy, a yellow line, benches, people waiting and a station sign.
function makePlatform(name, seed) {
  const g = new THREE.Group();
  const rr = seeded(seed);
  box(g, 6.2, 0.32, 80, mat('#9a968c'), -5.3, -0.19, 0);                 // the platform itself (its top is just below the train floor)
  box(g, 0.22, 0.02, 80, mat('#e8c200'), -2.5, -0.02, 0);               // yellow safety line
  for (let z = -36; z <= 36; z += 12) box(g, 0.2, 3.3, 0.2, mat('#55606c'), -7.6, 1.45, z); // canopy posts
  box(g, 4.6, 0.18, 80, mat('#46505c'), -5.6, 3.15, 0);                  // canopy roof
  for (const z of [-24, -6, 14, 30]) { box(g, 0.5, 0.08, 1.8, mat('#6b4a2a'), -7.0, 0.35, z); box(g, 0.08, 0.5, 1.8, mat('#6b4a2a'), -7.25, 0.55, z); } // benches
  // people
  for (let i = 0; i < 9; i++) {
    const z = -30 + rr() * 60, x = -3.4 - rr() * 3;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.0, 8), mat(CLOTH[Math.floor(rr() * CLOTH.length)]));
    body.position.set(x, 0.5, z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat(SKIN[Math.floor(rr() * SKIN.length)]));
    head.position.set(x, 1.22, z);
    g.add(body, head);
  }
  // sign with the station name
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const x2 = cv.getContext('2d');
  x2.fillStyle = '#1d3b6b'; x2.fillRect(0, 0, 512, 128);
  x2.fillStyle = '#ffffff'; x2.font = 'bold 54px sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle';
  x2.fillText(String(name).slice(0, 18), 256, 66);
  const tex = new THREE.CanvasTexture(cv);
  for (const z of [-14, 22]) {
    box(g, 0.12, 2.6, 0.12, mat('#55606c'), -3.3, 1.3, z - 1.9); box(g, 0.12, 2.6, 0.12, mat('#55606c'), -3.3, 1.3, z + 1.9);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(-3.22, 2.4, z); sign.rotation.y = Math.PI / 2;
    g.add(sign);
  }
  return g;
}

// How fast the train goes as the trip goes on, by seconds into the trip (t) of a trip lasting `secs`:
// stopped at the platform with the doors closing (3 s), speeding up (4 s), cruising, then braking into the next platform (4 s).
export const TRAIN_WAIT = 3, TRAIN_BRAKE = 5;
const speedFactor = (t, secs) => {
  const ss = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  return ss(TRAIN_WAIT, TRAIN_WAIT + 4, t) * (1 - ss(secs - TRAIN_BRAKE, secs - 1, t));
};
// Distance covered by progress p, as seconds of cruising speed, from a table built for this trip.
const N = 400;
const makeDist = (secs) => { const t = [0]; for (let i = 1; i <= N; i++) t.push(t[i - 1] + speedFactor(((i - 0.5) / N) * secs, secs) * (secs / N)); return t; };
const distAt = (tbl, p) => { const x = Math.min(1, Math.max(0, p)) * N, i = Math.floor(x); return i >= N ? tbl[N] : tbl[i] + (tbl[i + 1] - tbl[i]) * (x - i); };

const FAR = new THREE.Vector3(6000, 0, 0);   // where detached cabins sit, far from every city

export function createCabin({ scene, camera }) {
  let state = null; // { kind, cab, scenery?, world?, yaw, pitch, bg }
  const tmp = new THREE.Vector3();
  const sky = new THREE.Color();

  function enterDetached(kind, seed, opts = {}) {
    const type = Object.hasOwn(SPECS, kind) ? kind : kind === 'coach' ? 'bus' : kind === 'flight' ? 'plane' : 'train';
    const cab = buildCabin(type, { seed });
    cab.group.position.copy(FAR);
    scene.add(cab.group);
    const scenery = makeScenery(type);
    scenery.position.copy(FAR);
    scene.add(scenery);
    const light = new THREE.PointLight(0xfff0d0, 22, 12, 1.5);
    light.position.copy(FAR).add(new THREE.Vector3(0, SPECS[type].h - 0.4, 0));
    scene.add(light);
    state = { type, cab, scenery, light, world: null, yaw: 0, pitch: 0, bg: scene.background, fog: scene.fog, trip: null };
    if (type === 'train' && opts.secs > 0) {
      // a train trip is staged: stand at a platform, pull out, cruise, brake into the destination platform
      const dist = makeDist(opts.secs);
      const total = SPECS.train.speed * dist[N];
      const start = makePlatform('Express Station', seed + 1), end = makePlatform(opts.to || 'Express Station', seed + 2);
      for (const pl of [start, end]) { pl.position.copy(FAR); scene.add(pl); }
      for (const m of scenery.userData.movers) m.z0 = m.obj.position.z;
      state.trip = { dist, secs: opts.secs, prog: 0, server: 0, total, start, end, platforms: [start, end] };
    }
    scene.fog = null;
  }
  function enterWorld(veh) {
    state = { type: 'bus', cab: null, scenery: null, light: null, world: veh, yaw: 0, pitch: 0, bg: null, fog: null };
  }
  function leave() {
    if (!state) return;
    for (const o of [state.cab && state.cab.group, state.scenery, state.light, ...(state.trip ? state.trip.platforms : [])]) if (o) scene.remove(o);
    if (state.trip) for (const pl of state.trip.platforms) pl.traverse((n) => { if (n.geometry) n.geometry.dispose(); });
    if (state.cab) state.cab.group.traverse((n) => { if (n.geometry) n.geometry.dispose(); });
    if (state.scenery) state.scenery.traverse((n) => { if (n.geometry) n.geometry.dispose(); });
    if (state.bg) scene.background = state.bg;
    scene.fog = state.fog;
    camera.fov = 45; camera.updateProjectionMatrix();
    state = null;
  }
  function look(dx, dy) {
    if (!state) return;
    state.yaw -= dx * 0.006;
    state.pitch = Math.max(-1.0, Math.min(0.9, state.pitch - dy * 0.005));
  }
  // Every frame: move the scenery past the windows and put the camera at your eyes.
  function update(dt, daylight = 1) {
    if (!state) return;
    const cp = Math.cos(state.pitch);
    const dir = new THREE.Vector3(Math.sin(state.yaw) * cp, Math.sin(state.pitch), Math.cos(state.yaw) * cp);
    camera.fov = 75; camera.updateProjectionMatrix();
    if (state.world) {
      const v = state.world;
      v.updateMatrixWorld(true);
      const eye = v.userData.cabin.eye;
      camera.position.copy(v.localToWorld(tmp.copy(eye)));
      camera.lookAt(v.localToWorld(tmp.copy(eye).addScaledVector(dir, 5)));
      return;
    }
    const S = SPECS[state.type];
    const L = state.scenery.userData.length;
    const speed = S.speed || 0;
    let shake = 0;
    if (state.trip) {
      const T = state.trip;
      T.prog = Math.min(1, T.prog + dt / T.secs);
      if (Math.abs(T.server - T.prog) > 0.02) T.prog += (T.server - T.prog) * Math.min(1, dt * 2);
      const s = speed * distAt(T.dist, T.prog);
      for (const m of state.scenery.userData.movers) {
        m.obj.position.z = ((m.z0 - s * m.speedMul + L) % (2 * L) + 2 * L) % (2 * L) - L;
      }
      T.start.position.set(FAR.x, 0, FAR.z - s + 0);
      T.end.position.set(FAR.x, 0, FAR.z + T.total - s);
      T.start.visible = Math.abs(T.start.position.z - FAR.z) < 160;
      T.end.visible = Math.abs(T.end.position.z - FAR.z) < 160;
      shake = speedFactor(T.prog * T.secs, T.secs);
    } else {
      for (const m of state.scenery.userData.movers) {
        m.obj.position.z -= (speed || 90) * m.speedMul * dt;
        if (m.obj.position.z < -L) m.obj.position.z += 2 * L;
      }
    }
    // sky: blue by day, dark at night
    sky.set(state.type === 'plane' ? '#7fb2ec' : '#8ec0ee').lerp(new THREE.Color('#070a24'), (1 - daylight) * 0.85);
    scene.background = sky;
    state.light.intensity = 10 + 14 * (1 - daylight);
    const e = state.cab.eye.clone().add(FAR);
    if (shake) { const t = performance.now() / 1000; dir.x += Math.sin(t * 13) * 0.004 * shake; dir.y += Math.sin(t * 9.3) * 0.003 * shake; }
    camera.position.copy(e);
    camera.lookAt(e.clone().addScaledVector(dir, 5));
  }
  return {
    get active() { return Boolean(state); },
    get world() { return Boolean(state && state.world); },
    enterDetached, enterWorld, leave, look, update,
    // the server's progress through a staged train trip (0..1)
    setProgress(p) { if (state && state.trip) state.trip.server = p; },
    get tripProgress() { return state && state.trip ? state.trip.prog : null; },
    get tripSeconds() { return state && state.trip ? state.trip.prog * state.trip.secs : null; },
    get tripLength() { return state && state.trip ? state.trip.secs : null; },
  };
}