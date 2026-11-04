// Adulthood: furniture and decorating your Home. Rules only (no network, no database), like bank.js and world.js.
// You BUY furniture at the Home Store (it goes in your own stock), then PLACE it in your Home on a grid.
// Some pieces make your home better to live in (a bed, a TV, a fridge, a desk, plants). Only PLACED pieces count.
// Only the best piece in each "slot" counts, so buying five beds never stacks up.

export const GRID = 8;          // you may place things on cells from -8 to 8 on both axes
export const MAX_ITEMS = 30;    // most pieces you can own at once
export const SELL_BACK = 0.5;   // the store buys things back at half price, so buying and selling is never a way to make money
export const STYLE_COST = 3000; // changing the wall or floor color

// ---------- The catalog ----------
// Furniture comes in CATEGORIES (groups). Each category has several kinds, from basic to luxury, with different prices,
// looks, and (for useful pieces) bigger bonuses. Add a new kind by adding one line to a category. Prices are placeholders to tune.
//   [id, name, cost, extras]   extras: sleep / fun / eat / course / calm / cool = the bonus, style = how nice it looks,
//   color = what it looks like, size = override of the category footprint, max = how many of this exact kind you may own.
// "slot" categories (bed, tv, fridge, desk, cooling): only the best placed piece counts, so extras never stack.
// "flat" pieces (rugs) can sit under other furniture. Old ids (mattress, bed_frame, small_tv, ...) are kept so old saves still load.
export const GROUPS = {
  bed: { label: 'Beds', size: [2, 1], slot: 'bed', cap: 2, items: [
    ['mat_foam',    'Foam mat',                  12000,  { sleep: 4,  style: 1,  color: '#d8c9a0' }],
    ['mattress',    'Spring mattress',           25000,  { sleep: 8,  style: 2,  color: '#e8e0d0' }],
    ['mat_ortho',   'Orthopedic mattress',       45000,  { sleep: 11, style: 3,  color: '#cfe0ea' }],
    ['bed_frame',   'Iron bed frame',            70000,  { sleep: 15, style: 6,  color: '#6d8fc0', frame: '#8a5a35', glb: 'old-iron-bed', size: [1, 2] }],
    ['bed_queen',   'Queen bed, padded headboard', 140000, { sleep: 19, style: 9,  color: '#b98aa8', frame: '#5b3d2a', glb: 'bed', size: [2, 2] }],
    ['bed_hospital', 'Adjustable hospital bed',  210000, { sleep: 21, style: 8,  glb: 'hospital-bed', size: [2, 1] }],
    ['bed_king',    'King bed, leather headboard', 280000, { sleep: 24, style: 14, color: '#2f3b52', frame: '#2a1d16', size: [2, 2] }],
  ] },
  tv: { label: 'TVs', size: [1, 1], slot: 'tv', cap: 2, items: [
    ['tv_crt',      'Old box TV',                15000,  { fun: 4,  style: 1 }],
    ['small_tv',    'Small TV',                  40000,  { fun: 8,  style: 3 }],
    ['tv_smart',    'Smart TV 32 inch',          65000,  { fun: 11, style: 4 }],
    ['big_tv',      'Big TV 55 inch',            110000, { fun: 15, style: 6, size: [2, 1] }],
    ['tv_oled',     'OLED TV 65 inch',           220000, { fun: 19, style: 9, size: [2, 1] }],
    ['tv_cinema',   'Home cinema wall',          450000, { fun: 24, style: 14, size: [3, 1] }],
  ] },
  fridge: { label: 'Fridges', size: [1, 1], slot: 'fridge', cap: 2, items: [
    ['fridge_mini', 'Mini fridge',               30000,  { eat: 5,  style: 2,  color: '#cfd6dc' }],
    ['fridge',      'Fridge',                    55000,  { eat: 8,  style: 3,  color: '#dfe5ea' }],
    ['fridge_chest', 'Chest freezer',            85000,  { eat: 10, style: 3,  glb: 'freezer-chest', size: [2, 1] }],
    ['fridge_double', 'Double-door fridge',      110000, { eat: 12, style: 5,  color: '#b9c3cc', size: [2, 1] }],
    ['fridge_smart', 'Smart fridge-freezer',     230000, { eat: 16, style: 8,  color: '#2b2f36', size: [2, 1] }],
  ] },
  desk: { label: 'Desks', size: [2, 1], slot: 'desk', cap: 2, items: [
    ['desk_fold',   'Folding table',             15000,  { course: 0.1,  style: 1 }],
    ['desk',        'Study desk',                35000,  { course: 0.25, style: 3 }],
    ['desk_exec',   'Executive desk',            95000,  { course: 0.4,  style: 7, color: '#5b3d2a' }],
    ['desk_dev',    'Developer station',         180000, { course: 0.55, style: 10, color: '#22262e', size: [3, 1] }],
  ] },
  cool: { label: 'Fans and AC', size: [1, 1], slot: 'cooling', cap: 2, items: [
    ['fan_stand',   'Standing fan',              18000,  { cool: 0.1, style: 1 }],
    ['fan_tower',   'Tower fan',                 40000,  { cool: 0.18, style: 2 }],
    ['ac_split',    'Split AC',                  150000, { cool: 0.3, style: 5 }],
  ] },
  sofa: { label: 'Sofas and seats', size: [2, 1], cap: 6, items: [
    ['bench',       'Wooden bench',              15000,  { style: 3, max: 2, color: '#a07046', size: [2, 1] }],
    ['sofa',        'Fabric sofa',               45000,  { style: 8, max: 2, color: '#7a4f9a', glb: 'sofa', size: [2, 1] }],
    ['sofa_leather', 'Leather sofa',             120000, { style: 14, max: 2, color: '#6b3a24' }],
    ['sofa_sect',   'Sectional sofa',            260000, { style: 22, max: 1, color: '#35507a', glb: 'corner-sofa', size: [3, 2] }],
  ] },
  rug: { label: 'Rugs', size: [2, 2], flat: true, cap: 4, items: [
    ['rug_mat',     'Plastic floor mat',         4000,   { style: 2, max: 2, color: '#6fa3a8' }],
    ['rug',         'Ankara print rug',          12000,  { style: 5, max: 2, color: '#c0583d' }],
    ['rug_wool',    'Wool rug',                  35000,  { style: 9, max: 2, color: '#d9cdb4' }],
    ['rug_persian', 'Handmade Persian-style rug', 120000, { style: 15, max: 1, color: '#8c2f3a', size: [3, 2] }],
  ] },
  art: { label: 'Wall art', size: [1, 1], cap: 6, items: [
    ['art_poster',  'Poster',                    3000,   { style: 1, max: 3, color: '#4a8fd0' }],
    ['art',         'Art print',                 9000,   { style: 4, max: 3, color: '#e9a23b' }],
    ['art_canvas',  'Canvas painting',           40000,  { style: 8, max: 3, color: '#3fa58a' }],
    ['art_original', 'Original by a local artist', 150000, { style: 14, max: 2, color: '#d1495b' }],
    ['art_bronze',  'Bronze sculpture',          320000, { style: 20, max: 1, color: '#b08d57' }],
  ] },
  lamp: { label: 'Lighting', size: [1, 1], cap: 4, items: [
    ['lamp_charge', 'Rechargeable lamp',         3000,   { style: 1, lamp: true, max: 2 }],
    ['lamp',        'Table lamp',                8000,   { style: 3, lamp: true, max: 2 }],
    ['lamp_floor',  'Designer floor lamp',       45000,  { style: 7, lamp: true, max: 2 }],
    ['lamp_chandelier', 'Chandelier',            160000, { style: 14, lamp: true, max: 1 }],
  ] },
  plant: { label: 'Plants', size: [1, 1], cap: 6, items: [
    ['plant_succ',  'Succulent',                 2000,   { style: 1, calm: 0.08, max: 4 }],
    ['plant',       'Potted plant',              5000,   { style: 2, calm: 0.15, max: 4 }],
    ['plant_palm',  'Palm tree',                 22000,  { style: 5, calm: 0.2,  max: 2 }],
    ['plant_fig',   'Fiddle-leaf fig',           40000,  { style: 7, calm: 0.25, max: 2 }],
  ] },
  shelf: { label: 'Shelves', size: [1, 1], cap: 4, items: [
    ['shelf_crate', 'Crate shelf',               6000,   { style: 2, max: 2 }],
    ['bookshelf',   'Bookshelf',                 28000,  { style: 6, max: 2 }],
    ['shelf_glass', 'Glass display cabinet',     90000,  { style: 11, max: 2 }],
    ['shelf_library', 'Built-in library wall',   240000, { style: 18, max: 1, size: [3, 1] }],
  ] },
  seat: { label: 'Chairs and seats', size: [1, 1], cap: 10, items: [
    ['school_chair', 'Stackable school chair',   6000,   { style: 1, max: 4, glb: 'stackable-school-chair' }],
    ['pouf',         'Pink pouf',                14000,  { style: 3, max: 4, glb: 'pouf' }],
    ['office_chair', 'Office chair',             38000,  { style: 5, max: 2, glb: 'office-chair' }],
    ['armchair',     'Round armchair',           55000,  { style: 8, max: 3, glb: 'armchair' }],
    ['gaming_chair', 'Gaming chair',             85000,  { style: 9, max: 2, glb: 'gaming-chair' }],
  ] },
  bath: { label: 'Bathroom', size: [1, 1], cap: 8, items: [
    ['tp_holder',    'Toilet roll holder',       1500,   { style: 1, max: 2, glb: 'toilet-paper-holder', lift: 0.9 }],
    ['med_cabinet',  'Medicine cabinet',         32000,  { style: 4, max: 1, glb: 'medicine-cabinet', lift: 1.1 }],
    ['toilet',       'Toilet',                   45000,  { style: 3, max: 1, glb: 'toilet' }],
    ['bidet',        'Bidet',                    60000,  { style: 4, max: 1, glb: 'bidet' }],
    ['hot_tub',      'Wooden hot tub',           650000, { style: 24, max: 1, glb: 'hot-tub', size: [3, 3] }],
  ] },
  decor: { label: 'Decor and storage', size: [1, 1], cap: 10, items: [
    ['curtains',     'Green curtains',           22000,  { style: 5, max: 2, glb: 'curtains', size: [2, 1], lift: 0.5 }],
    ['door',         'Interior door',            30000,  { style: 3, max: 2, glb: 'door' }],
    ['xmas_tree',    'Christmas tree',           38000,  { style: 7, max: 1, glb: 'christmas-tree', size: [2, 2] }],
    ['vanity',       'Vanity table with mirror', 48000,  { style: 6, max: 1, glb: 'vanity-table' }],
    ['wardrobe',     'Old painted wardrobe',     85000,  { style: 8, max: 2, glb: 'old-wardrobe', size: [2, 1] }],
    ['patio_set',    'Patio table and chairs',   130000, { style: 11, max: 1, glb: 'patio-set', size: [2, 2] }],
  ] },
  pro: { label: 'Shop and clinic', size: [1, 1], cap: 6, items: [
    ['grocery_shelf', 'Grocery shelf',           70000,  { style: 4, max: 2, glb: 'grocery-shelf', size: [2, 1] }],
    ['reception',    'Curved reception desk',    150000, { style: 8, max: 1, glb: 'reception-desk', size: [2, 1] }],
    ['op_table',     'Operating table',          400000, { style: 6, max: 1, glb: 'operating-table', size: [2, 2] }],
  ] },
};
export const GROUP_IDS = Object.keys(GROUPS);
export const TIER_NAMES = ['Basic', 'Standard', 'Good', 'Premium', 'Luxury', 'Elite'];

