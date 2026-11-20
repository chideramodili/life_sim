// Adulthood: the well-known landmarks of the three real cities. Simple hand-built shapes (no downloads), each with a name that
// shows from far away. They are scenery: you can walk through them. Positions are real latitude/longitude turned into metres
// from the middle of each city's map (the same centre the map tiles were cut around).
import * as THREE from 'three';

export const CENTERS = { enugu: [6.4650, 7.4950], abuja: [9.0500, 7.4700], lagos: [6.4700, 3.4200] };
const toXZ = (city, lat, lon) => { const [clat, clon] = CENTERS[city]; return { x: (lon - clon) * 111320 * Math.cos((clat * Math.PI) / 180), z: -(lat - clat) * 110540 }; };

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
const box = (w, h, d, c, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y + h / 2, z); return m; };
const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 20) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), M(c)); m.position.set(x, y + h / 2, z); return m; };
const dome = (r, c, x, y, z, k = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M(c, { metalness: 0.2, roughness: 0.5 })); m.position.set(x, y, z); m.scale.y = k; return m; };
const cone = (r, h, c, x, y, z, seg = 14) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), M(c)); m.position.set(x, y + h / 2, z); return m; };
function lump(r, c, squash = 1, seed = 1, rough = 0.18) {   // a bumpy rock or hill
  const g = new THREE.IcosahedronGeometry(r, 3); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + rough * (Math.sin(x * 0.13 + seed) * Math.cos(z * 0.11 + seed * 2) + Math.sin(y * 0.17 + seed * 3) * 0.6); p.setXYZ(i, x * n, y * n * squash, z * n); }
  g.computeVertexNormals(); const m = new THREE.Mesh(g, M(c, { flatShading: true })); return m;
}
function label(text, color = '#ffd166') {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 160; const g = cv.getContext('2d');
  g.fillStyle = 'rgba(15,18,25,0.82)'; g.beginPath(); g.roundRect(8, 8, 1008, 144, 40); g.fill();
  g.fillStyle = color; g.font = 'bold 76px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 84, 980);
  const t = new THREE.CanvasTexture(cv); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.renderOrder = 10; return s;
}
const rot = (g, deg) => { g.rotation.y = (deg * Math.PI) / 180; return g; };

