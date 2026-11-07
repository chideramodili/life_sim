// Traffic lights. Every junction runs the same cycle, so the server only has to tell browsers where in the cycle we are.
// Pure rules (no network or database).
export const CYCLE = 40; // seconds
// [from, to, east-west light, north-south light]
const PHASES = [
  [0, 17, 'green', 'red'],
  [17, 20, 'yellow', 'red'],
  [20, 21, 'red', 'red'],
  [21, 35, 'red', 'green'],
  [35, 38, 'red', 'yellow'],
  [38, 40, 'red', 'red'],
];
export const phaseAt = (ms) => ((ms / 1000) % CYCLE + CYCLE) % CYCLE;
// axis 'x' = travelling east-west, 'z' = travelling north-south
export function stateOf(axis, ph) {
  for (const [a, b, ew, ns] of PHASES) if (ph >= a && ph < b) return axis === 'x' ? ew : ns;
  return 'red';
}
// Seconds until this axis next turns green (0 if it is green now).
export function secondsToGreen(axis, ph) {
  for (let s = 0; s <= CYCLE; s += 0.5) if (stateOf(axis, (ph + s) % CYCLE) === 'green') return s;
  return CYCLE;
}

// Which junction (if any) is this point inside? Returns { i, j } (north-south road i, east-west road j) or null.
export function junctionAt(city, x, z) {
  const i = city.roadsNS.findIndex((r) => Math.abs(x - r.x) < r.half);
  if (i < 0) return null;
  const j = city.roadsEW.findIndex((r) => Math.abs(z - r.z) < r.half);
  return j < 0 ? null : { i, j };
}
// The way a heading (radians, 0 = +z) is mostly pointing: 'x' or 'z'.
export const axisOfHeading = (ry) => (Math.abs(Math.sin(ry)) > Math.abs(Math.cos(ry)) ? 'x' : 'z');

// The next junction ahead for something travelling along an axis. Returns { center, half, dist } or null.
// pos is its position along the axis, dir is +1 or -1. dist is measured to the junction centre.
export function nextJunction(city, axis, pos, dir) {
  const roads = axis === 'x' ? city.roadsNS : city.roadsEW;
  let best = null;
  for (const r of roads) {
    const c = axis === 'x' ? r.x : r.z;
    const d = (c - pos) * dir;
    if (d > -r.half && (!best || d < best.dist)) best = { center: c, half: r.half, dist: d };
  }
  return best;
}