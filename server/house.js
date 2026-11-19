// Adulthood: player-built houses. Rules only (no network, no database), like race.js and rent.js.
// A house is a small grid: every cell is 2 m x 2 m. Between cells (and around the outside) there are "edges", and each edge is
// nothing, a wall, a door or a window. A house is saved as a short piece of data (see validate), never as a 3D model, and the browser
// builds it again from that data whenever it is needed. The same code can later build apartments, shops and offices.
//
// Layout of the data:
//  { v:1, w, d, found, roof:{t,c}, mats:{wall,trim,floor}, h:[[..]], v:[[..]], furn:[{k,x,z,r}] }
//  h[j][i]  the edge running along the x direction at the top of row j (j = 0..d), column i (0..w-1)   -> h[0] is the BACK, h[d] the FRONT
//  v[j][i]  the edge running along the z direction at the left of column i (i = 0..w), row j (0..d-1)
//  The front (south, h[d]) is the side with the street door.

export const CELL = 2;
export const EDGE = { NONE: 0, WALL: 1, DOOR: 2, WINDOW: 3 };
export const LIMITS = { minW: 3, maxW: 6, minD: 3, maxD: 4, maxFurn: 24 };
export const FRONT_Z = 9.5;      // inside the building room, the front door line is here (the room's exit door is at the same place)
export const WALL_T = 0.3;       // wall thickness for collisions
export const FOUNDATIONS = { slab: { label: 'Concrete slab', cell: 4000 }, raised: { label: 'Raised foundation', cell: 6500 } };
export const ROOFS = { flat: { label: 'Flat roof', cell: 2500 }, gable: { label: 'Pitched roof', cell: 3500 }, hip: { label: 'Hip roof', cell: 4200 } };
export const FLOORS = {
  concrete: { label: 'Polished concrete', cell: 800 },
  wood: { label: 'Wooden floor', cell: 1800 },
  tile: { label: 'Tiles', cell: 2200 },
  carpet: { label: 'Carpet', cell: 1500 },
};
export const PRICES = { wallOuter: 3500, wallInner: 2200, door: 8000, window: 5000 };
export const FURN = {
  bed:      { label: 'Bed', price: 18000, solid: true, icon: '🛏️' },
  sofa:     { label: 'Sofa', price: 22000, solid: true, icon: '🛋️' },
  table:    { label: 'Dining table', price: 12000, solid: true, icon: '🍽️' },
  chair:    { label: 'Chair', price: 4000, solid: false, icon: '🪑' },
  tv:       { label: 'TV stand', price: 25000, solid: true, icon: '📺' },
  fridge:   { label: 'Fridge', price: 20000, solid: true, icon: '🧊' },
  stove:    { label: 'Cooker', price: 16000, solid: true, icon: '🍳' },
  wardrobe: { label: 'Wardrobe', price: 14000, solid: true, icon: '🚪' },
  desk:     { label: 'Desk', price: 9000, solid: true, icon: '🖥️' },
  toilet:   { label: 'Toilet', price: 10000, solid: true, icon: '🚽' },
  bath:     { label: 'Bath', price: 15000, solid: true, icon: '🛁' },
  rug:      { label: 'Rug', price: 3000, solid: false, icon: '🟫' },
  plant:    { label: 'Plant', price: 2500, solid: false, icon: '🪴' },
  lamp:     { label: 'Floor lamp', price: 3500, solid: false, icon: '💡' },
};
export const FURN_IDS = Object.keys(FURN);
export const REFUND_SHARE = 0.5;                  // selling or removing parts pays back this share of what they cost

const HEX = /^#[0-9a-fA-F]{6}$/;
const clampInt = (n, a, b) => Math.max(a, Math.min(b, Math.floor(Number(n) || 0)));
const col = (c, dflt) => (typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : dflt);

// The biggest house a lot can take: leaves about 1.5 m of yard on every side.
export const maxCells = (lot) => ({ w: Math.max(0, Math.min(LIMITS.maxW, Math.floor((lot.w - 3) / CELL))), d: Math.max(0, Math.min(LIMITS.maxD, Math.floor((lot.d - 3) / CELL))) });

const grid = (rows, cols, fill) => Array.from({ length: rows }, () => Array(cols).fill(fill));

