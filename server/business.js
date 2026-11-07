// Adulthood: land and player businesses. Rules only (no network, no database), like bank.js and home.js.
// You BUY a lot, BUILD a business on it, STOCK it, and customers buy from it (townspeople on their own, and other players).
// Money from sales waits in the till until the owner collects it. Every number here is a placeholder to tune.

export const MAX_LOTS = Number(process.env.MAX_LOTS) || 3;          // most lots one player can own
export const SELL_LAND = 0.6;       // selling a lot back pays 60% of its price
export const BIZ_MAX_LEVEL = 3;
export const UPGRADE_COST = { 2: 90000, 3: 220000 };   // cost to reach that level
export const STOCK_CAP = (level) => 40 * level;
export const RATE_MULT = (level) => 1 + 0.6 * (level - 1);      // more customers at higher levels
export const PRICE_MULT = (level) => 1 + 0.15 * (level - 1);    // and a bit more per sale
export const STAFF_WAGE = Number(process.env.STAFF_WAGE) || 2400;   // per staff member per real hour of opening time, paid from the till
export const STAFF_BOOST = 0.4;                                      // each staff member adds 40% more customers
export const STAFF_MAX = (level) => level + 1;                       // 2, 3 or 4 staff by level
export const HIRE_FEE = 3000;                                        // one-off fee to hire
export const BIZ_RATE = Number(process.env.BIZ_RATE) || 1;      // 1 = normal; tests turn it up

// price = what a customer pays at level 1, cost = what the owner pays the wholesaler per unit,
// rate = townspeople customers per real minute while open, fx = what one purchase gives the buyer.
export const KINDS = {
  cafe:     { label: 'Café',      build: 60000,  item: 'Meal',       price: 2500, cost: 1000, rate: 0.6, fx: { food: 30, fun: 4 },            hours: [7, 21] },
  minimart: { label: 'Mini-mart', build: 90000,  item: 'Snack pack', price: 1500, cost: 600,  rate: 0.9, fx: { food: 12, fun: 8 },            hours: [7, 22] },
  salon:    { label: 'Salon',     build: 80000,  item: 'Haircut',    price: 4000, cost: 1200, rate: 0.4, fx: { clean: 25, social: 6, fun: 6 }, hours: [9, 19] },
  gym:      { label: 'Gym',       build: 150000, item: 'Day pass',   price: 3000, cost: 500,  rate: 0.5, fx: { fun: 12, social: 8, energy: -8 }, hours: [6, 21] },
};
export const KIND_IDS = Object.keys(KINDS);
export const isKind = (k) => typeof k === 'string' && Object.hasOwn(KINDS, k);

export const priceOf = (kind, level) => Math.round((KINDS[kind].price * PRICE_MULT(level)) / 50) * 50;
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 '&.-]{2,19}$/;
export const validName = (s) => typeof s === 'string' && NAME_RE.test(s.trim()) && s.trim().length <= 20;
export const isOpen = (kind, minuteOfDay) => { const [a, b] = KINDS[kind].hours; const h = minuteOfDay / 60; return h >= a && h < b; };

// A new empty business record.
export const newBiz = (kind, name, now) => ({ kind, name: name.trim(), level: 1, stock: 0, till: 0, frac: 0, built: now, staff: 0, owed: 0 });

// Wages: while the doors are open each staff member earns STAFF_WAGE per hour, taken from the till.
// What the till cannot cover piles up as 'owed'; if it reaches two hours of wages for the whole team, one person quits.
// Returns true if somebody quit.
export function payStaff(b, dtSec, open) {
  if (!open || !b.staff || dtSec <= 0) return false;
  b.owed = (b.owed || 0) + (dtSec / 3600) * STAFF_WAGE * b.staff * BIZ_RATE;
  const pay = Math.min(b.till, b.owed);
  b.till -= pay; b.owed -= pay;
  if (b.owed >= STAFF_WAGE * b.staff * 2) { b.staff -= 1; b.owed = 0; return true; }
  return false;
}

export function hire(b, cash) {
  if ((b.staff || 0) >= STAFF_MAX(b.level)) return { ok: false, why: `${b.name} has all the staff it can hold at level ${b.level}.` };
  if (cash < HIRE_FEE) return { ok: false, why: `Hiring costs ₦${HIRE_FEE.toLocaleString('en-US')}.` };
  return { ok: true, cost: HIRE_FEE };
}

// Let time pass for one business: townspeople buy while it is open and there is stock. Returns how many were sold.
export function step(b, dtSec, open) {
  if (!open || b.stock <= 0 || dtSec <= 0) return 0;
  b.frac += (dtSec / 60) * KINDS[b.kind].rate * RATE_MULT(b.level) * (1 + STAFF_BOOST * (b.staff || 0)) * BIZ_RATE;
  let n = Math.min(Math.floor(b.frac), b.stock);
  b.frac -= Math.floor(b.frac);
  if (n > 0) { b.stock -= n; b.till += n * priceOf(b.kind, b.level); }
  if (b.stock <= 0) b.frac = 0;
  return n;
}

// Buying stock. Returns { ok, why } or { ok, n, cost }.
export function buyStock(b, n, cash) {
  n = Math.floor(n);
  if (!Number.isFinite(n) || n < 1) return { ok: false, why: 'Pick how many to order.' };
  const room = STOCK_CAP(b.level) - b.stock;
  if (room <= 0) return { ok: false, why: 'Your storeroom is full.' };
  n = Math.min(n, room);
  const cost = n * KINDS[b.kind].cost;
  if (cash < cost) return { ok: false, why: `${n} ${KINDS[b.kind].item.toLowerCase()}s cost ₦${cost.toLocaleString('en-US')} from the wholesaler.` };
  return { ok: true, n, cost };
}