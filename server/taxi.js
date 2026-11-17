// Adulthood: the Taxi Driver career. Rules only (no network, no database).
// Go on duty in your own car, accept a passenger request, drive to the pickup, then to the drop-off.
// The server picks the places, counts the time and checks where you are.

export const TAXI_MAX = 10;
export const taxiLevel = (fares) => Math.min(TAXI_MAX, 1 + Math.floor(fares / 6));   // a new taxi level every 6 fares
export const taxiNext = (fares) => (taxiLevel(fares) >= TAXI_MAX ? null : taxiLevel(fares) * 6);
export const fareMult = (lvl) => 1 + 0.05 * (lvl - 1);                                  // +5% per taxi level
export const TAXI_REACH = 7;           // metres from the point that counts as "there"
export const REQUEST_SECONDS = 20;     // time to accept a request
export const PICKUP_SECONDS = 90;      // time to reach the passenger

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const NAMES = ['Tunde', 'Amaka', 'Ibrahim', 'Ngozi', 'Segun', 'Fatima', 'Emeka', 'Bisi', 'Chinedu', 'Zainab', 'Kelechi', 'Yemi'];

export function makeRequest(layout, pos, rnd) {
  const points = [
    ...Object.entries(layout.doors || {}).filter(([id]) => id !== 'depot').map(([id, d]) => ({ x: d.x, z: d.z, venue: id })),
    ...(layout.plots || []).map((p) => ({ x: p.door.x, z: p.door.z, plot: p.id })),
  ];
  let pick = null, drop = null;
  for (let tries = 0; tries < 120 && !(pick && drop); tries++) {
    const a = points[Math.floor(rnd() * points.length)];
    if (!pick) { const d = dist(pos, a); if (d >= 50 && d <= 190) pick = a; continue; }
    const dd = dist(pick, a);
    if (a !== pick && dd >= 110 && dd <= 330) drop = a;
  }
  if (!pick || !drop) return null;
  const ride = Math.round(dist(pick, drop));
  return { pick, drop, ride, name: NAMES[Math.floor(rnd() * NAMES.length)], pickLimit: PICKUP_SECONDS, dropLimit: Math.round(ride / 6 + 30), base: 1200 + ride * 11 };
}
export const baseFare = (req, lvl) => Math.round((req.base * fareMult(lvl)) / 100) * 100;

// Stars from how much of the drop-off time was left: 5 with half or more left, 4 with a fifth, otherwise 3.
export const stars = (left, total) => (left >= total * 0.5 ? 5 : left >= total * 0.2 ? 4 : 3);
export const tipFor = (fare, st) => (st === 5 ? Math.round((fare * 0.2) / 100) * 100 : 0);
