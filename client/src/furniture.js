// Adulthood: draws the furniture, paint, and walls in your Home. The server decides what you own and where it is.
// This file only turns that into simple 3D shapes. Only your own Home shows any of this.
import * as THREE from 'three';

const wood = '#8a5a35';
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const box = (w, h, d, color, x = 0, y = 0, z = 0, extra) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra));
  m.position.set(x, y + h / 2, z);
  return m;
};

// Each builder makes the piece centered on its footprint, facing the front (+z).
// w and d are the footprint in cells. c is the catalog entry (its color, its tier from 0 = basic up, and how many tiers there are).
const shade = (hex, k) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
const BUILD = {
  bed: (w, d, c) => {
    const g = new THREE.Group();
    const col = c.color || '#e8e0d0';
    if (c.frame) {
      const high = 0.8 + c.tier * 0.08;
      g.add(box(w - 0.05, 0.4, d - 0.05, c.frame), box(w - 0.2, 0.3, d - 0.2, col, 0.05, 0.4, 0), box(0.5, 0.15, Math.min(d - 0.5, 1.2), '#ffffff', -w / 2 + 0.45, 0.7, 0), box(0.14, high, d - 0.05, shade(c.frame, 1.15), -w / 2 + 0.07, 0, 0));
      if (d > 1.5) g.add(box(0.5, 0.15, 0.7, '#ffffff', -w / 2 + 0.45, 0.7, 0.6), box(w - 0.3, 0.06, d - 0.3, shade(col, 1.25), 0.1, 0.7, 0));
    } else {
      g.add(box(w - 0.1, c.tier === 0 ? 0.12 : 0.3 + c.tier * 0.03, d - 0.1, col, 0, 0.02, 0), box(0.5, 0.12, d - 0.4, '#ffffff', -w / 2 + 0.45, 0.35, 0));
    }
    return g;
  },
  tv: (w, d, c) => {
    const g = new THREE.Group();
    const glow = { emissive: '#223355', emissiveIntensity: 0.4 + c.tier * 0.15 };
    if (c.tier === 0) {
      g.add(box(0.8, 0.5, 0.6, '#5a4a3a'), box(0.55, 0.4, 0.1, '#1a1c22', 0, 0.55, 0.28, glow), box(0.7, 0.55, 0.55, '#3a3128', 0, 0.5, -0.05));
      return g;
    }
    const sw = Math.max(0.7, w - 0.3);
    g.add(box(sw, 0.45, 0.6, '#8a5a35'), box(sw - 0.05, 0.25 + 0.2 * (w - 0.7) + c.tier * 0.04, 0.07, '#111318', 0, 0.45, 0, glow));
    if (c.tier >= 4) g.add(box(0.25, 1.2, 0.3, '#222', -w / 2 + 0.12, 0, 0.1), box(0.25, 1.2, 0.3, '#222', w / 2 - 0.12, 0, 0.1));
    return g;
  },
  fridge: (w, d, c) => {
    const g = new THREE.Group();
    const col = c.color || '#dfe5ea';
    const h = c.tier === 0 ? 1.0 : 1.9;
    g.add(box(w - 0.15, h, 0.8, col));
    if (w > 1.5) g.add(box(0.03, h - 0.1, 0.03, '#555', 0, 0.05, 0.42), box(0.04, 0.5, 0.05, '#7d8791', -0.1, 1.0, 0.43), box(0.04, 0.5, 0.05, '#7d8791', 0.1, 1.0, 0.43));
    else g.add(box(0.04, 0.5, 0.05, '#7d8791', 0.3, h * 0.55, 0.42));
    if (c.tier === 3) g.add(box(0.3, 0.2, 0.03, '#4af', 0.0, 1.3, 0.42, { emissive: '#4af', emissiveIntensity: 0.8 }));
    return g;
  },
  desk: (w, d, c) => {
    const g = new THREE.Group();
    const col = c.color || '#8a5a35';
    g.add(box(w - 0.1, 0.1, d - 0.1, col, 0, 0.75, 0), box(0.1, 0.75, 0.1, col, -w / 2 + 0.15, 0, 0), box(0.1, 0.75, 0.1, col, w / 2 - 0.15, 0, 0));
    const screens = c.tier >= 3 ? 3 : c.tier >= 2 ? 2 : c.tier === 0 ? 0 : 1;
    for (let i = 0; i < screens; i++) g.add(box(0.55, 0.38, 0.05, '#15171c', (i - (screens - 1) / 2) * 0.65, 0.9, -0.15, { emissive: '#1d3a5c', emissiveIntensity: 0.5 }));
    if (c.tier >= 2) g.add(box(w - 0.3, 0.3, 0.1, shade(col, 0.8), 0, 0.45, 0.3));
    return g;
  },
  cool: (w, d, c) => {
    const g = new THREE.Group();
    if (c.tier === 2) {
      g.add(box(0.7, 1.7, 0.4, '#eef1f4'), box(0.55, 0.06, 0.05, '#9aa4ad', 0, 1.3, 0.21), box(0.55, 0.06, 0.05, '#9aa4ad', 0, 1.15, 0.21), box(0.1, 0.08, 0.03, '#4af', 0.2, 1.55, 0.21, { emissive: '#4af', emissiveIntensity: 1 }));
    } else if (c.tier === 1) {
      g.add(box(0.35, 1.5, 0.35, '#2d3036'), box(0.3, 1.2, 0.04, '#111', 0, 0.2, 0.2));
    } else {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 16), mat('#d4dbe0'));
      disc.rotation.x = Math.PI / 2;
      disc.position.set(0, 1.35, 0.05);
      g.add(box(0.4, 0.06, 0.4, '#444'), box(0.05, 1.2, 0.05, '#666'), disc);
    }
    return g;
  },
  sofa: (w, d, c) => {
    const g = new THREE.Group();
    const col = c.color || '#7a4f9a';
    if (c.id === 'bench') {
      g.add(box(w - 0.1, 0.1, d - 0.2, col, 0, 0.45, 0), box(0.1, 0.45, d - 0.2, shade(col, 0.8), -w / 2 + 0.15, 0, 0), box(0.1, 0.45, d - 0.2, shade(col, 0.8), w / 2 - 0.15, 0, 0));
      return g;
    }
    g.add(box(w - 0.1, 0.45, d - 0.1, col, 0, 0, 0), box(w - 0.1, 0.55, 0.25, shade(col, 0.85), 0, 0.45, -d / 2 + 0.2), box(0.2, 0.3, d - 0.1, shade(col, 0.85), -w / 2 + 0.15, 0.45, 0), box(0.2, 0.3, d - 0.1, shade(col, 0.85), w / 2 - 0.15, 0.45, 0));
    if (c.id === 'sofa_sect') g.add(box(0.9, 0.45, 0.9, col, w / 2 - 0.5, 0, 0.9), box(0.2, 0.3, 0.9, shade(col, 0.85), w / 2 - 0.1, 0.45, 0.9));
    if (c.tier >= 2) for (let i = 0; i < 3; i++) g.add(box(0.12, 0.3, 0.6, '#f2e6c9', -w / 2 + 0.5 + i * 0.5, 0.45, -0.1));
    return g;
  },
  chair: (w, d, c) => {
    const g = new THREE.Group();
    const col = c.color || '#7a4f9a';
    if (c.id === 'chair') {
      g.add(box(w - 0.1, 0.1, d - 0.2, col, 0, 0.45, 0), box(0.1, 0.45, d - 0.2, shade(col, 0.8), -w / 2 + 0.15, 0, 0), box(0.1, 0.45, d - 0.2, shade(col, 0.8), w / 2 - 0.15, 0, 0));
      return g;
    }
    g.add(box(w - 0.1, 0.45, d - 0.1, col, 0, 0, 0), box(w - 0.1, 0.55, 0.25, shade(col, 0.85), 0, 0.45, -d / 2 + 0.2), box(0.2, 0.3, d - 0.1, shade(col, 0.85), -w / 2 + 0.15, 0.45, 0), box(0.2, 0.3, d - 0.1, shade(col, 0.85), w / 2 - 0.15, 0.45, 0));
    if (c.id === 'chair_sect') g.add(box(0.9, 0.45, 0.9, col, w / 2 - 0.5, 0, 0.9), box(0.2, 0.3, 0.9, shade(col, 0.85), w / 2 - 0.1, 0.45, 0.9));
    if (c.tier >= 2) for (let i = 0; i < 3; i++) g.add(box(0.12, 0.3, 0.6, '#f2e6c9', -w / 2 + 0.5 + i * 0.5, 0.45, -0.1));
    return g;
  },
  rug: (w, d, c) => {
    const g = new THREE.Group();
    const col = c.color || '#c0583d';
    g.add(box(w - 0.1, 0.03, d - 0.1, col, 0, 0, 0));
    if (c.tier >= 1) g.add(box(w - 0.5, 0.035, d - 0.5, shade(col, 1.25), 0, 0, 0));
    if (c.tier >= 3) g.add(box(w - 0.9, 0.04, d - 0.9, shade(col, 0.7), 0, 0, 0));
    return g;
  },
  art: (w, d, c) => {
    const g = new THREE.Group();
    const col = c.color || '#e9a23b';
    if (c.id === 'art_bronze') {
      const fig = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), mat(col, { metalness: 0.6, roughness: 0.35 }));
      fig.position.y = 1.35;
      g.add(box(0.5, 0.9, 0.5, '#d9d4cb'), fig, box(0.12, 0.5, 0.12, col, 0, 0.9, 0));
      return g;
    }
    const frame = c.tier >= 3 ? '#c9a227' : '#2b2b33';
    g.add(box(0.7, 0.9, 0.06, frame, 0, 0.55, 0), box(0.58, 0.78, 0.07, col, 0, 0.61, 0), box(0.06, 0.55, 0.06, '#8a5a35', -0.2, 0, 0.1), box(0.06, 0.55, 0.06, '#8a5a35', 0.2, 0, 0.1));
    return g;
  },
  lamp: (w, d, c) => {
    const g = new THREE.Group();
    const lit = { emissive: '#ffd36b', emissiveIntensity: 0.9 };
    const mk = (r1, r2, h, y) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 12), mat('#ffe9a8', lit));
      m.position.y = y;
      return m;
    };
    if (c.id === 'lamp_charge') return (g.add(box(0.2, 0.05, 0.2, '#333'), mk(0.1, 0.12, 0.35, 0.22)), g);
    if (c.id === 'lamp') return (g.add(box(0.3, 0.05, 0.3, '#333'), box(0.05, 0.6, 0.05, '#444'), mk(0.2, 0.3, 0.35, 0.8)), g);
    if (c.id === 'lamp_floor') return (g.add(box(0.35, 0.05, 0.35, '#222'), box(0.05, 1.5, 0.05, '#c9a227'), mk(0.18, 0.34, 0.4, 1.6)), g);
    g.add(box(0.4, 0.05, 0.4, '#222'), box(0.05, 1.8, 0.05, '#c9a227'));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mat('#fff3c4', lit));
      bulb.position.set(Math.cos(a) * 0.35, 2.0, Math.sin(a) * 0.35);
      g.add(bulb, box(0.35, 0.03, 0.03, '#c9a227', Math.cos(a) * 0.17, 1.85, Math.sin(a) * 0.17));
    }
    return g;
  },
  plant: (w, d, c) => {
    const g = new THREE.Group();
    const potC = new THREE.Mesh(new THREE.CylinderGeometry(c.tier === 0 ? 0.15 : 0.28, c.tier === 0 ? 0.12 : 0.2, c.tier === 0 ? 0.25 : 0.4, 12), mat('#b5654a'));
    potC.position.y = c.tier === 0 ? 0.12 : 0.2;
    g.add(potC);
    if (c.tier === 0) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat('#6fb36f'));
      l.position.y = 0.35;
      g.add(l);
    } else if (c.tier === 1) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), mat('#3f9b55'));
      l.position.y = 0.8;
      g.add(l);
    } else {
      g.add(box(0.1, 1.2, 0.1, '#6b4a2a', 0, 0.3, 0));
      for (let i = 0; i < (c.tier === 2 ? 5 : 4); i++) {
        const a = (i / 5) * Math.PI * 2;
        const l = new THREE.Mesh(new THREE.SphereGeometry(c.tier === 2 ? 0.22 : 0.3, 10, 8), mat(c.tier === 2 ? '#2f8f4a' : '#3d7f3a'));
        l.scale.y = c.tier === 2 ? 0.5 : 0.9;
        l.position.set(Math.cos(a) * 0.3, 1.5 + (i % 2) * 0.1, Math.sin(a) * 0.3);
        g.add(l);
      }
    }
    return g;
  },
  shelf: (w, d, c) => {
    const g = new THREE.Group();
    const colors = ['#c44', '#4a7', '#47c', '#ca4', '#a5c'];
    const books = (n, rows, width, z) => {
      for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) g.add(box(0.1, 0.35, 0.3, colors[(i + r) % 5], -width / 2 + 0.1 + i * 0.16, 0.2 + r * 0.5, z));
    };
    if (c.id === 'shelf_crate') {
      for (let r = 0; r < 3; r++) g.add(box(0.8, 0.3, 0.4, r % 2 ? '#b98b55' : '#a97b45', 0, r * 0.31, 0));
      return g;
    }
    if (c.id === 'shelf_glass') {
      g.add(box(0.9, 1.9, 0.45, '#5b3d2a'), box(0.8, 1.7, 0.02, '#cfe8f2', 0, 0.1, 0.23, { transparent: true, opacity: 0.35 }));
      for (let r = 0; r < 3; r++) g.add(box(0.2, 0.25, 0.2, '#c9a227', (r - 1) * 0.25, 0.3 + r * 0.5, 0));
      return g;
    }
    if (c.id === 'shelf_library') {
      g.add(box(w - 0.1, 2.2, 0.4, '#3a2a20'));
      books(Math.floor((w - 0.3) / 0.16), 4, w - 0.3, 0.12);
      return g;
    }
    g.add(box(0.9, 1.7, 0.4, '#8a5a35'));
    books(5, 3, 0.9, 0.12);
    return g;
  },
};

