// Adulthood: land and player businesses. Rules only (no network, no database), like bank.js and home.js.
// You BUY a lot, BUILD a business on it, STOCK it, and customers buy from it (townspeople on their own, and other players).
// Money from sales waits in the till until the owner collects it. Every number here is a placeholder to tune.

export const MAX_LOTS = Number(process.env.MAX_LOTS) || 3;          // most lots one player can own
export const SELL_LAND = 0.6;       // selling a lot back pays 60% of its price
export const BIZ_MAX_LEVEL = 4;     // level 4 is Automation: same strength as level 3, but it runs itself
export const UPGRADE_COST = { 2: 90000, 3: 220000, 4: 600000 };   // cost to reach that level
const eff = (level) => Math.min(level, 3);   // levels 1-3 make the shop stronger; level 4 adds automation on top of level 3
export const isAuto = (b) => b.level >= 4;
export const STOCK_CAP = (level) => 40 * eff(level);
export const RATE_MULT = (level) => 1 + 0.6 * (eff(level) - 1);      // more customers at higher levels
export const PRICE_MULT = (level) => 1 + 0.15 * (eff(level) - 1);    // and a bit more per sale
export const STAFF_WAGE = Number(process.env.STAFF_WAGE) || 2400;   // per staff member per real hour of opening time, paid from the till
export const STAFF_BOOST = 0.4;                                      // each staff member adds 40% more customers
export const STAFF_MAX = (level) => eff(level) + 1;                       // 2, 3 or 4 staff by level
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
export const newBiz = (kind, name, now) => ({ kind, name: name.trim(), level: 1, stock: 0, till: 0, frac: 0, built: now, staff: 0, owed: 0, rep: 50, promoUntil: 0, cd: {} });

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

// Owner duties: do them inside your own business. Each has a cooldown (real seconds).
export const PROMO_MULT = 1.8, PROMO_SECONDS = 600, PROMO_COST = 5000, TRAIN_COST = 8000;
export const repMult = (b) => 0.7 + 0.6 * ((b.rep ?? 50) / 100);         // rating 0 = 30% fewer customers, 100 = 30% more
export const DUTIES = {
  clean: { label: 'Clean the shop', text: '+10 rating', cd: 180 },
  serve: { label: 'Serve customers', text: 'Sell up to 5 items yourself right now', cd: 60 },
  promo: { label: 'Run a promotion', text: `₦${PROMO_COST.toLocaleString('en-US')}: 80% more customers for 10 minutes`, cd: 1800 },
  train: { label: 'Train the staff', text: `₦${TRAIN_COST.toLocaleString('en-US')}: +15 rating (needs a team member)`, cd: 1200 },
};
export const DUTY_IDS = Object.keys(DUTIES);
export const dutyLeft = (b, id, now) => Math.max(0, Math.ceil((((b.cd || {})[id] || 0) + DUTIES[id].cd * 1000 - now) / 1000));
// Does one duty. cash = the owner's cash, open = is the shop open. Returns { ok, why } or { ok, cost, msg, sold }.
export function doDuty(b, id, cash, open, now) {
  if (!DUTIES[id]) return { ok: false, why: 'Unknown task.' };
  const w = dutyLeft(b, id, now);
  if (w > 0) return { ok: false, why: `${DUTIES[id].label} again in ${w >= 60 ? Math.ceil(w / 60) + ' min' : w + ' s'}.` };
  let cost = 0, sold = 0, msg = '';
  if (id === 'clean') { b.rep = Math.min(100, (b.rep ?? 50) + 10); msg = 'You cleaned the shop. Rating +10.'; }
  else if (id === 'serve') {
    if (!open) return { ok: false, why: `${b.name} is closed.` };
    sold = Math.min(5, b.stock);
    if (sold <= 0) return { ok: false, why: 'Nothing in stock to sell.' };
    b.stock -= sold; b.till += sold * priceOf(b.kind, b.level); msg = `You served ${sold} customer${sold > 1 ? 's' : ''}.`;
  } else if (id === 'promo') {
    if (cash < PROMO_COST) return { ok: false, why: `A promotion costs ₦${PROMO_COST.toLocaleString('en-US')}.` };
    cost = PROMO_COST; b.promoUntil = now + PROMO_SECONDS * 1000; msg = 'Promotion running for 10 minutes: 80% more customers.';
  } else if (id === 'train') {
    if (!(b.staff > 0)) return { ok: false, why: 'Hire a team member first.' };
    if (cash < TRAIN_COST) return { ok: false, why: `Training costs ₦${TRAIN_COST.toLocaleString('en-US')}.` };
    cost = TRAIN_COST; b.rep = Math.min(100, (b.rep ?? 50) + 15); msg = 'Staff trained. Rating +15.';
  }
  b.cd = { ...(b.cd || {}), [id]: now };
  return { ok: true, cost, sold, msg };
}

// Let time pass for one business: townspeople buy while it is open and there is stock. Returns how many were sold.
export function step(b, dtSec, open, now = Date.now()) {
  if (open && dtSec > 0) b.rep = Math.max(0, Math.min(100, (b.rep ?? 50) + (dtSec / 60) * (b.stock <= 0 ? -0.5 : 0.1)));   // a sold-out shop loses its good name, a stocked one slowly earns it
  if (!open || b.stock <= 0 || dtSec <= 0) return 0;
  b.frac += (dtSec / 60) * KINDS[b.kind].rate * RATE_MULT(b.level) * (1 + STAFF_BOOST * (b.staff || 0)) * repMult(b) * (now < (b.promoUntil || 0) ? PROMO_MULT : 1) * BIZ_RATE;
  let n = Math.min(Math.floor(b.frac), b.stock);
  b.frac -= Math.floor(b.frac);
  if (n > 0) { b.stock -= n; b.till += n * priceOf(b.kind, b.level); }
  if (b.stock <= 0) b.frac = 0;
  return n;
}

// Automation (level 4): the till restocks the shop when it is half empty, wages are paid from the till as before, and the
// profit above a safe reserve is sent to the owner. Returns { bought, send } and the caller moves the money.
export const AUTO_MIN_SEND = 3000;
export function autoStep(b) {
  const K = KINDS[b.kind], cap = STOCK_CAP(b.level);
  let bought = 0;
  if (b.stock <= cap / 2) {
    const n = Math.min(cap - b.stock, Math.floor(b.till / K.cost));
    if (n > 0) { b.stock += n; b.till -= n * K.cost; bought = n; }
  }
  const reserve = Math.ceil(cap / 2) * K.cost + STAFF_WAGE * (b.staff || 0) * 2;   // keeps the next restock and two hours of wages
  const extra = Math.floor(b.till - reserve);
  return { bought, send: extra >= AUTO_MIN_SEND ? extra : 0 };
}

// What a built business is worth to its owner when selling (build cost plus the upgrades paid for).
export const buildingValue = (b) => KINDS[b.kind].build + Object.entries(UPGRADE_COST).filter(([lv]) => Number(lv) <= b.level).reduce((a, [, c]) => a + c, 0);

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
