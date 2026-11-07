// Adulthood: the city layout. Rules only (no network, no database), like bank.js and home.js.
// The server builds the layout once (it is always the same) and sends it to the browser, which draws it.
// The server also uses it to keep players out of buildings and to know where every door and house is.
//
// Map (x goes east, z goes south). One unit is about one metre.
//   Enugu Boulevard runs east-west through the middle. Five cross streets run north-south. Two secondary roads and two ring
//   roads run east-west. That makes 24 blocks: 6 columns by 4 rows.
export const CITY = {
  bx: 168, bz: 114,                      // how far a player can walk
  spawn: process.env.CITY_SPAWN ? { x: Number(process.env.CITY_SPAWN.split(',')[0]), z: Number(process.env.CITY_SPAWN.split(',')[1]) } : { x: 28, z: 9.2 }, // where you arrive by map (CITY_SPAWN is for tests only)
};
export const COLS = [[-160, -118], [-102, -63], [-47, -8], [8, 47], [63, 102], [118, 160]];
export const ROWS = [[-94.5, -65.5], [-50.5, -11], [11, 50.5], [65.5, 94.5]];     // far north, near north, near south, far south
export const ROADS_EW = [{ z: 0, half: 7 }, { z: -58, half: 4.5 }, { z: 58, half: 4.5 }, { z: -102, half: 4.5 }, { z: 102, half: 4.5 }];
export const ROADS_NS = [{ x: -110, half: 5 }, { x: -55, half: 5 }, { x: 0, half: 5 }, { x: 55, half: 5 }, { x: 110, half: 5 }];
export const DOOR_REACH = 3.5;
export const LOT_W = 16, LOT_D = 12;

// A small seeded random number generator so the city is identical every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Empty building lots that players can buy. A few ordinary buildings (shops, offices, warehouses, flats, with no venue) are
// taken out of the city and their ground is sold as lots instead. This uses its own random generator, so nothing else moves.
function findLots(seed, buildings) {
  const rr = rng((seed ^ 0x10751) >>> 0);
  const ok = buildings.filter((b) => !b.v && (b.k === 'shop' || b.k === 'office' || b.k === 'warehouse' || b.k === 'apt') && b.w >= 9 && b.d >= 8);
  const clearOfStalls = (b) => !buildings.some((o) => o.k === 'stall' && Math.abs(o.x - b.x) < (o.w + Math.min(b.w, LOT_W)) / 2 && Math.abs(o.z - b.z) < (o.d + Math.min(b.d, LOT_D)) / 2);
  const cand = ok.filter(clearOfStalls).map((b) => ({ b, key: rr() })).sort((p, q) => p.key - q.key).map((c) => c.b);
  const picked = [];
  for (const b of cand) {
    if (picked.length >= 12) break;
    if (picked.some((p) => Math.hypot(p.x - b.x, p.z - b.z) < 30)) continue;
    picked.push(b);
  }
  for (const b of picked) buildings.splice(buildings.indexOf(b), 1);
  picked.sort((p, q) => p.x - q.x || p.z - q.z);
  return picked.map((b, id) => {
    const w = Math.min(LOT_W, Math.max(10, Math.round(b.w))), d = Math.min(LOT_D, Math.max(8, Math.round(b.d)));
    const dist = Math.hypot(b.x, b.z); // closer to the middle of town costs more
    const price = Math.max(120000, Math.round((380000 - dist * 1400) / 5000) * 5000);
    return { id, x: b.x, z: b.z, w, d, f: b.f, door: { x: b.x, z: b.f === 's' ? b.z + b.d / 2 + 1.4 : b.z - b.d / 2 - 1.4 }, price };
  });
}

