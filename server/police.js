// Crime and fines. Pure rules: no network, no database. index.js stores the list and moves the money.
export const DAY = 1440;                 // game minutes in a day
export const OFFENCES = {
  theft: { label: 'Theft at the Market', fine: 5000, rep: -10, jailSec: 90 },
  redlight: { label: 'Running a red light', fine: 3000, rep: -5, jailSec: 60 },
  hitrun: { label: 'Hit and run', fine: 8000, rep: -15, jailSec: 90 },
  evading: { label: 'Evading police', fine: 5000, rep: -8, jailSec: 90 },
};
export const STEAL = { min: 1500, max: 4000, catchChance: 0.35, cooldownMs: 20000 };
export const GRACE_DAYS = 1;             // a fine can be paid at face value for one game day
export const LATE_PER_DAY = 0.1;         // then it grows 10% of its face value per day...
export const LATE_CAP = 0.5;             // ...up to +50%
export const MAX_FINES = 20;
export const ARREST_AT = 15000;          // overdue fines at or above this can get you picked up on the street
export const ARREST_JAIL_SEC = 120;
export const PATROL_EVERY_MS = 60000;
export const PATROL_CHANCE = 0.25;

const isInt = (n) => Number.isInteger(n);

export function cleanFines(json) {
  let arr = [];
  try { arr = typeof json === 'string' ? JSON.parse(json) : json; } catch { arr = []; }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((f) => f && typeof f === 'object' && isInt(f.id) && f.id > 0 && Object.hasOwn(OFFENCES, f.kind) && isInt(f.base) && f.base > 0 && f.base <= 1e6 && Number.isFinite(f.at))
    .slice(0, MAX_FINES)
    .map((f) => ({ id: f.id, kind: f.kind, base: f.base, at: f.at }));
}

export function newFine(fines, kind, gameMin) {
  if (!Object.hasOwn(OFFENCES, kind)) return null;
  if (fines.length >= MAX_FINES) return null;
  const id = fines.reduce((m, f) => Math.max(m, f.id), 0) + 1;
  const f = { id, kind, base: OFFENCES[kind].fine, at: Math.floor(gameMin) };
  fines.push(f);
  return f;
}

export function daysOverdue(f, gameMin) {
  return Math.max(0, (gameMin - f.at) / DAY - GRACE_DAYS);
}
export function fineAmount(f, gameMin) {
  const extra = Math.min(LATE_CAP, daysOverdue(f, gameMin) * LATE_PER_DAY);
  return Math.round(f.base * (1 + extra));
}
export const isOverdue = (f, gameMin) => daysOverdue(f, gameMin) > 0;
export const totalDue = (fines, gameMin) => fines.reduce((s, f) => s + fineAmount(f, gameMin), 0);
export const overdueTotal = (fines, gameMin) => fines.filter((f) => isOverdue(f, gameMin)).reduce((s, f) => s + fineAmount(f, gameMin), 0);

export function fineView(f, gameMin) {
  const od = isOverdue(f, gameMin);
  return {
    id: f.id, label: OFFENCES[f.kind].label, amount: fineAmount(f, gameMin), base: f.base, overdue: od,
    day: Math.floor(f.at / DAY) + 1,
    dueIn: od ? 0 : Math.max(0, Math.ceil((f.at + GRACE_DAYS * DAY - gameMin) / 60)), // hours left at face value
  };
}

// Pay one fine. Changes the list. Returns { ok, paid, msg }.
export function payFine(fines, id, cash, gameMin) {
  const i = fines.findIndex((f) => f.id === id);
  if (i < 0) return { ok: false, paid: 0, msg: 'That fine is not on your record.' };
  const amt = fineAmount(fines[i], gameMin);
  if (cash < amt) return { ok: false, paid: 0, msg: `Not enough cash. This fine is ₦${amt.toLocaleString('en-NG')}.` };
  fines.splice(i, 1);
  return { ok: true, paid: amt, msg: `Fine paid: ₦${amt.toLocaleString('en-NG')}.` };
}
// Pay as many as cash allows, oldest first. Used at the counter and when you are arrested.
export function payOldestFirst(fines, cash, gameMin) {
  let paid = 0;
  const left = [];
  for (const f of [...fines].sort((a, b) => a.at - b.at)) {
    const amt = fineAmount(f, gameMin);
    if (paid + amt <= cash) paid += amt;
    else left.push(f);
  }
  fines.length = 0;
  fines.push(...left);
  return paid;
}

// Stealing: random decides. rand() is a number in [0, 1). Returns { caught, loot }.
export function stealOutcome(rand, repScore = 0) {
  const chance = Math.min(0.8, STEAL.catchChance + (repScore < 0 ? 0.15 : 0)); // police watch people with a bad name closely
  const caught = rand() < chance;
  const loot = STEAL.min + Math.floor(rand() * (STEAL.max - STEAL.min + 1));
  return { caught, loot };
}

export const wantedByPolice = (fines, gameMin) => overdueTotal(fines, gameMin) >= ARREST_AT;