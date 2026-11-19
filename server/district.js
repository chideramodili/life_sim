// Adulthood: the walkable Real Map areas (Abuja and Enugu). Rules only (no network, no database).
// A real-map cut of OpenStreetMap (maps/<city>.json) becomes a big open area you can walk and run around.
// The server decides where you can stand: building outlines and water are solid, everything else is open.
import fs from 'node:fs';

export const HALF = 900;                 // every map runs from -900 to 900 metres on x and z
const CELL = 2;                          // the solid map is a grid of 2 m squares
const N = (HALF * 2) / CELL;
const cache = new Map();
// What a real place becomes when you walk in: one of the game's existing buildings. Places not listed here are for looking at and jumping to.
export const KIND_ROOM = { bank: 'bank', hotel: 'hotel', guest_house: 'hotel', clinic: 'hospital', hospital: 'hospital', dentist: 'hospital', doctors: 'hospital', pharmacy: 'pharmacy', library: 'library', supermarket: 'market', marketplace: 'market', convenience: 'market', mall: 'market', food_court: 'market', restaurant: 'market', cafe: 'market', fast_food: 'market', clothes: 'boutique', car_repair: 'garage', police: 'police' };
export const ENTER_REACH = 14;           // metres: you must be this close to walk into a place
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function read(cityId) {
  try { return JSON.parse(fs.readFileSync(new URL(`./maps/${cityId}.json`, import.meta.url), 'utf8')); } catch { return null; }
}

// Mark every grid square whose centre is inside the polygon.
function fill(grid, poly, v = 1) {
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (const [x, z] of poly) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (z < minz) minz = z; if (z > maxz) maxz = z; }
  const j0 = Math.max(0, Math.floor((minz + HALF) / CELL)), j1 = Math.min(N - 1, Math.floor((maxz + HALF) / CELL));
  for (let j = j0; j <= j1; j++) {
    const zc = j * CELL + CELL / 2 - HALF;
    const xs = [];
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const [xi, zi] = poly[i], [xk, zk] = poly[k];
      if ((zi > zc) !== (zk > zc)) xs.push(xi + ((zc - zi) * (xk - xi)) / (zk - zi));
    }
    xs.sort((a, b) => a - b);
    for (let t = 0; t + 1 < xs.length; t += 2) {
      const a = Math.max(0, Math.ceil((xs[t] + HALF) / CELL - 0.5)), b = Math.min(N - 1, Math.floor((xs[t + 1] + HALF) / CELL - 0.5));
      for (let i = a; i <= b; i++) grid[j * N + i] = v;
    }
  }
}

function build(cityId) {
  const d = read(cityId);
  if (!d) return null;
  const grid = new Uint8Array(N * N);
  for (const b of d.buildings) fill(grid, b.p);
  for (const w of d.water) fill(grid, w.p);
  const PAD = 0.35;
  const cell = (x, z) => { const i = Math.floor((x + HALF) / CELL), j = Math.floor((z + HALF) / CELL); return i < 0 || j < 0 || i >= N || j >= N ? 1 : grid[j * N + i]; };
  // A person is not a point: also test a little to each side.
  const blocked = (x, z) => {
    if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) return true;
    return cell(x, z) === 1 || cell(x - PAD, z) === 1 || cell(x + PAD, z) === 1 || cell(x, z - PAD) === 1 || cell(x, z + PAD) === 1;
  };
  // The nearest open spot to (x, z), looking outwards in rings.
  const freeNear = (x, z) => {
    if (!blocked(x, z)) return { x, z };
    for (let r = 2; r <= 60; r += 2) for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
      if (!blocked(px, pz)) return { x: Math.round(px * 10) / 10, z: Math.round(pz * 10) / 10 };
    }
    return null;
  };
  // Start on the main road nearest the middle.
  let best = null, bd = 1e9;
  for (const r of d.roads) if (r.w >= 6) for (const m of r.p) { const dd = Math.hypot(m[0], m[1]); if (dd < bd && !blocked(m[0], m[1])) { bd = dd; best = { x: m[0], z: m[1] }; } }
  const spawn = best || freeNear(0, 0) || { x: 0, z: 0 };
  // Named places you can jump to (the phone app lists them). Each one is moved to the nearest open spot.
  const seen = new Set();
  const pois = [];
  for (const p of d.pois || []) {
    const key = p.n.toLowerCase();
    if (seen.has(key)) continue;
    const f = freeNear(p.x, p.z);
    if (!f) continue;
    seen.add(key);
    pois.push({ i: pois.length, id: `${cityId}:${slug(p.n)}`, n: p.n, k: p.k, x: f.x, z: f.z, room: KIND_ROOM[p.k] || null });   // id stays the same as long as the place keeps its name
    if (pois.length >= 40) break;
  }
  return { blocked, freeNear, spawn, pois, name: d.name };
}

export function get(cityId) {
  if (!cache.has(cityId)) cache.set(cityId, build(cityId));
  return cache.get(cityId);
}
export const has = (cityId) => Boolean(get(cityId));