// Work out one flat table of everything for sale, with a helpful line of text for each piece.
function describe(it) {
  const t = [];
  if (it.sleep) t.push(`Sleeping at home restores ${it.sleep} more.`);
  if (it.fun) t.push(`Playing at home gives ${it.fun} more fun.`);
  if (it.eat) t.push(`Eating at home gives ${it.eat} more food.`);
  if (it.course) t.push(`Online courses at home give ${Math.round(it.course * 100)}% more XP.`);
  if (it.cool) t.push(`Keeps you cool: calms you a little at home.`);
  if (it.calm) t.push('Calms you a little at home (the best 3 plants count).');
  if (it.lamp) t.push('Keeps your home from going pitch dark in a power cut.');
  if (it.sleep || it.fun || it.eat || it.cool) t.push('Needs power.');
  if (!t.length) t.push('Makes your home look good.');
  return t.join(' ');
}
export const CATALOG = {};
for (const [gid, g] of Object.entries(GROUPS)) {
  g.items.forEach(([id, label, cost, x], i) => {
    const item = {
      id, label, cost, group: gid, tier: i, tiers: g.items.length,
      size: x.size || g.size, max: x.max || 1, style: x.style || 0, slot: g.slot || null, flat: Boolean(g.flat),
      color: x.color || null, frame: x.frame || null, glb: x.glb || null, lift: x.lift || 0,
      sleep: x.sleep || 0, fun: x.fun || 0, eat: x.eat || 0, course: x.course || 0, cool: x.cool || 0, calm: x.calm || 0, lamp: Boolean(x.lamp),
    };
    item.text = describe(item);
    CATALOG[id] = item;
  });
}
export const ITEM_IDS = Object.keys(CATALOG);
const groupCount = (home, gid) => home.items.filter((i) => CATALOG[i.id].group === gid).length;

