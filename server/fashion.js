// Adulthood: clothes, brands, perfume, and compliments. Rules only (no network, no database), like home.js and bank.js.
// All brands here are INVENTED. Before you launch, search each name once to make sure it is not a real shop or label.
// You buy clothes and perfume at the Boutique. Clothes are worn in four slots (top, bottom, shoes, accessory) and other players can see them.
// Almost everything is for looks only. The very expensive "Designer" and "Couture" pieces give a tiny charm bonus, and a good
// outfit or a nice perfume makes people compliment you. Perfume is used up: a bottle has a number of sprays and each one lasts a while.

export const SELL_BACK = 0.5;     // the Boutique buys things back at half price, so buying and selling is never a way to make money
export const MAX_CLOTHES = 40;
export const MAX_BOTTLES = 6;
export const SLOTS = ['top', 'bottom', 'shoes', 'acc'];
export const SLOT_LABELS = { top: 'Tops', bottom: 'Bottoms', shoes: 'Shoes', acc: 'Accessories' };
export const TIER_NAMES = ['Everyday', 'Smart', 'Premium', 'Designer', 'Couture'];

// Brands, from the street to the runway.
export const BRANDS = {
  danfo:   { name: 'Danfo Denim',       tier: 0 },
  eko:     { name: 'Eko Street',        tier: 0 },
  zuri:    { name: 'Zuri House',        tier: 1 },
  ada:     { name: 'Ada & Sons',        tier: 1 },
  oluwa:   { name: 'Oluwa Atelier',     tier: 2 },
  adaeze:  { name: 'Maison Adaeze',     tier: 3 },
  atelier: { name: 'Atelier Lekki',       tier: 3 },
  osagie:  { name: 'House of Osagie',   tier: 4 },
  ifeoma:  { name: 'Maison Ifeoma',     tier: 4 },
};

// [id, name, brand, cost, tier, color, kind(accessories)]. Prices are placeholders to tune.
const CLOTHES_TABLE = {
  top: [
    ['t_tee',     'Plain tee',                    'danfo',   2500,    0, '#e8e8e8'],
    ['t_ankara',  'Ankara print shirt',           'eko',     6000,    0, '#e07a1f'],
    ['t_polo',    'Classic polo',                 'zuri',    18000,   1, '#2f6bb3'],
    ['t_shirt',   'Tailored shirt',               'ada',     30000,   1, '#cfd8e3'],
    ['t_kaftan',  'Embroidered kaftan',           'oluwa',   65000,   2, '#e9dcc3'],
    ['t_knit',    'Cashmere knit',                'oluwa',   95000,   2, '#7a5a45'],
    ['t_blazer',  'Silk-lined blazer',            'adaeze',  220000,  3, '#1f2a44'],
    ['t_leather', 'Leather jacket',               'atelier', 350000,  3, '#1a1a1a'],
    ['t_agbada',  'Hand-embroidered agbada',      'osagie',  800000,  4, '#f4efe1'],
    ['t_evening', 'Beaded evening jacket',        'ifeoma',  1400000, 4, '#7b1e3a'],
  ],
  bottom: [
    ['b_shorts',  'Shorts',                       'danfo',   2000,    0, '#556070'],
    ['b_jeans',   'Blue jeans',                   'danfo',   5000,    0, '#2d4a7a'],
    ['b_chinos',  'Chinos',                       'zuri',    16000,   1, '#b59b6c'],
    ['b_trousers', 'Tailored trousers',           'ada',     32000,   1, '#33384a'],
    ['b_linen',   'Wide-leg linen trousers',      'oluwa',   70000,   2, '#d7cbb0'],
    ['b_selvedge', 'Selvedge denim',              'atelier', 180000,  3, '#1d2b4d'],
    ['b_wool',    'Wool suit trousers',           'adaeze',  260000,  3, '#15181f'],
    ['b_embroid', 'Embroidered trousers',         'osagie',  650000,  4, '#e9dcc3'],
  ],
  shoes: [
    ['s_slides',  'Slides',                       'danfo',   1500,    0, '#444444'],
    ['s_canvas',  'Canvas sneakers',              'eko',     7000,    0, '#e8e8e8'],
    ['s_loafer',  'Leather loafers',              'zuri',    28000,   1, '#5a3b26'],
    ['s_boots',   'Chelsea boots',                'ada',     45000,   1, '#3a2a20'],
    ['s_runner',  'Premium runners',              'oluwa',   90000,   2, '#f2f2f2'],
    ['s_oxford',  'Handmade oxfords',             'adaeze',  240000,  3, '#2b1a12'],
    ['s_dsneak',  'Designer sneakers',            'atelier', 300000,  3, '#fafafa'],
    ['s_croc',    'Crocodile-skin loafers',       'osagie',  900000,  4, '#3b2a1f'],
  ],
  acc: [
    ['a_cap',     'Cap',                          'danfo',   2000,    0, '#c0392b', 'cap'],
    ['a_shades',  'Sunglasses',                   'eko',     5000,    0, '#111111', 'shades'],
    ['a_watch',   'Steel watch',                  'zuri',    30000,   1, '#c0c6cc', 'watch'],
    ['a_bag',     'Leather bag',                  'ada',     40000,   1, '#6b3a24', 'bag'],
    ['a_chain',   'Gold-plated chain',            'oluwa',   80000,   2, '#d4af37', 'chain'],
    ['a_dshades', 'Designer sunglasses',          'adaeze',  200000,  3, '#0b0b0b', 'shades'],
    ['a_gwatch',  'Gold watch',                   'atelier', 450000,  3, '#e6c35c', 'watch'],
    ['a_diamond', 'Diamond-set watch',            'osagie',  1500000, 4, '#e8f4ff', 'watch'],
  ],
};
export const CLOTHES = {};
for (const slot of SLOTS) {
  for (const [id, name, brand, cost, tier, color, kind] of CLOTHES_TABLE[slot]) {
    CLOTHES[id] = { id, name, brand, brandName: BRANDS[brand].name, cost, tier, color, slot, kind: kind || null };
  }
}
export const CLOTHES_IDS = Object.keys(CLOTHES);

