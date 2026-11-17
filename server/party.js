// Adulthood: parties. Rules only (no network, no database).
// Host a party where you stand. Anyone close by (on foot or driving) gets fun and social while it lasts; the host earns a bonus for each new guest.
export const PARTY_COST = 20000;
export const PARTY_SECONDS = Number(process.env.PARTY_SECONDS) || 10 * 60;
export const PARTY_RADIUS = 28;                    // metres from the party spot
export const PARTY_COOLDOWN_MS = Number(process.env.PARTY_COOLDOWN_MS ?? 3600 * 1000);   // one party an hour per host
export const GUEST_PAY = 2000, GUEST_CAP = 12;     // the host earns this per new guest, for up to this many guests
export const TICK_FX = { fun: 1.2, social: 1.2 };  // per 5-second tick while you are at the party
export const NAMES = ['House Party', 'Street Party', 'Birthday Bash', 'Block Party'];
