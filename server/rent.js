// Adulthood: renting a built business to another player. Rules only (no network, no database), like race.js and business.js.
// The owner lists a built business with a rent per day. A tenant pays the first days up front plus a one-day deposit and then
// RUNS the business (stock, staff, duties, till, profit). The owner keeps the land and gets the rent. The game keeps a small fee.

export const DAY_MS = Number(process.env.RENT_DAY_MS) || 86400000;   // one rental day (tests shorten it)
export const RENT_MIN = 2000, RENT_MAX = 200000;                     // allowed rent per day
export const MIN_DAYS = 1, MAX_DAYS = 14;                            // how long one payment may cover; also the most you can have paid ahead
export const MAX_TENANCIES = 2;                                      // most businesses one player may rent at once
export const RENT_FEE = 0.05;                                        // the game keeps 5% of each rent payment

export const isRent = (n) => Number.isInteger(n) && n >= RENT_MIN && n <= RENT_MAX;
export const isDays = (n) => Number.isInteger(n) && n >= MIN_DAYS && n <= MAX_DAYS;
export const ownerNet = (amount) => Math.floor(amount * (1 - RENT_FEE));

// What it costs to start a lease: the days up front plus a refundable deposit of one day's rent.
export const startCost = (rent, days) => rent * days + rent;

// A lease record: { tenant, tenantName, rent, until, deposit }. active = it has not run out yet.
export const isActive = (lease, now) => Boolean(lease && lease.until > now);
export const daysLeft = (lease, now) => (lease ? Math.max(0, (lease.until - now) / DAY_MS) : 0);

export function newLease(tenant, tenantName, rent, days, now) {
  return { tenant, tenantName, rent, until: now + days * DAY_MS, deposit: rent };
}

// Adding days to a running lease. Never more than MAX_DAYS paid ahead.
export function extend(lease, days, now) {
  if (!isDays(days)) return { ok: false, why: `Pick 1 to ${MAX_DAYS} days.` };
  const ahead = Math.max(0, lease.until - now) / DAY_MS;
  if (ahead + days > MAX_DAYS + 1e-9) return { ok: false, why: `You can be paid up at most ${MAX_DAYS} days ahead.` };
  return { ok: true, cost: lease.rent * days, until: Math.max(lease.until, now) + days * DAY_MS };
}

// How a lease is stored and read back (JSON in lots.lease). Bad data becomes "no listing, no lease".
export function parse(text) {
  try {
    const o = JSON.parse(text || '{}');
    const ask = isRent(o.ask) ? o.ask : 0;
    const L = o.lease;
    const lease = L && Number.isInteger(L.tenant) && isRent(L.rent) && Number.isFinite(L.until)
      ? { tenant: L.tenant, tenantName: String(L.tenantName || '').slice(0, 30), rent: L.rent, until: L.until, deposit: Number.isInteger(L.deposit) ? L.deposit : L.rent }
      : null;
    return { ask, lease };
  } catch { return { ask: 0, lease: null }; }
}
export const stringify = (ask, lease) => (ask || lease ? JSON.stringify({ ask: ask || 0, lease: lease || null }) : '');