// Paint colors. null means the original look.
export const WALLS = { default: null, cream: '#d9c9a8', sage: '#8aa88a', sky: '#7fa6c9', rose: '#c98a9a', slate: '#59637a', sand: '#c4a17a' };
export const FLOORS = { default: null, oak: '#a8794a', ash: '#c9b595', walnut: '#5a3b26', grey: '#8a8d94', teal: '#3f7f80', brick: '#9a5a48' };

export const STYLE_CAP = 100;
export const STYLE_LEVELS = [
  { from: 0, label: 'Bare' }, { from: 10, label: 'Cosy' }, { from: 25, label: 'Comfortable' }, { from: 45, label: 'Stylish' }, { from: 70, label: 'Showroom' },
];
export const styleLevel = (score) => {
  let t = STYLE_LEVELS[0];
  for (const l of STYLE_LEVELS) if (score >= l.from) t = l;
  return t.label;
};

// ---------- State ----------
export const defaultHome = () => ({ items: [], wall: 'default', floor: 'default', lights: true, n: 1 });

const isInt = (v) => Number.isInteger(v);
const has = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);

// Read a saved home safely. Anything broken is dropped.
export function parseHome(json) {
  const h = defaultHome();
  let raw = null;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return h;
  if (has(WALLS, raw.wall)) h.wall = raw.wall;
  if (has(FLOORS, raw.floor)) h.floor = raw.floor;
  h.lights = raw.lights !== false;
  const counts = {};
  const seen = new Set();
  let maxUid = 0;
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    if (!it || typeof it !== 'object' || !has(CATALOG, it.id)) continue;
    if (!isInt(it.uid) || it.uid < 1 || seen.has(it.uid)) continue;
    if (h.items.length >= MAX_ITEMS) break;
    counts[it.id] = (counts[it.id] || 0) + 1;
    if (counts[it.id] > CATALOG[it.id].max) continue;
    if (groupCount(h, CATALOG[it.id].group) >= GROUPS[CATALOG[it.id].group].cap) continue;
    seen.add(it.uid);
    maxUid = Math.max(maxUid, it.uid);
    const item = { uid: it.uid, id: it.id, placed: false, x: 0, z: 0, rot: 0 };
    if (it.placed === true && isInt(it.x) && isInt(it.z) && (it.rot === 0 || it.rot === 1)) {
      item.x = it.x; item.z = it.z; item.rot = it.rot; item.placed = true;
    }
    h.items.push(item);
  }
  h.n = Math.max(maxUid + 1, isInt(raw.n) ? Math.min(raw.n, 1e9) : 1);
  // Put each placed piece back through the placement rules, so a damaged save cannot leave things overlapping.
  const placed = h.items.filter((i) => i.placed);
  for (const it of placed) {
    it.placed = false;
    if (fits(h, it, it.x, it.z, it.rot).ok) it.placed = true;
  }
  return h;
}

