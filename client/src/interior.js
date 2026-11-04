// Adulthood: building interiors. Real rooms with walls, windows, floors, props that suit each place, and staff and customers.
// Everything is drawn from code (no model files) so it works today. When real models arrive, each prop can be swapped for one.
// The people here are scenery. They walk and stand around so places feel alive. They are not players and cannot be talked to.
import * as THREE from 'three';
import { loadCar, carClone } from './vehicles.js';
import { whenNpcReady, upgradeToNpc, moveNpc } from './npc.js';

const rnd = (seed) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const hash = (str) => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const shade = (hex, f) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
};

// Floor looks.
const FLOORS = {
  wood: (base) => canvasTex(256, 256, (g, w, h) => {
    const r = rnd(5);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = shade(base, 0.85 + r() * 0.3);
      g.fillRect(0, i * 32, w, 32);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, i * 32, w, 2);
      g.fillRect(r() * w, i * 32, 2, 32);
    }
  }, 5, 5),
  tile: (base) => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = shade(base, 0.9);
    g.fillRect(0, 0, w / 2, h / 2);
    g.fillRect(w / 2, h / 2, w / 2, h / 2);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  }, 8, 8),
  carpet: (base) => canvasTex(128, 128, (g, w, h) => {
    const r = rnd(9);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = shade(base, 0.85 + r() * 0.3);
      g.fillRect(r() * w, r() * h, 2, 2);
    }
  }, 6, 6),
  concrete: (base) => canvasTex(128, 128, (g, w, h) => {
    const r = rnd(2);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = shade(base, 0.8 + r() * 0.4);
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(0,0,0,0.2)';
    g.strokeRect(0, 0, w, h);
  }, 5, 5),
};

// What each place looks like: floor, wall color, and which props to put in it.
const THEMES = {
  plaza:     { floor: ['concrete', '#8f8a84'], wall: '#7d6a8f', props: 'plaza', crowd: 6 },
  gym:       { floor: ['tile', '#3a4448'], wall: '#2f5d62', props: 'gym', crowd: 5, staff: ['#ff6b4a'] },
  market:    { floor: ['concrete', '#a49682'], wall: '#8a6a45', props: 'market', crowd: 7, staff: ['#3ddc97', '#e0a030'] },
  jobs:      { floor: ['carpet', '#44506b'], wall: '#3b4a6b', props: 'jobs', crowd: 4, staff: ['#3a86ff'] },
  shop:      { floor: ['tile', '#cfc3c8'], wall: '#8a4a63', props: 'shop', crowd: 4, staff: ['#ff4d8d'] },
  library:   { floor: ['wood', '#8a6a4a'], wall: '#4d6648', props: 'library', crowd: 4, staff: ['#f4d35e'] },
  pharmacy:  { floor: ['tile', '#dfe6e8'], wall: '#3d7480', props: 'pharmacy', crowd: 3, staff: ['#ffffff'] },
  garage:    { floor: ['concrete', '#6a6a72'], wall: '#555560', props: 'garage', crowd: 2, staff: ['#ff9f1c'] },
  club:      { floor: ['carpet', '#2a1a40'], wall: '#241040', props: 'club', crowd: 9, staff: ['#c77dff'] },
  hotel:     { floor: ['wood', '#8a6a4a'], wall: '#5a3b2e', props: 'hotel', crowd: 4, staff: ['#ffb347', '#ffb347'] },
  eventcenter: { floor: ['carpet', '#2a3050'], wall: '#2b3a67', props: 'eventcenter', crowd: 9, staff: ['#7ae0ff'] },
  bank:      { floor: ['tile', '#cfc8b4'], wall: '#27493f', props: 'bank', crowd: 3, staff: ['#f4d35e', '#f4d35e'] },
  boutique:  { floor: ['wood', '#b79a82'], wall: '#6b4a78', props: 'boutique', crowd: 4, staff: ['#ff7eb6'] },
  homestore: { floor: ['wood', '#9a7a52'], wall: '#7a6540', props: 'homestore', crowd: 3, staff: ['#ff9f1c'] },
  police:    { floor: ['tile', '#9aa3ae'], wall: '#34476b', props: 'police', crowd: 2, staff: ['#1f3a8a', '#1f3a8a'] },
  hospital:  { floor: ['tile', '#e4ecef'], wall: '#4f7a8c', props: 'hospital', crowd: 4, staff: ['#ffffff', '#6fd3c0'] },
  terminal:  { floor: ['tile', '#bdb4a2'], wall: '#6a5d48', props: 'terminal', crowd: 7, staff: ['#ffc857', '#ffc857'] },
  airport:   { floor: ['tile', '#c9ced6'], wall: '#46566b', props: 'airport', crowd: 8, staff: ['#7ad7ff', '#7ad7ff'] },
  home:      { floor: ['wood', '#a8794a'], wall: '#6b5646', props: 'home', crowd: 0 },
  // Player businesses (Update 36): the building depends on what kind of business it is.
  biz_cafe:     { floor: ['wood', '#b58a5a'], wall: '#8a5a2f', props: 'bizcafe', crowd: 3, staff: ['#ff9f1c'] },
  biz_minimart: { floor: ['tile', '#d8dcd0'], wall: '#2f7a5f', props: 'shop', crowd: 3, staff: ['#4cc9a0'] },
  biz_salon:    { floor: ['tile', '#e8dfe4'], wall: '#8a3a63', props: 'bizsalon', crowd: 2, staff: ['#ff7eb6', '#ff7eb6'] },
  biz_gym:      { floor: ['tile', '#3a4448'], wall: '#2f5a70', props: 'gym', crowd: 4, staff: ['#7ad7ff'] },
};

const SKIN = ['#f1c9a5', '#d9a47a', '#b07a54', '#8a5a3c', '#6b4129', '#4a2c1c'];
const HAIR = ['#111111', '#1c1410', '#2a1a10', '#3a2a1a', '#111111'];
const CLOTH = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400', '#7f8c8d', '#e8e8e8', '#2c3e50'];

