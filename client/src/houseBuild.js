// Adulthood: turns a saved house plan (see server/house.js) into 3D. Used for the inside view, the outside on the street and the builder preview.
// Local coordinates match the server: cell (i,j) sits at x = x0 + 2i, z = z0 + 2j, and the front door is at x = 0, z = 9.5.
import * as THREE from 'three';

const CELL = 2, FRONT_Z = 9.5, H = 3, T = 0.2;
const E = { NONE: 0, WALL: 1, DOOR: 2, WINDOW: 3 };
const FLOOR_COL = { concrete: '#9a9a96', wood: '#a9794a', tile: '#d9d6cc', carpet: '#7a5a8a' };
const mats = new Map();
const M = (c, extra) => { const k = c + (extra ? JSON.stringify(extra) : ''); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...extra })); return mats.get(k); };
const boxes = new Map();
const G = (w, h, d) => { const k = `${w}|${h}|${d}`; if (!boxes.has(k)) boxes.set(k, new THREE.BoxGeometry(w, h, d)); return boxes.get(k); };
const box = (g, w, h, d, c, x, y, z, extra) => { const m = new THREE.Mesh(G(w, h, d), typeof c === 'string' ? M(c, extra) : c); m.position.set(x, y, z); g.add(m); return m; };

export const doorColumn = (cfg) => cfg.h[cfg.d].findIndex((e) => e === E.DOOR);
export const origin = (cfg) => { const door = doorColumn(cfg); return { x0: -(2 * door + 1), z0: FRONT_Z - cfg.d * CELL }; };

function furniture(g, f, cx, cz) {
  const p = new THREE.Group();
  p.position.set(cx, 0, cz); p.rotation.y = -f.r * Math.PI / 2; g.add(p);
  switch (f.k) {
    case 'bed': box(p, 1.5, 0.45, 1.8, '#6b4a2f', 0, 0.25, 0); box(p, 1.4, 0.2, 1.7, '#e8e2f0', 0, 0.55, 0.05); box(p, 1.4, 0.15, 0.4, '#ffffff', 0, 0.72, -0.7); break;
    case 'sofa': box(p, 1.8, 0.45, 0.8, '#5b4a8a', 0, 0.25, 0); box(p, 1.8, 0.6, 0.2, '#4a3b75', 0, 0.65, -0.35); break;
    case 'table': box(p, 1.5, 0.08, 1.0, '#7a5a3a', 0, 0.78, 0); for (const dx of [-1, 1]) for (const dz of [-1, 1]) box(p, 0.08, 0.76, 0.08, '#4a3622', dx * 0.65, 0.38, dz * 0.4); break;
    case 'chair': box(p, 0.5, 0.08, 0.5, '#4a3b2a', 0, 0.5, 0); box(p, 0.5, 0.6, 0.08, '#4a3b2a', 0, 0.8, -0.25); for (const dx of [-1, 1]) for (const dz of [-1, 1]) box(p, 0.06, 0.5, 0.06, '#222', dx * 0.2, 0.25, dz * 0.2); break;
    case 'tv': box(p, 1.5, 0.5, 0.5, '#3a2f26', 0, 0.25, 0); box(p, 1.2, 0.7, 0.06, '#101015', 0, 0.95, 0, { emissive: '#223355', emissiveIntensity: 0.5 }); break;
    case 'fridge': box(p, 0.9, 1.9, 0.8, '#d8dde2', 0, 0.95, 0); box(p, 0.05, 0.5, 0.05, '#888', 0.35, 1.2, 0.42); break;
    case 'stove': box(p, 0.9, 0.9, 0.8, '#c8ccd0', 0, 0.45, 0); for (const dx of [-1, 1]) for (const dz of [-1, 1]) box(p, 0.25, 0.03, 0.25, '#222', dx * 0.2, 0.92, dz * 0.18); break;
    case 'wardrobe': box(p, 1.4, 2.1, 0.6, '#6b4a2f', 0, 1.05, 0); box(p, 0.03, 1.8, 0.02, '#3a2616', 0, 1.05, 0.31); break;
    case 'desk': box(p, 1.4, 0.08, 0.7, '#8a6a4a', 0, 0.76, 0); box(p, 0.08, 0.76, 0.6, '#4a3622', -0.6, 0.38, 0); box(p, 0.08, 0.76, 0.6, '#4a3622', 0.6, 0.38, 0); box(p, 0.5, 0.35, 0.05, '#101015', 0, 1.0, -0.2, { emissive: '#224466', emissiveIntensity: 0.4 }); break;
    case 'toilet': box(p, 0.45, 0.4, 0.6, '#f2f2f2', 0, 0.2, 0.05); box(p, 0.45, 0.6, 0.2, '#f2f2f2', 0, 0.7, -0.3); break;
    case 'bath': box(p, 0.9, 0.55, 1.8, '#f2f2f2', 0, 0.28, 0); box(p, 0.7, 0.04, 1.6, '#8fd0f0', 0, 0.5, 0); break;
    case 'rug': box(p, 1.6, 0.03, 1.6, '#b5523b', 0, 0.03, 0); break;
    case 'plant': box(p, 0.4, 0.4, 0.4, '#8a5a3a', 0, 0.2, 0); { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), M('#2f7a3a')); l.position.y = 0.8; p.add(l); } break;
    case 'lamp': box(p, 0.06, 1.5, 0.06, '#444', 0, 0.75, 0); box(p, 0.4, 0.3, 0.4, '#f5e6b0', 0, 1.6, 0, { emissive: '#f5e6b0', emissiveIntensity: 0.6 }); break;
    default: box(p, 0.8, 0.8, 0.8, '#888', 0, 0.4, 0);
  }
}