// Perfume. [id, name, brand label, cost, tier, sprays in a bottle, minutes one spray lasts (real minutes), family, notes, stars, staff pick]
// tier: 0 body spray, 1 eau de toilette, 2 eau de parfum, 3 designer, 4 luxury.
export const SCENT_TIERS = ['Body spray', 'Eau de toilette', 'Eau de parfum', 'Designer', 'Luxury'];
const PERFUME_TABLE = [
  ['p_breeze',  'Cool Breeze body spray',   'Danfo Fresh',            1500,   0, 15, 6,  'Fresh',   'citrus, mint', 2, false],
  ['p_sport',   'Sport Rush body spray',    'Danfo Fresh',            1800,   0, 15, 6,  'Fresh',   'lemon, cedar', 2, false],
  ['p_morning', 'Lagos Morning EDT',        'Zuri Scents',            12000,  1, 25, 10, 'Fresh',   'bergamot, neroli, white musk', 3, false],
  ['p_hibiscus', 'Hibiscus EDT',            'Zuri Scents',            14000,  1, 25, 10, 'Floral',  'hibiscus, jasmine, vanilla', 3, false],
  ['p_cedar',   'Cedar and Amber EDP',      'Oluwa Parfums',          45000,  2, 30, 15, 'Woody',   'cedar, amber, tonka bean', 4, true],
  ['p_coconut', 'Coconut Praline EDP',      'Oluwa Parfums',          55000,  2, 30, 15, 'Sweet',   'coconut, praline, vanilla', 4, false],
  ['p_rose',    'Rose Noir',                'Maison Adaeze Parfums',  150000, 3, 40, 25, 'Floral',  'damask rose, patchouli, black pepper', 5, true],
  ['p_atlantic', 'Atlantic Intense',        'Maison Adaeze Parfums',  190000, 3, 40, 25, 'Aquatic', 'sea salt, iris, sandalwood', 5, false],
  ['p_oud',     'Royal Oud',                'House of Osagie Parfums', 450000, 4, 50, 40, 'Oud',     'oud, saffron, rose, amber', 5, true],
  ['p_musk',    'White Musk Reserve',       'House of Osagie Parfums', 700000, 4, 50, 40, 'Musk',    'white musk, ambergris, tuberose', 5, false],
];
export const PERFUMES = {};
for (const [id, name, brand, cost, tier, sprays, minutes, family, notes, stars, pick] of PERFUME_TABLE) {
  PERFUMES[id] = { id, name, brand, cost, tier, sprays, minutes, family, notes, stars, pick };
}
export const PERFUME_IDS = Object.keys(PERFUMES);

