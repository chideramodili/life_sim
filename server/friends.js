// Adulthood: friends, private messages, phone numbers, and sending money. Rules only (no network, no database), like bank.js and home.js.
// The server stores the friendships and messages. Phone numbers are made-up in-game numbers, never real ones.

export const MAX_FRIENDS = 100;
export const MAX_REQUESTS_OUT = 20;     // waiting requests you have sent
export const DM_KEEP = 200;             // messages kept per pair of friends
export const DM_SHOW = 40;              // messages shown when you open a chat
export const PHONE_RE = /^0700\d{7}$/;
export const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

// A new in-game phone number: 0700 followed by seven digits. The server keeps trying until one is unused.
export function newPhone(rand = Math.random) {
  let s = '0700';
  for (let i = 0; i < 7; i++) s += Math.floor(rand() * 10);
  return s;
}
export const phoneText = (n) => (typeof n === 'string' && PHONE_RE.test(n) ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : '');

// Sending money. Only between friends. The limits grow with the age of the account (online time), so a brand new account
// cannot be used to move large sums around. Money is conserved: what one wallet loses, the other gains.
export const TRANSFER_TIERS = [
  { id: 'new',     fromDays: 0,  perSend: 20000,  perDay: 50000 },
  { id: 'member',  fromDays: 3,  perSend: 100000, perDay: 250000 },
  { id: 'trusted', fromDays: 10, perSend: 300000, perDay: 1000000 },
];
export const TRANSFER_MIN = 100;
const DAY = 1440;
export function transferTier(ageMin) {
  const days = (Number.isFinite(ageMin) ? ageMin : 0) / DAY;
  let t = TRANSFER_TIERS[0];
  for (const x of TRANSFER_TIERS) if (days >= x.fromDays) t = x;
  return t;
}
const fail = (why) => ({ ok: false, why });
// sentToday = what this player already sent in the last 24 real hours.
export function checkTransfer({ amount, cash, ageMin, sentToday }) {
  if (!Number.isInteger(amount) || amount < TRANSFER_MIN) return fail(`The smallest amount you can send is ₦${TRANSFER_MIN}.`);
  const t = transferTier(ageMin);
  if (amount > t.perSend) return fail(`You can send up to ₦${t.perSend.toLocaleString('en-NG')} at a time for now.`);
  if (sentToday + amount > t.perDay) return fail(`That goes over your limit of ₦${t.perDay.toLocaleString('en-NG')} a day.`);
  if (amount > cash) return fail('Not enough cash in your wallet.');
  return { ok: true, why: '', tier: t };
}
export const transferLimits = (ageMin) => {
  const t = transferTier(ageMin);
  return { perSend: t.perSend, perDay: t.perDay, min: TRANSFER_MIN };
};