// opts.inside: draw walls cut away low on the sides facing the camera, hide the roof. opts.roof: draw the roof.
export function buildHouse(cfg, opts = {}) {
  const g = new THREE.Group();
  const { x0, z0 } = origin(cfg), { w, d } = cfg;
  const wallC = cfg.mats.wall, trimC = cfg.mats.trim;
  // foundation + floor
  box(g, w * CELL + 0.6, cfg.found === 'raised' ? 0.5 : 0.2, d * CELL + 0.6, '#8d8a84', x0 + w, cfg.found === 'raised' ? -0.2 : -0.08, z0 + d);
  const fl = box(g, w * CELL, 0.06, d * CELL, FLOOR_COL[cfg.mats.floor] || '#a9794a', x0 + w, 0.03, z0 + d);
  fl.receiveShadow = true;
  // walls
  const wall = (len, x, z, alongX, e, full) => {
    if (e === E.NONE) return;
    const hh = full ? H : (opts.inside ? 1.1 : H);
    const mk = (l, h, y, off, c, extra) => box(g, alongX ? l : T, h, alongX ? T : l, c || wallC, alongX ? x + off : x, y, alongX ? z : z + off, extra);
    if (e === E.WALL) { mk(CELL, hh, hh / 2, CELL / 2); mk(CELL + 0.05, 0.08, hh, CELL / 2, trimC); }
    else if (e === E.WINDOW) {
      mk(CELL, 0.9, 0.45, CELL / 2); if (hh > 1.1) { mk(CELL, hh - 2.1, (hh + 2.1) / 2, CELL / 2); mk(CELL * 0.8, 1.2, 1.5, CELL / 2, '#bfe3f5', { transparent: true, opacity: 0.45, emissive: '#bfe3f5', emissiveIntensity: 0.2 }); }
    } else if (e === E.DOOR) {
      mk(0.25, 2.2, 1.1, 0.12, trimC); mk(0.25, 2.2, 1.1, CELL - 0.12, trimC); mk(CELL, hh - 2.2 > 0 ? hh - 2.2 : 0.01, hh > 2.2 ? (hh + 2.2) / 2 : 2.2, CELL / 2, wallC);
    }
  };
  for (let j = 0; j <= d; j++) for (let i = 0; i < w; i++) wall(CELL, x0 + i * CELL, z0 + j * CELL, true, cfg.h[j][i], j === 0 || !opts.inside);
  for (let j = 0; j < d; j++) for (let i = 0; i <= w; i++) wall(CELL, x0 + i * CELL, z0 + j * CELL, false, cfg.v[j][i], true);
  // front door leaf seen from outside
  if (!opts.inside) { const dc = doorColumn(cfg); box(g, 1.5, 2.1, 0.08, '#4a2f1f', x0 + dc * CELL + 1, 1.05, z0 + d * CELL + 0.02); }
  for (const f of cfg.furn) furniture(g, f, x0 + f.x * CELL + 1, z0 + f.z * CELL + 1);
  if (opts.roof) {
    const rc = cfg.roof.c, W = w * CELL + 1, D = d * CELL + 1, cx = x0 + w, cz = z0 + d;
    if (cfg.roof.t === 'flat') { box(g, W, 0.25, D, rc, cx, H + 0.12, cz); box(g, W, 0.35, 0.15, '#cfcfcf', cx, H + 0.3, cz - D / 2); }
    else {
      const rise = cfg.roof.t === 'hip' ? 1.3 : 1.8;
      const sh = new THREE.Shape(); sh.moveTo(-D / 2, 0); sh.lineTo(D / 2, 0); sh.lineTo(0, rise); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false });
      const m = new THREE.Mesh(geo, M(rc)); m.rotation.y = Math.PI / 2; m.position.set(cx - W / 2, H, cz); g.add(m);
    }
  }
  return g;
}

export function disposeHouse(g) { g.traverse((n) => { if (n.geometry && !boxes.has(n.geometry.__k) && n.geometry.type !== 'BoxGeometry') n.geometry.dispose(); }); }
