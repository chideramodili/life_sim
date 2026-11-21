// Adulthood: traffic for the real cities. The old city's cars ran in fixed lanes on a grid; a real city has no grid and is far too big
// to fill with cars, so cars appear on real roads a little way from people, drive along them, and go away when nobody is near.
// Same shape as traffic.js (step, view, blocked, carAhead, copCars, setLevel...), so the rest of the server does not change.
const HALF_LEN = 2.1, HALF_WID = 1.0, ACCEL = 3, BRAKE = 7, PANIC = 12;
export const HIT_MIN = 2.5;
const POOL = 36;
const NEAR_MIN = 70, NEAR_MAX = 210, FAR = 330;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// hub: from realcity.js (it has tileJson, half, T, n and blocked)
export function createRealTraffic(hub, seed = 7) {
  const rc = rng(seed);
  const cars = [];
  for (let i = 0; i < POOL; i++) cars.push({ id: i, on: false, x: 0, z: 0, ry: 0, fx: 0, fz: 1, v: 0, vmax: 8, color: Math.floor(rc() * 9), cop: i % 9 === 4, pts: null, k: 0, dir: 1, w: 6, wait: 0 });
  for (const c of cars) if (c.cop) c.vmax = 7;
  let level = 0.7;
  const setLevel = (l) => { level = l <= 0 ? 0 : Math.max(0.2, Math.min(1, l)); };
  const tileOf = (x, z) => [Math.floor((x + hub.half) / hub.T), Math.floor((z + hub.half) / hub.T)];
  const dist = (x, z, q) => Math.hypot(q[0] - x, q[1] - z);

  // Put a car on a real road 70-210 m from this person, driving away from or towards them (random).
  function spawn(c, p) {
    const [ti, tj] = tileOf(p.x, p.z);
    const t = hub.tileJson(ti, tj); if (!t || !t.roads.length) return false;
    for (let tries = 0; tries < 24; tries++) {
      const r = t.roads[Math.floor(rc() * t.roads.length)];
      if (r.w < 6 || r.p.length < 2) continue;
      const k = Math.floor(rc() * (r.p.length - 1));
      const mx = (r.p[k][0] + r.p[k + 1][0]) / 2, mz = (r.p[k][1] + r.p[k + 1][1]) / 2, d = Math.hypot(mx - p.x, mz - p.z);
      if (d < NEAR_MIN || d > NEAR_MAX) continue;
      if (cars.some((o) => o.on && Math.hypot(o.x - mx, o.z - mz) < 14)) continue;
      c.pts = r.p; c.w = r.w; c.dir = rc() < 0.5 ? 1 : -1; c.k = c.dir > 0 ? k + 1 : k;   // k = the vertex it is heading to
      c.x = mx; c.z = mz; c.v = 3; c.vmax = c.cop ? 7 : 6 + rc() * 4; c.on = true; c.wait = 0;
      aim(c); return true;
    }
    return false;
  }
  // Point the car at its next vertex, in the right-hand lane.
  function aim(c) {
    const q = c.pts[c.k]; let dx = q[0] - c.x, dz = q[1] - c.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    c.fx = dx; c.fz = dz; c.ry = Math.atan2(dx, dz);
  }
  // Parked cars: 40 beside the kerb of the main roads, nearest the middle of the city first. Placed once (same list for everyone) and solid.
  const parked = [];
  {
    const rp = rng(seed + 991), segs = [];
    for (const rd of hub.hubRoads || []) { if (rd.b || rd.w < 6) continue; for (let q = 0; q + 1 < rd.p.length; q++) { const a = rd.p[q], b = rd.p[q + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L >= 12) segs.push({ a, b, L, w: rd.w }); } }
    segs.sort((m, n) => Math.hypot((m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2) - Math.hypot((n.a[0] + n.b[0]) / 2, (n.a[1] + n.b[1]) / 2));
    for (const sg of segs) {
      if (parked.length >= 40) break;
      if (rp() < 0.45) continue;
      const dx = (sg.b[0] - sg.a[0]) / sg.L, dz = (sg.b[1] - sg.a[1]) / sg.L, t = 0.3 + rp() * 0.4, side = rp() < 0.5 ? 1 : -1, off = sg.w / 2 + 1.3;
      const x = sg.a[0] + (sg.b[0] - sg.a[0]) * t - dz * side * off, z = sg.a[1] + (sg.b[1] - sg.a[1]) * t + dx * side * off;
      if (hub.blocked(x, z) || hub.blocked(x + dx * 2.4, z + dz * 2.4) || hub.blocked(x - dx * 2.4, z - dz * 2.4)) continue;
      if (parked.some((o) => Math.hypot(o.x - x, o.z - z) < 6)) continue;
      parked.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, ry: Math.round(Math.atan2(dx, dz) * 1000) / 1000, fx: dx, fz: dz, color: Math.floor(rp() * 9) });
    }
  }
  const inParked = (x, z, pad) => { for (const k of parked) if (Math.abs(k.x - x) < 4 && Math.abs(k.z - z) < 4) { const ex = x - k.x, ez = z - k.z; if (Math.abs(ex * k.fx + ez * k.fz) <= HALF_LEN + pad && Math.abs(ex * -k.fz + ez * k.fx) <= HALF_WID + pad) return true; } return false; };
  const inBox = (c, x, z, pad) => { const dx = x - c.x, dz = z - c.z; return Math.abs(dx * c.fx + dz * c.fz) <= HALF_LEN + pad && Math.abs(dx * -c.fz + dz * c.fx) <= HALF_WID + pad; };
  const blocked = (x, z, pad = 0.35) => { if (inParked(x, z, pad)) return true; for (const c of cars) if (c.on && Math.abs(c.x - x) < 5 && Math.abs(c.z - z) < 5 && inBox(c, x, z, pad)) return true; return false; };

  function step(dt, people, ph, drivers) {
    const watch = drivers && drivers.length ? people.concat(drivers) : people;
    const hits = [];
    const near = watch.filter((p) => Number.isFinite(p.x));
    if (!near.length || level === 0) { for (const c of cars) c.on = false; return hits; }
    // cars leave when nobody is near
    let active = 0;
    for (const c of cars) if (c.on) { if (!near.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < FAR)) c.on = false; else active++; }
    const want = Math.round(Math.min(POOL, near.length * 14 + 6) * level);
    for (let n = 0; n < 2 && active < want; n++) {
      const c = cars.find((q) => !q.on); if (!c) break;
      if (spawn(c, near[Math.floor(rc() * near.length)])) active++;
    }
    for (const c of cars) {
      if (!c.on) continue;
      // how far is the nearest thing in front?
      let gap = Infinity; const look = 6 + (c.v * c.v) / (2 * BRAKE) + 6;
      for (const pe of watch) {
        const dx = pe.x - c.x, dz = pe.z - c.z; if (Math.abs(dx) > look + 3 || Math.abs(dz) > look + 3) continue;
        const along = dx * c.fx + dz * c.fz, lat = Math.abs(dx * -c.fz + dz * c.fx);
        if (along > 0 && along < look && lat < HALF_WID + 1.4) gap = Math.min(gap, along - HALF_LEN);
      }
      for (const o of cars) {
        if (o === c || !o.on) continue;
        const dx = o.x - c.x, dz = o.z - c.z; if (Math.abs(dx) > look + 6 || Math.abs(dz) > look + 6) continue;
        const along = dx * c.fx + dz * c.fz, lat = Math.abs(dx * -c.fz + dz * c.fx);
        if (along > 0 && along < look && lat < 2.4 && (o.fx * c.fx + o.fz * c.fz) > -0.5) gap = Math.min(gap, along - HALF_LEN * 2);
      }
      let target = c.vmax;
      if (gap < Infinity) target = Math.min(target, Math.sqrt(Math.max(0, 2 * BRAKE * (gap - 2.5))));
      if (c.v > target) c.v = Math.max(target, c.v - Math.min(PANIC, BRAKE * 1.5) * dt); else c.v = Math.min(target, c.v + ACCEL * dt);
      c.wait = c.v < 0.3 ? c.wait + dt : 0;
      if (c.wait > 25) { c.on = false; continue; }    // stuck: let it go
      // move along the road
      let move = c.v * dt;
      while (move > 0) {
        const q = c.pts[c.k]; const d = Math.hypot(q[0] - c.x, q[1] - c.z);
        if (d <= move) { c.x = q[0]; c.z = q[1]; move -= d; c.k += c.dir; if (c.k < 0 || c.k >= c.pts.length) { c.on = false; break; } aim(c); }
        else { c.x += c.fx * move; c.z += c.fz * move; move = 0; }
      }
      if (!c.on) continue;
      if (hub.blocked(c.x, c.z)) { c.on = false; continue; }    // a road that runs into a wall: drop it
      if (c.v > 0.3) for (const pe of people) if (inBox(c, pe.x, pe.z, 0.25)) { hits.push({ id: pe.id, speed: c.v, car: c.id }); c.v = 0; }
    }
    return hits;
  }
  // Drawn a little to the right of the road's centre line (right-hand traffic), so two cars passing do not overlap.
  const view = () => cars.map((c) => (!c.on ? [9999, 9999, 0, c.cop ? 100 : c.color] : [Math.round((c.x - c.fz * c.w * 0.25) * 10) / 10, Math.round((c.z + c.fx * c.w * 0.25) * 10) / 10, Math.round(c.ry * 100) / 100, c.cop ? 100 : c.color]));
  function carAhead(x, z, ry, range, halfLen = HALF_LEN) {
    const fx = Math.sin(ry), fz = Math.cos(ry); let best = null, who = null;
    for (const c of cars) {
      if (!c.on) continue;
      const dx = c.x - x, dz = c.z - z; if (Math.abs(dx) > range + 6 || Math.abs(dz) > range + 6) continue;
      const along = dx * fx + dz * fz, lat = Math.abs(dx * -fz + dz * fx);
      if (along <= 0 || along > range + HALF_LEN + halfLen || lat > 2.4) continue;
      const gap = along - HALF_LEN - halfLen; if (best === null || gap < best) { best = gap; who = c; }
    }
    carAhead.last = who; return best;
  }
  const copCars = () => cars.filter((c) => c.cop && c.on);
  return { cars, parked, bays: [], lanes: [], step, blocked, view, setLevel, carAhead, copCars, HIT_MIN };
}