export const footprint = (id, rot) => (rot ? [CATALOG[id].size[1], CATALOG[id].size[0]] : CATALOG[id].size);

// Does this piece fit at (x, z) with this turn? Everything else already placed is checked. Returns { ok, why }.
export function fits(home, item, x, z, rot) {
  if (!isInt(x) || !isInt(z) || (rot !== 0 && rot !== 1)) return { ok: false, why: 'That spot is not valid.' };
  const [w, d] = footprint(item.id, rot);
  if (x < -GRID || z < -GRID || x + w - 1 > GRID || z + d - 1 > GRID) return { ok: false, why: 'That does not fit inside your home.' };
  const flat = Boolean(CATALOG[item.id].flat);
  for (const o of home.items) {
    if (o.uid === item.uid || !o.placed) continue;
    const oflat = Boolean(CATALOG[o.id].flat);
    if (flat !== oflat) continue; // a rug may lie under furniture
    const [ow, od] = footprint(o.id, o.rot);
    if (x < o.x + ow && o.x < x + w && z < o.z + od && o.z < z + d) return { ok: false, why: `That spot is taken by your ${CATALOG[o.id].label.toLowerCase()}.` };
  }
  return { ok: true, why: '' };
}

// The first free spot, searching outwards from the middle of the room.
export function autoSpot(home, item, rot = 0) {
  const cells = [];
  for (let x = -GRID; x <= GRID; x++) for (let z = -GRID; z <= GRID; z++) cells.push([x, z]);
  cells.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]) || a[0] - b[0] || a[1] - b[1]);
  for (const [x, z] of cells) if (fits(home, item, x, z, rot).ok) return { x, z };
  return null;
}

