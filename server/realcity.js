// Adulthood: the real cities. Rules only (no network, no database).
// A whole city from OpenStreetMap is cut into 1.2 km tiles (maps/real/<city>/<i>_<j>.json). The server loads a tile the first time
// someone stands in it, makes a 2 m solid grid out of it (buildings and water are solid, bridges are open) and keeps the 60 most
// recent ones. It also decides where the game's places, lots and homes stand: close to the city's middle, next to real roads.
import fs from 'node:fs';

const CELL = 2;
const CACHE_MAX = 60;
export const DOOR_REACH_REAL = 3.5;
// The folder is `maps/real` (with an s). If it was copied in as `map/real` by mistake, use that one instead.
const dir = (city) => { const a = new URL(`./maps/real/${city}/`, import.meta.url); if (fs.existsSync(new URL('index.json', a))) return a; const b = new URL(`./map/real/${city}/`, import.meta.url); return fs.existsSync(new URL('index.json', b)) ? b : a; };
const readJson = (u) => { try { return JSON.parse(fs.readFileSync(u, 'utf8')); } catch { return null; } };

// A small repeatable random number generator, so a city's lots and homes are the same on every start.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Mark every square whose centre is inside the polygon, only inside the box [ox, ox+size) x [oz, oz+size).
function fill(grid, N, ox, oz, poly, v) {
  let minz = 1e9, maxz = -1e9, minx = 1e9, maxx = -1e9;
  for (const [x, z] of poly) { if (z < minz) minz = z; if (z > maxz) maxz = z; if (x < minx) minx = x; if (x > maxx) maxx = x; }
  const size = N * CELL;
  if (maxx < ox || minx > ox + size || maxz < oz || minz > oz + size) return;
  const j0 = Math.max(0, Math.floor((minz - oz) / CELL)), j1 = Math.min(N - 1, Math.floor((maxz - oz) / CELL));
  for (let j = j0; j <= j1; j++) {
    const zc = oz + j * CELL + CELL / 2;
    const xs = [];
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const [xi, zi] = poly[i], [xk, zk] = poly[k];
      if ((zi > zc) !== (zk > zc)) xs.push(xi + ((zc - zi) * (xk - xi)) / (zk - zi));
    }
    xs.sort((a, b) => a - b);
    for (let t = 0; t + 1 < xs.length; t += 2) {
      const a = Math.max(0, Math.ceil((xs[t] - ox) / CELL - 0.5)), b = Math.min(N - 1, Math.floor((xs[t + 1] - ox) / CELL - 0.5));
      for (let i = a; i <= b; i++) grid[j * N + i] = v;
    }
  }
}
// A road (a line with a width) as open ground: used to keep bridges open over water.
function ribbon(grid, N, ox, oz, pts, w) {
  const h = w / 2 + 1;
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az); if (len < 0.01) continue;
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    fill(grid, N, ox, oz, [[ax + nx * h, az + nz * h], [bx + nx * h, bz + nz * h], [bx - nx * h, bz - nz * h], [ax - nx * h, az - nz * h]], 0);
  }
}

const cities = new Map();
export function has(city) { return Boolean(load(city)); }
export function get(city) { return load(city); }

