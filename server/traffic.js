// Traffic on the city roads. The server owns the cars, so they can really stop for people and really hit them.
// No network or database in here: index.js feeds it the people on the street and reads the cars back.
import { CITY } from './city.js';
import { stateOf, nextJunction } from './signals.js';

const CAR_COLORS = 9;
const HALF_LEN = 2.1;      // half the length of a car
const HALF_WID = 1.0;      // half the width
const ACCEL = 3;           // m/s^2 speeding up
const BRAKE = 7;           // m/s^2 normal braking
const PANIC = 12;          // m/s^2 when it is nearly too late
const HIT_MIN = 2.5;       // slower than this (m/s) and a bump does not injure
export const PARK_PAD = 0.35;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function createTraffic(city, blockedAt = () => false, opts = {}) {
  const rc = rng(77);
  const lanes = [];
  for (const rw of city.roadsEW) {
    const lane = rw.half > 5 ? 3 : 1.5;
    lanes.push({ axis: 'x', z: rw.z + lane, dir: 1, len: city.bx * 2 }, { axis: 'x', z: rw.z - lane, dir: -1, len: city.bx * 2 });
  }
  for (const rs of city.roadsNS) {
    lanes.push({ axis: 'z', x: rs.x + 1.8, dir: 1, len: city.bz * 2 }, { axis: 'z', x: rs.x - 1.8, dir: -1, len: city.bz * 2 });
  }
  const cars = [];
  lanes.forEach((ln, li) => {
    const n = ln.axis === 'x' ? (Math.abs(ln.z) < 6 ? 5 : 2) : 2;
    for (let i = 0; i < n && cars.length < 56; i++) {
      const vmax = (ln.axis === 'x' && Math.abs(ln.z) < 6 ? 9 : 6) + rc() * 3;
      cars.push({ id: cars.length, li, t: rc() * ln.len, v: vmax, vmax, color: Math.floor(rc() * CAR_COLORS), on: true, x: 0, z: 0, ry: 0, fx: 0, fz: 0 });
    }
  });
  // A few of the cars are police patrols: slower, and they watch for speeders (see index.js).
  cars.forEach((c, i) => { if (i % 17 === 5 && !cars.some((o) => o.cop && o.li === c.li)) { c.cop = true; c.vmax = 7; } });
  // Cars on the same lane start well apart: sort and nudge so none begin on top of another.
  for (const ln of lanes.keys()) {
    const on = cars.filter((c) => c.li === ln).sort((a, b) => a.t - b.t);
    for (let i = 1; i < on.length; i++) if (on[i].t - on[i - 1].t < 14) on[i].t = on[i - 1].t + 14;
  }
  const place = (c) => {
    const ln = lanes[c.li];
    const half = ln.len / 2;
    const p = -half + c.t;
    if (ln.axis === 'x') { c.x = ln.dir > 0 ? p : -p; c.z = ln.z; c.ry = ln.dir > 0 ? Math.PI / 2 : -Math.PI / 2; c.fx = ln.dir; c.fz = 0; }
    else { c.x = ln.x; c.z = ln.dir > 0 ? p : -p; c.ry = ln.dir > 0 ? 0 : Math.PI; c.fx = 0; c.fz = ln.dir; }
  };
  cars.forEach(place);

  // Parking: marked bays along the kerb of every east-west road. Never at a junction or in front of a door.
  // Some bays hold a parked car (solid), the rest stay empty.
  const bays = [];
  for (const rw of city.roadsEW) for (const sgn of [-1, 1]) {
    for (let x = -city.bx + 14; x < city.bx - 14; x += 6.4) {
      if (city.roadsNS.some((r) => Math.abs(x - r.x) < r.half + 7)) continue;
      const z = rw.z + sgn * (rw.half - 0.9);
      if (blockedAt(x, z) || Object.values(city.doors).some((d) => Math.hypot(x - d.x, z - d.z) < 7)) continue;
      bays.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, ry: sgn < 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
  }
  const parked = [];
  {
    const order = bays.map((_, i) => i).sort(() => rc() - 0.5);
    for (const i of order.slice(0, Math.min(30, Math.floor(bays.length * 0.35)))) parked.push({ ...bays[i], color: Math.floor(rc() * CAR_COLORS) });
  }

  // Is this spot inside a car (moving or parked)? Used to stop people walking through them.
  const inBox = (c, x, z, pad) => {
    const dx = x - c.x, dz = z - c.z;
    const along = dx * c.fx + dz * c.fz;
    const lat = Math.abs(dx * -c.fz + dz * c.fx);
    return Math.abs(along) <= HALF_LEN + pad && lat <= HALF_WID + pad;
  };
  const blocked = (x, z, pad = PARK_PAD) => {
    for (const c of cars) if (c.on && Math.abs(c.x - x) < 5 && Math.abs(c.z - z) < 5 && inBox(c, x, z, pad)) return true;
    for (const k of parked) if (Math.abs(k.x - x) < 3 && Math.abs(k.z - z) < 3) {
      // parked cars run along x
      if (Math.abs(x - k.x) <= HALF_LEN + pad && Math.abs(z - k.z) <= HALF_WID + pad) return true;
    }
    return false;
  };

  // Is this car on an east-west road surface (so it is crossing it, not waiting to)?
  const inBand = (c) => city.roadsEW.some((rw) => Math.abs(c.z - rw.z) < rw.half + 1);

  // How many cars are out. Cars leave at the edge of the map and enter at the start of their lane, so the roads fill and empty smoothly.
  let level = 0.7;
  const setLevel = (l) => { level = l <= 0 ? 0 : Math.max(0.2, Math.min(1, l)); };
  const target = () => Math.round(cars.length * level);

  // Advance every car. people = [{ id, x, z }]. Returns the hits: [{ id, speed }].
  function step(dt, people, ph, drivers) {
    const watch = drivers && drivers.length ? people.concat(drivers) : people; // cars brake for drivers too, but only walkers get hit
    const hits = [];
    let active = cars.reduce((n, c) => n + (c.on ? 1 : 0), 0);
    const want = target();
    if (want === 0) for (const c of cars) c.on = false; // a test switch: an empty road
    for (const c of cars) {
      if (!c.on) {
        if (active < want && !cars.some((o) => o.on && o.li === c.li && o.t < 16)) { c.on = true; c.t = 0; c.v = c.vmax * 0.6; active++; place(c); }
        continue;
      }
      const ln = lanes[c.li];
      let gap = Infinity;
      const look = 6 + (c.v * c.v) / (2 * BRAKE) + 6;
      if (opts.brake !== false) for (const pe of watch) {
        const dx = pe.x - c.x, dz = pe.z - c.z;
        if (Math.abs(dx) > look + 3 || Math.abs(dz) > look + 3) continue;
        const along = dx * c.fx + dz * c.fz;
        const lat = Math.abs(dx * -c.fz + dz * c.fx);
        if (along > 0 && along < look && lat < HALF_WID + 1.0) gap = Math.min(gap, along - HALF_LEN);
      }
      for (const o of cars) {
        if (o === c || !o.on) continue;
        const dx = o.x - c.x, dz = o.z - c.z;
        if (Math.abs(dx) > look + 30 || Math.abs(dz) > look + 30) continue;
        const along = dx * c.fx + dz * c.fz;
        const lat = Math.abs(dx * -c.fz + dz * c.fx);
        const sameLane = o.li === c.li;
        if (sameLane) { // measured along the lane, so a car about to wrap round sees the cars at the start
          const diff = (o.t - c.t + ln.len) % ln.len;
          if (diff > 0 && diff < look) gap = Math.min(gap, diff - HALF_LEN * 2);
          continue;
        }
        let cross = false;
        if (!sameLane && ln.axis === 'z' && lanes[o.li].axis === 'x' && !inBand(c)) {
          // A side street waits for the main road: if a car is about to pass the junction, hold at the kerb.
          const rw = city.roadsEW.find((r) => Math.abs(o.z - r.z) < r.half);
          if (rw) {
            const edge = (rw.z - c.z) * c.fz - rw.half - 1;
            const appr = (c.x - o.x) * lanes[o.li].dir;
            if (o.v > 1 && edge > 0 && edge < look && appr > -3 && appr < 10 + o.v * 1.5) gap = Math.min(gap, edge - HALF_LEN + 1);
          }
          continue;
        }
        if (!sameLane && ln.axis === 'x' && lanes[o.li].axis === 'z') cross = inBand(o); // main road waits for a car already crossing it
        if (along > 0 && along < look && ((sameLane && lat < 1.5) || (cross && lat < HALF_WID + 2.2))) gap = Math.min(gap, along - HALF_LEN * 2);
      }
      // Traffic lights: stop at the line on red (and on yellow if there is room to stop).
      if (ph !== undefined) {
        const ln2 = lanes[c.li];
        const axis = ln2.axis;
        const j = nextJunction(city, axis, axis === 'x' ? c.x : c.z, ln2.dir);
        if (j && j.dist > j.half) {
          const st = stateOf(axis, ph);
          const stopGap = j.dist - j.half - 1.2 - HALF_LEN;
          if (st === 'red' || (st === 'yellow' && (c.v * c.v) / (2 * BRAKE) <= stopGap + 0.5)) gap = Math.min(gap, stopGap + 2.5); // +2.5 because the speed rule below keeps 2.5 m spare
        }
      }
      let target = c.vmax;
      if (gap < Infinity) target = Math.min(target, Math.sqrt(Math.max(0, 2 * BRAKE * (gap - 2.5))));
      if (c.v > target) {
        const need = target < c.v && gap < Infinity ? (c.v * c.v) / (2 * Math.max(0.1, gap - 1)) : BRAKE;
        c.v = Math.max(target, c.v - Math.min(PANIC, Math.max(BRAKE, need)) * dt);
      } else c.v = Math.min(target, c.v + ACCEL * dt);
      c.t += c.v * dt;
      if (c.t > ln.len) {
        // wrapping to the start: wait if the start of the lane is occupied
        if (active > want) { c.on = false; c.v = 0; c.t = 0; active--; continue; } // drive off the edge of the map
        if (cars.some((o) => o !== c && o.on && o.li === c.li && o.t < c.t - ln.len + 9)) { c.t = ln.len; c.v = 0; } else c.t -= ln.len;
      }
      place(c);
      if (c.v > 0.3) {
        for (const pe of people) if (inBox(c, pe.x, pe.z, 0.25)) hits.push({ id: pe.id, speed: c.v, car: c.id });
      }
      if (hits.length) {
        // a car that hit someone stops dead
        if (hits.some((h) => h.car === c.id)) c.v = 0;
      }
    }
    return hits;
  }

  // Compact view for the browsers: [x, z, ry, colour] per car, rounded to keep messages small.
  const view = () => cars.map((c) => !c.on ? [9999, 9999, 0, c.cop ? 100 : c.color] : [Math.round(c.x * 10) / 10, Math.round(c.z * 10) / 10, Math.round(c.ry * 100) / 100, c.color]);
  // Is a car in the way of something driving along (x, z) facing ry (a bus on its ride, say)? Returns the free gap in metres, or null.
  // Cars going the same way, or crossing in front, count; cars passing the other way in their own lane do not.
  function carAhead(x, z, ry, range, halfLen = HALF_LEN) {
    const fx = Math.sin(ry), fz = Math.cos(ry);
    let best = null, who = null;
    for (const c of cars) {
      if (!c.on) continue;
      const dx = c.x - x, dz = c.z - z;
      if (Math.abs(dx) > range + 6 || Math.abs(dz) > range + 6) continue;
      const along = dx * fx + dz * fz;
      const lat = Math.abs(dx * -fz + dz * fx);
      const dot = c.fx * fx + c.fz * fz;
      const near = dot > 0.5 ? lat < 2.4 : dot < -0.5 ? lat < 0.9 : lat < HALF_LEN + 1.2 && Math.abs(along) < HALF_LEN + halfLen + 3;
      if (!near || along <= 0 || along > range + HALF_LEN + halfLen) continue;
      const gap = along - HALF_LEN - halfLen;
      if (best === null || gap < best) { best = gap; who = c; }
    }
    carAhead.last = who;
    return best;
  }
  const copCars = () => cars.filter((c) => c.cop && c.on);
  return { cars, parked, bays, lanes, step, blocked, view, setLevel, carAhead, copCars, HIT_MIN };
}
