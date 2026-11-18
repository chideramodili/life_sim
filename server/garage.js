// Adulthood: garage and parking rules (no network, no database).
// Your vehicles are either "out" (with you, ready to drive) or "parked": stored in your private home garage or in a public car park,
// where they stay until you take them out. A parked vehicle cannot be driven.
export const GARAGE_COST = 150000;       // one-off: build a private garage at your home
export const GARAGE_SLOTS = 4;           // vehicles a private garage holds
export const LOT_SLOTS = 2;              // vehicles one player can keep in public car parks (all lots together)
export const LOT_FEE = 500;              // paid each time you park in a public car park
export const VALET_FEE = 5000;           // a valet brings a parked vehicle to you (same city)
export const ZONE_RADIUS = 16;           // metres from a car park centre or from your home door
export const LOTS_PER_CITY = 3;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const defaultGarage = () => ({ g: false, v: {}, u: {} });

// Vehicle upgrades: saved as data, applied to the driving maths (see driving.js stepSpeed). 3 levels each; no new 3D parts.
export const UP_MAX = 3;
export const UPGRADES = {
  engine: { label: 'Engine', weight: 1.0, text: '+4% top speed and +5% acceleration per level' },
  trans: { label: 'Transmission', weight: 0.8, text: '+8% acceleration per level' },
  brakes: { label: 'Brakes', weight: 0.6, text: '+10% braking power per level (shorter stops)' },
  tires: { label: 'Tyres and suspension', weight: 0.7, text: '+6% steering grip per level' },
};
export const UP_IDS = Object.keys(UPGRADES);
const LEVEL_SHARE = [0.06, 0.12, 0.2];     // share of the vehicle price, by the level being bought
export const upgradeCost = (vehiclePrice, cat, nextLevel) => Math.max(2000, Math.round((vehiclePrice * LEVEL_SHARE[nextLevel - 1] * UPGRADES[cat].weight) / 1000) * 1000);
export const upOf = (gar, id) => ({ engine: 0, trans: 0, brakes: 0, tires: 0, ...((gar.u && gar.u[id]) || {}) });
export const upTotal = (up) => UP_IDS.reduce((n, c) => n + (up[c] || 0), 0);
// Read a saved garage safely. Anything broken is dropped. v = { vehicleId: { at: 'home' | lotId, city } }
export function parseGarage(json, validIds) {
  const out = defaultGarage();
  let raw = null;
  try { raw = json ? JSON.parse(json) : null; } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return out;
  out.g = raw.g === true;
  for (const [id, u] of Object.entries(raw.u && typeof raw.u === 'object' ? raw.u : {})) {
    if (!validIds.has(id) || !u || typeof u !== 'object') continue;
    const o = {};
    for (const c of UP_IDS) o[c] = Math.max(0, Math.min(UP_MAX, Math.floor(Number(u[c]) || 0)));
    out.u[id] = o;
  }
  for (const [id, s] of Object.entries(raw.v && typeof raw.v === 'object' ? raw.v : {})) {
    if (!validIds.has(id) || !s || typeof s.at !== 'string' || typeof s.city !== 'string') continue;
    out.v[id] = { at: s.at.slice(0, 40), city: s.city.slice(0, 20) };
  }
  return out;
}
// Public car parks for one city: three of them, beside spread-out venue doors. Same every time for the same layout.
export function lotsFor(layout, nameOf) {
  const ids = Object.keys(layout.doors || {}).filter((id) => id !== 'depot' && id !== 'home').sort();
  const out = [];
  const far = (d) => out.every((l) => dist(l, d) >= 80);          // car parks at least 80 m apart
  for (let i = 0; i < LOTS_PER_CITY && ids.length; i++) {
    const start = Math.floor(((i + 0.5) * ids.length) / LOTS_PER_CITY);
    for (let k = 0; k < ids.length; k++) {
      const id = ids[(start + k) % ids.length], d = layout.doors[id];
      if (out.some((l) => l.id === 'lot:' + id) || !far(d)) continue;
      out.push({ id: 'lot:' + id, name: `Car park · ${nameOf(id)}`, x: d.x, z: d.z });
      break;
    }
  }
  return out;
}
// Which parking place is the player standing in? Returns { at: 'home' | lotId, name } or null.
export function zoneAt(pos, homeDoor, hasGarage, lots) {
  if (homeDoor && hasGarage && dist(pos, homeDoor) <= ZONE_RADIUS) return { at: 'home', name: 'Your home garage' };
  const l = lots.find((x) => dist(pos, x) <= ZONE_RADIUS);
  return l ? { at: l.id, name: l.name } : null;
}
export const parkedIn = (gar, where, city) => Object.entries(gar.v).filter(([, s]) => (where === 'lots' ? s.at !== 'home' : s.at === 'home') && s.city === city).map(([id]) => id);
export const isParked = (gar, id) => Object.hasOwn(gar.v, id);