function load(city) {
  if (cities.has(city)) return cities.get(city);
  const idx = readJson(new URL('index.json', dir(city)));
  if (!idx) { cities.set(city, null); return null; }
  const half = idx.half, T = idx.tile, n = idx.n, N = T / CELL;
  const raw = new Map();     // parsed tile json, by "i_j"
  const grids = new Map();   // solid grids, by "i_j", most recent last
  const tileJson = (i, j) => {
    if (i < 0 || j < 0 || i >= n || j >= n) return null;
    const k = i + '_' + j;
    if (!raw.has(k)) { raw.set(k, readJson(new URL(k + '.json', dir(city)))); if (raw.size > 150) raw.delete(raw.keys().next().value); }
    return raw.get(k);
  };
  const gridOf = (i, j) => {
    const k = i + '_' + j;
    let g = grids.get(k);
    if (g) { grids.delete(k); grids.set(k, g); return g; }
    g = new Uint8Array(N * N);
    const ox = -half + i * T, oz = -half + j * T;
    // buildings and water can start in a neighbour tile and run into this one, so read the 8 around too
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const t = tileJson(i + di, j + dj); if (!t) continue;
      for (const b of t.buildings) fill(g, N, ox, oz, b.p, 1);
      if (di === 0 && dj === 0 || true) for (const w of t.water) fill(g, N, ox, oz, w.p, 1);
    }
    const here = tileJson(i, j);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const t = tileJson(i + di, j + dj); if (t) for (const r of t.roads) if (r.b) ribbon(g, N, ox, oz, r.p, r.w); }
    void here;
    grids.set(k, g); if (grids.size > CACHE_MAX) grids.delete(grids.keys().next().value);
    return g;
  };
  const cell = (x, z) => {
    const fx = (x + half) / T, fz = (z + half) / T;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= n || j >= n) return 1;
    const g = gridOf(i, j);
    const ci = Math.floor((fx - i) * N), cj = Math.floor((fz - j) * N);
    return g[cj * N + ci];
  };
  const PAD = 0.35;
  // Buildings and market stalls the game puts down itself (see layoutFor): turned rectangles { x, z, ry, hw, hd, r }.
  const boxes = [];
  const inBox = (b, x, z, pad) => { const dx = x - b.x, dz = z - b.z, sn = Math.sin(b.ry), cs = Math.cos(b.ry); return Math.abs(dx * cs - dz * sn) <= b.hw + pad && Math.abs(dx * sn + dz * cs) <= b.hd + pad; };
  const blocked = (x, z) => {
    if (Math.abs(x) > half - 2 || Math.abs(z) > half - 2) return true;
    for (const b of boxes) if (Math.abs(x - b.x) < b.r && Math.abs(z - b.z) < b.r && inBox(b, x, z, 0.3)) return true;
    return cell(x, z) === 1 || cell(x - PAD, z) === 1 || cell(x + PAD, z) === 1 || cell(x, z - PAD) === 1 || cell(x, z + PAD) === 1;
  };
  const freeNear = (x, z, maxR = 80) => {
    if (!blocked(x, z)) return { x, z };
    for (let r = 2; r <= maxR; r += 2) for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
      if (!blocked(px, pz)) return { x: Math.round(px * 10) / 10, z: Math.round(pz * 10) / 10 };
    }
    return null;
  };
  // roads near the middle, to place things beside them
  const hubTiles = [];
  for (let di = -1; di <= 0; di++) for (let dj = -1; dj <= 0; dj++) hubTiles.push([Math.floor(n / 2) + di, Math.floor(n / 2) + dj]);
  const hubRoads = [];
  for (const [i, j] of hubTiles) { const t = tileJson(i, j); if (t) for (const r of t.roads) if (!r.b && r.w >= 6) hubRoads.push(r); }
  const hub = { idx, half, T, n, blocked, freeNear, tileJson, gridOf, hubRoads, boxes, inBox };
  cities.set(city, hub);
  return hub;
}

// A free rectangle w x d beside a road, facing it. Returns the centre and the door (on the road side), or null.
function rectBeside(hub, road, seg, side, w, d, gap) {
  const [ax, az] = road.p[seg], [bx, bz] = road.p[seg + 1];
  const len = Math.hypot(bx - ax, bz - az); if (len < w + 4) return null;
  const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz * side, nz = ux * side;
  const t = 2 + (len - 4) * 0.5;
  const off = road.w / 2 + 2.5 + d / 2;
  const cx = ax + ux * t + nx * off, cz = az + uz * t + nz * off;
  for (let a = -w / 2; a <= w / 2; a += 2) for (let b = -d / 2 - gap; b <= d / 2; b += 2) if (hub.blocked(cx + ux * a + nx * b, cz + uz * a + nz * b)) return null;
  const door = { x: cx - nx * (d / 2 + 1.2), z: cz - nz * (d / 2 + 1.2) };
  // the road side is the side we offset away from, so the door is on the near edge
  return { x: cx, z: cz, ux, uz, door, f: Math.abs(nz) > Math.abs(nx) ? (nz > 0 ? 'n' : 's') : (nx > 0 ? 'w' : 'e') };
}

