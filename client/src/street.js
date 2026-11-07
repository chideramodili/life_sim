// Adulthood: the city. Roads, sidewalks, blocks, buildings with doors, parks, trees, street lights, bus stops, railway, traffic, and people.
// The server sends the layout (server/city.js). This file only draws it. Everything is made from code (no model files),
// and every repeated thing is merged or instanced so phones can draw the whole city.
import * as THREE from 'three';
import { iconOf } from './mapUi.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { whenNpcReady, upgradeToNpc, moveNpc } from './npc.js';
import { viaductSegs, createViaductTrains } from './trains.js';

const rnd = (seed) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const clamp8 = (n) => Math.max(0, Math.min(255, n));

function canvasTex(w, h, draw, rx = 1, ry = 1, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, base, spread, count, size = 1) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const r = rnd(7);
  const R = parseInt(base.slice(1, 3), 16), G = parseInt(base.slice(3, 5), 16), B = parseInt(base.slice(5, 7), 16);
  for (let i = 0; i < count; i++) {
    const v = Math.floor((r() - 0.5) * spread);
    g.fillStyle = `rgb(${clamp8(R + v)},${clamp8(G + v)},${clamp8(B + v)})`;
    g.fillRect(r() * w, r() * h, size, size);
  }
}
function label(text, accent, w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#17141f';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = accent;
  g.lineWidth = 8;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#ffffff';
  g.font = `700 ${h * 0.45}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4, w - 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ----- Facade looks. Each kind has a wall picture and a "lit windows" picture that glows at night. -----
const FACADES = {
  apt:       { wall: '#a8553f', win: '#2a3446', style: 'grid', cols: 4, rows: 1, brick: true },
  office:    { wall: '#9aa4ae', win: '#3a4a5e', style: 'grid', cols: 6, rows: 1 },
  tower:     { wall: '#4a7fa6', win: '#9fd0ea', style: 'glass', cols: 8, rows: 1 },
  civic:     { wall: '#cfc6b4', win: '#2e3a4c', style: 'grid', cols: 5, rows: 1, columns: true },
  shop:      { wall: '#d9c9a8', win: '#35495f', style: 'shopfront', cols: 3, rows: 1 },
  campus:    { wall: '#e4e0d4', win: '#4a7a9a', style: 'glass', cols: 6, rows: 1 },
  warehouse: { wall: '#8a8e96', win: '#2a2d33', style: 'metal', cols: 4, rows: 1 },
  house:     { wall: '#e8dcc4', win: '#2a3446', style: 'house', cols: 3, rows: 1 },
  police:    { wall: '#5a6fa0', win: '#1e2a40', style: 'grid', cols: 5, rows: 1 },
  terminal:  { wall: '#b8a888', win: '#2e3a4c', style: 'grid', cols: 6, rows: 1, columns: true },
  factory:   { wall: '#8a5a48', win: '#2a2d33', style: 'metal', cols: 3, rows: 1, brick: true },
  bigbox:    { wall: '#c9c4b8', win: '#35495f', style: 'shopfront', cols: 6, rows: 1 },
};

function facadeMaps(kind, seed) {
  const f = FACADES[kind];
  const W = 256, H = 128;
  const r = rnd(seed);
  const lit = [];
  const wall = canvasTex(W, H, (g, w, h) => {
    speckle(g, w, h, f.wall, 22, 1500, 2);
    if (f.brick) {
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      for (let y = 0; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 8) % 2 ? 0 : 8; x < w; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); } }
    }
    const cw = w / f.cols;
    for (let c = 0; c < f.cols; c++) {
      const x = c * cw + cw * 0.18, ww = cw * 0.64;
      let y = 18, hh = 72;
      if (f.style === 'glass') { y = 6; hh = 116; }
      if (f.style === 'shopfront') { y = 30; hh = 90; }
      if (f.style === 'metal') { y = 22; hh = 40; }
      if (f.style === 'house') { y = 30; hh = 50; }
      g.fillStyle = f.win;
      g.fillRect(x, y, ww, hh);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x, y, ww, hh * 0.35);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + ww / 2 - 1, y, 2, hh);
      lit.push([x, y, ww, hh, r() > 0.4]);
      if (f.columns) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(c * cw, 0, 6, h); }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, h - 6, w, 6);
    if (f.style === 'shopfront') { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, w, 24); }
  });
  const glow = canvasTex(W, H, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    for (const [x, y, ww, hh, on] of lit) { if (!on) continue; g.fillStyle = '#ffd88a'; g.fillRect(x + 2, y + 2, ww - 4, hh - 4); }
  }, 1, 1, true);
  return { wall, glow };
}

// A box whose texture repeats nicely: UVs are scaled by the real size in metres.
function boxGeo(w, h, d, tw, th) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // faces in order: +x, -x, +y, -y, +z, -z (4 vertices each)
  const widths = [d, d, w, w, w, w];
  const heights = [h, h, d, d, h, h];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * (widths[f] / tw), uv.getY(k) * (heights[f] / th));
    }
  }
  return g;
}
function gableGeo(w, d, h) {
  // a pitched roof: a triangle prism running along the width
  const g = new THREE.BufferGeometry();
  const hw = w / 2, hd = d / 2;
  const v = [
    -hw, 0, -hd, hw, 0, -hd, 0, h, -hd,   // back triangle
    -hw, 0, hd, 0, h, hd, hw, 0, hd,      // front triangle
    -hw, 0, -hd, 0, h, -hd, 0, h, hd,  -hw, 0, -hd, 0, h, hd, -hw, 0, hd, // left slope
    hw, 0, -hd, hw, 0, hd, 0, h, hd,   hw, 0, -hd, 0, h, hd, 0, h, -hd,   // right slope
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((v.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

const DEFAULT_TINTS = ['#ffffff', '#f3e3d0', '#dfe9f2', '#f2d9d0', '#e6f0dc', '#e9e2f4'];

export function createCity(info) {
  const city = info.city;
  const TINTS = (info.theme && info.theme.tints) || DEFAULT_TINTS;
  const GRASS = (info.theme && info.theme.grass) || '#587a40';
  const root = new THREE.Group();
  const disposables = [];
  const winMats = [];
  const lotObjs = [];
  const nightMats = [];
  const standard = (opts) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.9, ...opts }); disposables.push(m); return m; };
  const track = (o) => { disposables.push(o); return o; };

  // ---------- Ground, roads, sidewalks ----------
  const grass = track(canvasTex(128, 128, (g, w, h) => speckle(g, w, h, GRASS, 38, 3000), 70, 50));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(city.bx * 2 + 400, city.bz * 2 + 400), standard({ map: grass }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  root.add(ground);

  const asphalt = track(canvasTex(256, 256, (g, w, h) => speckle(g, w, h, '#3a3a3f', 30, 5000)));
  asphalt.repeat.set(1, 1);
  const asphaltMat = (len) => { const t = asphalt.clone(); t.needsUpdate = true; t.repeat.set(len / 10, 1); disposables.push(t); return standard({ map: t, roughness: 0.95 }); };
  const lineTex = track(canvasTex(64, 8, (g, w, h) => { g.fillStyle = '#f2d34f'; g.fillRect(0, 0, w * 0.5, h); }));
  const lineMat = (len) => { const t = lineTex.clone(); t.needsUpdate = true; t.repeat.set(len / 5, 1); disposables.push(t); const m = new THREE.MeshBasicMaterial({ map: t, transparent: true }); disposables.push(m); return m; };
  const paving = track(canvasTex(128, 128, (g, w, h) => {
    speckle(g, w, h, '#a8a39a', 22, 1800);
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  }));
  const plane = (w, d, mat, x, z, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); root.add(m); return m; };

  // Sidewalk paving under every block (a little bigger than the block, so it runs to the kerb).
  const pavMat = standard({ map: paving, roughness: 0.9 });
  const sidewalkSlabs = [];
  for (const rw of city.roadsEW) sidewalkSlabs.push({ x: 0, z: rw.z, w: city.bx * 2, d: (rw.half + 3.2) * 2 });
  for (const rs of city.roadsNS) sidewalkSlabs.push({ x: rs.x, z: 0, w: (rs.half + 3.2) * 2, d: city.bz * 2 });
  paving.repeat.set(1, 1);
  for (const s of sidewalkSlabs) { const t = paving.clone(); t.needsUpdate = true; t.repeat.set(s.w / 4, s.d / 4); disposables.push(t); plane(s.w, s.d, standard({ map: t, roughness: 0.9 }), s.x, s.z, 0.02); }
  // Roads on top of the sidewalk strips.
  for (const rw of city.roadsEW) {
    plane(city.bx * 2, rw.half * 2, asphaltMat(city.bx * 2), 0, rw.z, 0.04);
    plane(city.bx * 2, 0.18, lineMat(city.bx * 2), 0, rw.z, 0.06);
  }
  for (const rs of city.roadsNS) {
    const m = plane(city.bz * 2, rs.half * 2, asphaltMat(city.bz * 2), rs.x, 0, 0.05);
    m.rotation.z = Math.PI / 2;
    const l = plane(city.bz * 2, 0.18, lineMat(city.bz * 2), rs.x, 0, 0.07);
    l.rotation.z = Math.PI / 2;
  }
  // Zebra crossings at the boulevard intersections.
  const zebraTex = track(canvasTex(64, 64, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); g.fillStyle = '#e8e8e8'; for (let i = 0; i < 4; i++) g.fillRect(i * 16, 0, 9, h); }));
  const zebraMat = new THREE.MeshBasicMaterial({ map: zebraTex, transparent: true });
  disposables.push(zebraMat);
  for (const rs of city.roadsNS) {
    for (const sz of [-1, 1]) { const z = plane(2.4, 14, zebraMat, rs.x + sz * 0, sz * 0, 0.075); z.visible = false; }
    const a = plane(2.6, 9, zebraMat, rs.x - 6.5, 0, 0.075); a.rotation.z = Math.PI / 2; a.scale.set(1, 1, 1);
  }

  // Parks, lawns and yards.
  const parkMat = standard({ color: '#4f8a3c', roughness: 1 });
  const lawnMat = standard({ color: '#5f9a48', roughness: 1 });
  const yardMat = standard({ color: '#6aa44f', roughness: 1 });
  for (const pk of city.parks) {
    const m = plane(pk.x1 - pk.x0, pk.z1 - pk.z0, pk.kind === 'park' ? parkMat : pk.kind === 'lawn' ? lawnMat : yardMat, (pk.x0 + pk.x1) / 2, (pk.z0 + pk.z1) / 2, 0.03);
    m.renderOrder = 1;
  }

  // ---------- Buildings: merged by look so the whole city is a handful of draw calls ----------
  const byKind = {};
  const roofs = [];
  const gables = [];
  const stalls = [];
  const r = rnd(11);
  for (const b of city.buildings) {
    if (b.k === 'stall') { stalls.push(b); continue; }
    if (b.k === 'platform') { const g = new THREE.BoxGeometry(b.w, b.h, b.d); g.translate(b.x, b.h / 2, b.z); roofs.push({ g, c: '#8a8a90' }); continue; }
    if (!FACADES[b.k]) continue;
    const g = boxGeo(b.w, b.h, b.d, 12, 6);
    g.translate(b.x, b.h / 2, b.z);
    (byKind[b.k] = byKind[b.k] || []).push(g);
    if (b.k === 'house') {
      const roof = gableGeo(b.w + 0.8, b.d + 0.8, 2.2);
      roof.rotateY(r() > 0.5 ? 0 : Math.PI / 2 * 0);
      roof.translate(b.x, b.h, b.z);
      gables.push(roof);
    } else {
      const rg = new THREE.BoxGeometry(b.w + 0.5, 0.5, b.d + 0.5);
      rg.translate(b.x, b.h + 0.25, b.z);
      roofs.push({ g: rg, c: b.k === 'tower' || b.k === 'office' ? '#4a4e58' : b.k === 'warehouse' || b.k === 'bigbox' ? '#6a6e76' : '#5a4a44' });
    }
  }
  for (const [kind, list] of Object.entries(byKind)) {
    const maps = facadeMaps(kind, kind.length * 31);
    disposables.push(maps.wall, maps.glow);
    const mat = standard({ map: maps.wall, emissiveMap: maps.glow, emissive: '#ffd88a', emissiveIntensity: 0, roughness: 0.85 });
    winMats.push(mat);
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    root.add(mesh);
    for (const g of list) g.dispose();
  }
  // Roofs, grouped by colour.
  const byColor = {};
  for (const rf of roofs) (byColor[rf.c] = byColor[rf.c] || []).push(rf.g);
  for (const [c, list] of Object.entries(byColor)) { root.add(new THREE.Mesh(mergeGeometries(list), standard({ color: c }))); for (const g of list) g.dispose(); }
  if (gables.length) { const m = new THREE.Mesh(mergeGeometries(gables), standard({ color: '#8a3f30', side: THREE.DoubleSide })); root.add(m); for (const g of gables) g.dispose(); }
  // Market stalls (small, coloured canopies).
  if (stalls.length) {
    const colors = ['#e74c3c', '#27ae60', '#f39c12', '#3a86ff', '#9b59b6'];
    const tops = stalls.map((b, i) => { const g = new THREE.BoxGeometry(b.w, 0.15, b.d); g.translate(b.x, b.h, b.z); return g; });
    const legs = stalls.map((b) => { const g = new THREE.BoxGeometry(b.w * 0.9, b.h * 0.9, b.d * 0.9); g.translate(b.x, (b.h * 0.9) / 2, b.z); return g; });
    root.add(new THREE.Mesh(mergeGeometries(legs), standard({ color: '#8a6a45' })));
    stalls.forEach((b, i) => { const t = new THREE.Mesh(tops[i], standard({ color: colors[i % colors.length] })); root.add(t); });
  }

  // Shopfront signs, awnings and glowing doors for every place you can enter.
  const doorGlow = [];
  for (const [id, d] of Object.entries(city.doors)) {
    const name = info.names[id];
    const accent = info.accents[id];
    const south = d.f === 's'; // the building's front faces south (toward +z)
    const sgn = south ? 1 : -1;
    const fz = d.z - sgn * -0.6; // on the building front
    const frameMat = standard({ color: accent, emissive: accent, emissiveIntensity: 0.15 });
    doorGlow.push(frameMat);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3, 3.6, 0.3), frameMat);
    frame.position.set(d.x, 1.8, d.z + sgn * 0.5);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.2, 0.34), standard({ color: '#1d1a24', roughness: 0.4 }));
    panel.position.set(d.x, 1.6, d.z + sgn * 0.5);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 0.9), standard({ color: accent, transparent: true, opacity: 0.55 }));
    awn.position.set(d.x, 3.9, d.z + sgn * 0.1);
    const tex = label(name, accent);
    disposables.push(tex);
    const signMat = new THREE.MeshBasicMaterial({ map: tex });
    disposables.push(signMat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), signMat);
    sign.position.set(d.x, 5.6, d.z + sgn * 0.7);
    if (!south) sign.rotation.y = Math.PI;
    root.add(frame, panel, awn, sign);
    // A round icon floating above the sign, so you can tell what a place is from far away.
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.96)';
    g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = accent; g.stroke();
    g.font = '64px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(iconOf(id), 64, 70);
    const itex = new THREE.CanvasTexture(cv);
    disposables.push(itex);
    const imat = new THREE.SpriteMaterial({ map: itex, transparent: true });
    disposables.push(imat);
    const icon = new THREE.Sprite(imat);
    icon.scale.set(3, 3, 1);
    icon.position.set(d.x, 8.4, d.z + sgn * 0.7);
    root.add(icon);
  }
  void doorGlow;

  // Your own house gets a marker so you can find it.
  if (Number.isInteger(info.myPlot) && city.plots[info.myPlot]) {
    const pl = city.plots[info.myPlot];
    const sgn = pl.f === 's' ? 1 : -1;
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.5, 6), standard({ color: '#e8e8e8' }));
    pole.position.y = 2.25;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ color: '#8be0b0', side: THREE.DoubleSide }));
    cloth.position.set(0.8, 4.0, 0);
    flag.add(pole, cloth);
    flag.position.set(pl.x + 3.6, 0, pl.z + sgn * 0.5);
    root.add(flag);
    const tex = label('Your home', '#8be0b0', 384, 96);
    disposables.push(tex);
    const signMat = new THREE.MeshBasicMaterial({ map: tex });
    disposables.push(signMat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), signMat);
    sign.position.set(pl.door.x, 3.4, pl.door.z + (pl.f === 's' ? 0.3 : -0.3) * 0 + sgn * 0.9);
    if (pl.f !== 's') sign.rotation.y = Math.PI;
    root.add(sign);
    // the door itself
    const dm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.2), standard({ color: '#8be0b0', emissive: '#8be0b0', emissiveIntensity: 0.2 }));
    dm.position.set(pl.door.x, 1.2, pl.door.z + sgn * 0.3);
    root.add(dm);
  }

  // ---------- Railway ----------
  if (city.tracks.length) {
    const ties = [], rails = [];
    for (const t of city.tracks) {
      const len = t.x1 - t.x0, cz = (t.z0 + t.z1) / 2, cx = (t.x0 + t.x1) / 2;
      const bed = new THREE.BoxGeometry(len, 0.15, t.z1 - t.z0 + 1); bed.translate(cx, 0.08, cz); ties.push(bed);
      for (const dz of [-0.7, 0.7]) { const rl = new THREE.BoxGeometry(len, 0.15, 0.12); rl.translate(cx, 0.22, cz + dz); rails.push(rl); }
      for (let x = t.x0; x < t.x1; x += 1.4) { const tie = new THREE.BoxGeometry(0.35, 0.1, 2.2); tie.translate(x, 0.18, cz); ties.push(tie); }
    }
    root.add(new THREE.Mesh(mergeGeometries(ties), standard({ color: '#4a3f36' })));
    root.add(new THREE.Mesh(mergeGeometries(rails), standard({ color: '#b8b8c0', metalness: 0.6 })));
  }

  let viaductTrains = null;
  // ---------- The Express viaduct: an elevated railway over the Boulevard and the cross streets, reaching every station ----------
  {
    const Y = 7.2;
    const segs = viaductSegs(city);
    viaductTrains = createViaductTrains(root, segs, Y);
    const deck = [], rails = [], pillars = [], ties = [];
    const isJunction = (x, z) => city.roadsNS.some((r) => Math.abs(x - r.x) < 8) && city.roadsEW.some((r) => Math.abs(z - r.z) < 9);
    for (const [x0, z0, x1, z1] of segs) {
      const len = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const mk = (lx, ly, lz, px, py, pz) => { const g = new THREE.BoxGeometry(alongX ? lx : lz, ly, alongX ? lz : lx); g.translate(px, py, pz); return g; };
      deck.push(mk(len, 0.7, 4.2, cx, Y, cz));
      for (const d of [-0.75, 0.75]) rails.push(alongX ? (() => { const g = new THREE.BoxGeometry(len, 0.14, 0.12); g.translate(cx, Y + 0.5, cz + d); return g; })() : (() => { const g = new THREE.BoxGeometry(0.12, 0.14, len); g.translate(cx + d, Y + 0.5, cz); return g; })());
      for (let t = -len / 2 + 0.7; t < len / 2; t += 1.5) { const g = new THREE.BoxGeometry(alongX ? 0.3 : 2.1, 0.1, alongX ? 2.1 : 0.3); g.translate(alongX ? cx + t : cx, Y + 0.42, alongX ? cz : cz + (z1 > z0 ? t : -t) * (z1 > z0 ? 1 : 1)); ties.push(g); }
      for (let t = 0; t <= len; t += 14) {
        const px = alongX ? x0 + (x1 > x0 ? t : -t) : x0, pz = alongX ? z0 : z0 + (z1 > z0 ? t : -t);
        if (isJunction(px, pz)) continue;
        const h = new THREE.CylinderGeometry(0.45, 0.6, Y - 0.35, 8); h.translate(px, (Y - 0.35) / 2, pz); pillars.push(h);
      }
    }
    root.add(new THREE.Mesh(mergeGeometries(deck), standard({ color: '#9a9a9f' })));
    root.add(new THREE.Mesh(mergeGeometries(pillars), standard({ color: '#85858a' })));
    root.add(new THREE.Mesh(mergeGeometries(ties), standard({ color: '#4a3f36' })));
    root.add(new THREE.Mesh(mergeGeometries(rails), standard({ color: '#c8c8d0', metalness: 0.6 })));
  }

  // ---------- Trees and street lights (instanced) ----------
  const rt = rnd(5);
  const treeSpots = [];
  // along the sidewalks, between buildings, and inside parks
  for (const rw of city.roadsEW) for (let x = -city.bx + 6; x < city.bx - 4; x += 11) for (const s of [-1, 1]) treeSpots.push([x + rt() * 2, rw.z + s * (rw.half + 1.6)]);
  for (const rs of city.roadsNS) for (let z = -city.bz + 6; z < city.bz - 4; z += 11) for (const s of [-1, 1]) treeSpots.push([rs.x + s * (rs.half + 1.6), z + rt() * 2]);
  for (const pk of city.parks) {
    if (pk.kind === 'park') for (let i = 0; i < 40; i++) treeSpots.push([pk.x0 + 2 + rt() * (pk.x1 - pk.x0 - 4), pk.z0 + 2 + rt() * (pk.z1 - pk.z0 - 4)]);
    else if (pk.kind === 'lawn') for (let i = 0; i < 14; i++) treeSpots.push([pk.x0 + 2 + rt() * (pk.x1 - pk.x0 - 4), pk.z0 + 2 + rt() * (pk.z1 - pk.z0 - 4)]);
    else for (let i = 0; i < 6; i++) treeSpots.push([pk.x0 + 2 + rt() * (pk.x1 - pk.x0 - 4), pk.z0 + 2 + rt() * (pk.z1 - pk.z0 - 4)]);
  }
  // keep trees out of buildings and doorways
  const inBuilding = (x, z, pad = 1.2) => city.buildings.some((b) => b.k !== 'stall' && Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad);
  const doorNear = (x, z) => Object.values(city.doors).some((d) => Math.hypot(x - d.x, z - d.z) < 4) || city.plots.some((p) => Math.hypot(x - p.door.x, z - p.door.z) < 3);
  // Roads are for traffic: no trees or poles on any road surface, including where a side street crosses.
  const onRoad = (x, z, pad = 0.4) => city.roadsEW.some((r) => Math.abs(z - r.z) < r.half + pad) || city.roadsNS.some((r) => Math.abs(x - r.x) < r.half + pad);
  const trees = city.trees ? city.trees : treeSpots.filter(([x, z]) => !inBuilding(x, z) && !doorNear(x, z) && !onRoad(x, z) && Math.abs(x) < city.bx && Math.abs(z) < city.bz);
  const trunkI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6), standard({ color: '#5a4030' }), trees.length);
  const crownI = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 0), standard({ color: '#3f7a3a' }), trees.length);
  const m4 = new THREE.Matrix4();
  trees.forEach(([x, z], i) => {
    m4.makeTranslation(x, 1.2, z); trunkI.setMatrixAt(i, m4);
    const s = (trees[i] && trees[i][2]) || 0.8 + rt() * 0.7;
    m4.makeScale(s, s, s).setPosition(x, 3.0, z); crownI.setMatrixAt(i, m4);
  });
  trunkI.geometry && disposables.push(trunkI.geometry, crownI.geometry);
  root.add(trunkI, crownI);

  // Street lights: a tapering pole on a base, a curved arm reaching over the road, a lamp housing, and a soft pool of light on the ground at night.
  const poleMat = standard({ color: '#34353c', metalness: 0.55, roughness: 0.45 });
  const bulbMat = standard({ color: '#fff3c4', emissive: '#ffd77a', emissiveIntensity: 0.1 });
  nightMats.push(bulbMat);
  const haloMat = new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const lights = [];
  // [x, z, dx, dz]: where the pole stands and which way its arm leans (toward the road)
  for (const rw of city.roadsEW) for (let x = -city.bx + 12; x < city.bx - 6; x += 22) for (const s of [-1, 1]) lights.push([x, rw.z + s * (rw.half + 0.6), 0, -s]);
  for (const rs of city.roadsNS) for (let z = -city.bz + 12; z < city.bz - 6; z += 22) for (const s of [-1, 1]) lights.push([rs.x + s * (rs.half + 0.6), z, -s, 0]);
  const lightsOk = lights.filter(([x, z]) => !inBuilding(x, z, 0.3) && !onRoad(x, z, 0.2));
  const N = lightsOk.length;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.12, 6.2, 8), poleMat, N);
  const bases = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8), poleMat, N);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 1.7), poleMat, N);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.14, 0.95), poleMat, N);
  const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.05, 0.8), bulbMat, N);
  const halos = new THREE.InstancedMesh(new THREE.CircleGeometry(4.2, 20), haloMat, N);
  const q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const put = (inst, i, x, y, z, ry, rx = 0) => { e4.set(rx, ry, 0); q4.setFromEuler(e4); m4.compose(v3.set(x, y, z), q4, one); inst.setMatrixAt(i, m4); };
  lightsOk.forEach(([x, z, dx, dz], i) => {
    const ry = Math.atan2(dx, dz); // the arm's long side points toward the road
    put(poles, i, x, 3.1, z, 0);
    put(bases, i, x, 0.25, z, 0);
    put(arms, i, x + dx * 0.85, 6.15, z + dz * 0.85, ry);
    put(heads, i, x + dx * 1.55, 6.05, z + dz * 1.55, ry);
    put(bulbs, i, x + dx * 1.55, 5.96, z + dz * 1.55, ry);
    put(halos, i, x + dx * 1.55, 0.07, z + dz * 1.55, 0, -Math.PI / 2);
  });
  disposables.push(poles.geometry, bases.geometry, arms.geometry, heads.geometry, bulbs.geometry, halos.geometry, haloMat);
  root.add(poles, bases, arms, heads, bulbs, halos);

  // ---------- Bus stops ----------
  const stopBlue = standard({ color: '#2c5aa0' });
  const stopRoof = standard({ color: '#2c5aa0', transparent: true, opacity: 0.55 });
  const benchMat = standard({ color: '#6b4a2f' });
  const busTex = label('BUS', '#3a86ff', 256, 128);
  disposables.push(busTex);
  const busSign = new THREE.MeshBasicMaterial({ map: busTex });
  disposables.push(busSign);
  for (const s of city.busStops) {
    const g = new THREE.Group();
    for (const dx of [-1.4, 1.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), stopBlue); p.position.set(dx, 1.3, 0); g.add(p); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 1.4), stopRoof);
    top.position.y = 2.65;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.5), benchMat);
    bench.position.set(0, 0.5, 0);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), busSign);
    sg.position.set(0, 3.1, 0);
    g.add(top, bench, sg);
    g.position.set(s.x, 0.04, s.z);
    root.add(g);
  }

  // ---------- Traffic: the cars are driven by the server (they brake for people and are solid) ----------
  const CAR_COLORS = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#2c3e50', '#27ae60', '#e67e22', '#7f8c8d', '#f1c40f'];
  const carBody = new THREE.BoxGeometry(2.0, 0.7, 4.2);
  const carTop = new THREE.BoxGeometry(1.7, 0.6, 2.2);
  const carWheel = new THREE.BoxGeometry(2.1, 0.5, 0.7);
  const MAXC = 100;
  const bodyI = new THREE.InstancedMesh(carBody, standard({ color: '#ffffff', roughness: 0.5, metalness: 0.2 }), MAXC);
  const topI = new THREE.InstancedMesh(carTop, standard({ color: '#9fd0ea', roughness: 0.2 }), MAXC);
  const wheelF = new THREE.InstancedMesh(carWheel, standard({ color: '#111111' }), MAXC);
  const wheelB = new THREE.InstancedMesh(carWheel, standard({ color: '#111111' }), MAXC);
  disposables.push(carBody, carTop, carWheel);
  root.add(bodyI, topI, wheelF, wheelB);
  const parked = (info.parked || []).slice(0, 40);
  // Painted parking bays: two short white lines across the kerb at each bay.
  {
    const bays = info.bays || [];
    const lineMat = new THREE.MeshBasicMaterial({ color: '#e8e8e0' });
    const lineGeo = new THREE.BoxGeometry(0.14, 0.02, 2.6);
    const lines = new THREE.InstancedMesh(lineGeo, lineMat, Math.max(1, bays.length * 2));
    const m = new THREE.Matrix4();
    bays.forEach((b, i) => {
      for (const k of [-1, 1]) {
        // bays run along x, so the dividing lines run across the road (along z)
        m.makeTranslation(b.x + k * 3.2, 0.06, b.z);
        lines.setMatrixAt(i * 2 + (k > 0 ? 1 : 0), m);
      }
    });
    lines.count = bays.length * 2;
    disposables.push(lineGeo, lineMat);
    root.add(lines);
  }
  const tmp = new THREE.Object3D();
  const place = (inst, i, x, y, z, ry, dy = 0, dz = 0) => {
    tmp.position.set(x + Math.sin(ry) * dz, y + dy, z + Math.cos(ry) * dz);
    tmp.rotation.set(0, ry, 0);
    tmp.updateMatrix();
    inst.setMatrixAt(i, tmp.matrix);
  };
  const setCar = (i, x, z, ry) => {
    place(bodyI, i, x, 0.55, z, ry);
    place(topI, i, x, 1.05, z, ry, 0, -0.2);
    place(wheelF, i, x, 0.3, z, ry, 0, 1.4);
    place(wheelB, i, x, 0.3, z, ry, 0, -1.4);
  };
  parked.forEach((p, i) => { bodyI.setColorAt(i, new THREE.Color(CAR_COLORS[p.color % CAR_COLORS.length])); setCar(i, p.x, p.z, p.ry); });
  const friendSigns = [];
  let density = 0.7;
  let shown = -1, shownAcc = 0;
  let people = []; // players, so the walkers can give way
  let live = []; // moving cars: { x, z, ry, tx, tz, try }
  bodyI.count = topI.count = wheelF.count = wheelB.count = parked.length;
  bodyI.instanceColor && (bodyI.instanceColor.needsUpdate = true);
  function setCars(list) {
    const n = Math.min(list.length, MAXC - parked.length);
    while (live.length < n) {
      const [x, z, ry] = list[live.length];
      live.push({ x, z, ry, tx: x, tz: z, tr: ry });
    }
    for (let i = 0; i < n; i++) {
      const [x, z, ry, col] = list[i];
      const c = live[i];
      if (Math.abs(x - c.x) > 30 || Math.abs(z - c.z) > 30) { c.x = x; c.z = z; c.ry = ry; } // wrapped around the map
      c.tx = x; c.tz = z; c.tr = ry;
      if (c.col !== col) { c.col = col; bodyI.setColorAt(parked.length + i, new THREE.Color(CAR_COLORS[col % CAR_COLORS.length])); bodyI.instanceColor.needsUpdate = true; }
    }
    live.length = n;
    bodyI.count = topI.count = wheelF.count = wheelB.count = parked.length + n;
  }

  // ---------- People walking on the sidewalks ----------
  const SKIN = ['#f1c9a5', '#d9a47a', '#b07a54', '#8a5a3c', '#6b4129', '#4a2c1c'];
  const CLOTH = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400', '#7f8c8d', '#e8e8e8', '#2c3e50'];
  const walkers = [];
  const rp = rnd(404);
  const bodyGeo = new THREE.BoxGeometry(0.5, 0.65, 0.32), legGeo = new THREE.BoxGeometry(0.4, 0.55, 0.3), headGeo = new THREE.SphereGeometry(0.2, 8, 6);
  disposables.push(bodyGeo, legGeo, headGeo);
  const legMat = standard({ color: '#2c3e50' });
  for (let i = 0; i < 90; i++) {
    const g = new THREE.Group();
    const topCol = CLOTH[Math.floor(rp() * CLOTH.length)], skinCol = SKIN[Math.floor(rp() * SKIN.length)];
    const torso = new THREE.Mesh(bodyGeo, standard({ color: topCol }));
    torso.position.y = 0.9;
    const legs = new THREE.Mesh(legGeo, legMat);
    legs.position.y = 0.28;
    const head = new THREE.Mesh(headGeo, standard({ color: skinCol }));
    head.position.y = 1.42;
    g.add(torso, legs, head);
    // a path along one sidewalk
    const horizontal = rp() > 0.3;
    const rd = horizontal ? city.roadsEW[Math.floor(rp() * city.roadsEW.length)] : city.roadsNS[Math.floor(rp() * city.roadsNS.length)];
    const side = rp() > 0.5 ? 1 : -1;
    const off = rd.half + 1.2 + rp() * 1.0;
    const wk = { g, horizontal, fixed: (horizontal ? rd.z : rd.x) + side * off, t: (rp() - 0.5) * 2 * (horizontal ? city.bx : city.bz) * 0.95, dir: rp() > 0.5 ? 1 : -1, speed: 1.1 + rp() * 0.6, ph: rp() * 6 };
    g.position.set(horizontal ? wk.t : wk.fixed, 0, horizontal ? wk.fixed : wk.t);
    root.add(g);
    wk.look = { skin: skinCol, top: topCol, bottom: ['#2c3e50', '#3a3a48', '#5a4a3a', '#1f2a3a'][Math.floor(rp() * 4)], shoes: ['#e8e8e8', '#222222', '#6b4a2a'][Math.floor(rp() * 3)] };
    walkers.push(wk);
  }
  // When the light 3D person has loaded, the pedestrians become people.
  whenNpcReady(() => { for (const w of walkers) upgradeToNpc(w.g, w.look); });

  // ---------- People waiting at bus stops, train platforms and the terminal ----------
  const waiters = [];
  {
    const rw = rnd(777);
    const nearestRoad = (x, z) => {
      let best = null, bd = 1e9;
      for (const r of city.roadsEW) { const d = Math.abs(z - r.z); if (d < bd) { bd = d; best = { x, z: r.z }; } }
      for (const r of city.roadsNS) { const d = Math.abs(x - r.x); if (d < bd) { bd = d; best = { x: r.x, z }; } }
      return best;
    };
    const person = (x, z, faceX, faceZ) => {
      const g = new THREE.Group();
      const topCol = CLOTH[Math.floor(rw() * CLOTH.length)], skinCol = SKIN[Math.floor(rw() * SKIN.length)];
      const torso = new THREE.Mesh(bodyGeo, standard({ color: topCol })); torso.position.y = 0.9;
      const legs = new THREE.Mesh(legGeo, legMat); legs.position.y = 0.28;
      const head = new THREE.Mesh(headGeo, standard({ color: skinCol })); head.position.y = 1.42;
      g.add(torso, legs, head);
      g.position.set(x, 0, z);
      g.rotation.y = Math.atan2(faceX - x, faceZ - z);
      root.add(g);
      waiters.push({ g, look: { skin: skinCol, top: topCol, bottom: ['#2c3e50', '#3a3a48', '#5a4a3a', '#1f2a3a'][Math.floor(rw() * 4)], shoes: ['#e8e8e8', '#222222', '#6b4a2a'][Math.floor(rw() * 3)] } });
    };
    for (const s of city.busStops) {
      const road = nearestRoad(s.x, s.z);
      const n = 1 + Math.floor(rw() * 3);
      for (let i = 0; i < n; i++) person(s.x + (rw() - 0.5) * 3.2, s.z + (rw() - 0.5) * 1.4, road.x, road.z);
    }
    for (const st of city.stations || []) {
      const n = st.id === 'terminal' ? 6 : 4;
      for (let i = 0; i < n; i++) person(st.x + (rw() - 0.5) * 10, st.z + 1 + rw() * 3, st.x + (rw() - 0.5) * 6, st.z + 10);
    }
    // the Airport forecourt
    const ad = city.doors && city.doors.airport;
    if (ad) for (let i = 0; i < 5; i++) person(ad.x + (rw() - 0.5) * 12, ad.z + (ad.f === 's' ? 2.2 : -2.2) + (rw() - 0.5), ad.x + (rw() - 0.5) * 6, ad.z);
  }
  whenNpcReady(() => { for (const w of waiters) upgradeToNpc(w.g, w.look); });

  // Traffic lights: a post at each corner of every junction with a lamp facing its road. Two corners show the east-west
  // light, two show the north-south light. The server sends where we are in the 40 s cycle; the cycle is repeated here.
  const sigMats = { x: new THREE.MeshBasicMaterial({ color: '#22cc55' }), z: new THREE.MeshBasicMaterial({ color: '#cc2222' }) };
  const sigPostMat = standard({ color: '#2b2f36' });
  const sigState = (axis, ph) => {
    const P = [[0, 17, 'green', 'red'], [17, 20, 'yellow', 'red'], [20, 21, 'red', 'red'], [21, 35, 'red', 'green'], [35, 38, 'red', 'yellow'], [38, 40, 'red', 'red']];
    for (const [f, t, ew, ns] of P) if (ph >= f && ph < t) return axis === 'x' ? ew : ns;
    return 'red';
  };
  const SIG_COL = { green: '#22cc55', yellow: '#f2c230', red: '#e03030' };
  for (const rs of city.roadsNS) for (const rw of city.roadsEW) {
    [[1, 1, 'x'], [-1, -1, 'x'], [1, -1, 'z'], [-1, 1, 'z']].forEach(([sx, sz, axis]) => {
      const px = rs.x + sx * (rs.half + 0.7), pz = rw.z + sz * (rw.half + 0.7);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 6), sigPostMat);
      post.position.set(px, 1.8, pz);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.35), sigPostMat);
      head.position.set(px, 3.8, pz);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.1), sigMats[axis]);
      // The lamp faces the traffic it controls (along the road's axis, toward the junction).
      if (axis === 'x') lamp.position.set(px - sx * 0.2, 3.8, pz); else lamp.position.set(px, 3.8, pz - sz * 0.2);
      if (axis === 'x') lamp.rotation.y = Math.PI / 2;
      root.add(post, head, lamp);
    });
  }
  let copMeshes = [];
  const sigApi = {
    setSignals(ph) { for (const ax of ['x', 'z']) sigMats[ax].color.set(SIG_COL[sigState(ax, ph)]); },
  };

  return {
    group: root,
    setCars,
    ...sigApi,
    // Friends' houses get a name sign above them (green dot when they are online).
    setFriendHomes(list) {
      for (const sp of friendSigns) { root.remove(sp); sp.material.map.dispose(); sp.material.dispose(); }
      friendSigns.length = 0;
      for (const h of list) {
        const pl = city.plots[h.plot];
        if (!pl || h.plot === info.myPlot) continue;
        const c = document.createElement('canvas');
        c.width = 384; c.height = 96;
        const g = c.getContext('2d');
        g.fillStyle = 'rgba(20,28,24,0.78)';
        g.fillRect(0, 0, 384, 96);
        g.fillStyle = h.online ? '#3ddc97' : '#8a8f98';
        g.beginPath(); g.arc(30, 48, 12, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff';
        g.font = 'bold 40px system-ui, sans-serif';
        g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(`${String(h.name).slice(0, 14)}'s house`, 54, 50);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
        sp.scale.set(8, 2, 1);
        sp.position.set(pl.x, 8, pl.z);
        sp.renderOrder = 5;
        root.add(sp);
        friendSigns.push(sp);
      }
    },
    // Lots for sale and player businesses. list = [{ id, owner, kind, name, level, soldOut }] from the server.
    setLots(list) {
      for (const o of lotObjs) { root.remove(o); o.traverse((n) => { if (n.material) { if (n.material.map) n.material.map.dispose(); n.material.dispose(); } if (n.geometry) n.geometry.dispose(); }); }
      lotObjs.length = 0;
      const KCOL = { cafe: '#ff9f1c', minimart: '#4cc9a0', salon: '#ff7eb6', gym: '#7ad7ff' };
      const sign = (text, color, x, y, z) => {
        const c = document.createElement('canvas');
        c.width = 512; c.height = 112;
        const g = c.getContext('2d');
        g.fillStyle = 'rgba(20,18,30,0.85)'; g.fillRect(0, 0, 512, 112);
        g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(4, 4, 504, 104);
        g.fillStyle = '#fff'; g.font = 'bold 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, 256, 58, 480);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
        sp.scale.set(9, 2, 1); sp.position.set(x, y, z); sp.renderOrder = 5;
        return sp;
      };
      for (const st of list || []) {
        const l = city.lots && city.lots[st.id];
        if (!l) continue;
        const grp = new THREE.Group();
        const sgn = l.f === 's' ? 1 : -1; // towards the street
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.d), new THREE.MeshStandardMaterial({ color: st.kind ? '#9a9486' : '#8a7a5a', roughness: 1 }));
        ground.rotation.x = -Math.PI / 2; ground.position.set(l.x, 0.04, l.z); grp.add(ground);
        // fence along the back and sides
        const fm = new THREE.MeshStandardMaterial({ color: '#d9d2c0', roughness: 0.9 });
        const back = new THREE.Mesh(new THREE.BoxGeometry(l.w, 1, 0.15), fm); back.position.set(l.x, 0.5, l.z - sgn * l.d / 2); grp.add(back);
        for (const sx of [-1, 1]) { const sd = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, l.d), fm); sd.position.set(l.x + sx * l.w / 2, 0.5, l.z); grp.add(sd); }
        if (st.kind) {
          const col = KCOL[st.kind] || '#ffc857';
          const shop = new THREE.Mesh(new THREE.BoxGeometry(Math.min(10, l.w - 3), 3.4 + (st.level || 1) * 0.5, 5), new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.9 }));
          shop.position.set(l.x, shop.geometry.parameters.height / 2, l.z - sgn * 1.5); grp.add(shop);
          const awn = new THREE.Mesh(new THREE.BoxGeometry(Math.min(10, l.w - 3) + 0.6, 0.25, 2), new THREE.MeshStandardMaterial({ color: col }));
          awn.position.set(l.x, 3, l.z + sgn * 1.4); grp.add(awn);
          grp.add(sign(st.soldOut ? `${st.name} · sold out` : st.name, col, l.x, 5.6 + (st.level || 1) * 0.5, l.z));
        } else if (st.owner) {
          grp.add(sign(`${String(st.owner).slice(0, 12)}'s lot`, '#8a8f98', l.x, 3.2, l.z));
        } else {
          grp.add(sign(`FOR SALE · ₦${Math.round(l.price / 1000)}k`, '#3ddc97', l.x, 3.2, l.z));
        }
        root.add(grp);
        lotObjs.push(grp);
      }
    },
    setPeople(list) { people = list; },
    // 0..1: how busy the pavements are (more people at rush hour, fewer at night)
    setDensity(l) { density = l; },
    // d is how bright the world is, 1 in daylight and near 0 at night.
    setLight(d) {
      for (const m of nightMats) m.emissiveIntensity = 0.1 + (1 - d) * 2.4;
      haloMat.opacity = Math.max(0, 0.8 - d) * 0.45;
      for (const m of winMats) m.emissiveIntensity = Math.max(0, (0.75 - d) * 1.6);
    },
    update(dt) {
      if (viaductTrains) viaductTrains.update(Date.now());
      for (const w of waiters) moveNpc(w.g, dt, 0);
      const k = 1 - Math.exp(-dt * 14);
      live.forEach((c, i) => {
        c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k;
        c.ry += ((((c.tr - c.ry) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * k;
        setCar(parked.length + i, c.x, c.z, c.ry);
      });
      bodyI.instanceMatrix.needsUpdate = topI.instanceMatrix.needsUpdate = wheelF.instanceMatrix.needsUpdate = wheelB.instanceMatrix.needsUpdate = true;
      // Pavements fill up before the rush and empty at night: one person appears or leaves every quarter second.
      const goal = Math.round(walkers.length * (0.3 + 0.7 * density));
      if (shown < 0) shown = goal;
      shownAcc += dt;
      while (shownAcc > 0.25) { shownAcc -= 0.25; shown += Math.sign(goal - shown); }
      walkers.forEach((w, i) => { w.g.visible = i < shown; });
      for (const w of walkers) {
        if (!w.g.visible) continue;
        // Stop for people in the way and step around them instead of walking through.
        const px = w.horizontal ? w.t : w.fixed + (w.off || 0), pz = w.horizontal ? w.fixed + (w.off || 0) : w.t;
        let blocked = false, push = 0;
        for (const q of people) {
          const dx = q.x - px, dz = q.z - pz;
          if (Math.abs(dx) > 2.2 || Math.abs(dz) > 2.2) continue;
          const ahead = w.horizontal ? dx * w.dir : dz * w.dir;
          const side = w.horizontal ? dz : dx;
          if (ahead > -0.3 && ahead < 2.0 && Math.abs(side) < 1.0) { blocked = ahead < 1.2; push += side > 0 ? -1 : 1; }
        }
        w.off = Math.max(-1.1, Math.min(1.1, (w.off || 0) + (push ? push * dt * 1.6 : -Math.sign(w.off || 0) * Math.min(Math.abs(w.off || 0), dt * 0.5))));
        if (!blocked) w.t += w.dir * w.speed * dt;
        const lim = (w.horizontal ? city.bx : city.bz) - 4;
        if (w.t > lim) w.dir = -1;
        if (w.t < -lim) w.dir = 1;
        if (!blocked) w.ph += dt * 6;
        const f = w.fixed + (w.off || 0);
        w.g.position.set(w.horizontal ? w.t : f, w.g.userData.npc ? 0 : Math.abs(Math.sin(w.ph)) * 0.04, w.horizontal ? f : w.t);
        moveNpc(w.g, dt, blocked ? 0 : w.speed);
        w.g.rotation.y = w.horizontal ? (w.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (w.dir > 0 ? 0 : Math.PI);
      }
    },
    dispose() {
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const d of disposables) d.dispose && d.dispose();
    },
  };
}
export { createCity as createStreet };