// Building kinds: house, shop, apt, office, tower, warehouse, civic, campus, stall, police, terminal, factory, bigbox.
// A building is { x, z, w, d, h, k, f, t, v } = centre x and z, width, depth, height, kind, facing ('n' or 's'), tint 0-5, venue id or null.
export function generateCity(seed = 20260) {
  const r = rng(seed);
  const buildings = [];
  const plots = [];
  const parks = [];     // green areas { x0, x1, z0, z1 }
  const tracks = [];    // railway lines { x0, x1, z0, z1 }
  const doors = {};     // venue id -> { x, z, f }
  const busStops = [];

  const add = (b) => buildings.push({ t: Math.floor(r() * 6), v: null, ...b });
  // A building whose front touches the sidewalk side of its lot. edge is the z of the block edge on that side.
  const front = (cx, edge, f, w, d, h, k, v = null, extra = {}) => {
    const setback = 2;
    const z = f === 's' ? edge - setback - d / 2 : edge + setback + d / 2;
    add({ x: cx, z, w, d, h, k, f, v, ...extra });
    if (v) doors[v] = { x: cx, z: f === 's' ? edge - 0.6 : edge + 0.6, f };
  };
  // A line of buildings along an edge.
  const row = (x0, x1, edge, f, n, d, kind, hMin, hMax, gap = 2) => {
    const w = (x1 - x0 - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) front(x0 + gap + w / 2 + i * (w + gap), edge, f, w, d + (r() - 0.5) * 3, hMin + r() * (hMax - hMin), kind);
  };
  const house = (cx, edge, f) => {
    const id = plots.length;
    const hz = f === 's' ? edge - 2 - 3 : edge + 2 + 3;
    add({ x: cx, z: hz, w: 6.5, d: 6, h: 3.4 + r() * 0.8, k: 'house', f });
    plots.push({ id, x: cx, z: hz, f, door: { x: cx, z: f === 's' ? edge - 0.8 : edge + 0.8 } });
  };
  // Two rows of houses in a block: the front row faces the near road, the back row faces the far road.
  const houses = (col, rw) => {
    const [x0, x1] = COLS[col];
    const [z0, z1] = ROWS[rw];
    const n = Math.floor((x1 - x0) / 9.5);
    const pad = ((x1 - x0) - n * 9.5) / 2;
    for (let i = 0; i < n; i++) {
      const cx = x0 + pad + 4.75 + i * 9.5;
      house(cx, z1, 's');   // faces south, toward the road below
      house(cx, z0, 'n');   // faces north, toward the road above
    }
    parks.push({ x0: x0 + 1, x1: x1 - 1, z0: z0 + 1, z1: z1 - 1, kind: 'yard' });
  };

  const NN = 1, NS = 2, NF = 0, SF = 3; // row numbers
  // ---------- North near row (faces south onto the Boulevard) ----------
  {
    const rw = NN;
    const [z0, z1] = ROWS[rw];
    // c0 Technology Campus
    let [a, b] = COLS[0];
    front((a + b) / 2, z1, 's', 18, 14, 9, 'campus');
    front(a + 9, z1 - 20, 's', 12, 10, 6, 'campus'); front(b - 9, z1 - 20, 's', 12, 10, 6, 'campus');
    parks.push({ x0: a, x1: b, z0, z1, kind: 'lawn' });
    // c1 Main Street shopping: Shop, Boutique, Home Store
    [a, b] = COLS[1];
    front(a + 7.5, z1, 's', 11, 15, 7, 'shop', 'shop');
    front(a + 19.5, z1, 's', 11, 15, 7, 'shop', 'boutique');
    front(a + 31.5, z1, 's', 11, 15, 8, 'shop', 'homestore');
    row(a, b, z0, 'n', 2, 12, 'apt', 14, 20);
    // c2 The Flats (apartments) with the Pharmacy on the ground floor of one
    [a, b] = COLS[2];
    front(a + 10, z1, 's', 16, 13, 6, 'shop', 'pharmacy');
    front(b - 10, z1, 's', 14, 13, 18, 'apt');
    front(a + 10, z1 - 22, 's', 14, 12, 22, 'apt'); front(b - 10, z1 - 22, 's', 14, 12, 26, 'apt');
    // c3 Government Quarter: the Jobs Center
    [a, b] = COLS[3];
    front((a + b) / 2, z1, 's', 24, 16, 11, 'civic', 'jobs');
    front((a + b) / 2, z1 - 24, 's', 28, 12, 10, 'civic');
    // c4 Downtown Business Core
    [a, b] = COLS[4];
    row(a, b, z1, 's', 3, 12, 'office', 18, 36);
    row(a, b, z0, 'n', 2, 12, 'tower', 34, 52);
    // c5 Finance District
    [a, b] = COLS[5];
    row(a, b, z1, 's', 3, 12, 'tower', 40, 66);
    row(a, b, z0, 'n', 3, 12, 'tower', 44, 70);
  }
  // ---------- South near row (faces north onto the Boulevard) ----------
  {
    const rw = NS;
    const [z0, z1] = ROWS[rw];
    houses(0, rw);
    let [a, b] = COLS[1];
    front((a + b) / 2 - 6, z0, 'n', 24, 16, 9, 'warehouse', 'market');
    for (let i = 0; i < 9; i++) add({ x: a + 4 + (i % 5) * 7, z: z0 + 24 + Math.floor(i / 5) * 6, w: 4.5, d: 3, h: 2.6, k: 'stall', f: 'n' });
    front((a + b) / 2, z1, 's', 30, 9, 8, 'warehouse');
    [a, b] = COLS[2];
    front(a + 12, z0, 'n', 16, 14, 11, 'civic', 'bank');
    front(b - 9, z0, 'n', 13, 12, 8, 'shop');
    row(a, b, z1, 's', 2, 12, 'office', 12, 20);
    [a, b] = COLS[3];
    front((a + b) / 2, z0, 'n', 14, 10, 5, 'civic', 'plaza');
    parks.push({ x0: a, x1: b, z0, z1, kind: 'park' });
    [a, b] = COLS[4];
    front(a + 11, z0, 'n', 20, 16, 10, 'police', 'police');
    front(b - 9, z0, 'n', 14, 14, 8, 'warehouse', 'gym');
    row(a, b, z1, 's', 2, 12, 'office', 12, 18);
    [a, b] = COLS[5];
    front(a + 17, z0, 'n', 24, 14, 8, 'terminal', 'terminal');
    tracks.push({ x0: a - 2, x1: b + 8, z0: z0 + 22, z1: z0 + 25 });
    tracks.push({ x0: a - 2, x1: b + 8, z0: z0 + 27, z1: z0 + 30 });
    add({ x: a + 17, z: z0 + 26, w: 18, d: 3, h: 0.4, k: 'platform', f: 'n' });
  }
  // ---------- Far north row ----------
  {
    const rw = NF;
    const [z0, z1] = ROWS[rw];
    houses(0, rw); houses(1, rw);
    { // Hospital in the Government Quarter's far side
      const [ha, hb] = COLS[3];
      front((ha + hb) / 2, z1, 's', 30, 16, 12, 'civic', 'hospital');
      parks.push({ x0: ha, x1: hb, z0, z1, kind: 'lawn' });
    }
    let [a, b] = COLS[2]; // University district
    front(a + 11, z1, 's', 16, 14, 9, 'campus', 'library');
    front(b - 9, z1, 's', 14, 12, 12, 'campus');
    front(a + 20, z0, 'n', 24, 9, 8, 'campus');
    parks.push({ x0: a, x1: b, z0, z1, kind: 'lawn' });
    [a, b] = COLS[4]; // big-box retail plaza
    front((a + b) / 2, z1, 's', 34, 14, 9, 'terminal', 'airport'); // the Airport (it shares the terminal look)
    row(a, b, z0, 'n', 2, 7, 'warehouse', 6, 8);
    houses(5, rw);
  }
  // ---------- Far south row ----------
  {
    const rw = SF;
    const [z0, z1] = ROWS[rw];
    houses(0, rw); houses(1, rw);
    let [a, b] = COLS[2]; // industrial: the Auto Shop
    front(a + 12, z0, 'n', 18, 14, 8, 'warehouse', 'garage');
    front(b - 10, z0, 'n', 14, 12, 8, 'warehouse');
    add({ x: a + 10, z: z1 - 6, w: 14, d: 8, h: 7, k: 'factory', f: 'n' });
    [a, b] = COLS[3]; // commerce: the Night Club
    front(a + 10, z0, 'n', 16, 14, 8, 'shop', 'club');
    front(b - 9, z0, 'n', 12, 12, 8, 'shop');
    row(a, b, z1, 's', 2, 10, 'shop', 6, 9);
    [a, b] = COLS[4]; // industrial
    row(a, b, z0, 'n', 3, 12, 'warehouse', 7, 10);
    add({ x: b - 8, z: z1 - 7, w: 8, d: 8, h: 16, k: 'factory', f: 'n' });
    [a, b] = COLS[5]; // railyard
    row(a, b, z0, 'n', 2, 12, 'warehouse', 6, 8);
    tracks.push({ x0: a - 2, x1: b + 8, z0: z1 - 12, z1: z1 - 9 });
  }
  // Bus stops: on the sidewalks of the Boulevard and the cross streets.
  for (const x of [-80, -30, 30, 80, 135]) { busStops.push({ x, z: -8.5 }); busStops.push({ x: x + 5, z: 8.5 }); }
  for (const z of [-30, 30]) { busStops.push({ x: -6.5, z }); busStops.push({ x: 6.5, z: z + 8 }); }

  // Express train stops. The Central Terminal has its own door; the others are platforms on the sidewalk.
  const stations = [
    { id: 'terminal', name: 'Central Terminal', x: 144, z: 11.6 },
    { id: 'west', name: 'Westgate Platform', x: -116.5, z: -30 },
    { id: 'north', name: 'Northgate Platform', x: -6.5, z: -80 },
    { id: 'south', name: 'Southgate Platform', x: 6.5, z: 80 },
  ];

  const lots = findLots(seed, buildings);

  // Trees and street lights. The browser draws exactly these, and makeWalls makes them solid.
  const rt = rng((seed ^ 0x7ee5) >>> 0);
  const treeSpots = [];
  for (const rw of ROADS_EW) for (let x = -CITY.bx + 6; x < CITY.bx - 4; x += 11) for (const sd of [-1, 1]) treeSpots.push([x + rt() * 2, rw.z + sd * (rw.half + 1.6)]);
  for (const rs of ROADS_NS) for (let z = -CITY.bz + 6; z < CITY.bz - 4; z += 11) for (const sd of [-1, 1]) treeSpots.push([rs.x + sd * (rs.half + 1.6), z + rt() * 2]);
  for (const pk of parks) {
    const n = pk.kind === 'park' ? 40 : pk.kind === 'lawn' ? 14 : 6;
    for (let i = 0; i < n; i++) treeSpots.push([pk.x0 + 2 + rt() * (pk.x1 - pk.x0 - 4), pk.z0 + 2 + rt() * (pk.z1 - pk.z0 - 4)]);
  }
  const inBuilding = (x, z, pad = 1.2) => buildings.some((b) => b.k !== 'stall' && Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad);
  const doorNear = (x, z) => Object.values(doors).some((d) => Math.hypot(x - d.x, z - d.z) < 4) || plots.some((p) => Math.hypot(x - p.door.x, z - p.door.z) < 3);
  const onRoad = (x, z, pad = 0.4) => ROADS_EW.some((r) => Math.abs(z - r.z) < r.half + pad) || ROADS_NS.some((r) => Math.abs(x - r.x) < r.half + pad);
  const trees = treeSpots.filter(([x, z]) => !inBuilding(x, z) && !doorNear(x, z) && !onRoad(x, z) && Math.abs(x) < CITY.bx && Math.abs(z) < CITY.bz)
    .map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round((0.8 + rt() * 0.7) * 100) / 100]);
  const lightSpots = [];
  for (const rw of ROADS_EW) for (let x = -CITY.bx + 12; x < CITY.bx - 6; x += 22) for (const sd of [-1, 1]) lightSpots.push([x, rw.z + sd * (rw.half + 0.6)]);
  for (const rs of ROADS_NS) for (let z = -CITY.bz + 12; z < CITY.bz - 6; z += 22) for (const sd of [-1, 1]) lightSpots.push([rs.x + sd * (rs.half + 0.6), z]);
  const lights = lightSpots.filter(([x, z]) => !inBuilding(x, z, 0.3) && !onRoad(x, z, 0.2));
  return {
    stations, lots, trees, lights,
    bx: CITY.bx, bz: CITY.bz, cols: COLS, rows: ROWS, roadsEW: ROADS_EW, roadsNS: ROADS_NS,
    buildings, plots, parks, tracks, doors, busStops,
  };
}