// ---------- What your home does for you ----------
export function effectsOf(home) {
  const e = { sleep: 0, fun: 0, eat: 0, course: 0, cool: 0, calm: 0, style: 0, lamp: false };
  const plants = [];
  let style = 0;
  for (const it of home.items) {
    if (!it.placed) continue;
    const c = CATALOG[it.id];
    style += c.style || 0;
    if (c.slot === 'bed') e.sleep = Math.max(e.sleep, c.sleep);
    if (c.slot === 'tv') e.fun = Math.max(e.fun, c.fun);
    if (c.slot === 'fridge') e.eat = Math.max(e.eat, c.eat);
    if (c.slot === 'desk') e.course = Math.max(e.course, c.course);
    if (c.slot === 'cooling') e.cool = Math.max(e.cool, c.cool);
    if (c.calm) plants.push(c.calm);
    if (c.lamp) e.lamp = true;
  }
  // The best three plants count, plus your fan or air conditioner.
  e.calm = plants.sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0) + e.cool;
  e.style = Math.min(STYLE_CAP, style);
  return e;
}

// ---------- Requests. Each returns { ok, why, cash, msg } and changes "home" only when ok. The caller moves the cash. ----------
const fail = (why) => ({ ok: false, why, cash: 0 });
const okay = (cash, msg) => ({ ok: true, why: '', cash, msg });
const money = (n) => `₦${n.toLocaleString('en-US')}`;
const find = (home, uid) => (isInt(uid) ? home.items.find((i) => i.uid === uid) || null : null);

export function buyItem(home, cash, id) {
  if (!has(CATALOG, id)) return fail('The store does not sell that.');
  const c = CATALOG[id];
  if (home.items.length >= MAX_ITEMS) return fail(`Your home is full of stuff. You can own ${MAX_ITEMS} pieces.`);
  if (home.items.filter((i) => i.id === id).length >= c.max) return fail(`You already have the most ${c.label.toLowerCase()} you can own (${c.max}).`);
  const g = GROUPS[c.group];
  if (groupCount(home, c.group) >= g.cap) return fail(`You have enough in ${g.label.toLowerCase()} already (${g.cap}). Sell one to make room.`);
  if (cash < c.cost) return fail(`${c.label} costs ${money(c.cost)}.`);
  home.items.push({ uid: home.n++, id, placed: false, x: 0, z: 0, rot: 0 });
  return okay(-c.cost, `You bought a ${c.label.toLowerCase()} for ${money(c.cost)}. Place it in your Home.`);
}

export function sellItem(home, uid) {
  const it = find(home, uid);
  if (!it) return fail('You do not own that.');
  const back = Math.floor(CATALOG[it.id].cost * SELL_BACK);
  home.items = home.items.filter((i) => i.uid !== uid);
  return okay(back, `Sold your ${CATALOG[it.id].label.toLowerCase()} for ${money(back)}.`);
}

