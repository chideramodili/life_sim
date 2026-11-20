// Adulthood: the real cities. Draws the OpenStreetMap tiles (public/maps/real/<city>/<i>_<j>.json) around the camera.
// Kept light on purpose: one shared material, a tile is only downloaded when you get close, each tile is cut into 150 m chunks that
// are built when they come into range and freed when you leave, buildings under 3 m high are flat blocks, and water and parks are
// triangulated a few per frame so walking never hitches.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CH = 150;          // chunk size, metres
const SHOW = 340;        // chunks closer than this are drawn
const DROP = 480;        // chunks further than this are freed
const PER_FRAME = 2;     // most chunks built in one frame
const AREA_PER_FRAME = 2;
const ROAD = { motorway: '#4a4a50', motorway_link: '#4a4a50', trunk: '#4a4a50', trunk_link: '#4a4a50', primary: '#55555c', primary_link: '#55555c', secondary: '#66666c', secondary_link: '#66666c', tertiary: '#77777c', tertiary_link: '#77777c' };
const PAL = ['#e8d9c0', '#d9b99b', '#c98a6a', '#bfc9d6', '#e6e1d4', '#d6c4a8'];
const hash = (a, b) => (Math.imul((a * 73856093) ^ (b * 19349663), 2654435761) >>> 0) / 4294967296;
const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

