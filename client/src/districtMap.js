// Adulthood: the Real Map (Abuja, Enugu). Draws a cut of OpenStreetMap data (public/maps/<city>.json) around the player.
// Kept light on purpose: one shared material, simplified building outlines, and the map is cut into 150 m chunks that are
// built only when you get near them and thrown away when you leave (so memory and draw calls stay small).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CH = 150;          // chunk size, metres
const SHOW = 330;        // chunks whose middle is closer than this are drawn
const DROP = 470;        // chunks further than this are freed
const PER_FRAME = 2;     // most chunks built in one frame, so walking never hitches
const ROAD = { motorway: '#4a4a50', trunk: '#4a4a50', primary: '#55555c', secondary: '#66666c', tertiary: '#77777c' };
const PAL = ['#e8d9c0', '#d9b99b', '#c98a6a', '#bfc9d6', '#e6e1d4', '#d6c4a8'];
const hash = (a, b) => (Math.imul((a * 73856093) ^ (b * 19349663), 2654435761) >>> 0) / 4294967296;
const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const key = (x, z) => `${Math.floor(x / CH)},${Math.floor(z / CH)}`;

function paint(g, c) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function flat(pts, y, c) {
  const v = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  let tri; try { tri = THREE.ShapeUtils.triangulateShape(v, []); } catch { return null; }
  if (!tri.length) return null;
  const pos = new Float32Array(v.length * 3); v.forEach((p, i) => pos.set([p.x, y, p.y], i * 3));
  const up = tri.map(([a, b, c2]) => { const u = [v[b].x - v[a].x, v[b].y - v[a].y], w = [v[c2].x - v[a].x, v[c2].y - v[a].y]; return u[1] * w[0] - u[0] * w[1] >= 0 ? [a, b, c2] : [a, c2, b]; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(up.flat());
  const ng = g.toNonIndexed(); const n = ng.attributes.position.count, nn = new Float32Array(n * 3); for (let i = 0; i < n; i++) nn[i * 3 + 1] = 1; ng.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  return paint(ng, c);
}
function ribbon(pts, w, y, c) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    pos.push(pts[i][0] - dz * w / 2, y, pts[i][1] + dx * w / 2, pts[i][0] + dz * w / 2, y, pts[i][1] - dx * w / 2);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const ng = g.toNonIndexed(); const n = ng.attributes.position.count, nn = new Float32Array(n * 3); for (let i = 0; i < n; i++) nn[i * 3 + 1] = 1; ng.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  return paint(ng, c);
}
function building(pts, h, c, roofC) {
  const ring = pts.slice();
  let mx = 0, mz = 0; for (const p of ring) { mx += p[0]; mz += p[1]; } mx /= ring.length; mz /= ring.length;
  { const a = ring[0], b = ring[1], dx = b[0] - a[0], dz = b[1] - a[1]; if ((-dz) * ((a[0] + b[0]) / 2 - mx) + dx * ((a[1] + b[1]) / 2 - mz) < 0) ring.reverse(); }   // walls face outwards
  const n = ring.length, wp = [], wn = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
    wp.push(a[0], 0, a[1], b[0], 0, b[1], b[0], h, b[1], a[0], 0, a[1], b[0], h, b[1], a[0], h, a[1]); for (let k = 0; k < 6; k++) wn.push(nx, 0, nz);
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3)); paint(wg, c);
  const parts = [wg]; const rg = flat(ring, h, roofC); if (rg) parts.push(rg);
  return parts;
}
function merge(parts) {
  const ok = parts.filter((g) => g && g.attributes.position.count > 0);
  if (!ok.length) return null;
  for (const g of ok) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  const m = mergeGeometries(ok, false); for (const g of ok) g.dispose(); return m;
}