// Place a piece, or move it. With auto = true the game picks a free spot.
export function placeItem(home, req) {
  const it = find(home, req && req.uid);
  if (!it) return fail('You do not own that.');
  const rot = req.rot === 1 ? 1 : req.rot === 0 || req.rot === undefined ? 0 : NaN;
  if (req.auto === true) {
    const spot = autoSpot(home, it, it.placed ? it.rot : 0);
    if (!spot) return fail('There is no free space left.');
    it.x = spot.x; it.z = spot.z; it.rot = it.placed ? it.rot : 0; it.placed = true;
    return okay(0, `Placed your ${CATALOG[it.id].label.toLowerCase()}.`);
  }
  const f = fits(home, it, req.x, req.z, rot);
  if (!f.ok) return fail(f.why);
  it.x = req.x; it.z = req.z; it.rot = rot; it.placed = true;
  return okay(0, '');
}

export function putAway(home, uid) {
  const it = find(home, uid);
  if (!it) return fail('You do not own that.');
  if (!it.placed) return fail('That is not placed.');
  it.placed = false;
  return okay(0, `Put your ${CATALOG[it.id].label.toLowerCase()} away.`);
}

// Paint. Each change costs STYLE_COST. Choosing the color you already have is free (and does nothing).
// Switch the lights in your home on or off. Free, and only a yes or no is accepted.
export function setLights(home, on) {
  if (typeof on !== 'boolean') return { ok: false, why: 'Lights: on or off.' };
  home.lights = on;
  return { ok: true, cash: 0, msg: on ? 'Lights on.' : 'Lights off.' };
}

export function paint(home, cash, req) {
  if (!req || typeof req !== 'object') return fail('Pick a color.');
  const next = { wall: home.wall, floor: home.floor };
  if (req.wall !== undefined) {
    if (!has(WALLS, req.wall)) return fail('That wall color does not exist.');
    next.wall = req.wall;
  }
  if (req.floor !== undefined) {
    if (!has(FLOORS, req.floor)) return fail('That floor color does not exist.');
    next.floor = req.floor;
  }
  const changes = (next.wall !== home.wall ? 1 : 0) + (next.floor !== home.floor ? 1 : 0);
  if (!changes) return okay(0, '');
  const cost = changes * STYLE_COST;
  if (cash < cost) return fail(`Painting costs ${money(cost)}.`);
  home.wall = next.wall;
  home.floor = next.floor;
  return okay(-cost, `Freshly painted. -${money(cost)}.`);
}

// ---------- What the screen shows ----------
export function homeInfo(home, where) {
  const e = effectsOf(home);
  return {
    where,                      // 'home', 'store', or null: decides which buttons work
    items: home.items.map((i) => ({ uid: i.uid, id: i.id, placed: i.placed, x: i.x, z: i.z, rot: i.rot })),
    wall: home.wall, floor: home.floor, lights: home.lights !== false,
    wallColor: WALLS[home.wall], floorColor: FLOORS[home.floor],
    effects: { sleep: e.sleep, fun: e.fun, eat: e.eat, course: e.course, calm: Math.round(e.calm * 100) / 100, lamp: e.lamp },
    style: e.style, styleLabel: styleLevel(e.style),
    limit: MAX_ITEMS, grid: GRID, styleCost: STYLE_COST, sellBack: SELL_BACK,
    groups: GROUP_IDS.map((id) => ({ id, label: GROUPS[id].label, cap: GROUPS[id].cap })),
    catalog: ITEM_IDS.map((id) => {
      const c = CATALOG[id];
      return { id, label: c.label, cost: c.cost, size: c.size, max: c.max, text: c.text, style: c.style, flat: c.flat, group: c.group, tier: c.tier, tierLabel: TIER_NAMES[Math.min(TIER_NAMES.length - 1, Math.round((c.tier / Math.max(1, c.tiers - 1)) * (TIER_NAMES.length - 1)))], color: c.color, frame: c.frame, lamp: c.lamp, glb: c.glb, lift: c.lift };
    }),
    walls: Object.entries(WALLS).map(([id, color]) => ({ id, color })),
    floors: Object.entries(FLOORS).map(([id, color]) => ({ id, color })),
  };
}
