// Adulthood: how each job looks while a shift runs. The server walks the worker between a few stops (so everyone sees the same thing)
// and tells the other players which style to draw. Stops are [x, z, facing, seconds to stay]; facing is atan2(dx, dz) (0 = towards +z, PI = towards -z).
// Jobs not listed here keep the old busy pose where they stand.
const PI = Math.PI;
const behind = (x, z, f = PI) => [[x, z, f, 99]];   // stand behind a counter and write
const PLANS = {
  mechanic_h: { style: 'wash', stops: [[-3.2, -4.4, -PI / 2, 2.6], [-3.2, -1.6, -PI / 2, 2.6], [1.2, -1.6, PI / 2, 2.6], [1.2, -4.4, PI / 2, 2.6]] },
  cleaner:    { style: 'mop',  stops: [[-3.5, 1, 0, 0.1], [3.5, 1, 0, 0.1], [3.5, -5.5, 0, 0.1], [-3.5, -5.5, 0, 0.1]], walk: true },
  gym_desk:   { style: 'desk', stops: behind(6.5, 6.4) },
  cashier:    { style: 'desk', stops: behind(-6.5, 6.4) },
  stall:      { style: 'desk', stops: behind(-6.5, 6.4) },
  shop:       { style: 'desk', stops: behind(6, 6.4) },
  shop_trial: { style: 'desk', stops: behind(6, 6.4) },
  attendant:  { style: 'desk', stops: behind(4, -7.8, 0) },
  clinic:     { style: 'desk', stops: behind(4, -7.8, 0) },
  tutor:      { style: 'desk', stops: behind(7, 6.4) },
  guard:      { style: 'guard', stops: [[5, 7, PI, 99]] },
  shelver:    { style: 'shelve', stops: [[-7, -8.2, PI, 2.4], [-3.5, -8.2, PI, 2.4], [0, -8.2, PI, 2.4], [3.5, -8.2, PI, 2.4], [7, -8.2, PI, 2.4]] },
  rider:      { style: 'carry', stops: [[-4, 1.5, PI / 2, 1.5], [4, 1.5, PI / 2, 1.5], [4, 4, PI, 1.2], [-4, 4, -PI / 2, 1.2]], walk: true },
  runner:     { style: 'carry', stops: [[-3, 1, PI / 2, 1.2], [3, 1, PI / 2, 1.2], [3, -3, 0, 1.2], [-3, -3, -PI / 2, 1.2]], walk: true },
  seller:     { style: 'sell', stops: behind(-6.5, 6.4) },
  trainer:    { style: 'coach', stops: [[-3.5, -0.5, -PI / 2, 3.2], [1, -1, 0, 3.2], [3.5, 2.5, PI, 3.2], [-1, 3, 0, 3.2]], walk: true },
  mc:         { style: 'mic', stops: [[3, -8, PI, 99]] },
  dev_jr:     { style: 'type', stops: [] },
  dev_sr:     { style: 'type', stops: [] },
  waiter:     { style: 'tray', stops: [[-5.5, 1.5, -PI / 2, 1.2], [-1, -1, PI / 2, 1.8], [3, 0, PI / 2, 1.8], [4, -4, PI / 2, 1.8]] },
};
export const planFor = (jobId) => PLANS[jobId] || null;
export const STYLE_IDS = ['wash', 'mop', 'desk', 'guard', 'shelve', 'tray', 'carry', 'sell', 'coach', 'mic', 'type'];

// Step the plan for a worker: walk to the next stop, stay there a while, then move on. Returns nothing; sets p.tx/p.tz/p.face.
export function stepWork(p, now) {
  const sh = p.shift;
  if (!sh || !sh.plan) return;
  const stops = sh.plan.stops;
  if (!stops.length) return;   // works where they stand (remote jobs at home)
  const st = stops[sh.i % stops.length];
  const d = Math.hypot(st[0] - p.x, st[1] - p.z);
  if (!sh.at) {
    if (!sh.walkSince) sh.walkSince = now;
    if (d > 0.3 && now - sh.walkSince < 9000) { p.tx = st[0]; p.tz = st[1]; return; }   // still walking (or give up after 9 s if something is in the way)
    sh.at = now; p.tx = p.x; p.tz = p.z;
  }
  p.face = st[2];
  if (now - sh.at >= st[3] * 1000 && stops.length > 1) { sh.i = (sh.i + 1) % stops.length; sh.at = 0; sh.walkSince = 0; }
}