// ---------- Outfit score, charm, compliments ----------
const FIT_POINTS = [0, 1, 2, 4, 6];            // points per worn piece by tier
const FLAIR_POINTS = [0, 0, 0, 1, 2];          // only Designer and Couture give flair
export const FIT_LEVELS = [{ from: 0, label: 'Casual' }, { from: 4, label: 'Neat' }, { from: 8, label: 'Sharp' }, { from: 14, label: 'Stylish' }, { from: 20, label: 'Head-turner' }];
export const fitLabel = (score) => FIT_LEVELS.filter((l) => score >= l.from).pop().label;

export function outfitOf(w) {
  let score = 0;
  let flair = 0;
  let best = null;
  for (const slot of SLOTS) {
    const c = w.worn[slot] ? CLOTHES[w.worn[slot]] : null;
    if (!c) continue;
    score += FIT_POINTS[c.tier];
    flair += FLAIR_POINTS[c.tier];
    if (!best || c.tier > best.tier) best = c;
  }
  return { score, label: fitLabel(score), flair, bestTier: best ? best.tier : -1, bestBrand: best ? best.brandName : '' };
}
// What perfume you smell of right now (or null).
export const scentOf = (w) => (w.scentId && w.scentLeft > 0 && Object.hasOwn(PERFUMES, w.scentId) ? PERFUMES[w.scentId] : null);

// The tiny bonus: extra friendship points when you chat with someone and it goes well. At most +2.
// Designer flair 3 or more gives +1 and 7 or more gives another +1 (that means mostly couture). A luxury scent counts as one too. Capped at 2.
export function charmBonus(w) {
  const o = outfitOf(w);
  const s = scentOf(w);
  let b = (o.flair >= 3 ? 1 : 0) + (o.flair >= 7 ? 1 : 0) + (s && s.tier >= 4 ? 1 : 0);
  return Math.min(2, b);
}

const LINES = {
  scent: {
    0: ['That is... a lot of body spray. Brave!', 'Ha, I can smell you from the door. Easy on the spray!'],
    1: ['Something smells nice. Is that you?', 'Fresh. I like that.'],
    2: ['You smell really nice today.', 'Wow, what are you wearing? It smells lovely.'],
    3: ['You smell incredible. What is that?', 'Okay, that fragrance is serious. Compliments!'],
    4: ['Whatever that scent is, it is a masterpiece. People will remember you.', 'You walk in and the whole place smells expensive. Respect.'],
  },
  outfit: {
    2: ['That outfit is clean. Is that {brand}?', 'You look sharp today.'],
    3: ['Is that {brand}? You look very expensive today.', 'That {brand} piece fits you perfectly.'],
    4: ['{brand}?! Hand-made, right? You look like a magazine cover.', 'That is couture. Everybody is looking at you.'],
  },
  both: ['The outfit and that scent? You are doing it today. Respect.', 'You look amazing and you smell amazing. Unfair advantage!'],
};
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

// A compliment for someone you have just started talking to, or null. "rand" is injectable for tests.
// Returns { text, rel, social }. rel is the friendship you gain (0 for the body spray joke), social is a small mood lift.
export function compliment(w, rand = Math.random) {
  const s = scentOf(w);
  const o = outfitOf(w);
  const scentChance = s ? [0.2, 0.15, 0.35, 0.6, 0.8][s.tier] : 0;
  const outfitChance = o.bestTier >= 2 && o.score >= 8 ? [0, 0, 0.3, 0.55, 0.75][o.bestTier] : 0;
  const scentHit = rand() < scentChance;
  const outfitHit = rand() < outfitChance;
  if (scentHit && outfitHit && s.tier >= 2) return { text: pick(LINES.both, rand), rel: 2, social: 6, kind: 'both' };
  if (outfitHit) return { text: pick(LINES.outfit[o.bestTier], rand).replace('{brand}', o.bestBrand), rel: o.bestTier >= 3 ? 2 : 1, social: 4, kind: 'outfit' };
  if (scentHit) return { text: pick(LINES.scent[s.tier], rand), rel: s.tier === 0 ? 0 : s.tier >= 3 ? 2 : 1, social: s.tier === 0 ? 0 : 4, kind: 'scent' };
  return null;
}
export const COMPLIMENT_COOLDOWN_MS = 12 * 60 * 1000;