// A fresh, empty house with only outer walls, one door and two windows.
export function blank(w = 4, d = 3) {
  const h = grid(d + 1, w, EDGE.NONE), v = grid(d, w + 1, EDGE.NONE);
  for (let i = 0; i < w; i++) { h[0][i] = EDGE.WALL; h[d][i] = EDGE.WALL; }
  for (let j = 0; j < d; j++) { v[j][0] = EDGE.WALL; v[j][w] = EDGE.WALL; }
  const door = Math.floor(w / 2);
  h[d][door] = EDGE.DOOR;
  if (w >= 3) { h[d][0] = EDGE.WINDOW; h[d][w - 1] = EDGE.WINDOW; }
  h[0][Math.floor(w / 2)] = EDGE.WINDOW;
  return { v: 1, w, d, found: 'slab', roof: { t: 'gable', c: '#b5523b' }, mats: { wall: '#efe6d2', trim: '#8a6f4d', floor: 'wood' }, h, v, furn: [] };
}

// Which column is the front door in (or -1)?
export const doorColumn = (cfg) => cfg.h[cfg.d].findIndex((e) => e === EDGE.DOOR);

// Read any saved data safely and return a clean house, or null. Everything unknown is dropped or repaired.
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const w = clampInt(raw.w, LIMITS.minW, LIMITS.maxW), d = clampInt(raw.d, LIMITS.minD, LIMITS.maxD);
  const edge = (x) => { const n = Math.floor(Number(x)); return n >= 0 && n <= 3 ? n : 0; };
  const h = grid(d + 1, w, 0), v = grid(d, w + 1, 0);
  for (let j = 0; j <= d; j++) for (let i = 0; i < w; i++) h[j][i] = edge(raw.h && raw.h[j] && raw.h[j][i]);
  for (let j = 0; j < d; j++) for (let i = 0; i <= w; i++) v[j][i] = edge(raw.v && raw.v[j] && raw.v[j][i]);
  const furn = [], used = new Set();
  for (const f of Array.isArray(raw.furn) ? raw.furn.slice(0, LIMITS.maxFurn) : []) {
    if (!f || typeof f.k !== 'string' || !Object.hasOwn(FURN, f.k)) continue;
    const x = Math.floor(Number(f.x)), z = Math.floor(Number(f.z));
    if (!(x >= 0 && x < w && z >= 0 && z < d) || used.has(`${x},${z}`)) continue;
    used.add(`${x},${z}`);
    furn.push({ k: f.k, x, z, r: clampInt(f.r, 0, 3) });
  }
  const m = raw.mats && typeof raw.mats === 'object' ? raw.mats : {};
  const roof = raw.roof && typeof raw.roof === 'object' ? raw.roof : {};
  return {
    v: 1, w, d,
    found: Object.hasOwn(FOUNDATIONS, raw.found) ? raw.found : 'slab',
    roof: { t: Object.hasOwn(ROOFS, roof.t) ? roof.t : 'gable', c: col(roof.c, '#b5523b') },
    mats: { wall: col(m.wall, '#efe6d2'), trim: col(m.trim, '#8a6f4d'), floor: Object.hasOwn(FLOORS, m.floor) ? m.floor : 'wood' },
    h, v, furn,
  };
}

const isPerimH = (j, d) => j === 0 || j === d;
const isPerimV = (i, w) => i === 0 || i === w;

// Can you walk from one cell to the next? Only through an open edge or a door.
const open = (e) => e === EDGE.NONE || e === EDGE.DOOR;

// Check a house against the rules. Returns { ok, why, cfg, cost } (cfg is the clean version; cost is itemised).
export function validate(raw, maxW = LIMITS.maxW, maxD = LIMITS.maxD) {
  const cfg = sanitize(raw);
  if (!cfg) return { ok: false, why: 'That house plan is not valid.' };
  if (cfg.w > maxW || cfg.d > maxD) return { ok: false, why: `That lot only fits a house up to ${maxW} x ${maxD} cells (${maxW * CELL} x ${maxD * CELL} m).`, cfg };
  const { w, d, h, v } = cfg;
  for (let i = 0; i < w; i++) for (const j of [0, d]) if (h[j][i] === EDGE.NONE) return { ok: false, why: 'The outside of the house needs a wall, window or door all the way round. There is a gap.', cfg };
  for (let j = 0; j < d; j++) for (const i of [0, w]) if (v[j][i] === EDGE.NONE) return { ok: false, why: 'The outside of the house needs a wall, window or door all the way round. There is a gap.', cfg };
  // One street door, on the front side, and no other outside doors.
  let outerDoors = 0, front = -1;
  for (let i = 0; i < w; i++) { if (h[0][i] === EDGE.DOOR) outerDoors++; if (h[d][i] === EDGE.DOOR) { outerDoors++; front = i; } }
  for (let j = 0; j < d; j++) { if (v[j][0] === EDGE.DOOR) outerDoors++; if (v[j][w] === EDGE.DOOR) outerDoors++; }
  if (outerDoors !== 1 || front < 0) return { ok: false, why: 'A house needs exactly one outside door, and it must be on the front (the side facing the street).', cfg };
  // The door must be near enough to the middle that the whole house fits in the room.
  if (2 * front + 1 > 9.5 || 2 * (w - front) - 1 > 9.5) return { ok: false, why: 'Move the front door closer to the middle of the front wall.', cfg };
  // Every cell must be reachable from the door (no sealed rooms).
  const seen = grid(d, w, false), q = [[front, d - 1]];
  seen[d - 1][front] = true;
  while (q.length) {
    const [i, j] = q.pop();
    const tryGo = (ni, nj, e) => { if (ni < 0 || nj < 0 || ni >= w || nj >= d || seen[nj][ni] || !open(e)) return; seen[nj][ni] = true; q.push([ni, nj]); };
    tryGo(i, j - 1, h[j][i]); tryGo(i, j + 1, h[j + 1][i]); tryGo(i - 1, j, v[j][i]); tryGo(i + 1, j, v[j][i + 1]);
  }
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) if (!seen[j][i]) return { ok: false, why: `One of the rooms cannot be reached (row ${j + 1}, column ${i + 1}). Put a door or an opening in the wall so you can walk in.`, cfg };
  // Furniture must not block the front door cell or the only path into a room: keep it simple, the door cell stays free of solid items.
  for (const f of cfg.furn) if (FURN[f.k].solid && f.x === front && f.z === d - 1) return { ok: false, why: 'Keep the cell just inside the front door free of big furniture.', cfg };
  return { ok: true, why: '', cfg, cost: costOf(cfg) };
}

