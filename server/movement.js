// Adulthood: how people move. Rules only (no network, no database).
// Walk or run speeds, sliding along obstacles, and finding a way around them for tap-to-move.
import fs from 'node:fs';

// Metres per second. Tapping or a gentle joystick push walks; only the outer rim of the joystick (or Shift) runs.
// FAST_WALK=1 makes everyone run all the time (the automatic tests use it so they do not wait on slow walking).
export const FAST = process.env.FAST_WALK === '1';
export const SPEEDS = { room: { walk: 1.7, run: 3.4 }, street: { walk: 2.2, run: 5.0 } };
export const speedFor = (street, run) => (FAST ? SPEEDS[street ? 'street' : 'room'].run * (street ? 1.02 : 0.88) : SPEEDS[street ? 'street' : 'room'][run ? 'run' : 'walk']);

// Furniture in the building interiors: boxes [x0, z0, x1, z1] per room, made from the real props (see colliders.json).
const SOLIDS = JSON.parse(fs.readFileSync(new URL('./colliders.json', import.meta.url), 'utf8'));
const ROOM_SIZE = 10;       // rooms run from -10 to 10
const PAD = 0.32;           // a person is not a point
export const roomSolids = (id) => SOLIDS[id] || [];
// Can a person stand at (x, z) in this room? (Not in a wall, not in furniture.)
export function roomBlockedFn(id, extra = null) {
  const boxes = extra && extra.length ? roomSolids(id).concat(extra) : roomSolids(id);
  return (x, z) => {
    if (Math.abs(x) > ROOM_SIZE - 0.3 || Math.abs(z) > ROOM_SIZE - 0.3) return true;
    for (const b of boxes) if (x > b[0] - PAD && x < b[2] + PAD && z > b[1] - PAD && z < b[3] + PAD) return true;
    return false;
  };
}

// Move by (dx, dz), sliding along whatever is in the way. If you are already stuck inside something you may move freely out of it.
export function slide(blocked, x, z, dx, dz) {
  if (blocked(x, z)) return { x: x + dx, z: z + dz };
  if (!blocked(x + dx, z + dz)) return { x: x + dx, z: z + dz };
  if (!blocked(x + dx, z)) return { x: x + dx, z };
  if (!blocked(x, z + dz)) return { x, z: z + dz };
  // A corner: try a gentler slide so you do not stick to it
  const m = Math.hypot(dx, dz);
  if (m > 0) {
    if (Math.abs(dx) > Math.abs(dz) && !blocked(x + dx * 0.5, z)) return { x: x + dx * 0.5, z };
    if (Math.abs(dz) >= Math.abs(dx) && !blocked(x, z + dz * 0.5)) return { x, z: z + dz * 0.5 };
  }
  return { x, z };
}

// A* on a grid, then pulled tight. Returns the points to walk through (not including where you are), or null if there is no way.
export function findPath(blocked, from, to, { bx, bz, cell = 1, limit = 30000 } = {}) {
  const W = Math.ceil((2 * bx) / cell) + 1, H = Math.ceil((2 * bz) / cell) + 1;
  const cx = (x) => Math.max(0, Math.min(W - 1, Math.round((x + bx) / cell)));
  const cz = (z) => Math.max(0, Math.min(H - 1, Math.round((z + bz) / cell)));
  const wx = (i) => i * cell - bx, wz = (j) => j * cell - bz;
  const idx = (i, j) => j * W + i;
  const open = (i, j) => !blocked(wx(i), wz(j));
  let gi = cx(to.x), gj = cz(to.z);
  if (!open(gi, gj)) {
    // the target is inside something: aim for the nearest free spot
    let best = null;
    for (let r = 1; r <= 6 && !best; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = gi + di, j = gj + dj;
      if (i < 0 || j < 0 || i >= W || j >= H || !open(i, j)) continue;
      const d = Math.hypot(wx(i) - to.x, wz(j) - to.z);
      if (!best || d < best.d) best = { i, j, d };
    }
    if (!best) return null;
    gi = best.i; gj = best.j;
  }
  const si = cx(from.x), sj = cz(from.z);
  if (si === gi && sj === gj) return [{ x: wx(gi), z: wz(gj) }];
  const g = new Map(), came = new Map(), closed = new Set();
  const heap = []; // simple binary heap of [f, key]
  const push = (f, k) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { let l = c * 2 + 1, r = l + 1, m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  const h = (i, j) => Math.hypot(i - gi, j - gj);
  const sk = idx(si, sj);
  g.set(sk, 0); push(h(si, sj), sk);
  let n = 0, found = false;
  while (heap.length && n++ < limit) {
    const [, k] = pop();
    if (closed.has(k)) continue;
    closed.add(k);
    const i = k % W, j = (k - i) / W;
    if (i === gi && j === gj) { found = true; break; }
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nk = idx(ni, nj);
      if (closed.has(nk) || !open(ni, nj)) continue;
      if (di && dj && (!open(i + di, j) || !open(i, j + dj))) continue; // no squeezing diagonally between two obstacles
      const ng = g.get(k) + (di && dj ? 1.414 : 1);
      if (g.has(nk) && g.get(nk) <= ng) continue;
      g.set(nk, ng); came.set(nk, k); push(ng + h(ni, nj), nk);
    }
  }
  if (!found) return null;
  const cells = [];
  for (let k = idx(gi, gj); k !== undefined; k = came.get(k)) cells.push({ x: wx(k % W), z: wz((k - (k % W)) / W) });
  cells.reverse();
  cells.shift();
  // pull the path tight: skip over points when there is a clear straight line
  const clear = (a, b) => {
    const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(d / 0.4);
    for (let s = 1; s <= steps; s++) { const t = s / steps; if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; }
    return true;
  };
  const out = [];
  let at = { x: from.x, z: from.z }, i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !clear(at, cells[j])) j--;
    out.push(cells[j]);
    at = cells[j];
    i = j + 1;
  }
  return out;
}