// Collision: can a player stand at (x, z)? Buildings are solid boxes. (Small things like stalls and trees are not solid.)
const SOLID = new Set(['house', 'shop', 'apt', 'office', 'tower', 'warehouse', 'civic', 'campus', 'police', 'terminal', 'factory', 'bigbox']);
export function makeWalls(city) {
  const boxes = city.buildings.filter((b) => SOLID.has(b.k)).map((b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }));
  // Street furniture is solid too: tree trunks, lamp posts, and the bench and posts of every bus stop.
  const small = (x, z, r) => ({ x0: x - r, x1: x + r, z0: z - r, z1: z + r });
  // Never block a way in: nothing is solid within 2.5 m of a door, a house door, a lot door or a station.
  const entries = [...Object.values(city.doors || {}), ...(city.plots || []).map((p) => p.door), ...(city.lots || []).map((l) => l.door), ...(city.stations || [])];
  const clear = (x, z) => !entries.some((d) => Math.hypot(x - d.x, z - d.z) < 2.5);
  for (const [x, z] of city.trees || []) if (clear(x, z)) boxes.push(small(x, z, 0.28));
  for (const [x, z] of city.lights || []) if (clear(x, z)) boxes.push(small(x, z, 0.3));
  for (const s of city.busStops || []) {
    if (!clear(s.x, s.z)) continue;
    boxes.push({ x0: s.x - 1.1, x1: s.x + 1.1, z0: s.z - 0.25, z1: s.z + 0.25 });
    for (const dx of [-1.4, 1.4]) boxes.push(small(s.x + dx, s.z, 0.1));
  }
  // A coarse grid so each test only looks at a few boxes.
  const CELL = 20;
  const grid = new Map();
  const key = (i, j) => i * 10000 + j;
  for (const bx of boxes) {
    for (let i = Math.floor(bx.x0 / CELL); i <= Math.floor(bx.x1 / CELL); i++) {
      for (let j = Math.floor(bx.z0 / CELL); j <= Math.floor(bx.z1 / CELL); j++) {
        const k = key(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(bx);
      }
    }
  }
  const PAD = 0.35; // a player is not a point
  return {
    blocked(x, z) {
      const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (!list) return false;
      for (const b of list) if (x > b.x0 - PAD && x < b.x1 + PAD && z > b.z0 - PAD && z < b.z1 + PAD) return true;
      return false;
    },
    // Move from (x, z) by (dx, dz), sliding along walls. Returns the new position.
    step(x, z, dx, dz) {
      if (!this.blocked(x + dx, z + dz)) return { x: x + dx, z: z + dz };
      if (!this.blocked(x + dx, z)) return { x: x + dx, z };
      if (!this.blocked(x, z + dz)) return { x, z: z + dz };
      return { x, z };
    },
  };
}

