// Adulthood: the Express trains you can see running on the viaduct. They are only scenery: where a train is depends on the clock,
// so everybody sees them in the same place. The model is the high-speed train (one car, 20 m long, front towards +z).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The lines: one trunk over the Boulevard and a branch to each platform station. Same layout as the viaduct in street.js.
export function viaductSegs(city) {
  const nsX = city.roadsNS.map((r) => r.x);
  const stations = city.stations || [];
  const nearestRoad = (st) => nsX.reduce((b, x) => (Math.abs(x - st.x) < Math.abs(b - st.x) ? x : b), nsX[0]);
  const segs = [];
  const trunkMin = Math.min(...stations.map(nearestRoad));
  const term = stations.find((st) => st.id === 'terminal');
  const trunkMax = term ? term.x : Math.max(...nsX);
  segs.push([trunkMin, 0, trunkMax, 0]);
  for (const st of stations) {
    if (st.id === 'terminal') continue;
    const rx = nearestRoad(st);
    segs.push([rx, 0, rx, st.z]);
  }
  return segs;
}

const CARS = 3, CAR_LEN = 20, SPEED = 26, DWELL = 8; // seconds waiting at each end

export function createViaductTrains(root, segs, deckY) {
  const runners = [];
  let ready = false;
  new GLTFLoader().loadAsync('/models/train.glb').then((gltf) => {
    for (const seg of segs) {
      const [x0, z0, x1, z1] = seg;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const consist = new THREE.Group();
      for (let i = 0; i < CARS; i++) {
        const car = gltf.scene.clone(true);
        car.position.z = (1 - i) * CAR_LEN; // three cars in a row, centred on the middle of the train (front is +z)
        consist.add(car);
      }
      consist.visible = false;
      root.add(consist);
      runners.push({ seg, len, consist, phase: (x0 * 7 + z1 * 3) % 1 });
    }
    ready = true;
  }).catch(() => { /* no train model: no trains, nothing else breaks */ });

  // Time comes from the clock, so every browser agrees: a triangle wave with a wait at each end.
  return {
    update(nowMs) {
      if (!ready) return;
      const t = nowMs / 1000;
      for (const r of runners) {
        const N = CARS * CAR_LEN;
        const run = Math.max(1, r.len - N);           // how far the middle of the train can travel
        const cycle = 2 * (run / SPEED + DWELL);
        const k = ((t + r.phase * cycle) % cycle + cycle) % cycle;
        let c, dir;                                   // c: how far the middle has gone from its first position
        if (k < run / SPEED) { c = k * SPEED; dir = 1; }
        else if (k < run / SPEED + DWELL) { c = run; dir = 1; }
        else if (k < 2 * run / SPEED + DWELL) { c = run - (k - run / SPEED - DWELL) * SPEED; dir = -1; }
        else { c = 0; dir = -1; }
        const [x0, z0, x1, z1] = r.seg;
        const ux = (x1 - x0) / r.len, uz = (z1 - z0) / r.len;
        const mid = N / 2 + c;                        // metres from the start of the line
        r.consist.visible = true;
        r.consist.rotation.y = Math.atan2(ux * dir, uz * dir);   // the model's front is +z
        r.consist.position.set(x0 + ux * mid, deckY + 0.5, z0 + uz * mid);
      }
    },
  };
}