// One piece on its own, for the shop thumbnails. Returns null for a kind that has no model.
export function buildPiece(def) {
  const build = BUILD[def.group];
  if (!build) return null;
  const g = new THREE.Group();
  g.add(build(def.size[0], def.size[1], def));
  return g;
}

export function createFurniture(scene) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  // Floor paint (a flat sheet just above the ground) and the back and left walls.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), mat('#a8794a'));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.005;
  floor.visible = false;
  const wallMat = mat('#6b5646', { transparent: true, opacity: 0.92 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.2), wallMat);
  back.position.set(0, 1.6, -10);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.2), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-10, 1.6, 0);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.2), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(10, 1.6, 0);
  // The front wall too, so the room can be turned: each wall is drawn only from the inside, so the walls
  // between the camera and the room simply do not show and you always see into the room.
  const front = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.2), wallMat);
  front.rotation.y = Math.PI;
  front.position.set(0, 1.6, 10);
  const items = new THREE.Group();
  root.add(floor, back, left, right, front, items);

  const ring = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45 }));
  ring.visible = false;
  root.add(ring);

  let data = null;
  let selected = null;
  const meshes = new Map(); // uid -> group
  let lampOn = false;
  let lightsOn = true;

  function rebuild() {
    for (const g of meshes.values()) items.remove(g);
    meshes.clear();
    if (!data) return;
    for (const it of data.items) {
      if (!it.placed) continue;
      const def = data.catalog.find((c) => c.id === it.id);
      const build = def ? BUILD[def.group] : null;
      if (!def || !build) continue;
      const [w, d] = def.size;
      const g = new THREE.Group();
      g.add(build(w, d, def));
      const fw = it.rot ? d : w;
      const fd = it.rot ? w : d;
      g.position.set(it.x + fw / 2, 0, it.z + fd / 2);
      if (it.rot) g.rotation.y = Math.PI / 2;
      g.userData = { fw, fd };
      items.add(g);
      meshes.set(it.uid, g);
    }
    mark();
  }
  function mark() {
    const g = selected !== null ? meshes.get(selected) : null;
    ring.visible = Boolean(g);
    if (g) {
      ring.scale.set(g.userData.fw, 1, g.userData.fd);
      ring.position.set(g.position.x, 0.03, g.position.z);
    }
  }

  return {
    // New furniture data from the server (or null on log out).
    set(info) {
      data = info;
      if (!info) {
        rebuild();
        return;
      }
      floor.visible = Boolean(info.floorColor);
      if (info.floorColor) floor.material.color.set(info.floorColor);
      wallMat.color.set(info.wallColor || '#6b5646');
      lampOn = Boolean(info.effects && info.effects.lamp);
      lightsOn = info.lights !== false;
      rebuild();
    },
    // Only show all this while you are inside your Home.
    show(on) {
      root.visible = Boolean(on);
    },
    select(uid) {
      selected = uid;
      mark();
    },
    hasLamp: () => lampOn,
    lightsOn: () => lightsOn,
  };
}