// The layout never changes, so build it once.
// Each city has its own seed, so its buildings differ; the road grid and the venue doors are the same everywhere.
const cached = new Map();
export function getCity(seed = 20260) {
  if (!cached.has(seed)) {
    const city = generateCity(seed);
    cached.set(seed, { city, walls: makeWalls(city) });
  }
  return cached.get(seed);
}

// ---------- Routes for rides ----------
// Vehicles drive along the road centre lines. A route is a list of points. The server works it out; the browser just plays it.
const clampTo = (v, lim) => Math.max(-lim, Math.min(lim, v));
export function projectToRoad(city, p) {
  let best = null;
  for (let i = 0; i < city.roadsEW.length; i++) {
    const c = { x: clampTo(p.x, city.bx - 6), z: city.roadsEW[i].z, axis: 'ew', i };
    c.d = Math.hypot(c.x - p.x, c.z - p.z);
    if (!best || c.d < best.d) best = c;
  }
  for (let i = 0; i < city.roadsNS.length; i++) {
    const c = { x: city.roadsNS[i].x, z: clampTo(p.z, city.bz - 6), axis: 'ns', i };
    c.d = Math.hypot(c.x - p.x, c.z - p.z);
    if (!best || c.d < best.d) best = c;
  }
  return best;
}
export function routeBetween(city, from, to) {
  const A = projectToRoad(city, from);
  const B = projectToRoad(city, to);
  const k = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
  // positions along each road: every crossing, plus the two ends of the trip
  const ew = city.roadsEW.map((r) => ({ z: r.z, xs: city.roadsNS.map((s) => s.x) }));
  const ns = city.roadsNS.map((r) => ({ x: r.x, zs: city.roadsEW.map((s) => s.z) }));
  for (const P of [A, B]) {
    if (P.axis === 'ew') ew[P.i].xs.push(P.x);
    else ns[P.i].zs.push(P.z);
  }
  const adj = new Map();
  const link = (a, b) => {
    const ka = k(a.x, a.z), kb = k(b.x, b.z);
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (!adj.has(ka)) adj.set(ka, { p: a, to: [] });
    if (!adj.has(kb)) adj.set(kb, { p: b, to: [] });
    adj.get(ka).to.push([kb, d]);
    adj.get(kb).to.push([ka, d]);
  };
  for (const r of ew) { const xs = [...new Set(r.xs.map((x) => Math.round(x * 100)))].sort((a, b) => a - b).map((x) => x / 100); for (let i = 0; i + 1 < xs.length; i++) link({ x: xs[i], z: r.z }, { x: xs[i + 1], z: r.z }); }
  for (const r of ns) { const zs = [...new Set(r.zs.map((z) => Math.round(z * 100)))].sort((a, b) => a - b).map((z) => z / 100); for (let i = 0; i + 1 < zs.length; i++) link({ x: r.x, z: zs[i] }, { x: r.x, z: zs[i + 1] }); }
  const ks = k(A.x, A.z), ke = k(B.x, B.z);
  const dist = new Map([[ks, 0]]);
  const prev = new Map();
  const todo = new Set([ks]);
  while (todo.size) {
    let cur = null;
    for (const n of todo) if (cur === null || dist.get(n) < dist.get(cur)) cur = n;
    todo.delete(cur);
    if (cur === ke) break;
    for (const [nb, d] of (adj.get(cur) || { to: [] }).to) {
      const nd = dist.get(cur) + d;
      if (!dist.has(nb) || nd < dist.get(nb)) { dist.set(nb, nd); prev.set(nb, cur); todo.add(nb); }
    }
  }
  const pts = [];
  let c = ke;
  if (!dist.has(ke)) return { points: [{ x: A.x, z: A.z }], total: 0, start: { x: A.x, z: A.z }, end: { x: A.x, z: A.z } };
  while (c) { pts.unshift({ x: adj.get(c).p.x, z: adj.get(c).p.z }); c = prev.get(c); }
  return { points: pts, total: dist.get(ke), start: { x: A.x, z: A.z }, end: { x: B.x, z: B.z } };
}
// Where along a route (distance s from the start) are we, and which way are we facing?
export function pointOnRoute(points, s) {
  if (points.length === 1) return { x: points[0].x, z: points[0].z, ry: 0 };
  let left = Math.max(0, s);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= len || i + 2 === points.length) {
      const t = len ? Math.min(1, left / len) : 1;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, ry: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    left -= len;
  }
  const l = points[points.length - 1];
  return { x: l.x, z: l.z, ry: 0 };
}