export function createInterior(scene) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  let figures = [];
  let windows = [];
  let lamps = [];
  let owned = []; // things to dispose when the room changes
  let current = null;
  let propsGroup = null;
  let solids = [];   // furniture boxes, so wandering customers walk around them
  const inSolid = (x, z) => solids.some((b) => x > b[0] - 0.3 && x < b[2] + 0.3 && z > b[1] - 0.3 && z < b[3] + 0.3);

  const matCache = new Map();
  const mat = (color, extra = {}) => {
    const k = color + JSON.stringify(extra);
    if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));
    return matCache.get(k);
  };
  const boxCache = new Map();
  const geo = (w, h, d) => {
    const k = `${w}|${h}|${d}`;
    if (!boxCache.has(k)) boxCache.set(k, new THREE.BoxGeometry(w, h, d));
    return boxCache.get(k);
  };
  const put = (parent, w, h, d, color, x, y, z, extra) => {
    const m = new THREE.Mesh(geo(w, h, d), typeof color === 'string' ? mat(color, extra) : color);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // ---------- Props ----------
  const counter = (g, x, z, w, color = '#6b4a2f', top = '#d8d0c4', rot = 0) => {
    const c = new THREE.Group();
    put(c, w, 1.0, 1.0, color, 0, 0.5, 0);
    put(c, w + 0.2, 0.1, 1.2, top, 0, 1.05, 0);
    c.position.set(x, 0, z);
    c.rotation.y = rot;
    g.add(c);
    return c;
  };
  const shelf = (g, x, z, w, cols, rot = 0, h = 2.4) => {
    const s = new THREE.Group();
    put(s, w, h, 0.5, '#5a4636', 0, h / 2, 0);
    const r = rnd(hash(`${x}${z}`));
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < Math.floor(w / 0.35); i++) {
        put(s, 0.25, 0.3, 0.3, cols[Math.floor(r() * cols.length)], -w / 2 + 0.25 + i * 0.35, 0.35 + row * 0.55, 0.3);
      }
    }
    s.position.set(x, 0, z);
    s.rotation.y = rot;
    g.add(s);
  };
  const bookshelf = (g, x, z, w, rot = 0) => shelf(g, x, z, w, ['#8b2e2e', '#2e5a8b', '#3a7a3a', '#c9a227', '#5a3a7a', '#e8e0d0'], rot, 3);
  const rail = (g, x, z, w, rot = 0) => {
    const c = new THREE.Group();
    for (const dx of [-w / 2, w / 2]) put(c, 0.06, 1.8, 0.06, '#b8b8c0', dx, 0.9, 0);
    put(c, w, 0.06, 0.06, '#b8b8c0', 0, 1.8, 0);
    const colors = ['#e84393', '#6c5ce7', '#00b894', '#fdcb6e', '#d63031', '#0984e3', '#2d3436', '#fab1a0'];
    const r = rnd(hash(`r${x}${z}`));
    for (let i = 0; i < Math.floor(w / 0.28); i++) {
      put(c, 0.2, 0.9, 0.08, colors[Math.floor(r() * colors.length)], -w / 2 + 0.2 + i * 0.28, 1.25, 0);
    }
    c.position.set(x, 0, z);
    c.rotation.y = rot;
    g.add(c);
  };
  const table = (g, x, z, w = 1.6, d = 1.0, color = '#7a5a3a') => {
    put(g, w, 0.1, d, color, x, 0.8, z);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) put(g, 0.1, 0.8, 0.1, shade(color, 0.7), x + dx * (w / 2 - 0.1), 0.4, z + dz * (d / 2 - 0.1));
  };
  const chair = (g, x, z, color = '#4a3b2a') => {
    put(g, 0.5, 0.08, 0.5, color, x, 0.5, z);
    put(g, 0.5, 0.6, 0.08, color, x, 0.8, z - 0.25);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) put(g, 0.06, 0.5, 0.06, '#222', x + dx * 0.2, 0.25, z + dz * 0.2);
  };
  const plant = (g, x, z, s = 1) => {
    put(g, 0.5 * s, 0.5 * s, 0.5 * s, '#8a5a3a', x, 0.25 * s, z);
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * s, 0), mat('#2f7a3a'));
    l.position.set(x, 0.9 * s, z);
    g.add(l);
    owned.push(l.geometry);
  };
  const sofa = (g, x, z, color = '#5b4a8a', rot = 0) => {
    const s = new THREE.Group();
    put(s, 2.2, 0.5, 0.9, color, 0, 0.3, 0);
    put(s, 2.2, 0.7, 0.25, color, 0, 0.75, -0.35);
    for (const dx of [-1, 1]) put(s, 0.25, 0.6, 0.9, shade(color, 0.85), dx * 1.1, 0.5, 0);
    s.position.set(x, 0, z);
    s.rotation.y = rot;
    g.add(s);
  };
  const computer = (g, x, y, z) => {
    put(g, 0.6, 0.4, 0.05, '#111', x, y + 0.45, z);
    put(g, 0.55, 0.35, 0.02, '#4ab3ff', x, y + 0.45, z + 0.03, { emissive: '#4ab3ff', emissiveIntensity: 0.35 });
    put(g, 0.1, 0.25, 0.1, '#333', x, y + 0.15, z);
  };
  const mirror = (g, x, z, rot = 0) => {
    const m = new THREE.Group();
    put(m, 1.1, 2.2, 0.08, '#c8a050', 0, 1.2, 0);
    put(m, 0.95, 2.05, 0.1, '#bfe3f0', 0, 1.2, 0.01, { metalness: 0.7, roughness: 0.15 });
    m.position.set(x, 0, z);
    m.rotation.y = rot;
    g.add(m);
  };
  const poster = (g, x, y, z, w, h, color, rot = 0) => {
    const p = put(g, w, h, 0.05, color, x, y, z);
    p.rotation.y = rot;
  };
  const crateStack = (g, x, z, n = 3) => {
    const r = rnd(hash(`c${x}${z}`));
    for (let i = 0; i < n; i++) put(g, 0.7, 0.5, 0.7, '#a07a4a', x + (r() - 0.5) * 0.3, 0.25 + i * 0.5, z + (r() - 0.5) * 0.3);
  };
  const treadmill = (g, x, z) => {
    put(g, 0.9, 0.2, 2, '#2a2a30', x, 0.25, z);
    put(g, 0.9, 0.05, 1.7, '#111', x, 0.37, z + 0.1);
    put(g, 0.08, 1.2, 0.08, '#888', x - 0.4, 0.9, z - 0.8);
    put(g, 0.08, 1.2, 0.08, '#888', x + 0.4, 0.9, z - 0.8);
    put(g, 0.9, 0.3, 0.1, '#222', x, 1.5, z - 0.8);
  };
  const weights = (g, x, z) => {
    put(g, 2.2, 0.1, 0.1, '#bbb', x, 1.4, z);
    for (const dx of [-1, 1]) put(g, 0.1, 0.5, 0.5, '#222', x + dx * 1.0, 1.4, z);
    put(g, 0.5, 0.4, 1.6, '#333', x, 0.5, z + 0.5);
    put(g, 0.08, 1.4, 0.08, '#666', x - 0.8, 0.7, z);
    put(g, 0.08, 1.4, 0.08, '#666', x + 0.8, 0.7, z);
  };
  const lamp = (g, x, y, z, color = '#ffe2a0') => {
    const m = put(g, 0.3, 0.2, 0.3, color, x, y, z, { emissive: color, emissiveIntensity: 0.6 });
    lamps.push(m);
  };

  const PROPS = {
    plaza(g) {
      // an indoor plaza hall: benches, a central fountain-like planter, plants
      put(g, 3, 0.4, 3, '#6a6a78', 0, 0.2, -2);
      put(g, 2.2, 0.3, 2.2, '#3a86a8', 0, 0.45, -2, { emissive: '#3a86a8', emissiveIntensity: 0.25 });
      for (const x of [-7, 7]) { put(g, 2.2, 0.15, 0.6, '#7a5a3a', x, 0.5, -4); put(g, 2.2, 0.6, 0.1, '#7a5a3a', x, 0.9, -4.3); }
      for (const [x, z] of [[-8.3, -8.3], [8.3, -8.3], [-8.3, 4], [8.3, 4]]) plant(g, x, z, 1.4);
      poster(g, 0, 2.6, -9.8, 6, 1.4, '#b88a3a');
    },
    gym(g) {
      for (let i = 0; i < 4; i++) treadmill(g, -7 + i * 1.6, -7.5);
      weights(g, 5.5, -7); weights(g, 8, -3.5);
      put(g, 3, 0.05, 2, '#c0392b', -6, 0.03, -2); // mat
      put(g, 3, 0.05, 2, '#2980b9', -6, 0.03, 1);
      put(g, 0.2, 0.2, 2, '#222', 7.6, 1.0, 1);
      counter(g, 6.5, 5, 3, '#2f5d62');
      mirror(g, -9.7, -2, Math.PI / 2); mirror(g, -9.7, 3, Math.PI / 2);
      poster(g, 0, 2.8, -9.8, 7, 1.0, '#ff6b4a');
    },
    market(g) {
      for (const x of [-7, -3, 1, 5]) {
        const s = new THREE.Group();
        put(s, 2.6, 0.9, 1.1, '#8a6a45', 0, 0.45, 0);
        put(s, 2.8, 0.1, 1.3, '#d9c9a8', 0, 0.95, 0);
        const r = rnd(hash(`m${x}`));
        for (let i = 0; i < 7; i++) put(s, 0.3, 0.25, 0.3, ['#e74c3c', '#f39c12', '#27ae60', '#f1c40f', '#8e44ad'][Math.floor(r() * 5)], -1.0 + i * 0.33, 1.15, (r() - 0.5) * 0.5);
        put(s, 0.08, 2.4, 0.08, '#6b4a2f', -1.3, 1.2, -0.5); put(s, 0.08, 2.4, 0.08, '#6b4a2f', 1.3, 1.2, -0.5);
        put(s, 3, 0.1, 1.6, ['#e74c3c', '#27ae60', '#f39c12', '#3a86ff'][Math.abs(x) % 4], 0, 2.4, -0.2);
        s.position.set(x, 0, -5.5);
        g.add(s);
      }
      crateStack(g, 8.3, -8, 3); crateStack(g, -8.5, -8.5, 2); crateStack(g, 8.3, 2, 2);
      shelf(g, 9.5, -1, 4, ['#e74c3c', '#f1c40f', '#27ae60', '#ecf0f1'], -Math.PI / 2);
      counter(g, -6.5, 5, 3, '#8a6a45');
      poster(g, 0, 2.8, -9.8, 6, 1.0, '#3ddc97');
    },
    jobs(g) {
      for (const x of [-7, -3.5, 0, 3.5, 7]) { counter(g, x, -6, 2.4, '#44506b'); computer(g, x, 1.1, -6.1); chair(g, x, -4.6, '#222a40'); }
      for (let i = 0; i < 3; i++) chair(g, -8 + i * 0.7, 3, '#3b4a6b');
      sofa(g, 6, 4, '#3b4a6b');
      put(g, 6, 3, 0.1, '#e8ecf4', 0, 2, -9.75); // notice board
      const r = rnd(4);
      for (let i = 0; i < 14; i++) put(g, 0.6, 0.8, 0.04, ['#ffd166', '#ef476f', '#06d6a0', '#118ab2'][Math.floor(r() * 4)], -2.5 + (i % 7) * 0.8, 2.4 - Math.floor(i / 7) * 1.0, -9.68);
      plant(g, 8.5, -8.5, 1.2);
    },
    bizcafe(g) {
      // counter with a menu board and coffee machine, round-ish tables with chairs, plants
      counter(g, 5.5, -6, 5, '#6b3b1f', '#e8d8b8');
      put(g, 0.6, 0.5, 0.5, '#2a2a2e', 7, 1.35, -6); put(g, 0.2, 0.3, 0.2, '#c0c0c8', 7, 1.7, -6);
      put(g, 4, 1.6, 0.12, '#1a1f1a', 5.5, 3.3, -9.75); poster(g, 5.5, 3.3, -9.65, 3.6, 1.3, '#ff9f1c');
      for (const [x, z] of [[-6, -3], [-2, -3], [-6, 1.5], [-2, 1.5], [3, 2]]) { table(g, x, z, 1.1, 1.1, '#8a5a3a'); chair(g, x - 0.8, z, '#4a3b2a'); chair(g, x + 0.8, z, '#4a3b2a'); put(g, 0.25, 0.25, 0.25, '#e8e8e8', x, 0.95, z); }
      plant(g, -8.6, -8, 1.2); plant(g, 8.6, 7, 1.1);
      lamp(g, -4, 3, -1); lamp(g, 3, 3, 4);
    },
    bizsalon(g) {
      // mirrors with chairs, a wash basin, a waiting sofa
      for (const x of [-6, -2, 2]) { mirror(g, x, -9.7, 0); chair(g, x, -7.6, '#c0392b'); put(g, 0.7, 0.1, 0.5, '#222', x, 0.12, -7.6); }
      put(g, 1.6, 0.9, 0.9, '#e8e8ee', 7, 0.45, -7); put(g, 0.7, 0.2, 0.5, '#bfd8e8', 7, 0.95, -7);
      sofa(g, -6, 3, '#8a3a63', 0); sofa(g, -2, 3, '#8a3a63', 0);
      counter(g, 6.5, 4, 3, '#6b3b4f');
      shelf(g, 9.4, -2, 3.2, ['#ff7eb6', '#ffd166', '#a29bfe'], -Math.PI / 2, 1.8);
      plant(g, -8.6, 7, 1.1);
    },
    shop(g) {
      for (const x of [-7, -3]) shelf(g, x, -8.2, 3.2, ['#ff4d8d', '#ffd166', '#06d6a0', '#118ab2', '#ecf0f1']);
      shelf(g, 3, -8.2, 3.2, ['#ff4d8d', '#ffd166', '#06d6a0']);
      shelf(g, -9.4, -3, 4, ['#e74c3c', '#27ae60', '#f1c40f'], Math.PI / 2);
      shelf(g, 9.4, -3, 4, ['#3498db', '#ecf0f1', '#e67e22'], -Math.PI / 2);
      for (const x of [-4, 0, 4]) shelf(g, x, -2, 2.4, ['#ff4d8d', '#ffd166', '#2ecc71', '#9b59b6'], 0, 1.5);
      counter(g, 6, 5, 3.5, '#6b3b4f');
      put(g, 0.5, 0.3, 0.4, '#222', 6, 1.25, 5); // till
    },
    library(g) {
      for (const x of [-7, -3.5, 0, 3.5, 7]) bookshelf(g, x, -9.3, 3);
      bookshelf(g, -9.5, -3, 4, Math.PI / 2); bookshelf(g, 9.5, -3, 4, -Math.PI / 2);
      for (const x of [-4, 4]) for (const z of [-3, 2]) { table(g, x, z, 2.2, 1.2); chair(g, x - 0.7, z + 1, '#4a3b2a'); chair(g, x + 0.7, z + 1, '#4a3b2a'); put(g, 0.5, 0.05, 0.4, '#e8e0d0', x, 0.88, z); }
      counter(g, 7, 6, 2.6, '#5a4636');
      lamp(g, -4, 3, -3); lamp(g, 4, 3, 2);
      plant(g, 8.6, 8, 1.2);
    },
    pharmacy(g) {
      for (const x of [-7, -3.5, 0]) shelf(g, x, -9.3, 3, ['#ecf0f1', '#e74c3c', '#3498db', '#2ecc71']);
      shelf(g, 9.5, -3, 4.2, ['#ecf0f1', '#e74c3c', '#f1c40f'], -Math.PI / 2);
      counter(g, 4, -6.5, 5, '#3d7480', '#f0f4f5');
      put(g, 0.9, 0.9, 0.12, '#2ecc71', 8.4, 3, -9.8, { emissive: '#2ecc71', emissiveIntensity: 0.6 }); // green cross sign
      put(g, 0.3, 0.9, 0.12, '#2ecc71', 8.4, 3, -9.75); // (second bar)
      for (let i = 0; i < 3; i++) chair(g, -8 + i * 0.7, 4, '#3d7480');
      plant(g, 8.5, 6, 1.1);
    },
    police(g) {
      // front desk, two cells with bars, noticeboard, benches
      counter(g, 4, -6.5, 6, '#34476b', '#dfe4ea');
      for (const x of [-8, -4.5]) {
        put(g, 3, 0.1, 3.4, '#6f7782', x, 0.05, -8);
        for (let i = 0; i < 7; i++) put(g, 0.08, 2.4, 0.08, '#1c1f24', x - 1.35 + i * 0.45, 1.25, -6.4);
        put(g, 3, 0.08, 0.08, '#1c1f24', x, 2.45, -6.4);
        put(g, 1.6, 0.4, 0.7, '#7a6a55', x, 0.3, -9.2);
      }
      put(g, 2.4, 1.4, 0.1, '#e8d9a8', 8.4, 2.8, -9.8);
      for (let i = 0; i < 3; i++) chair(g, -8 + i * 0.8, 5, '#34476b');
      plant(g, 8.5, 6, 1.1);
    },
    hospital(g) {
      // reception desk, a ward of beds with curtains, waiting chairs, red cross sign
      counter(g, 4, -7, 6, '#4f7a8c', '#f0f4f5');
      for (const x of [-8, -4.5, -1]) {
        put(g, 1.6, 0.5, 3.2, '#cfd8dc', x, 0.45, -7); put(g, 1.5, 0.2, 2.4, '#ffffff', x, 0.78, -6.7); put(g, 1.5, 0.3, 0.5, '#9fd0ea', x, 0.95, -8);
        put(g, 0.1, 2.2, 3.2, '#8fd3c8', x + 1.2, 1.2, -7);
      }
      put(g, 0.9, 0.9, 0.12, '#ff5c5c', 8.4, 3, -9.8, { emissive: '#ff5c5c', emissiveIntensity: 0.6 });
      put(g, 0.3, 0.9, 0.12, '#ff5c5c', 8.4, 3, -9.75);
      for (let i = 0; i < 4; i++) chair(g, -8 + i * 0.8, 5, '#4f7a8c');
      plant(g, 8.5, 6, 1.1);
    },
    terminal(g) {
      // ticket counters, departures board, rows of benches
      counter(g, -5, -7, 6, '#6a5d48', '#e8dfc8'); counter(g, 5, -7, 6, '#6a5d48', '#e8dfc8');
      put(g, 8, 1.6, 0.15, '#111418', 0, 3.6, -9.75);
      for (let i = 0; i < 5; i++) put(g, 6.6, 0.12, 0.2, i % 2 ? '#ffc857' : '#66d9a0', 0, 4.1 - i * 0.28, -9.62, { emissive: i % 2 ? '#ffc857' : '#66d9a0', emissiveIntensity: 0.6 });
      for (const z of [0, 3.5]) for (const x of [-6, 0, 6]) put(g, 3.6, 0.5, 0.8, '#7a5a38', x, 0.3, z);
      plant(g, -8.6, 7, 1.2); plant(g, 8.6, 7, 1.2);
    },
    airport(g) {
      // check-in desks, a big departures board, a window onto the runway, rows of seats
      counter(g, -5, -7, 6, '#46566b', '#e8eef6'); counter(g, 5, -7, 6, '#46566b', '#e8eef6');
      put(g, 9, 1.8, 0.15, '#0e1218', 0, 3.7, -9.75);
      for (let i = 0; i < 6; i++) put(g, 7.6, 0.1, 0.2, i % 2 ? '#7ad7ff' : '#66d9a0', 0, 4.4 - i * 0.26, -9.62, { emissive: i % 2 ? '#7ad7ff' : '#66d9a0', emissiveIntensity: 0.6 });
      put(g, 0.15, 3, 9, '#9fd6ff', -9.75, 2, 1, { emissive: '#4a7a9a', emissiveIntensity: 0.25 });
      for (const z of [0, 3.5, 7]) for (const x of [-6, -2, 2, 6]) put(g, 2.6, 0.5, 0.8, '#3a5a8a', x, 0.3, z);
      for (const x of [-7, 7]) { put(g, 1.2, 0.35, 1.6, '#2a2a32', x, 0.2, 5.2); put(g, 0.9, 0.7, 0.4, '#c0392b', x, 0.55, 5.2); }
      plant(g, -8.6, 8, 1.2); plant(g, 8.6, 8, 1.2);
    },
    garage(g) {
      // two car lifts with cars, tyre stacks, tool wall
      for (const x of [-5, 3]) {
        put(g, 3.6, 0.3, 6, '#3a3a44', x, 0.15, -3);
      }
      // the two dearest cars Kanis Motors sells stand on the lifts (plain box stand-ins until the models load)
      [[-5, 'sports'], [3, 'racer']].forEach(([x, name], i) => {
        const stand = new THREE.Group();
        put(stand, 2.2, 0.6, 4.2, '#c0392b', 0, 0.8, 0); put(stand, 1.8, 0.5, 2, '#9fd6ff', 0, 1.3, -0.2);
        stand.position.set(x, 0, -3); g.add(stand);
        loadCar(name).then(() => {
          const c = carClone(name); if (!c) return;
          c.position.set(x, 0.3, -3); c.rotation.y = i ? 0.35 : -0.35;
          g.remove(stand); g.add(c);
        });
      });
      for (let i = 0; i < 4; i++) put(g, 0.9, 0.35, 0.9, '#1a1a1a', 8.4, 0.18 + i * 0.35, -8.3);
      put(g, 6, 2, 0.1, '#444', -3, 1.8, -9.75);
      for (let i = 0; i < 12; i++) put(g, 0.1, 0.5, 0.05, '#c0c0c8', -5.5 + i * 0.5, 1.8, -9.65);
      counter(g, 7.5, 5, 3, '#454552');
      put(g, 0.5, 0.9, 0.5, '#ff9f1c', 9, 0.45, 1);
    },
    club(g) {
      // dance floor with colored tiles, DJ booth, bar, speakers, lights
      for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 4; iz++) {
        const c = ['#7b2cbf', '#3a0ca3', '#f72585', '#4361ee'][(ix + iz) % 4];
        put(g, 1.4, 0.04, 1.4, c, -3 + ix * 1.5, 0.03, -4 + iz * 1.5, { emissive: c, emissiveIntensity: 0.55 });
      }
      put(g, 6, 1.1, 1.6, '#1a1030', 0, 0.55, -8.6); put(g, 5.8, 0.1, 1.5, '#222', 0, 1.15, -8.6);
      put(g, 0.7, 0.4, 0.6, '#111', -0.7, 1.4, -8.6); put(g, 0.7, 0.4, 0.6, '#111', 0.7, 1.4, -8.6);
      for (const x of [-7, 7]) { put(g, 1.2, 2.2, 1, '#0c0c10', x, 1.1, -8.5); put(g, 0.7, 0.7, 0.05, '#222', x, 0.9, -7.95); }
      counter(g, -8.3, 2, 6, '#2a1050', '#0e0a1a', Math.PI / 2);
      for (let i = 0; i < 4; i++) put(g, 0.4, 0.8, 0.4, '#5a3a90', -6.8, 0.4, -0.5 + i * 1.4);
      for (const [x, c] of [[-5, '#ff2d95'], [-1.7, '#2de2ff'], [1.7, '#b6ff2d'], [5, '#ff9f1c']]) {
        const l = put(g, 0.4, 0.4, 0.4, c, x, 3.6, -2, { emissive: c, emissiveIntensity: 1.2 });
        lamps.push(l);
      }
      sofa(g, 8, 3, '#3a0ca3', -Math.PI / 2);
    },
    hotel(g) {
      // reception, key rack, luggage trolley, lounge, a hallway of room doors
      counter(g, 0, -6.2, 7, '#5a3b2e', '#d8c8a8');
      computer(g, -1.5, 1.1, -6.2); computer(g, 1.5, 1.1, -6.2);
      for (let i = 0; i < 6; i++) put(g, 0.35, 0.45, 0.05, '#c8a050', -1.4 + i * 0.55, 2.2, -9.8, { metalness: 0.5 });
      put(g, 3.6, 0.1, 0.1, '#7a5a3a', 0, 1.9, -9.8);
      for (const x of [-7.5, -5.5, 5.5, 7.5]) { put(g, 1.6, 2.7, 0.2, '#3a2a20', x, 1.35, -9.8); put(g, 0.14, 0.14, 0.1, '#d6b25a', x + 0.5, 1.3, -9.66, { metalness: 0.7 }); }
      put(g, 1.1, 0.12, 0.7, '#c8a050', -8, 0.55, -3); put(g, 0.1, 1.3, 0.1, '#c8a050', -8.5, 1.1, -3); put(g, 0.1, 1.3, 0.1, '#c8a050', -7.5, 1.1, -3);
      put(g, 0.8, 0.5, 0.4, '#7a2e2e', -8, 0.9, -3);
      sofa(g, -6, 3, '#6a4a3a', 0); sofa(g, 6, 3, '#6a4a3a', 0);
      table(g, 0, 3.2, 2, 1.0, '#7a5a3a');
      for (const [x, z] of [[-9, 6], [9, 6], [-9, -6.5], [9, -6.5]]) plant(g, x, z, 1.5);
      poster(g, -9.8, 2.6, 0, 5, 1.4, '#c8a050', Math.PI / 2);
      for (const x of [-4, 4]) lamps.push(put(g, 0.5, 0.5, 0.5, '#ffd9a0', x, 3.6, 0, { emissive: '#ffd9a0', emissiveIntensity: 0.9 }));
    },
    eventcenter(g) {
      // a stage with curtains and speakers, rows of chairs, a bar and spotlights
      put(g, 11, 0.7, 4.2, '#2a2230', 0, 0.35, -8);
      put(g, 11, 0.05, 4.2, '#c0392b', 0, 0.72, -8);
      put(g, 2.2, 6, 0.3, '#5a1a2a', -5.8, 3, -9.8); put(g, 2.2, 6, 0.3, '#5a1a2a', 5.8, 3, -9.8); put(g, 9.5, 1, 0.3, '#5a1a2a', 0, 5.6, -9.8);
      for (const x of [-5.4, 5.4]) { put(g, 1.1, 2.4, 1, '#0c0c10', x, 1.9, -6.8); put(g, 0.7, 0.7, 0.05, '#333', x, 1.5, -6.28); }
      put(g, 0.06, 1.7, 0.06, '#222', 0, 1.55, -7); put(g, 0.2, 0.28, 0.2, '#444', 0, 2.5, -7);
      for (let row = 0; row < 4; row++) for (let i = 0; i < 8; i++) { if (i === 3 || i === 4) continue; put(g, 0.7, 0.5, 0.7, '#3a4a8a', -5.6 + i * 1.6, 0.25, -3 + row * 1.8); put(g, 0.7, 0.55, 0.12, '#3a4a8a', -5.6 + i * 1.6, 0.75, -3.35 + row * 1.8); }
      counter(g, 8.2, 4, 5, '#2b3a67', '#111a33', -Math.PI / 2);
      for (const [x, c] of [[-6, '#ff2d95'], [-2, '#2de2ff'], [2, '#ffe14d'], [6, '#7aff6e']]) lamps.push(put(g, 0.5, 0.5, 0.5, c, x, 3.8, -4, { emissive: c, emissiveIntensity: 1.2 }));
      poster(g, 0, 4.4, -9.6, 7, 0.8, '#7ae0ff');
      plant(g, -9, 7, 1.4);
    },
    bank(g) {
      counter(g, 0, -6.5, 12, '#27493f', '#d8d0c4');
      for (const x of [-4, 0, 4]) { put(g, 0.1, 1.2, 0.1, '#c8a050', x - 1.5, 1.7, -6.5); put(g, 1.6, 1.0, 0.04, '#bfe3f0', x - 0.7, 1.7, -6.5, { transparent: true, opacity: 0.4 }); computer(g, x, 1.1, -6.6); }
      put(g, 3.2, 3.4, 0.5, '#8a8a92', 6.5, 1.7, -9.5, { metalness: 0.6 }); // vault door
      put(g, 1.6, 1.6, 0.2, '#6a6a72', 6.5, 1.7, -9.2, { metalness: 0.7 });
      put(g, 0.6, 0.6, 0.1, '#c8a050', 6.5, 1.7, -9.05);
      for (const x of [-8.6, -7.5]) { put(g, 0.9, 1.9, 0.7, '#2c3e50', x, 0.95, -8.3); put(g, 0.7, 0.5, 0.05, '#4ab3ff', x, 1.6, -7.94, { emissive: '#4ab3ff', emissiveIntensity: 0.5 }); }
      for (let i = 0; i < 4; i++) { put(g, 0.1, 1.0, 0.1, '#c8a050', -4 + i * 1.3, 0.5, 1); }
      put(g, 4, 0.04, 0.04, '#7a1f1f', -2.6, 1.0, 1);
      sofa(g, -7.5, 4, '#3a3a40', Math.PI / 2);
      plant(g, 8.6, 3, 1.3);
    },
    boutique(g) {
      rail(g, -7, -7.5, 3.4); rail(g, -2.5, -7.5, 3.4); rail(g, 2, -7.5, 3.4);
      rail(g, -8.5, -2, 4, Math.PI / 2); rail(g, 8.5, -2, 4, -Math.PI / 2);
      for (const [x, z] of [[-4, -3], [0, -2], [4, -3]]) {
        const m = put(g, 0.5, 1.5, 0.5, '#e8e0d8', x, 0.75, z); // mannequins
        put(g, 0.6, 0.8, 0.45, ['#e84393', '#6c5ce7', '#fdcb6e'][Math.abs(x) % 3], x, 1.3, z);
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat('#e8e0d8'));
        h.position.set(x, 1.95, z); g.add(h); owned.push(h.geometry);
        m.visible = false;
      }
      mirror(g, 9.7, 3, -Math.PI / 2); mirror(g, -4, 9.7, Math.PI);
      for (let i = 0; i < 4; i++) put(g, 0.5, 0.5, 0.35, '#c8a050', 6 + i * 0.7, 0.3 + (i % 2) * 0.5, -9);
      counter(g, 6.5, 5, 3, '#4a2f55', '#f0e6ee');
      put(g, 2.4, 0.9, 0.2, '#fff', -5, 0.95, 6, { transparent: true, opacity: 0 }); // spacer (invisible)
      put(g, 2.2, 1.0, 1.2, '#7a4a8a', -6, 0.5, 4.5); // fitting room
      put(g, 2.2, 2.4, 0.1, '#e8d0e8', -6, 1.2, 3.9);
      poster(g, -2, 2.8, -9.8, 5, 1.2, '#ff7eb6');
    },
    homestore(g) {
      for (const [x, z] of [[-6, -6.5], [-2, -6.5]]) { put(g, 2.4, 0.5, 3, '#cfc3b4', x, 0.35, z); put(g, 2.4, 0.9, 0.3, '#8a7a6a', x, 0.7, z - 1.3); put(g, 0.1, 0.5, 0.1, '#222', x, 0.12, z); }
      sofa(g, 3, -7, '#8a5a3a'); sofa(g, 7, -7, '#4a6a8a');
      for (const x of [-7, -3, 1]) { put(g, 1.6, 0.9, 0.6, '#6b5a4a', x, 0.45, -1); put(g, 1.4, 0.8, 0.05, '#111', x, 1.2, -1.2); }
      put(g, 4, 0.05, 3, '#b0453a', -2, 0.03, 2.5);
      for (const x of [3, 5, 7]) plant(g, x, 2, 1.3);
      bookshelf(g, 9.4, -2, 3.6, -Math.PI / 2);
      counter(g, -6.5, 6, 3, '#5a4a2f');
      lamp(g, -6.5, 2.4, -8.5);
    },
    home(g) { /* your own furniture goes here; walls and floor paint are handled in furniture.js */ },
  };

  // ---------- People ----------
  function person(parent, color, seed, role) {
    const r = rnd(seed);
    const grp = new THREE.Group();
    const skin = SKIN[Math.floor(r() * SKIN.length)];
    const legs = put(grp, 0.4, 0.55, 0.3, '#2c3e50', 0, 0.28, 0);
    const topCol = color || CLOTH[Math.floor(r() * CLOTH.length)];
    const torso = put(grp, 0.5, 0.65, 0.32, topCol, 0, 0.9, 0);
    grp.userData.look = { skin, top: topCol, bottom: ['#2c3e50', '#3a3a48', '#5a4a3a', '#1f2a3a'][Math.floor(r() * 4)], shoes: ['#e8e8e8', '#222222', '#6b4a2a'][Math.floor(r() * 3)] };
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(skin));
    head.position.y = 1.42;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(HAIR[Math.floor(r() * HAIR.length)]));
    hair.position.y = 1.45;
    owned.push(head.geometry, hair.geometry);
    const armL = put(grp, 0.12, 0.55, 0.12, skin, -0.32, 0.9, 0);
    const armR = put(grp, 0.12, 0.55, 0.12, skin, 0.32, 0.9, 0);
    grp.add(head, hair);
    if (role === 'staff') put(grp, 0.3, 0.12, 0.02, '#ffffff', 0.08, 1.0, 0.17); // name badge
    parent.add(grp);
    return { grp, legs, armL, armR, head, torso };
  }

  let roomOpenForVisits = true;
  // Staff who wear their own uniform, in the order of the staff spots above.
  const WORKERS_AT = { hospital: ['doctor', 'nurse'], pharmacy: ['nurse'], police: ['police', 'police'], biz_cafe: ['chef', 'chef', 'chef', 'chef'] };

  function addFigures(g, theme, id, bizStaff) {
    const r = rnd(hash(id));
    const spots = {
      // staff stand behind counters / at their post; customers wander the floor in front
      staff: {
        plaza: [[0, -4.5]], gym: [[6.5, 6.4]], market: [[-6.5, 6.4], [-7, -4.3], [1, -4.3]], jobs: [[-7, -7.3], [3.5, -7.3]], shop: [[6, 6.4]],
        library: [[7, 7.4]], pharmacy: [[4, -7.7]], hospital: [[4, -7.8], [-3, -4.5]], police: [[4, -7.8], [0, -5]], terminal: [[-5, -7.8], [5, -7.8]], airport: [[-5, -7.8], [5, -7.8]], garage: [[7.5, 6.4]], club: [[-9.6, 2], [0, -9.9]], hotel: [[-1.5, -7.6], [1.5, -7.6]], eventcenter: [[0, -6.2]], bank: [[-4, -7.8], [4, -7.8]], boutique: [[6.5, 6.4]], homestore: [[-6.5, 7.4]],
        biz_cafe: [[6, 6.4], [3, 6.4], [-6, 6.4], [-3, 6.4]], biz_minimart: [[6, 6.4], [3, 6.4], [-6, 6.4], [-3, 6.4]], biz_salon: [[-6, -7.4], [-2.5, -7.4], [1, -7.4], [4.5, -7.4]], biz_gym: [[6.5, 6.4], [3.5, 6.4], [-6.5, 6.4], [-3.5, 6.4]],
      }[id] || [],
    };
    const crew = id.startsWith('biz_') ? Array.from({ length: bizStaff || 0 }, (_, i) => (theme.staff || ['#ffffff'])[i % (theme.staff || ['#ffffff']).length]) : (theme.staff || []);
    crew.forEach((c, i) => {
      const s = spots.staff[i % Math.max(1, spots.staff.length)];
      if (!s) return;
      const f = person(g, c, hash(id) + i, 'staff');
      const wk = (WORKERS_AT[id] || [])[i];
      if (wk) f.grp.userData.look.worker = wk;
      f.grp.position.set(s[0], 0, s[1]);
      f.grp.rotation.y = s[1] > 3 || id === 'club' ? Math.PI : 0;
      figures.push({ ...f, kind: 'idle', phase: r() * 6 });
    });
    if (id === 'hospital') {
      // A patient resting in the second bed.
      const f = person(g, '#9fd0ea', hash(id) + 99, 'guest');
      f.grp.position.set(-4.5, 0.98, -5.9);
      f.grp.rotation.x = -Math.PI / 2;
      figures.push({ ...f, kind: 'patient', phase: 1 });
    }
    for (let i = 0; i < theme.crowd; i++) {
      const f = person(g, null, hash(id) * 7 + i, 'guest');
      const x = (r() - 0.5) * 14;
      const z = -2 + r() * 8;
      f.grp.position.set(x, 0, z);
      figures.push({ ...f, kind: i % 3 === 0 ? 'idle' : 'wander', phase: r() * 6, target: new THREE.Vector3(x, 0, z), wait: r() * 3, speed: 0.6 + r() * 0.5, life: 20 + r() * 70 });
    }
    // When the light 3D person has loaded, staff and customers become people.
    const mine = figures.slice();
    whenNpcReady(() => { for (const f of mine) if (figures.includes(f)) upgradeToNpc(f.grp, f.grp.userData.look); });
  }

  // ---------- The shell: floor, walls, windows, and the ground around the building ----------
  function buildShell(id, theme) {
    const [floorKind, floorColor] = theme.floor;
    const floorTex = FLOORS[floorKind](floorColor);
    owned.push(floorTex);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    root.add(floor);
    owned.push(floor.geometry, floor.material);
    // Ground around the building so the room does not float in space.
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: id === 'home' ? '#4f7a3a' : '#55565c', roughness: 1 }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.03;
    root.add(outside);
    owned.push(outside.geometry, outside.material);
    if (id === 'home') return buildHomeExterior();
    const H = 4.2;
    const wallTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = theme.wall;
      g.fillRect(0, 0, w, h);
      const r = rnd(3);
      for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 2, 2); }
    }, 6, 1);
    owned.push(wallTex);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    const trim = mat(shade(theme.wall, 0.55));
    const addWall = (w, x, z, ry) => {
      const grp = new THREE.Group();
      const slab = new THREE.Mesh(geo(w, H, 0.4), wallMat);
      slab.position.y = H / 2;
      const base = new THREE.Mesh(geo(w, 0.35, 0.46), trim);
      base.position.y = 0.18;
      const top = new THREE.Mesh(geo(w, 0.2, 0.5), trim);
      top.position.y = H;
      grp.add(slab, base, top);
      grp.position.set(x, 0, z);
      grp.rotation.y = ry;
      root.add(grp);
      return grp;
    };
    const back = addWall(20.8, 0, -10.2, 0);
    const left = addWall(20.8, -10.2, 0, Math.PI / 2);
    const right = addWall(20.8, 10.2, 0, Math.PI / 2);
    owned.push(wallMat);
    // Windows on the back wall and side walls (they glow at night).
    const winMat = new THREE.MeshStandardMaterial({ color: '#bfe3f5', emissive: '#bfe3f5', emissiveIntensity: 0.25, roughness: 0.2 });
    windows.push(winMat);
    owned.push(winMat);
    const frameMat = mat('#2a2a30');
    const win = (wall, x, y, w, h) => {
      const f = new THREE.Mesh(geo(w + 0.2, h + 0.2, 0.05), frameMat);
      f.position.set(x, y, 0.23);
      const p = new THREE.Mesh(geo(w, h, 0.05), winMat);
      p.position.set(x, y, 0.26);
      wall.add(f, p);
    };
    for (const x of [-7, -3.5, 3.5, 7]) win(back, x, 2.5, 2, 1.5);
    for (const z of [-5, 0, 5]) { win(left, z, 2.5, 2, 1.5); win(right, z, 2.5, 2, 1.5); }
    // Left and right walls face outwards from the room: flip the windows to the inside.
    left.children.forEach((c) => { if (c.position.z > 0.2) c.position.z = -c.position.z; });
    // (the side walls are rotated, so their "front" faces the room already)
  }

  function buildHomeExterior() {
    // Fence all round your plot, a gate at the front, and a path to the door. The house walls are drawn in furniture.js.
    const fence = mat('#e8e2d4');
    const post = (x, z) => put(root, 0.22, 1.5, 0.22, fence, x, 0.75, z);
    const rail = (x, z, w, d) => { put(root, w, 0.12, d, fence, x, 1.2, z); put(root, w, 0.12, d, fence, x, 0.6, z); };
    const R = 13;
    for (let i = -R; i <= R; i += 2) {
      post(i, -R); post(i, R); if (Math.abs(i) <= R) { post(-R, i); post(R, i); }
    }
    rail(0, -R, R * 2, 0.1); rail(-R, 0, 0.1, R * 2); rail(R, 0, 0.1, R * 2);
    rail(-R / 2 - 1.5, R, R - 3, 0.1); rail(R / 2 + 1.5, R, R - 3, 0.1);
    put(root, 0.3, 2, 0.3, '#c9a227', -1.7, 1, R); put(root, 0.3, 2, 0.3, '#c9a227', 1.7, 1, R); // gate pillars
    put(root, 3.4, 0.2, 0.2, '#c9a227', 0, 2.1, R);
    put(root, 3, 0.04, 6, '#b8b0a0', 0, 0.03, 11.5); // path
    const r = rnd(8);
    for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11, 8], [-11, 6]]) plant(root, x, z, 2.2 + r());
    for (let i = 0; i < 18; i++) { // flower bed along the front
      put(root, 0.25, 0.3, 0.25, ['#e84393', '#fdcb6e', '#ffffff', '#e17055'][i % 4], -R + 1 + i * 1.4 + (r() - 0.5) * 0.2, 0.2, R - 1.2);
    }
    // a house on the horizon, so the plot sits in a neighbourhood
    for (const [x, z, c] of [[-24, -14, '#cdbba0'], [24, -10, '#bfcad8'], [-22, 14, '#d8c4b0'], [26, 12, '#c8d0bc']]) {
      put(root, 8, 4, 7, c, x, 2, z); put(root, 8.6, 0.4, 7.6, '#6b3a2a', x, 4.2, z);
      put(root, 1, 1.4, 0.1, '#222', x, 1.0, z + 3.55);
    }
    // the right wall (the left and back are in furniture.js), so the room is closed on three sides
  }

  function clear() {
    for (const c of [...root.children]) root.remove(c);
    figures = [];
    windows = [];
    lamps = [];
    for (const o of owned) o.dispose && o.dispose();
    owned = [];
  }

  return {
    show(roomId, bizStaff) {
      const key = roomId + ':' + (bizStaff || 0);
      if (current === key) return;
      clear();
      current = key;
      const theme = THEMES[roomId];
      if (!theme) {
        root.visible = false;
        return;
      }
      root.visible = true;
      buildShell(roomId, theme);
      const props = new THREE.Group();
      root.add(props);
      PROPS[theme.props](props);
      propsGroup = props;
      solids = this.dumpSolids();
      const people = new THREE.Group();
      root.add(people);
      if (roomId !== 'home') addFigures(people, theme, roomId, bizStaff);
    },
    // Closing time: customers (not staff) head for the door and leave.
    closeUp() { roomOpenForVisits = false; for (const f of figures) { if (!f.target) continue; if (f.kind === 'away') f.kind = 'gone'; else if (['wander', 'idle', 'exit', 'enter'].includes(f.kind)) f.kind = 'leave'; } },
    // The floor space the props take up, as [x0, z0, x1, z1] boxes. Used once to build the server's furniture collision list.
    dumpSolids() {
      if (!propsGroup) return [];
      root.updateMatrixWorld(true);
      const out = [];
      for (const c of propsGroup.children) {
        const b = new THREE.Box3().setFromObject(c);
        const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
        if (b.max.y >= 0.7 && b.min.y < 1.2 && w >= 0.3 && d >= 0.3) out.push([+b.min.x.toFixed(2), +b.min.z.toFixed(2), +b.max.x.toFixed(2), +b.max.z.toFixed(2)]);
      }
      return out;
    },
    hide() {
      clear();
      current = null;
      root.visible = false;
    },
    // Called every frame. d is how bright the world is (1 = day, 0 = night).
    update(dt, d) {
      for (const w of windows) w.emissiveIntensity = 0.18 + (1 - d) * 0.9;
      for (const l of lamps) l.material.emissiveIntensity = 0.35 + (1 - d) * 0.9;
      for (const f of figures) {
        f.phase += dt;
        const g = f.grp;
        // Regular visitors: after a while a guest heads out, and a little later someone comes in through the door.
        if (f.target && (f.kind === 'wander' || f.kind === 'idle')) { f.life -= dt; if (f.life <= 0 && roomOpenForVisits) f.kind = 'exit'; }
        if (f.kind === 'away') {
          f.back -= dt;
          if (f.back <= 0) {
            g.position.set((Math.random() - 0.5) * 1.2, 0, 9.4);
            g.visible = true;
            f.target.set((Math.random() - 0.5) * 14, 0, -2 + Math.random() * 9);
            f.kind = 'enter'; f.life = 25 + Math.random() * 70; f.wait = 0;
          }
          continue;
        }
        if (f.kind === 'enter') {
          const pos = g.position, dx = f.target.x - pos.x, dz = f.target.z - pos.z, dist = Math.hypot(dx, dz);
          if (dist < 0.3) { f.kind = 'wander'; f.wait = 0.5; }
          else {
            const step = Math.min(dist, f.speed * 1.2 * dt);
            pos.x += (dx / dist) * step; pos.z += (dz / dist) * step;
            g.rotation.y = Math.atan2(dx, dz);
            moveNpc(g, dt, f.speed * 1.2);
            const sw = Math.sin(f.phase * 8) * 0.5; f.armL.rotation.x = sw; f.armR.rotation.x = -sw;
          }
          continue;
        }
        if (f.kind === 'leave' || f.kind === 'exit') {
          // closing time: walk to the door and go out
          const pos = g.position, dx = 0 - pos.x, dz = 9.6 - pos.z, dist = Math.hypot(dx, dz);
          if (dist < 0.3) { g.visible = false; if (f.kind === 'exit') { f.kind = 'away'; f.back = 4 + Math.random() * 14; } else f.kind = 'gone'; }
          else {
            const step = Math.min(dist, f.speed * 1.6 * dt);
            const nx = pos.x + (dx / dist) * step, nz = pos.z + (dz / dist) * step;
            if (!(inSolid(nx, nz) && !inSolid(pos.x, pos.z))) { pos.x = nx; pos.z = nz; } else { pos.x += (dx / dist) * step; }
            g.rotation.y = Math.atan2(dx, dz);
            moveNpc(g, dt, f.speed * 1.6);
            const sw = Math.sin(f.phase * 9) * 0.5;
            f.armL.rotation.x = sw; f.armR.rotation.x = -sw;
          }
          continue;
        }
        if (f.kind === 'patient') { moveNpc(g, dt, 0); continue; }
        if (f.kind === 'gone') continue;
        if (f.kind === 'wander') {
          const pos = g.position;
          if (f.wait > 0) {
            f.wait -= dt;
            if (f.wait <= 0) f.target.set((Math.random() - 0.5) * 14, 0, -2 + Math.random() * 9);
          } else {
            const dx = f.target.x - pos.x;
            const dz = f.target.z - pos.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.1) {
              f.wait = 1.5 + Math.random() * 4;
            } else {
              const step = Math.min(dist, f.speed * dt);
              const nx = pos.x + (dx / dist) * step, nz = pos.z + (dz / dist) * step;
              if (inSolid(nx, nz) && !inSolid(pos.x, pos.z)) { f.wait = 0.2; f.target.set((Math.random() - 0.5) * 14, 0, -2 + Math.random() * 9); } // something is in the way: choose again
              else { pos.x = nx; pos.z = nz; }
              g.rotation.y = Math.atan2(dx, dz);
            }
          }
          const moving = f.wait <= 0;
          moveNpc(g, dt, moving ? f.speed : 0);
          const sw = moving ? Math.sin(f.phase * 7) * 0.5 : 0;
          f.armL.rotation.x = sw;
          f.armR.rotation.x = -sw;
          g.position.y = moving ? Math.abs(Math.sin(f.phase * 7)) * 0.04 : 0;
        } else {
          moveNpc(g, dt, 0);
          f.head.rotation.y = Math.sin(f.phase * 0.7) * 0.5;
          f.torso.scale.y = 1 + Math.sin(f.phase * 1.6) * 0.012;
        }
      }
    },
    people: () => figures.length,
  };
}