// What the house costs, itemised.
export function costOf(cfg) {
  const { w, d, h, v } = cfg, cells = w * d;
  const parts = { foundation: cells * FOUNDATIONS[cfg.found].cell, roof: cells * ROOFS[cfg.roof.t].cell, floor: cells * FLOORS[cfg.mats.floor].cell, walls: 0, doors: 0, windows: 0, furniture: 0 };
  const edge = (e, outer) => { if (e === EDGE.WALL) parts.walls += outer ? PRICES.wallOuter : PRICES.wallInner; else if (e === EDGE.DOOR) { parts.doors += PRICES.door; } else if (e === EDGE.WINDOW) { parts.windows += PRICES.window; } };
  for (let j = 0; j <= d; j++) for (let i = 0; i < w; i++) edge(h[j][i], isPerimH(j, d));
  for (let j = 0; j < d; j++) for (let i = 0; i <= w; i++) edge(v[j][i], isPerimV(i, w));
  for (const f of cfg.furn) parts.furniture += FURN[f.k].price;
  const total = Object.values(parts).reduce((n, x) => n + x, 0);
  return { ...parts, total };
}

// Changing a built house: pay the extra, get a share back for what you take away.
export const renovationCharge = (oldTotal, newTotal) => (newTotal >= oldTotal ? newTotal - oldTotal : -Math.floor((oldTotal - newTotal) * REFUND_SHARE));
export const houseValue = (cfg) => costOf(cfg).total;

// ----- Where things are inside the room. The front door is at x = 0, z = FRONT_Z, so a house is shifted sideways to put its door there.
export const geom = (cfg) => {
  const door = doorColumn(cfg);
  const x0 = -(2 * door + 1);                         // left edge of the house
  const z0 = FRONT_Z - cfg.d * CELL;                  // back edge of the house
  return { x0, z0, x1: x0 + cfg.w * CELL, z1: FRONT_Z, door };
};
export const cellCenter = (cfg, i, j) => { const g = geom(cfg); return { x: g.x0 + i * CELL + 1, z: g.z0 + j * CELL + 1 }; };

// Boxes people cannot walk through: [x0, z0, x1, z1]. Walls, windows, the ground outside the house, and big furniture.
export function solids(cfg) {
  const g = geom(cfg), out = [], t = WALL_T / 2, { w, d, h, v } = cfg;
  for (let j = 0; j <= d; j++) for (let i = 0; i < w; i++) {
    const e = h[j][i];
    if (e !== EDGE.WALL && e !== EDGE.WINDOW) continue;
    const z = g.z0 + j * CELL, x = g.x0 + i * CELL;
    out.push([x - t, z - t, x + CELL + t, z + t]);
  }
  for (let j = 0; j < d; j++) for (let i = 0; i <= w; i++) {
    const e = v[j][i];
    if (e !== EDGE.WALL && e !== EDGE.WINDOW) continue;
    const x = g.x0 + i * CELL, z = g.z0 + j * CELL;
    out.push([x - t, z - t, x + t, z + CELL + t]);
  }
  // The yard outside the house: north, west and east of it (the room's own edge stops people at the south).
  out.push([-10, -10, 10, g.z0 - 0.05], [-10, g.z0 - 0.05, g.x0 - 0.05, 10], [g.x1 + 0.05, g.z0 - 0.05, 10, 10]);
  for (const f of cfg.furn) {
    if (!FURN[f.k].solid) continue;
    const c = cellCenter(cfg, f.x, f.z);
    out.push([c.x - 0.7, c.z - 0.7, c.x + 0.7, c.z + 0.7]);
  }
  return out;
}

