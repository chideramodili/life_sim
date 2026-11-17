// Adulthood: scheduled Special Events (Treasure Hunt, Driving Rally) and the token shop. Rules only (no network, no database).
export const SPECIAL_SECONDS = 15 * 60;        // how long an event lasts
export const CHEST_COUNT = 6, CHEST_REACH = 7, CHECKPOINTS = 4, CP_REACH = 9;
export const SPECIALS = {
  hunt: { id: 'hunt', icon: '🧰', title: 'Treasure Hunt', text: `${CHEST_COUNT} chests are hidden around the city. Walk or drive to one to open it. The first player to arrive wins it.` },
  rally: { id: 'rally', icon: '🏁', title: 'Driving Rally', text: `Join, then drive through ${CHECKPOINTS} checkpoints in order in your own car. The three fastest times win extra prizes when the event ends.` },
};
export const SPECIAL_IDS = Object.keys(SPECIALS);
export const CHEST_PAY = { cash: 6000, tok: 1, xp: 20 };
export const RALLY_PAY = { cash: 8000, tok: 1, xp: 40 };
export const RALLY_PRIZES = [{ cash: 40000, tok: 5 }, { cash: 20000, tok: 3 }, { cash: 10000, tok: 2 }];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pointsOf = (layout) => [
  ...Object.entries(layout.doors || {}).map(([id, d]) => ({ x: d.x, z: d.z, venue: id })),
  ...(layout.plots || []).map((p) => ({ x: p.door.x, z: p.door.z, plot: p.id })),
];
// n spread-out points (each at least `gap` metres from the others).
export function spreadPoints(layout, n, rnd, gap = 70) {
  const all = pointsOf(layout), out = [];
  for (let tries = 0; tries < 600 && out.length < n; tries++) {
    const a = all[Math.floor(rnd() * all.length)];
    if (out.every((b) => dist(a, b) >= gap)) out.push(a);
  }
  return out;
}

// The token shop. Cosmetic badges, a refill, a cash pack and an XP book.
export const SHOP = [
  { id: 'refill', name: 'Full recharge', text: 'Food, energy, fun, social, clean and toilet back to full.', cost: 3, repeat: true },
  { id: 'cash', name: '₦60,000 cash pack', text: 'Cash straight into your pocket.', cost: 6, repeat: true },
  { id: 'xp', name: 'Mentor book (+500 XP)', text: 'Read it and level up faster.', cost: 8, repeat: true },
  { id: 'b_vip', name: 'Badge: Event VIP', text: 'Shows in your badges.', cost: 10, badge: 'Event VIP' },
  { id: 'b_hunter', name: 'Badge: Treasure Hunter', text: 'Shows in your badges.', cost: 15, badge: 'Treasure Hunter' },
  { id: 'b_king', name: 'Badge: Road King', text: 'Shows in your badges.', cost: 15, badge: 'Road King' },
  { id: 'b_gold', name: 'Badge: Golden Citizen', text: 'The rarest badge.', cost: 40, badge: 'Golden Citizen' },
];
export const SHOP_ITEM = Object.fromEntries(SHOP.map((s) => [s.id, s]));