function paint(g, c) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
const upNormals = (ng) => { const n = ng.attributes.position.count, nn = new Float32Array(n * 3); for (let i = 0; i < n; i++) nn[i * 3 + 1] = 1; ng.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); return ng; };
function flat(pts, y, c) {
  if (pts.length < 3) return null;
  const v = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  let tri; try { tri = THREE.ShapeUtils.triangulateShape(v, []); } catch { return null; }
  if (!tri.length) return null;
  const pos = new Float32Array(v.length * 3); v.forEach((p, i) => pos.set([p.x, y, p.y], i * 3));
  const up = tri.map(([a, b, c2]) => { const u = [v[b].x - v[a].x, v[b].y - v[a].y], w = [v[c2].x - v[a].x, v[c2].y - v[a].y]; return u[1] * w[0] - u[0] * w[1] >= 0 ? [a, b, c2] : [a, c2, b]; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(up.flat());
  return paint(upNormals(g.toNonIndexed()), c);
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
  return paint(upNormals(g.toNonIndexed()), c);
}
function building(pts, h, c, roofC) {
  const ring = pts.slice();
  let mx = 0, mz = 0; for (const p of ring) { mx += p[0]; mz += p[1]; } mx /= ring.length; mz /= ring.length;
  { const a = ring[0], b = ring[1], dx = b[0] - a[0], dz = b[1] - a[1]; if ((-dz) * ((a[0] + b[0]) / 2 - mx) + dx * ((a[1] + b[1]) / 2 - mz) < 0) ring.reverse(); }
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

// info: { id: 'enugu', half, tile, n }  (the server's index.json). Returns { group, update(x, z), stats(), dispose() }
// The folder is public/maps/real; if it was put in public/map/real by mistake, that one is used instead.
let realBase = '/maps/real';
async function getTile(cityId, k) {
  for (let n = 0; n < 2; n++) {
    try { const r = await fetch(`${realBase}/${cityId}/${k}.json`); if (r.ok && /json/i.test(r.headers.get('content-type') || '')) return await r.json(); } catch { /* next */ }
    if (n === 0 && realBase === '/maps/real') { const alt = '/map/real'; try { const r2 = await fetch(`${alt}/${cityId}/index.json`); if (r2.ok && /json/i.test(r2.headers.get('content-type') || '')) { realBase = alt; continue; } } catch { /* none */ } }
    break;
  }
  return null;
}
export function createRealTiles(cityId, half, T, N, theme = {}) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const tiles = new Map();      // "i_j" -> { state: 'loading'|'ready'|'none', chunks: Map, areas: [] }
  const live = new Map();       // "i_j|cx,cz" -> Mesh
  const areaMeshes = new Map(); // "i_j" -> Mesh[]
  const areaQueue = [];         // polygons waiting to be triangulated
  let dead = false;
  const GREEN = (theme.look && theme.look.parks && theme.look.parks[0]) || '#8fc47a';

  const tileKey = (i, j) => `${i}_${j}`;
  function loadTile(i, j) {
    const k = tileKey(i, j);
    if (tiles.has(k) || i < 0 || j < 0 || i >= N || j >= N) return;
    const t = { state: 'loading', chunks: new Map(), areas: [], i, j };
    tiles.set(k, t);
    getTile(cityId, k).then((d) => {
      if (dead) return;
      if (!d) { t.state = 'none'; return; }
      const slot = (x, z) => { const ck = `${Math.floor(x / CH)},${Math.floor(z / CH)}`; let s = t.chunks.get(ck); if (!s) { s = { x: (Math.floor(x / CH) + 0.5) * CH, z: (Math.floor(z / CH) + 0.5) * CH, roads: [], blds: [] }; t.chunks.set(ck, s); } return s; };
      for (const r of d.roads || []) {
        let piece = [r.p[0]], cur = null;
        for (let q = 1; q < r.p.length; q++) {
          const a = r.p[q - 1], b = r.p[q], s = slot((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          if (cur && s !== cur) { if (piece.length > 1) cur.roads.push({ p: piece, w: r.w, c: r.c, b: r.b }); piece = [a]; }
          cur = s; piece.push(b);
        }
        if (cur && piece.length > 1) cur.roads.push({ p: piece, w: r.w, c: r.c, b: r.b });
      }
      for (const b of d.buildings || []) { let cx = 0, cz = 0; for (const p of b.p) { cx += p[0]; cz += p[1]; } cx /= b.p.length; cz /= b.p.length; slot(cx, cz).blds.push({ p: b.p, h: b.h, cx, cz }); }
      for (const g of d.green || []) t.areas.push({ p: g.p, y: 0.12, c: col(GREEN) });
      for (const w of d.water || []) t.areas.push({ p: w.p, y: 0.2, c: col('#6fb3e0') });
      t.state = 'ready';
      for (const a of t.areas) areaQueue.push({ t, a });
    }).catch(() => { t.state = 'none'; });
  }
  function buildChunk(s) {
    const parts = [];
    s.roads.sort((a, b) => a.w - b.w).forEach((r, i) => parts.push(ribbon(r.p, r.w, (r.b ? 0.45 : 0.3) + i * 0.0008, col(ROAD[r.c] || '#8a8a8e'))));
    for (const b of s.blds) {
      const r = hash(Math.round(b.cx), Math.round(b.cz)); const h = b.h || 3.2 + Math.floor(r * 3) * 3.2;
      const wall = col(PAL[Math.floor(r * 97) % PAL.length], 0.9 + r * 0.15), roof = col(PAL[(Math.floor(r * 97) + 2) % PAL.length], 0.7);
      for (const g of building(b.p, h, wall, roof)) parts.push(g);
    }
    const geo = merge(parts); if (!geo) return null;
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m;
  }
  function dropTile(k) {
    for (const [lk, m] of [...live]) if (lk.startsWith(k + '|')) { if (m) { group.remove(m); m.geometry.dispose(); } live.delete(lk); }
    const am = areaMeshes.get(k); if (am) { for (const m of am) { group.remove(m); m.geometry.dispose(); } areaMeshes.delete(k); }
    tiles.delete(k);
  }
  let frame = 0;
  return {
    group,
    get tilesLoaded() { return [...tiles.values()].filter((t) => t.state === 'ready').length; },
    update(x, z) {
      if (dead) return;
      frame++;
      const ci = Math.floor((x + half) / T), cj = Math.floor((z + half) / T);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        // only the tiles that are near enough to matter
        const i = ci + di, j = cj + dj; const cx = -half + (i + 0.5) * T, cz = -half + (j + 0.5) * T;
        if (Math.abs(cx - x) < T / 2 + SHOW && Math.abs(cz - z) < T / 2 + SHOW) loadTile(i, j);
      }
      // triangulate water and parks a few at a time
      for (let n = 0; n < AREA_PER_FRAME && areaQueue.length; n++) {
        const { t, a } = areaQueue.shift();
        if (!tiles.has(tileKey(t.i, t.j)) || tiles.get(tileKey(t.i, t.j)) !== t) continue;
        const g = a.p.length > 1500 ? null : flat(a.p, a.y, a.c);
        if (!g) continue;
        const m = new THREE.Mesh(g, mat); m.frustumCulled = false; group.add(m);
        const k = tileKey(t.i, t.j); if (!areaMeshes.has(k)) areaMeshes.set(k, []); areaMeshes.get(k).push(m);
      }
      let built = 0;
      for (const [k, t] of tiles) {
        if (t.state !== 'ready') continue;
        const far = Math.hypot(-half + (t.i + 0.5) * T - x, -half + (t.j + 0.5) * T - z) > T * 1.2 + DROP;
        if (far) { dropTile(k); continue; }
        for (const [ck, s] of t.chunks) {
          const lk = k + '|' + ck, d = Math.hypot(s.x - x, s.z - z), m = live.get(lk);
          if (d < SHOW && m === undefined && built < PER_FRAME) { const mesh = buildChunk(s); live.set(lk, mesh || null); if (mesh) group.add(mesh); built++; }
          else if (d > DROP && m !== undefined) { if (m) { group.remove(m); m.geometry.dispose(); } live.delete(lk); }
        }
      }
    },
    stats() { let n = 0; for (const m of live.values()) if (m) n += m.geometry.attributes.position.count / 3; return { tiles: tiles.size, chunks: live.size, triangles: Math.round(n) }; },
    dispose() {
      dead = true;
      for (const m of live.values()) if (m) m.geometry.dispose();
      for (const arr of areaMeshes.values()) for (const m of arr) m.geometry.dispose();
      live.clear(); tiles.clear(); areaMeshes.clear(); areaQueue.length = 0;
      mat.dispose();
    },
  };
}