// A few ready-made designs for "Quick Construction". The player can change colours, roof and floor, then confirm.
const put = (cfg, list) => { for (const [k, x, z, r] of list) cfg.furn.push({ k, x, z, r: r || 0 }); return cfg; };
const wallH = (cfg, j, from, to, e = EDGE.WALL) => { for (let i = from; i < to; i++) cfg.h[j][i] = e; };
const wallV = (cfg, i, from, to, e = EDGE.WALL) => { for (let j = from; j < to; j++) cfg.v[j][i] = e; };
export const PRESETS = {
  studio: { label: 'Studio', text: 'One open room with a bed, sofa and kitchen corner.', build: () => put(blank(3, 3), [['bed', 0, 0], ['wardrobe', 2, 0], ['sofa', 0, 1, 1], ['tv', 2, 1, 3], ['fridge', 0, 2], ['stove', 2, 2], ['rug', 1, 1]]) },
  cottage: { label: 'Cottage', text: 'A living room and a separate bedroom.', build: () => { const c = blank(4, 3); wallV(c, 2, 0, 3); c.v[2][2] = EDGE.DOOR; c.h[0][3] = EDGE.WINDOW; c.h[3][3] = EDGE.WINDOW; return put(c, [['bed', 0, 0], ['wardrobe', 1, 0], ['desk', 0, 1], ['sofa', 2, 0], ['tv', 3, 0], ['table', 3, 1], ['chair', 2, 1], ['fridge', 3, 2], ['stove', 1, 2]]); } },
  bungalow: { label: 'Bungalow', text: 'Two bedrooms, a bathroom and an open living and kitchen area.', build: () => { const c = blank(5, 4); wallV(c, 2, 0, 2); c.v[1][2] = EDGE.DOOR; wallH(c, 2, 0, 2); c.h[2][0] = EDGE.DOOR; wallV(c, 2, 2, 4, EDGE.NONE); c.h[4][1] = EDGE.WINDOW; c.h[4][3] = EDGE.WINDOW; return put(c, [['bed', 0, 0], ['wardrobe', 1, 0], ['bed', 3, 0], ['wardrobe', 4, 0], ['toilet', 0, 1], ['bath', 1, 1], ['sofa', 2, 2, 1], ['tv', 4, 2, 3], ['table', 3, 3], ['fridge', 0, 3], ['stove', 1, 3], ['plant', 4, 3]]); } },
  family: { label: 'Family house', text: 'Three bedrooms, two bathrooms, living room and kitchen.', build: () => { const c = blank(6, 4); wallH(c, 2, 0, 6); c.h[2][1] = EDGE.DOOR; c.h[2][3] = EDGE.DOOR; c.h[2][5] = EDGE.DOOR; wallV(c, 2, 0, 2); wallV(c, 4, 0, 2); c.v[0][2] = EDGE.NONE; c.v[0][4] = EDGE.NONE; wallV(c, 3, 2, 4); c.v[3][3] = EDGE.DOOR; c.h[4][1] = EDGE.WINDOW; c.h[4][5] = EDGE.WINDOW; return put(c, [['bed', 0, 0], ['wardrobe', 1, 0], ['bed', 2, 0], ['wardrobe', 3, 0], ['bed', 4, 0], ['wardrobe', 5, 0], ['sofa', 3, 2, 1], ['tv', 5, 2, 3], ['rug', 4, 2], ['table', 4, 3], ['chair', 5, 3], ['fridge', 0, 3], ['stove', 1, 3], ['toilet', 2, 3], ['bath', 2, 2]]); } },
};
export const PRESET_IDS = Object.keys(PRESETS);
export const presetCfg = (id) => (PRESETS[id] ? PRESETS[id].build() : null);

// ----- Saving: { s:'built', cfg, draft, open } as JSON in lots.house. Bad data becomes "no house".
export function parse(text) {
  try {
    const o = JSON.parse(text || '{}');
    const cfg = o.cfg ? sanitize(o.cfg) : null, draft = o.draft ? sanitize(o.draft) : null;
    if (!cfg && !draft) return null;
    return { s: cfg ? 'built' : 'draft', cfg, draft, open: Boolean(o.open) };
  } catch { return null; }
}
export const stringify = (h) => (h && (h.cfg || h.draft) ? JSON.stringify({ cfg: h.cfg || null, draft: h.draft || null, open: Boolean(h.open) }) : '');