// ---------- State ----------
export const defaultWardrobe = () => ({ owned: [], worn: { top: null, bottom: null, shoes: null, acc: null }, bottles: [], n: 1, scentId: null, scentLeft: 0, comp: {} });
const isInt = (v) => Number.isInteger(v);
const has = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);

export function parseWardrobe(json) {
  const w = defaultWardrobe();
  let raw = null;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return w;
  const seen = new Set();
  for (const id of Array.isArray(raw.owned) ? raw.owned : []) {
    if (!has(CLOTHES, id) || seen.has(id) || w.owned.length >= MAX_CLOTHES) continue;
    seen.add(id);
    w.owned.push(id);
  }
  for (const slot of SLOTS) {
    const id = raw.worn && typeof raw.worn === 'object' ? raw.worn[slot] : null;
    if (has(CLOTHES, id) && CLOTHES[id].slot === slot && seen.has(id)) w.worn[slot] = id;
  }
  let maxUid = 0;
  const uids = new Set();
  for (const b of Array.isArray(raw.bottles) ? raw.bottles : []) {
    if (!b || typeof b !== 'object' || !has(PERFUMES, b.id) || !isInt(b.uid) || b.uid < 1 || uids.has(b.uid) || w.bottles.length >= MAX_BOTTLES) continue;
    const sprays = isInt(b.sprays) ? Math.max(1, Math.min(PERFUMES[b.id].sprays, b.sprays)) : PERFUMES[b.id].sprays;
    uids.add(b.uid);
    maxUid = Math.max(maxUid, b.uid);
    w.bottles.push({ uid: b.uid, id: b.id, sprays });
  }
  w.n = Math.max(maxUid + 1, isInt(raw.n) ? Math.min(raw.n, 1e9) : 1);
  if (has(PERFUMES, raw.scentId) && Number.isFinite(raw.scentLeft) && raw.scentLeft > 0) {
    w.scentId = raw.scentId;
    w.scentLeft = Math.min(PERFUMES[raw.scentId].minutes, raw.scentLeft);
  }
  // When each person may compliment you again (saved, so logging out and in again does not reset it).
  if (raw.comp && typeof raw.comp === 'object' && !Array.isArray(raw.comp)) {
    for (const [k, v] of Object.entries(raw.comp).slice(0, 30)) if (k.length <= 24 && Number.isFinite(v) && v > 0) w.comp[k] = v;
  }
  return w;
}

// ---------- Requests. Each returns { ok, why, cash, msg } and changes "w" only when ok. The caller moves the cash. ----------
const fail = (why) => ({ ok: false, why, cash: 0 });
const okay = (cash, msg) => ({ ok: true, why: '', cash, msg });
const money = (n) => `₦${n.toLocaleString('en-US')}`;