// Each builder returns a group centred on (0,0,0) at ground level. `h` is where the name floats.
const BUILD = {
  milliken: () => { const g = new THREE.Group(); const hill = lump(120, '#5f8a3a', 0.5, 2); hill.position.y = 20; g.add(hill); g.add(cyl(1.2, 2, 40, '#c9c9d2', 0, 85, 0)); for (let i = 0; i < 30; i++) { const a = i * 2.4, r = 30 + (i * 37) % 80; g.add(cone(3.5, 9, '#2f6b2a', Math.cos(a) * r, 8 + (i % 4) * 4, Math.sin(a) * r)); } return { g, h: 150 }; },
  nikelake: () => { const g = new THREE.Group(); const isl = lump(22, '#6a9a3a', 0.25, 4); isl.position.set(-30, 1, 10); g.add(isl); const hotel = new THREE.Group(); hotel.add(box(40, 14, 16, '#f2ead8', 0, 0, 0), box(44, 1.2, 20, '#a23c20', 0, 14, 0), box(14, 22, 14, '#e8dfc8', 24, 0, 0)); hotel.position.set(190, 0, 0); g.add(hotel); for (let i = 0; i < 12; i++) g.add(cone(4, 12, '#2f6b2a', 150 + (i % 4) * 9, 0, -40 + i * 7)); return { g, h: 50 }; },
  ngwo: () => { const g = new THREE.Group(); for (let i = 0; i < 90; i++) { const a = i * 2.39996, r = 8 + Math.sqrt(i) * 14; const h = 10 + ((i * 7) % 9); g.add(cone(3 + (i % 3) * 0.6, h, '#1f5a2e', Math.cos(a) * r, 0, Math.sin(a) * r, 8), cyl(0.5, 0.6, 3, '#5b3b24', Math.cos(a) * r, 0, Math.sin(a) * r, 6)); } const rock = lump(18, '#8a7f72', 0.7, 6); rock.position.set(0, 7, 70); g.add(rock); const mouth = new THREE.Mesh(new THREE.CircleGeometry(5, 20, 0, Math.PI), M('#0a0a0e')); mouth.position.set(0, 0.2, 86); g.add(mouth); return { g, h: 40 }; },
  awhum: () => { const g = new THREE.Group(); const cliff = lump(40, '#6e6256', 1.2, 8, 0.12); cliff.scale.set(1.6, 1.2, 0.5); cliff.position.set(0, 22, -8); g.add(cliff); const fall = new THREE.Mesh(new THREE.PlaneGeometry(9, 36), new THREE.MeshBasicMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide })); fall.position.set(0, 20, 8.5); g.add(fall); const pool = new THREE.Mesh(new THREE.CircleGeometry(20, 28), M('#5ab6e0', { metalness: 0.3, roughness: 0.3 })); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.4, 24); g.add(pool); for (let i = 0; i < 14; i++) g.add(cone(3, 9, '#2f7a30', -40 + i * 6, 0, 40 + (i % 3) * 6)); return { g, h: 55 }; },
  polo: () => { const g = new THREE.Group(); g.add(box(70, 14, 36, '#e9dcc4'), box(74, 1.5, 40, '#a23c20', 0, 14, 0), box(18, 8, 4, '#ffcf4a', 0, 14, 18), box(60, 2, 10, '#3a3a40', 0, 0, 24)); for (let i = -3; i <= 3; i++) g.add(box(2, 6, 2, '#ffffff', i * 9, 0, 21)); return { g, h: 30 }; },
  mosque: () => { const g = new THREE.Group(); g.add(box(70, 10, 70, '#f4f1e8'), box(52, 12, 52, '#ffffff', 0, 10, 0)); g.add(dome(22, '#d9b54a', 0, 22, 0, 1.1)); for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.add(cyl(1.8, 2.4, 58, '#ffffff', sx * 42, 0, sz * 42, 14)); g.add(cone(2.6, 9, '#d9b54a', sx * 42, 58, sz * 42, 14)); g.add(dome(7, '#d9b54a', sx * 26, 10, sz * 26, 1)); } return { g, h: 95 }; },
  christian: () => { const g = new THREE.Group(); g.add(box(80, 18, 50, '#f1ebe0'), box(50, 14, 34, '#cfe3f2', 0, 18, 0)); g.add(dome(18, '#9ec9e8', 0, 32, 0, 0.9)); g.add(box(2.2, 26, 2.2, '#ffffff', 0, 40, 0), box(12, 2.2, 2.2, '#ffffff', 0, 58, 0)); g.add(box(36, 2, 10, '#c6bca8', 0, 0, 30)); return { g, h: 85 }; },
  aso: () => { const g = new THREE.Group(); const r = lump(150, '#8c7658', 0.9, 11, 0.22); r.position.y = 60; g.add(r); const r2 = lump(90, '#7d6a50', 0.8, 5, 0.2); r2.position.set(120, 30, 40); g.add(r2); for (let i = 0; i < 24; i++) { const a = i * 0.9; g.add(cone(6, 14, '#3f7a35', Math.cos(a) * 160, 0, Math.sin(a) * 140)); } return { g, h: 230 }; },
  citygate: () => { const g = new THREE.Group(); g.add(box(8, 30, 10, '#f1efe8', -26, 0, 0), box(8, 30, 10, '#f1efe8', 26, 0, 0)); const arch = new THREE.Mesh(new THREE.TorusGeometry(26, 3.4, 10, 28, Math.PI), M('#2f9a4a')); arch.position.set(0, 30, 0); g.add(arch); g.add(box(60, 3, 12, '#f1efe8', 0, 26, 0)); return { g, h: 70 }; },
  jabi: () => { const g = new THREE.Group(); g.add(box(5, 0.6, 120, '#9a7b52', 0, 0.35, 0), box(14, 5, 10, '#e9dcc4', 0, 0, -64), box(16, 1, 12, '#a23c20', 0, 5, -64)); for (let i = 0; i < 8; i++) g.add(cyl(0.3, 0.3, 4, '#444', (i % 2 ? 3 : -3), 0, -150 + i * 12, 6)); return { g, h: 40 }; },
  // Cable-stayed bridge: two tall towers with a fan of cables each side. The deck itself is the real road drawn from the map.
  linkbridge: () => { const g = new THREE.Group(); const cable = new THREE.MeshStandardMaterial({ color: '#f1f1f6', roughness: 0.6 });
    for (const s of [-1, 1]) { const zc = s * 130;
      g.add(box(3.4, 78, 3.4, '#f4f4f8', -5, 0, zc), box(3.4, 78, 3.4, '#f4f4f8', 5, 0, zc), box(13, 3, 3.4, '#f4f4f8', 0, 52, zc), box(13, 3, 3.4, '#f4f4f8', 0, 74, zc));
      for (let k = 1; k <= 9; k++) for (const sd of [-1, 1]) for (const sx of [-1, 1]) { const dz = sd * k * 12, len = Math.hypot(dz, 70 - k * 3); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, len, 4), cable); c.position.set(sx * 5, (70 + 2) / 2 + 4, zc + dz / 2); c.rotation.x = Math.atan2(dz, 66) * -1; g.add(c); } }
    return { g, h: 130, always: false }; },
  // The whole 9.5 km bridge: a row of blue arches over the real road (it follows the real route: path), so it can be seen from far away.
  thirdmainland: (l) => { const g = new THREE.Group(); const blue = '#2f7bd9'; let since = 9999;
    for (let i = 1; i < l.path.length; i++) {
      const [ax, az] = l.path[i - 1], [bx, bz] = l.path[i], len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, ry = Math.atan2(ux, uz);
      for (let t = 0; t < len; t += 50) {
        since += 50; const x = ax + ux * t - l.x, z = az + uz * t - l.z;
        if (since >= 400) { since = 0; const a = new THREE.Group(); a.add(box(2.4, 18, 2.4, blue, -11, 0, 0), box(2.4, 18, 2.4, blue, 11, 0, 0), box(24, 2.4, 2.4, blue, 0, 18, 0)); a.position.set(x, 0, z); a.rotation.y = ry; g.add(a); }
        else if (since % 100 === 0) { const a = new THREE.Group(); a.add(box(0.5, 9, 0.5, '#d8d8dc', -12.5, 0, 0), box(0.5, 9, 0.5, '#d8d8dc', 12.5, 0, 0)); a.position.set(x, 0, z); a.rotation.y = ry; g.add(a); }
      }
    }
    return { g, h: 60, always: true }; },
  theatre: () => { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(44, 26, 22, 36), M('#d8d4c8')); body.position.y = 30; g.add(body); const top = dome(38, '#e9e5da', 0, 41, 0, 0.55); g.add(top); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.add(cyl(1.4, 1.4, 20, '#bdb8aa', Math.cos(a) * 34, 0, Math.sin(a) * 34, 8)); } g.add(box(36, 8, 14, '#c9c4b6', 0, 0, 50)); return { g, h: 80 }; },
  lcc: () => { const g = new THREE.Group(); for (let i = 0; i < 80; i++) { const a = i * 2.39996, r = 10 + Math.sqrt(i) * 18; g.add(cone(5, 14, '#2f7a30', Math.cos(a) * r, 0, Math.sin(a) * r, 8), cyl(0.6, 0.7, 4, '#5b3b24', Math.cos(a) * r, 0, Math.sin(a) * r, 6)); } g.add(box(3, 0.5, 120, '#9a7b52', 0, 7, 0)); for (let i = 0; i < 9; i++) g.add(cyl(0.3, 0.3, 7, '#6b4a2a', 1.4, 0, -55 + i * 14, 6)); return { g, h: 45 }; },
  nikeart: () => { const g = new THREE.Group(); const cols = ['#e8553a', '#f2b632', '#3a8fe0', '#5cb85c', '#a64ac9']; for (let i = 0; i < 5; i++) g.add(box(16, 8 + i * 3, 22, cols[i], -32 + i * 16, 0, 0)); for (let i = 0; i < 5; i++) g.add(box(10, 3, 1, '#ffffff', -32 + i * 16, 8 + i * 3 + 0.5, 11.3)); g.scale.setScalar(1.6); return { g, h: 70 }; },
};

