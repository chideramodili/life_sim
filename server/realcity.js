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
  const blocked = (x, z) => {
    if (Math.abs(x) > half - 2 || Math.abs(z) > half - 2) return true;
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
  const hub = { idx, half, T, n, blocked, freeNear, tileJson, gridOf, hubRoads };
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

// The same kind of layout object the old generated city made (doors, lots, plots, stations, bus stops, tracks...), but for a real city.
// Everything lives within a couple of kilometres of the middle of the city so people meet each other.
export function layoutFor(city, seed = 1) {
  const hub = load(city);
  if (!hub) return null;
  const r = rng(seed);
  const doors = {};
  const taken = [];
  const near = (x, z, m) => taken.some((t) => Math.hypot(t.x - x, t.z - z) < m);
  // 1. Real places with real names first
  const pois = (hub.idx.pois || []).filter((p) => Math.hypot(p.x, p.z) < 1050).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  for (const v of VENUES) {
    const kinds = VENUE_KINDS[v]; if (!kinds) continue;
    const p = pois.find((q) => kinds.includes(q.k) && !near(q.x, q.z, 60));
    if (!p) continue;
    const f = hub.freeNear(p.x, p.z, 40); if (!f) continue;
    doors[v] = { x: f.x, z: f.z, f: 's', real: p.n }; taken.push(f);
  }
  // 2. The rest go beside main roads near the middle
  const roads = hub.hubRoads.slice().sort((a, b) => Math.hypot(a.p[0][0], a.p[0][1]) - Math.hypot(b.p[0][0], b.p[0][1]));
  const slots = [];
  for (const rd of roads) for (let s = 0; s + 1 < rd.p.length; s++) for (const side of [1, -1]) {
    const q = rectBeside(hub, rd, s, side, 8, 6, 0); if (q) slots.push({ ...q, d: Math.hypot(q.x, q.z) });
  }
  slots.sort((a, b) => a.d - b.d || a.x - b.x);
  for (const v of VENUES) {
    if (doors[v]) continue;
    const s = slots.find((q) => !near(q.door.x, q.door.z, 45)); if (!s) continue;
    doors[v] = { x: round(s.door.x), z: round(s.door.z), f: s.f }; taken.push(s.door);
  }
  // 3. Lots (empty ground you can buy) and plots (homes)
  const lots = [];
  const lotSlots = [];
  for (const rd of roads) for (let s = 0; s + 1 < rd.p.length; s++) for (const side of [1, -1]) { const q = rectBeside(hub, rd, s, side, LOT_W, LOT_D, 0); if (q) lotSlots.push({ ...q, d: Math.hypot(q.x, q.z) }); }
  lotSlots.sort((a, b) => a.x - b.x || a.z - b.z);
  const lotPick = [];
  for (const q of lotSlots) { if (lotPick.length >= 24) break; if (lotPick.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < 90) || near(q.door.x, q.door.z, 20)) continue; lotPick.push(q); }
  lotPick.forEach((q, id) => { lots.push({ id, x: round(q.x), z: round(q.z), w: LOT_W, d: LOT_D, f: q.f, door: { x: round(q.door.x), z: round(q.door.z) }, price: Math.round((100000 + Math.max(0, 1500 - q.d) * 140 + r() * 40000) / 10000) * 10000 }); taken.push(q.door); });
  const plots = [];
  const plotSlots = [];
  for (const rd of roads) for (let s = 0; s + 1 < rd.p.length; s++) for (const side of [1, -1]) { const q = rectBeside(hub, rd, s, side, 7, 6, 0); if (q) plotSlots.push(q); }
  plotSlots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  for (const q of plotSlots) {
    if (plots.length >= 48) break;
    if (near(q.door.x, q.door.z, 14) || lots.some((l) => Math.hypot(l.x - q.x, l.z - q.z) < 14)) continue;
    plots.push({ id: plots.length, x: round(q.x), z: round(q.z), f: q.f, door: { x: round(q.door.x), z: round(q.door.z) } }); taken.push(q.door);
  }
  // 4. Platforms and bus stops
  const stations = [{ id: 'terminal', name: 'Central Terminal', ...(doors.terminal || { x: 0, z: 0 }) }];
  const ring = [['west', 'Westgate Platform', -1, 0], ['north', 'Northgate Platform', 0, -1], ['south', 'Southgate Platform', 0, 1]];
  for (const [id, name, dx, dz] of ring) { const f = hub.freeNear(dx * 900, dz * 900, 200) || { x: dx * 900, z: dz * 900 }; stations.push({ id, name, x: round(f.x), z: round(f.z) }); }
  const busStops = [];
  for (const s of slots.slice(0, 400)) { if (busStops.length >= 14) break; if (busStops.some((b) => Math.hypot(b.x - s.x, b.z - s.z) < 300)) continue; busStops.push({ x: round(s.door.x), z: round(s.door.z) }); }
  return { stations, lots, trees: [], lights: [], bx: hub.half, bz: hub.half, cols: [], rows: [], roadsEW: [], roadsNS: [], buildings: [], plots, parks: [], tracks: [], doors, busStops, real: true, tile: hub.T, n: hub.n };
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