const VENUE_KINDS = { bank: ['bank'], hospital: ['hospital', 'clinic'], library: ['library'], police: ['police'], pharmacy: ['pharmacy'], hotel: ['hotel', 'guest_house'], market: ['marketplace', 'supermarket'], boutique: ['clothes'], gym: ['fitness_centre', 'gym', 'sports_centre'], club: ['nightclub'], garage: ['car_repair'], eventcenter: ['events_venue', 'conference_centre'] };
const VENUES = ['shop', 'boutique', 'homestore', 'pharmacy', 'jobs', 'market', 'bank', 'plaza', 'police', 'gym', 'terminal', 'hospital', 'library', 'airport', 'garage', 'club', 'hotel', 'eventcenter', 'depot'];
const LOT_W = 16, LOT_D = 12;


// Venue buildings: [facade look, width, depth, height]. The market and the plaza are open areas: a list of sizes to try, biggest first.
const SIZES = { shop: ['shop', 11, 12, 7], boutique: ['shop', 11, 12, 7], homestore: ['shop', 12, 12, 8], pharmacy: ['shop', 14, 12, 6], jobs: ['civic', 20, 14, 10], bank: ['civic', 16, 13, 11], police: ['police', 18, 14, 10], gym: ['warehouse', 14, 13, 8], terminal: ['terminal', 24, 14, 8], hospital: ['civic', 28, 15, 12], library: ['campus', 16, 13, 9], airport: ['terminal', 32, 14, 9], garage: ['warehouse', 16, 13, 8], club: ['shop', 16, 13, 8], hotel: ['office', 18, 13, 16], eventcenter: ['civic', 22, 15, 9], depot: ['warehouse', 16, 13, 8] };
const OPEN = { market: [[40, 30], [32, 24], [24, 18]], plaza: [[22, 18], [16, 14]] };

// Where roads are (2 m squares, a little wider than the road), for the middle 2.4 km, so a building never sits on a street.
function roadMask(hub) {
  if (hub.mask) return hub.mask;
  const R = 1260, M = R; const m = new Uint8Array(M * M);
  hub.maskR = R;
  const stamp = (x, z, rad) => { const c = Math.ceil(rad / 2) + 1; const ix = Math.floor((x + R) / 2), iz = Math.floor((z + R) / 2); for (let a = -c; a <= c; a++) for (let b = -c; b <= c; b++) { const i = ix + a, j = iz + b; if (i < 0 || j < 0 || i >= M || j >= M) continue; const cx = i * 2 - R + 1, cz = j * 2 - R + 1; if ((cx - x) * (cx - x) + (cz - z) * (cz - z) <= rad * rad) m[j * M + i] = 1; } };
  for (let di = -1; di <= 0; di++) for (let dj = -1; dj <= 0; dj++) {
    const t = hub.tileJson(Math.floor(hub.n / 2) + di, Math.floor(hub.n / 2) + dj); if (!t) continue;
    for (const r of t.roads) { if (r.b) continue; const rad = r.w / 2 + 1.2; for (let q = 0; q + 1 < r.p.length; q++) { const [ax, az] = r.p[q], [bx, bz] = r.p[q + 1]; const L = Math.hypot(bx - ax, bz - az), st = Math.max(1, Math.ceil(L / 1.5)); for (let k = 0; k <= st; k++) stamp(ax + ((bx - ax) * k) / st, az + ((bz - az) * k) / st, rad); } }
  }
  hub.mask = m; return m;
}
const onRoad = (hub, x, z) => { const m = roadMask(hub), R = hub.maskR, i = Math.floor((x + R) / 2), j = Math.floor((z + R) / 2); return i < 0 || j < 0 || i >= R || j >= R || m[j * R + i] === 1; };

