// Adulthood: what land is worth. Rules only. Land gains value as a city fills up and as time passes (it never depreciates).
export const LAUNCH = Date.UTC(2026, 10, 15);   // the day land started gaining value
export const DAY_GROWTH = 0.01;                 // +1% of the starting price for every real day...
export const TIME_CAP = 2.5;                    // ...up to 2.5 times
export const SCARCITY_EXTRA = 2.0;              // a city with every lot owned is worth 3x (1 + this) from scarcity alone
export const SELL_TO_GAME = 0.85;               // selling to the game pays 85% of today's land value
export const BUILDING_BACK = 0.5;               // and 50% of what you spent building and upgrading
export const MARKET_FEE = 0.05;                 // the game keeps 5% when a player buys from another player
export const ASK_MIN = 0.3, ASK_MAX = 20;       // an asking price must be between 30% and 20x today's value

// How much the starting price is multiplied by right now. owned/total = share of this city's lots that someone owns.
export function landMult(owned, total, now = Date.now()) {
  const frac = total > 0 ? Math.min(1, owned / total) : 0;
  const scarcity = 1 + SCARCITY_EXTRA * frac * frac;
  const days = Math.max(0, (now - LAUNCH) / 86400000);
  const time = Math.min(TIME_CAP, 1 + DAY_GROWTH * days);
  return scarcity * time;
}
export const lotPrice = (base, mult) => Math.max(1000, Math.round((base * mult) / 500) * 500);

export const isAsk = (n, value) => Number.isFinite(n) && Number.isInteger(n) && n >= Math.ceil(value * ASK_MIN) && n <= value * ASK_MAX;
export const marketNet = (ask) => Math.floor(ask * (1 - MARKET_FEE));