export function buyClothes(w, cash, id) {
  if (!has(CLOTHES, id)) return fail('The Boutique does not sell that.');
  const c = CLOTHES[id];
  if (w.owned.includes(id)) return fail('You already own that.');
  if (w.owned.length >= MAX_CLOTHES) return fail(`Your wardrobe is full (${MAX_CLOTHES} pieces). Sell something first.`);
  if (cash < c.cost) return fail(`${c.name} costs ${money(c.cost)}.`);
  w.owned.push(id);
  return okay(-c.cost, `You bought ${c.name} by ${c.brandName} for ${money(c.cost)}.`);
}
export function sellClothes(w, id) {
  if (!has(CLOTHES, id) || !w.owned.includes(id)) return fail('You do not own that.');
  const c = CLOTHES[id];
  const back = Math.floor(c.cost * SELL_BACK);
  w.owned = w.owned.filter((x) => x !== id);
  if (w.worn[c.slot] === id) w.worn[c.slot] = null;
  return okay(back, `Sold ${c.name} for ${money(back)}.`);
}
export function wear(w, id) {
  if (!has(CLOTHES, id) || !w.owned.includes(id)) return fail('You do not own that.');
  const c = CLOTHES[id];
  if (w.worn[c.slot] === id) return fail('You are already wearing that.');
  w.worn[c.slot] = id;
  return okay(0, `You put on ${c.name} by ${c.brandName}.`);
}
export function takeOff(w, slot) {
  if (!has(w.worn, slot)) return fail('Pick something to take off.');
  if (!w.worn[slot]) return fail('You are not wearing anything there.');
  w.worn[slot] = null;
  return okay(0, 'Taken off.');
}
export function buyPerfume(w, cash, id) {
  if (!has(PERFUMES, id)) return fail('The Boutique does not sell that.');
  const p = PERFUMES[id];
  if (w.bottles.length >= MAX_BOTTLES) return fail(`You can keep ${MAX_BOTTLES} bottles. Use or sell one first.`);
  if (cash < p.cost) return fail(`${p.name} costs ${money(p.cost)}.`);
  w.bottles.push({ uid: w.n++, id, sprays: p.sprays });
  return okay(-p.cost, `You bought ${p.name} for ${money(p.cost)}.`);
}
export function sellPerfume(w, uid) {
  const b = isInt(uid) ? w.bottles.find((x) => x.uid === uid) : null;
  if (!b) return fail('You do not have that bottle.');
  const p = PERFUMES[b.id];
  const back = Math.floor((p.cost * SELL_BACK * b.sprays) / p.sprays); // the less is left, the less it is worth
  w.bottles = w.bottles.filter((x) => x.uid !== uid);
  return okay(back, `Sold ${p.name} for ${money(back)}.`);
}
// One spray. It lasts p.minutes real minutes. A fresh spray is not allowed while you still smell strongly of the same thing.
export function spritz(w, uid) {
  const b = isInt(uid) ? w.bottles.find((x) => x.uid === uid) : null;
  if (!b) return fail('You do not have that bottle.');
  const p = PERFUMES[b.id];
  if (w.scentId === b.id && w.scentLeft > p.minutes * 0.5) return fail('You already smell great. Wait a little before spraying again.');
  b.sprays -= 1;
  w.scentId = b.id;
  w.scentLeft = p.minutes;
  let msg = `You spray ${p.name}. Lovely.`;
  if (b.sprays <= 0) {
    w.bottles = w.bottles.filter((x) => x.uid !== uid);
    msg += ' The bottle is now empty.';
  }
  return okay(0, msg);
}
// Time passing while online (real minutes).
export function tickScent(w, realMin) {
  if (!w.scentId) return false;
  w.scentLeft -= realMin;
  if (w.scentLeft <= 0) {
    w.scentId = null;
    w.scentLeft = 0;
    return true; // it just wore off
  }
  return false;
}

// Other players see your outfit. This is the short public form: the four ids you are wearing (or null if nothing).
export function publicLook(w) {
  const l = SLOTS.map((s) => w.worn[s]);
  return l.some(Boolean) ? l : null;
}

// ---------- What the screen shows ----------
export function wardrobeInfo(w, where) {
  const o = outfitOf(w);
  const s = scentOf(w);
  return {
    where, // 'boutique' or null
    owned: w.owned, worn: w.worn,
    bottles: w.bottles.map((b) => ({ uid: b.uid, id: b.id, sprays: b.sprays })),
    scent: s ? { id: s.id, name: s.name, tier: s.tier, left: Math.ceil(w.scentLeft) } : null,
    fit: { score: o.score, label: o.label, flair: o.flair },
    charm: charmBonus(w),
    limits: { clothes: MAX_CLOTHES, bottles: MAX_BOTTLES },
    sellBack: SELL_BACK,
  };
}
export const fashionCatalog = () => ({
  brands: Object.fromEntries(Object.entries(BRANDS).map(([id, b]) => [id, b.name])),
  slots: SLOTS.map((id) => ({ id, label: SLOT_LABELS[id] })),
  tiers: TIER_NAMES,
  scentTiers: SCENT_TIERS,
  clothes: CLOTHES_IDS.map((id) => {
    const c = CLOTHES[id];
    return { id, name: c.name, brand: c.brandName, cost: c.cost, tier: c.tier, tierLabel: TIER_NAMES[c.tier], color: c.color, slot: c.slot, kind: c.kind };
  }),
  perfumes: PERFUME_IDS.map((id) => {
    const p = PERFUMES[id];
    return { id, name: p.name, brand: p.brand, cost: p.cost, tier: p.tier, tierLabel: SCENT_TIERS[p.tier], sprays: p.sprays, minutes: p.minutes, family: p.family, notes: p.notes, stars: p.stars, pick: p.pick };
  }),
});