// Every spot beside a main road where a building could face it: the door point, and which way "out" is (towards the road).
function candidates(hub) {
  if (hub.cands) return hub.cands;
  const out = [];
  for (const r of hub.hubRoads) for (let s = 0; s + 1 < r.p.length; s++) {
    const [ax, az] = r.p[s], [bx, bz] = r.p[s + 1], L = Math.hypot(bx - ax, bz - az); if (L < 6) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let t = 3; t < L - 3; t += 7) for (const side of [1, -1]) {
      const nx = -uz * side, nz = ux * side, off = r.w / 2 + 3.2;
      out.push({ x: ax + ux * t + nx * off, z: az + uz * t + nz * off, fx: -nx, fz: -nz });
    }
  }
  hub.cands = out; return out;
}
// A free w x d building spot: nearest to (tx, tz), within maxDist, at least `sep` from every door in `taken`.
function placeSpot(hub, tx, tz, w, d, { maxDist = 1500, taken = [], sep = 40, skip = 0 } = {}) {
  const list = [];
  for (const c of candidates(hub)) { const dd = Math.hypot(c.x - tx, c.z - tz); if (dd <= maxDist) list.push([dd, c]); }
  list.sort((a, b) => a[0] - b[0]);
  let skipped = 0;
  for (const [, c] of list) {
    if (taken.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < sep)) continue;
    if (hub.blocked(c.x, c.z) || onRoad(hub, c.x, c.z)) continue;
    const ry = Math.atan2(c.fx, c.fz), sn = Math.sin(ry), cs = Math.cos(ry);
    // the footprint, from 1 m behind the door point to d + 1 m, plus a 2 m margin at the sides and back
    let ok = true;
    for (let lf = -(1 + d + 2); lf <= -1 && ok; lf += 2) for (let lx = -w / 2 - 2; lx <= w / 2 + 2 && ok; lx += 2) {
      const x = c.x + cs * lx + sn * lf, z = c.z - sn * lx + cs * lf;
      if (hub.blocked(x, z) || onRoad(hub, x, z)) ok = false;
    }
    if (!ok) continue;
    if (skipped++ < skip) continue;
    return { door: { x: c.x, z: c.z }, ry };
  }
  return null;
}

// Real buildings (from the map) that a place can use: its door goes on one of the building's walls, facing out.
const MIN_AREA = { shop: 70, boutique: 70, homestore: 110, pharmacy: 90, jobs: 200, bank: 140, police: 200, gym: 120, terminal: 300, hospital: 400, library: 150, airport: 500, garage: 150, club: 120, hotel: 250, eventcenter: 300, depot: 150 };
function pool(hub) {
  if (hub.pool) return hub.pool;
  const out = [];
  for (let di = -1; di <= 0; di++) for (let dj = -1; dj <= 0; dj++) {
    const t = hub.tileJson(Math.floor(hub.n / 2) + di, Math.floor(hub.n / 2) + dj); if (!t) continue;
    for (const b of t.buildings) {
      if (b.p.length < 4 || b.p.length > 40) continue;
      let a2 = 0, cx = 0, cz = 0; const n = b.p.length;
      for (let i = 0; i < n; i++) { const [x1, z1] = b.p[i], [x2, z2] = b.p[(i + 1) % n]; a2 += x1 * z2 - x2 * z1; cx += x1; cz += z1; }
      const area = Math.abs(a2) / 2; if (area < 35 || area > 5000) continue;
      out.push({ p: b.p, area, cx: cx / n, cz: cz / n, used: false });
    }
  }
  hub.pool = out; return out;
}
const inPoly = (p, x, z) => { let c = false; for (let i = 0, k = p.length - 1; i < p.length; k = i++) { const [xi, zi] = p[i], [xk, zk] = p[k]; if ((zi > z) !== (zk > z) && x < ((xk - xi) * (z - zi)) / (zk - zi) + xi) c = !c; } return c; };
// The best wall of a building for a door: long, with open ground in front, and a road close by in front.
function wallDoor(hub, b, minEdge) {
  let best = null; const p = b.p, n = p.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = p[i], [bx, bz] = p[(i + 1) % n], L = Math.hypot(bx - ax, bz - az); if (L < minEdge) continue;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2; let nx = (bz - az) / L, nz = -(bx - ax) / L;
    if (inPoly(p, mx + nx * 0.7, mz + nz * 0.7)) { nx = -nx; nz = -nz; }
    if (inPoly(p, mx + nx * 0.7, mz + nz * 0.7)) continue;
    const dx = mx + nx * 1.0, dz = mz + nz * 1.0;
    if (hub.blocked(dx, dz) || hub.blocked(mx + nx * 2.5, mz + nz * 2.5)) continue;
    let road = 99; for (let t = 2; t <= 30; t += 2) { const qx = mx + nx * t, qz = mz + nz * t; if (hub.blocked(qx, qz)) break; if (onRoad(hub, qx, qz)) { road = t; break; } }
    const score = (road === 99 ? 200 : road) - Math.min(L, 24);
    if (!best || score < best.score) best = { score, door: { x: dx, z: dz }, ry: Math.atan2(nx, nz), ew: L, road: road !== 99 };
  }
  return best;
}
// The nearest suitable real building to (tx, tz): area between lo and hi, not used, doors at least `sep` apart.
function adopt(hub, tx, tz, { lo = 70, hi = 5000, maxDist = 1500, taken = [], sep = 45, minEdge = 6, roadOnly = true } = {}) {
  const list = [];
  for (const b of pool(hub)) { if (b.used || b.area < lo || b.area > hi) continue; const dd = Math.hypot(b.cx - tx, b.cz - tz); if (dd <= maxDist) list.push([dd, b]); }
  list.sort((a, b) => a[0] - b[0]);
  for (const [, b] of list) {
    const w = wallDoor(hub, b, minEdge); if (!w || (roadOnly && !w.road)) continue;
    if (taken.some((q) => Math.hypot(q.x - w.door.x, q.z - w.door.z) < sep)) continue;
    b.used = true; return { ...w, b };
  }
  return null;
}

