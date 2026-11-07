// Driving your own car or bike, and the police who chase you. Pure rules and maths (no network or database).
// A vehicle faces ry radians with 0 = +z, so its forward direction is (sin ry, cos ry).
import { routeBetween } from './city.js';

export const VEH = {
  car:  { max: 22, accel: 8, brake: 14, drag: 1.6, turn: 1.9, back: 6, len: 2.1, wid: 1.0 },
  bike: { max: 8,  accel: 4, brake: 8,  drag: 2.0, turn: 2.6, back: 2, len: 0.9, wid: 0.4 },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const newDrive = (kind, x, z, ry = 0) => ({ kind, x, z, ry, v: 0 });

// Speed and heading from the controls. steer: -1 (left) .. 1 (right); thr: -1 (brake / reverse) .. 1 (go).
export function stepSpeed(d, input, dt) {
  const k = VEH[d.kind];
  const steer = clamp(Number(input.steer) || 0, -1, 1);
  const thr = clamp(Number(input.thr) || 0, -1, 1);
  if (thr > 0.05) d.v += (d.v < -0.1 ? k.brake : k.accel * thr) * dt;
  else if (thr < -0.05) d.v -= (d.v > 0.1 ? k.brake : k.accel * 0.6) * -thr * dt;
  else d.v -= Math.sign(d.v) * Math.min(Math.abs(d.v), k.drag * dt * (1 + Math.abs(d.v) / 10));
  d.v = clamp(d.v, -k.back, k.max);
  // You cannot turn on the spot; the faster you go the wider the turn feels.
  const grip = Math.min(1, Math.abs(d.v) / 3) * (1 - 0.35 * Math.min(1, Math.abs(d.v) / k.max));
  d.ry -= steer * k.turn * grip * dt * Math.sign(d.v || 1);
  d.ry = ((d.ry + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

// Move, and bounce off anything solid. blocked(x, z) says if a point is inside something.
// Returns the speed you hit at (0 if you hit nothing).
export function moveDrive(d, dt, blocked) {
  const k = VEH[d.kind];
  const fx = Math.sin(d.ry), fz = Math.cos(d.ry);
  const nx = d.x + fx * d.v * dt, nz = d.z + fz * d.v * dt;
  const f = Math.sign(d.v || 1);
  const pts = [[0, 0], [k.len * f, 0], [-k.len * f, 0], [k.len * f * 0.7, k.wid], [k.len * f * 0.7, -k.wid]];
  for (const [al, lat] of pts) {
    if (blocked(nx + fx * al - fz * lat, nz + fz * al + fx * lat)) {
      const hit = Math.abs(d.v);
      d.v = -d.v * 0.2;
      return hit;
    }
  }
  d.x = nx;
  d.z = nz;
  return 0;
}

// ---------- The police ----------
export const POLICE = {
  speed: 19,            // slower than a car's top speed (22): you can outrun them, but not on a bike
  accel: 9,
  first: 2,             // cars at the start of a chase
  max: 4,
  moreEveryMs: 45000,   // another car joins if you are still running
  spawnMin: 70, spawnMax: 160,
  arrestDist: 5,        // a police car this close...
  arrestSpeed: 5,       // ...while you are this slow...
  arrestHoldMs: 1500,   // ...for this long means you are caught
  loseFar: 110,         // far from every police car...
  loseFarMs: 8000,      // ...for this long, you got away
  loseHiddenDist: 35,   // or out of their sight and at least this far away...
  loseHiddenMs: 10000,  // ...for this long
};

export function newChase(now, offences) {
  return { since: now, cops: [], nextMoreAt: now + POLICE.moreEveryMs, offences: new Set(offences), caughtMs: 0, farMs: 0, hiddenMs: 0 };
}

// A police car appears at a junction a good way off, so it drives in.
export function spawnCop(city, near, rand = Math.random) {
  const spots = [];
  for (const rs of city.roadsNS) for (const rw of city.roadsEW) {
    const dist = Math.hypot(rs.x - near.x, rw.z - near.z);
    if (dist >= POLICE.spawnMin && dist <= POLICE.spawnMax) spots.push({ x: rs.x, z: rw.z });
  }
  if (!spots.length) for (const rs of city.roadsNS) for (const rw of city.roadsEW) spots.push({ x: rs.x, z: rw.z });
  const s = spots[Math.floor(rand() * spots.length)];
  return { x: s.x, z: s.z, ry: 0, v: 0, route: null, idx: 0, routeAt: 0 };
}

// Drive one police car toward the target along the roads.
export function stepCop(city, cop, target, dt, now) {
  if (!cop.route || now - cop.routeAt > 1500) {
    cop.route = routeBetween(city, { x: cop.x, z: cop.z }, target).points;
    cop.idx = 1;
    cop.routeAt = now;
  }
  let tx = target.x, tz = target.z;
  if (cop.route && cop.idx < cop.route.length) { tx = cop.route[cop.idx].x; tz = cop.route[cop.idx].z; }
  const dx = tx - cop.x, dz = tz - cop.z;
  const d = Math.hypot(dx, dz);
  const toPlayer = Math.hypot(target.x - cop.x, target.z - cop.z);
  const want = toPlayer < 12 ? POLICE.speed * 0.6 : POLICE.speed;
  cop.v += clamp(want - cop.v, -POLICE.accel * dt * 2, POLICE.accel * dt);
  if (d > 0.01) {
    const step = Math.min(d, cop.v * dt);
    cop.x += (dx / d) * step;
    cop.z += (dz / d) * step;
    cop.ry = Math.atan2(dx, dz);
  }
  if (d < 1.2 && cop.route && cop.idx < cop.route.length) cop.idx++;
}

// One tick of a chase. player = { x, z, speed, onFoot }, hasLOS(cop) says if that cop can see the player.
// Returns 'arrest', 'lost' or null.
export function chaseTick(city, w, player, dtMs, now, hasLOS, rand = Math.random) {
  const dt = dtMs / 1000;
  while (w.cops.length < POLICE.first) w.cops.push(spawnCop(city, player, rand));
  if (now >= w.nextMoreAt && w.cops.length < POLICE.max) { w.cops.push(spawnCop(city, player, rand)); w.nextMoreAt = now + POLICE.moreEveryMs; }
  let nearest = Infinity, seen = false;
  for (const c of w.cops) {
    stepCop(city, c, player, dt, now);
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    nearest = Math.min(nearest, d);
    if (d < 90 && hasLOS(c)) seen = true;
  }
  // Caught: a police car right beside you while you are (nearly) stopped, or you got out next to them.
  const stuck = nearest <= POLICE.arrestDist && (player.onFoot ? nearest <= 12 : player.speed < POLICE.arrestSpeed);
  w.caughtMs = stuck ? w.caughtMs + dtMs : 0;
  if (w.caughtMs >= POLICE.arrestHoldMs || (player.onFoot && nearest <= 6)) return 'arrest';
  // Got away: far from everyone, or out of sight and not too close.
  w.farMs = nearest >= POLICE.loseFar ? w.farMs + dtMs : 0;
  w.hiddenMs = !seen && nearest >= POLICE.loseHiddenDist ? w.hiddenMs + dtMs : 0;
  if (w.farMs >= POLICE.loseFarMs || w.hiddenMs >= POLICE.loseHiddenMs) return 'lost';
  return null;
}

// Can this point see that point? Walks along the line and checks for buildings. blocked(x, z) is true inside a solid.
export function lineOfSight(a, b, blocked, stepLen = 2) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.ceil(d / stepLen);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}