export function createDistrict(mapId) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const groundMat = new THREE.MeshLambertMaterial({ color: '#cfc7b0' });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), groundMat); ground.position.y = -0.05; group.add(ground);
  const wanted = new Map();     // chunk key -> { x, z, roads: [], blds: [] } raw data
  const live = new Map();       // chunk key -> THREE.Mesh
  let ready = false, dead = false, px = 1e9, pz = 1e9;

  fetch(`/maps/${mapId}.json`).then((r) => (r.ok && /json/i.test(r.headers.get('content-type') || '') ? r.json() : fetch(`/map/${mapId}.json`).then((r2) => r2.json()))).then((d) => {
    if (dead) return;
    const slot = (x, z) => { const k = key(x, z); let s = wanted.get(k); if (!s) { s = { x: (Math.floor(x / CH) + 0.5) * CH, z: (Math.floor(z / CH) + 0.5) * CH, roads: [], blds: [] }; wanted.set(k, s); } return s; };
    // Roads are cut into pieces so a long road is drawn only near you.
    for (const r of d.roads) {
      let piece = [r.p[0]], pk = null;
      for (let i = 1; i < r.p.length; i++) {
        const a = r.p[i - 1], b = r.p[i], k = key((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        if (pk !== null && k !== pk) { slot(piece[0][0], piece[0][1]); const s = wanted.get(pk) || slot(a[0], a[1]); if (piece.length > 1) s.roads.push({ p: piece, w: r.w, c: r.c }); piece = [a]; }
        pk = k; piece.push(b);
      }
      if (piece.length > 1) (wanted.get(pk) || slot(piece[0][0], piece[0][1])).roads.push({ p: piece, w: r.w, c: r.c });
    }
    for (const b of d.buildings) { let cx = 0, cz = 0; for (const p of b.p) { cx += p[0]; cz += p[1]; } cx /= b.p.length; cz /= b.p.length; slot(cx, cz).blds.push({ p: b.p, h: b.h, cx, cz }); }
    // Parks and water are few, so they are always drawn.
    const fixed = [];
    for (const g of d.green) fixed.push(flat(g.p, 0.15, col('#8fc47a')));
    for (const g of d.water) fixed.push(flat(g.p, 0.2, col('#6fb3e0')));
    const fm = merge(fixed); if (fm) { const m = new THREE.Mesh(fm, mat); m.frustumCulled = false; group.add(m); }
    ready = true;
  }).catch(() => {});

  function buildChunk(s) {
    const parts = [];
    s.roads.sort((a, b) => a.w - b.w).forEach((r, i) => parts.push(ribbon(r.p, r.w, 0.3 + i * 0.0008, col(ROAD[r.c] || '#8a8a8e'))));
    for (const b of s.blds) {
      const r = hash(Math.round(b.cx), Math.round(b.cz)); const h = b.h || 3.2 + Math.floor(r * 3) * 3.2;
      const wall = col(PAL[Math.floor(r * 97) % PAL.length], 0.9 + r * 0.15), roof = col(PAL[(Math.floor(r * 97) + 2) % PAL.length], 0.7);
      for (const g of building(b.p, h, wall, roof)) parts.push(g);
    }
    const geo = merge(parts); if (!geo) return null;
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m;
  }

  return {
    group,
    get ready() { return ready; },
    // Called every frame with where the camera is looking: builds chunks coming into range and frees far ones.
    update(x, z) {
      if (!ready) return;
      px = x; pz = z;
      let built = 0;
      for (const [k, s] of wanted) {
        const d = Math.hypot(s.x - x, s.z - z);
        const m = live.get(k);
        if (d < SHOW && !m && built < PER_FRAME) { const mesh = buildChunk(s); live.set(k, mesh || null); if (mesh) group.add(mesh); built++; }
        else if (d > DROP && m !== undefined) { if (m) { group.remove(m); m.geometry.dispose(); } live.delete(k); }
      }
    },
    stats() { let n = 0; for (const m of live.values()) if (m) n += m.geometry.attributes.position.count / 3; return { chunks: live.size, triangles: Math.round(n) }; },
    dispose() {
      dead = true;
      for (const m of live.values()) if (m) m.geometry.dispose();
      live.clear(); wanted.clear();
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      mat.dispose(); groundMat.dispose();
    },
  };
}
