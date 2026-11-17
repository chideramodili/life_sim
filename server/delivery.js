// Adulthood: the Delivery Driver career. Rules only (no network, no database).
// You take a job at the Delivery Depot, drive to the pickup point, collect the package, drive it to the drop-off and get paid.
// The server picks the places, counts the time and checks where you are, so the browser cannot cheat.

export const COURIER_MAX = 10;
export const courierLevel = (deliveries) => Math.min(COURIER_MAX, 1 + Math.floor(deliveries / 5));   // a new courier level every 5 deliveries
export const levelPay = (lvl) => 1 + 0.05 * (lvl - 1);                                                // +5% pay per courier level
export const NEXT_AT = (deliveries) => (courierLevel(deliveries) >= COURIER_MAX ? null : courierLevel(deliveries) * 5);
export const REACH = 6;            // metres from the pickup or drop-off point that counts as "there"
export const EARLY_BONUS = 0.3;    // up to +30% for arriving early

export const KINDS = [
  { id: 'parcel', title: 'Parcel', icon: '📦', mult: 1, time: 1, car: false, text: 'A normal parcel. Bike or car.' },
  { id: 'express', title: 'Express parcel', icon: '⚡', mult: 1.6, time: 0.65, car: false, text: 'Pays more, but the clock is tight.' },
  { id: 'heavy', title: 'Heavy delivery', icon: '🚚', mult: 1.4, time: 1.1, car: true, text: 'Big load, needs a car.' },
];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// layout: the city layout; origin: the depot door; rnd: () => 0..1; label(point) gives a name.
export function makeOffers(layout, origin, lvl, rnd, hasCar) {
  const points = [
    ...Object.entries(layout.doors || {}).filter(([id]) => id !== 'depot').map(([id, d]) => ({ x: d.x, z: d.z, venue: id })),
    ...(layout.plots || []).map((p) => ({ x: p.door.x, z: p.door.z, plot: p.id })),
  ];
  const offers = [];
  for (const kind of KINDS) {
    if (kind.car && !hasCar) continue;
    let pick = null, drop = null;
    for (let tries = 0; tries < 80 && !(pick && drop); tries++) {
      const a = points[Math.floor(rnd() * points.length)];
      const da = dist(origin, a);
      if (!pick) { if (da >= 50 && da <= 230) pick = a; continue; }
      const dd = dist(pick, a);
      if (a !== pick && dd >= 90 && dd <= 300 && dist(origin, a) >= 40) drop = a;
    }
    if (!pick || !drop) continue;
    const route = dist(origin, pick) + dist(pick, drop);
    const limit = Math.round((route / 6 + 35) * kind.time);
    const pay = Math.round(((1500 + route * 14) * kind.mult * levelPay(lvl)) / 100) * 100;
    offers.push({ kind: kind.id, pick, drop, route: Math.round(route), limit, pay });
  }
  return offers;
}

// Pay for a finished job: the offer's pay plus up to 30% for being early.
export function finalPay(job, now) {
  const left = Math.max(0, job.endsAt - now), total = job.limit * 1000;
  return job.pay + Math.round((job.pay * EARLY_BONUS * Math.min(1, left / total)) / 100) * 100;
}