// The same kind of layout object the old generated city made (doors, lots, plots, stations, bus stops, tracks...), but for a real city.
// Everything lives within a couple of kilometres of the middle of the city so people meet each other.
export function layoutFor(city, seed = 1) {
  const hub = load(city);
  if (!hub) return null;
  const r = rng(seed);
  const doors = {};
  const taken = [];
  const near = (x, z, m) => taken.some((t) => Math.hypot(t.x - x, t.z - z) < m);
  // 1+2. Every place gets a real building (turned to face the road) with its door on the road side, so a door is never alone on the grass.
  //      The Market and the Plaza are open areas instead (stalls, no door into a building).
  hub.boxes.length = 0;
  const buildings = [];
  const addBox = (x, z, ry, w, d) => hub.boxes.push({ x, z, ry, hw: w / 2, hd: d / 2, r: Math.hypot(w, d) / 2 + 1 });
  const pois = (hub.idx.pois || []).filter((p) => Math.hypot(p.x, p.z) < 1050).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  for (const v of VENUES) {
    const open = OPEN[v];
    const sizes = open ? OPEN[v] : [[SIZES[v][1], SIZES[v][2]]];
    const kinds = VENUE_KINDS[v];
    const poi = kinds ? pois.find((q) => kinds.includes(q.k) && !near(q.x, q.z, 60)) : null;
    let spot = null, size = null;
    if (!open) {   // 1) a real building from the map
      const lo = MIN_AREA[v] || 90;
      let ad = poi ? adopt(hub, poi.x, poi.z, { lo, maxDist: 250, taken, sep: 45 }) : null;
      if (!ad) ad = adopt(hub, 0, 0, { lo, maxDist: 1500, taken, sep: 45 });
      if (ad) {
        doors[v] = { x: round(ad.door.x), z: round(ad.door.z), f: Math.cos(ad.ry) >= 0 ? 's' : 'n', ry: round(ad.ry), ew: round(ad.ew), ...(poi && Math.hypot(ad.b.cx - poi.x, ad.b.cz - poi.z) < 320 ? { real: poi.n } : {}) };
        taken.push(ad.door); continue;
      }
    }
    for (const [w, d] of sizes) {   // 2) a new building on open ground
      if (poi) spot = placeSpot(hub, poi.x, poi.z, w, d, { maxDist: open ? 500 : 300, taken, sep: 45 });
      if (!spot) spot = placeSpot(hub, 0, 0, w, d, { maxDist: 1500, taken, sep: 45 });
      if (spot) { size = [w, d]; break; }
    }
    if (!spot) {   // nowhere to put a building: keep the old behaviour (a door on free ground)
      const f = hub.freeNear(poi ? poi.x : 0, poi ? poi.z : 0, 120); if (!f) continue;
      doors[v] = { x: f.x, z: f.z, f: 's', ry: 0, ...(poi ? { real: poi.n } : {}) }; taken.push(f); continue;
    }
    const [w, d] = size, ry = spot.ry;
    doors[v] = { x: round(spot.door.x), z: round(spot.door.z), f: Math.cos(ry) >= 0 ? 's' : 'n', ry: round(ry), ...(poi && Math.hypot(spot.door.x - poi.x, spot.door.z - poi.z) < 320 ? { real: poi.n } : {}) };
    taken.push(spot.door);
    const sn = Math.sin(ry), cs = Math.cos(ry);
    const wx = (lx, lf) => spot.door.x + cs * lx + sn * lf, wz = (lx, lf) => spot.door.z - sn * lx + cs * lf;   // local (right, forward) from the door point
    if (!open) {
      const h = SIZES[v][3], k = SIZES[v][0], lf = -(1.0 + d / 2);
      buildings.push({ k, x: round(wx(0, lf)), z: round(wz(0, lf)), w, d, h, f: doors[v].f, ry: round(ry), venue: v });
      addBox(wx(0, lf), wz(0, lf), ry, w, d);
    } else {
      const c = { x: wx(0, -(1.0 + d / 2)), z: wz(0, -(1.0 + d / 2)) };
      buildings.push({ k: 'platform', x: round(c.x), z: round(c.z), w, d, h: 0.06, f: 's', ry: round(ry), venue: v });
      if (v === 'market') {
        // rows of stalls with a wide aisle down the middle and cross aisles; the door point is the entrance in the middle of the front
        const cols = Math.max(2, Math.floor((w - 8) / 5.2 / 2)), rows = Math.max(2, Math.floor((d - 5) / 5.4));
        for (let rI = 0; rI < rows; rI++) for (let cI = 0; cI < cols; cI++) for (const sgn of [-1, 1]) {
          const lx = sgn * (3.6 + cI * 5.2), lf = -(5 + rI * 5.4);
          if (Math.abs(lx) + 2.2 > w / 2 - 1 || -lf + 1.2 > d - 1) continue;
          const sry = ry - sgn * Math.PI / 2;   // each stall faces the aisle in the middle
          buildings.push({ k: 'stall', x: round(wx(lx, lf)), z: round(wz(lx, lf)), w: 4.2, d: 2.4, h: 2.6, f: 's', ry: round(sry), venue: v });
          addBox(wx(lx, lf), wz(lx, lf), sry, 4.2, 2.4);
        }
      }
    }
  }
  const roads = hub.hubRoads.slice().sort((a, b) => Math.hypot(a.p[0][0], a.p[0][1]) - Math.hypot(b.p[0][0], b.p[0][1]));
  const slots = [];   // beside-the-road spots, for bus stops
  for (const rd of roads) for (let s = 0; s + 1 < rd.p.length; s++) for (const side of [1, -1]) {
    const q = rectBeside(hub, rd, s, side, 8, 6, 0); if (q) slots.push({ ...q, d: Math.hypot(q.x, q.z) });
  }
  slots.sort((a, b) => a.d - b.d || a.x - b.x);
  // 3. Lots (empty ground you can buy) and plots (homes)
  const lots = [];
  const lotSlots = [];
  for (const rd of roads) for (let s = 0; s + 1 < rd.p.length; s++) for (const side of [1, -1]) { const q = rectBeside(hub, rd, s, side, LOT_W, LOT_D, 0); if (q) lotSlots.push({ ...q, d: Math.hypot(q.x, q.z) }); }
  lotSlots.sort((a, b) => a.x - b.x || a.z - b.z);
  const lotPick = [];
  for (const q of lotSlots) { if (lotPick.length >= 24) break; if (lotPick.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < 90) || near(q.door.x, q.door.z, 20)) continue; lotPick.push(q); }
  lotPick.forEach((q, id) => { lots.push({ id, x: round(q.x), z: round(q.z), w: LOT_W, d: LOT_D, f: q.f, door: { x: round(q.door.x), z: round(q.door.z) }, price: Math.round((100000 + Math.max(0, 1500 - q.d) * 140 + r() * 40000) / 10000) * 10000 }); taken.push(q.door); });
  const plots = [];
  for (let tries = 0; plots.length < 48 && tries < 400; tries++) {
    const ad = adopt(hub, 0, 0, { lo: 40, hi: 400, maxDist: 1500, taken, sep: 9, minEdge: 5 });
    if (!ad) break;
    if (lots.some((l) => Math.hypot(l.x - ad.b.cx, l.z - ad.b.cz) < 14)) { taken.push(ad.door); continue; }
    plots.push({ id: plots.length, x: round(ad.b.cx), z: round(ad.b.cz), f: Math.cos(ad.ry) >= 0 ? 's' : 'n', ry: round(ad.ry), door: { x: round(ad.door.x), z: round(ad.door.z) } }); taken.push(ad.door);
  }
  for (let tries = 0; plots.length < 48 && tries < 80; tries++) {
    const spot = placeSpot(hub, 0, 0, 8, 7, { maxDist: 1500, taken, sep: 14 });
    if (!spot) break;
    const ry = spot.ry, sn = Math.sin(ry), cs = Math.cos(ry), lf = -(1.0 + 3.5);
    const cx = spot.door.x + sn * lf, cz = spot.door.z + cs * lf;
    if (lots.some((l) => Math.hypot(l.x - cx, l.z - cz) < 14)) { taken.push({ x: spot.door.x, z: spot.door.z }); continue; }
    plots.push({ id: plots.length, x: round(cx), z: round(cz), f: Math.cos(ry) >= 0 ? 's' : 'n', ry: round(ry), door: { x: round(spot.door.x), z: round(spot.door.z) } }); taken.push(spot.door);
    buildings.push({ k: 'house', x: round(cx), z: round(cz), w: 8, d: 7, h: 3.8, f: Math.cos(ry) >= 0 ? 's' : 'n', ry: round(ry), plot: plots.length - 1 });
    addBox(cx, cz, ry, 8, 7);
  }
  // 4. Platforms and bus stops
  const stations = [{ id: 'terminal', name: 'Central Terminal', ...(doors.terminal || { x: 0, z: 0 }) }];
  const ring = [['west', 'Westgate Platform', -1, 0], ['north', 'Northgate Platform', 0, -1], ['south', 'Southgate Platform', 0, 1]];
  for (const [id, name, dx, dz] of ring) { const f = hub.freeNear(dx * 900, dz * 900, 200) || { x: dx * 900, z: dz * 900 }; stations.push({ id, name, x: round(f.x), z: round(f.z) }); }
  const busStops = [];
  for (const s of slots.slice(0, 400)) { if (busStops.length >= 14) break; if (busStops.some((b) => Math.hypot(b.x - s.x, b.z - s.z) < 300)) continue; busStops.push({ x: round(s.door.x), z: round(s.door.z) }); }
  return { stations, lots, trees: [], lights: [], bx: hub.half, bz: hub.half, cols: [], rows: [], roadsEW: [], roadsNS: [], buildings, plots, parks: [], tracks: [], doors, busStops, real: true, tile: hub.T, n: hub.n };
}
const round = (v) => Math.round(v * 100) / 100;

// What the Map screen draws for a real city: the main roads and the water inside the middle 2.4 km, where all the places stand.
export function planOf(city) {
  const hub = load(city); if (!hub) return null;
  const rr = hub.hubRoads.map((r) => ({ p: r.p, w: r.w }));
  const ww = [];
  for (let di = -1; di <= 0; di++) for (let dj = -1; dj <= 0; dj++) { const t = hub.tileJson(Math.floor(hub.n / 2) + di, Math.floor(hub.n / 2) + dj); if (t) for (const w of t.water) ww.push(w.p); }
  const parks = [];
  for (let di = -1; di <= 0; di++) for (let dj = -1; dj <= 0; dj++) { const t = hub.tileJson(Math.floor(hub.n / 2) + di, Math.floor(hub.n / 2) + dj); if (t) for (const g of t.green) parks.push(g.p); }
  return { rr, ww, gg: parks.slice(0, 150) };
}
