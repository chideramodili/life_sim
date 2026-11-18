// Adulthood: player-created races. Rules only (no network, no database).
// A player creates a race, others join by staking at least the entry minimum (the stakes sit in escrow), the server counts down, tracks checkpoints
// and pays the pool out by the creator's prize rule. The server decides everything; the phone only shows it and drives.
export const FORMATS = {
  sprint: { label: 'Sprint (point to point)', text: 'Start line to a finish line through checkpoints.' },
  circuit: { label: 'Circuit (laps)', text: 'Loop around the same checkpoints for a number of laps.' },
};
export const CLASSES = { any: 'Any vehicle', car: 'Cars only', bike: 'Bicycles only', stock: 'Stock only (no upgrades)' };
export const SPLITS = { win: { label: 'Winner takes all', pct: [100] }, top3: { label: 'Top three: 60% / 25% / 15%', pct: [60, 25, 15] } };
export const MIN_ENTRY_FLOOR = 1000, MIN_ENTRY_CAP = 500000;      // the creator's minimum entry must be between these
export const MAX_PLAYERS = 8, MAX_LAPS = 3;
export const START_RADIUS = 60;          // everyone must be this close to the start line when the creator starts the race
export const COUNTDOWN_SECONDS = 10;
export const CP_REACH = 10;              // metres from a checkpoint that counts
export const FINISH_WINDOW_SECONDS = 90; // after the first finisher, others get this long
export const LOBBY_SECONDS = 15 * 60;    // an open race with nobody starting it is cancelled (all stakes refunded)
export const MAX_SPEED = Number(process.env.RACE_MAX_SPEED) || 40;             // m/s, for the plausibility check between checkpoints

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const doorsOf = (layout) => [
  ...Object.entries(layout.doors || {}).filter(([id]) => id !== 'depot').map(([id, d]) => ({ x: d.x, z: d.z })),
  ...(layout.plots || []).map((p) => ({ x: p.door.x, z: p.door.z })),
];

// Check what the creator asked for. Returns { ok, why } or { ok, cfg }.
export function checkConfig(req, cash) {
  if (!req || typeof req !== 'object') return { ok: false, why: 'Bad request.' };
  const name = typeof req.name === 'string' ? req.name.trim().replace(/\s+/g, ' ').slice(0, 30) : '';
  if (name.length < 3) return { ok: false, why: 'Give the race a name (at least 3 letters).' };
  if (!FORMATS[req.format]) return { ok: false, why: 'Pick a race format.' };
  const laps = req.format === 'circuit' ? Math.floor(Number(req.laps)) : 1;
  if (req.format === 'circuit' && !(laps >= 1 && laps <= MAX_LAPS)) return { ok: false, why: `Laps must be 1 to ${MAX_LAPS}.` };
  const max = Math.floor(Number(req.max));
  if (!(max >= 2 && max <= MAX_PLAYERS)) return { ok: false, why: `Players must be 2 to ${MAX_PLAYERS}.` };
  const minEntry = Math.floor(Number(req.minEntry));
  if (!(minEntry >= MIN_ENTRY_FLOOR && minEntry <= MIN_ENTRY_CAP)) return { ok: false, why: `The minimum entry must be ₦${MIN_ENTRY_FLOOR.toLocaleString('en-NG')} to ₦${MIN_ENTRY_CAP.toLocaleString('en-NG')}.` };
  if (!SPLITS[req.split]) return { ok: false, why: 'Pick a prize rule.' };
  if (!CLASSES[req.cls]) return { ok: false, why: 'Pick a vehicle rule.' };
  if (!['public', 'private'].includes(req.vis)) return { ok: false, why: 'Pick public or private.' };
  const stake = Math.floor(Number(req.stake));
  if (!(stake >= minEntry)) return { ok: false, why: 'Your own stake must be at least the minimum entry.' };
  if (stake > cash) return { ok: false, why: 'You do not have enough cash for that stake.' };
  return { ok: true, cfg: { name, format: req.format, laps, max, minEntry, split: req.split, cls: req.cls, vis: req.vis, stake } };
}
// A route: start point plus the checkpoints in order (the last one is the finish). Circuit loops back to the start line.
export function makeRoute(layout, format, rnd) {
  const all = doorsOf(layout), pts = [];
  for (let tries = 0; tries < 800 && pts.length < 4; tries++) {
    const a = all[Math.floor(rnd() * all.length)];
    if (pts.every((b) => dist(a, b) >= 70 && dist(a, b) <= 260)) pts.push(a);
  }
  if (pts.length < 4) return null;
  const strip = (p) => ({ x: p.x, z: p.z });
  const [s, a, b, c] = pts.map(strip);
  return format === 'circuit' ? { start: s, cps: [a, b, c, s] } : { start: s, cps: [a, b, c] };
}
export const totalCheckpoints = (race) => race.route.cps.length * race.laps;
export const targetOf = (race, idx) => race.route.cps[idx % race.route.cps.length];
export const raceLength = (race) => { let d = 0, prev = race.route.start; for (let l = 0; l < race.laps; l++) for (const c of race.route.cps) { d += dist(prev, c); prev = c; } return d; };
// How long the race may run before everyone left is a "did not finish".
export const raceSeconds = (race) => Math.round(raceLength(race) / 6 + 90);
// Pool paid by finish order. places = user ids in finish order; stakes = { userId: amount }. Returns { userId: amount }. Nothing is created or lost.
export function payouts(stakes, places, split) {
  const pool = Object.values(stakes).reduce((n, v) => n + v, 0), out = {};
  if (!places.length) return out;
  const pct = SPLITS[split].pct.slice(0, places.length), sum = pct.reduce((n, v) => n + v, 0);
  let paid = 0;
  pct.forEach((p, i) => { const a = Math.floor((pool * p) / sum); out[places[i]] = a; paid += a; });
  out[places[0]] += pool - paid;                    // rounding leftovers go to the winner
  return out;
}
// Can this vehicle take part? vid = the player's active vehicle id for the class, kind = 'car' | 'bike', up = total upgrade levels.
export const classOk = (cls, kind, upTotal) => (cls === 'any' ? true : cls === 'stock' ? upTotal === 0 : cls === kind);
export const stakeXp = (stake, minEntry) => Math.min(100, Math.floor(stake / 5000));