// name, builder, latitude, longitude (rotation in degrees where it matters). The positions of the three Enugu places that are not
// named in the map data (Milliken Hill, Awhum Waterfall) are best estimates.
export const LANDMARKS = {
  enugu: [
    { id: 'milliken', n: 'Milliken Hill', lat: 6.4380, lon: 7.5010 },
    { id: 'nikelake', n: 'Nike Lake Resort', lat: 6.5085, lon: 7.5095 },
    { id: 'ngwo', n: 'Ngwo Pine Forest and Cave', lat: 6.4297, lon: 7.4433 },
    { id: 'awhum', n: 'Awhum Waterfall', lat: 6.3990, lon: 7.4290 },
    { id: 'polo', n: 'Polo Park Mall', lat: 6.4613, lon: 7.4966 },
  ],
  abuja: [
    { id: 'mosque', n: 'Abuja National Mosque', lat: 9.0599, lon: 7.4896 },
    { id: 'christian', n: 'National Christian Centre', lat: 9.0510, lon: 7.4966 },
    { id: 'aso', n: 'Aso Rock', lat: 9.0833, lon: 7.5341 },
    { id: 'citygate', n: 'Abuja City Gate', lat: 9.0358, lon: 7.4486, rot: 20 },
    { id: 'jabi', n: 'Jabi Lake', lat: 9.0715, lon: 7.4245 },
  ],
  lagos: [
    { id: 'linkbridge', n: 'Lekki-Ikoyi Link Bridge', x: 3905, z: 2383, rot: 77.3 },
    { id: 'thirdmainland', n: 'Third Mainland Bridge', x: -2258, z: -2705, path: [[-2856, 748], [-3019, 550], [-3159, 264], [-3235, -4], [-3275, -329], [-3266, -587], [-3208, -886], [-3087, -1203], [-2919, -1509], [-2531, -2176], [-2403, -2393], [-2258, -2705], [-1744, -4111], [-1675, -4362], [-1627, -4610], [-1599, -4893], [-1599, -5238], [-1628, -5512], [-1685, -5792], [-2112, -7145], [-2182, -7470], [-2214, -7721], [-2274, -8000], [-2338, -8191]] },
    { id: 'theatre', n: 'National Theatre', lat: 6.4747, lon: 3.3686 },
    { id: 'lcc', n: 'Lekki Conservation Centre', lat: 6.4432, lon: 3.5360 },
    { id: 'nikeart', n: 'Nike Art Gallery', lat: 6.4314, lon: 3.4818 },
  ],
};
export const landmarkList = (city) => (LANDMARKS[city] || []).map((l) => ({ ...l, ...(l.x !== undefined ? { x: l.x, z: l.z } : toXZ(city, l.lat, l.lon)) }));

// All of a city's landmarks as one group. update(x, z) shows the names of the ones within sight of the camera.
export function createLandmarks(city) {
  const group = new THREE.Group(); const items = [];
  for (const l of landmarkList(city)) {
    const b = BUILD[l.id]; if (!b) continue;
    const { g, h, always } = b(l); g.position.set(l.x, 0, l.z); if (l.rot) rot(g, l.rot);
    const tag = label(l.n); tag.scale.set(60, 9.4, 1); tag.position.set(l.x, h + 8, l.z);
    group.add(g, tag); items.push({ l, g, tag, always });
  }
  return {
    group, items,
    update(x, z) { for (const it of items) { const d = Math.hypot(it.l.x - x, it.l.z - z); it.g.visible = it.always || d < 1400; it.tag.visible = d < 2500; } },
    dispose() { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); },
  };
}
