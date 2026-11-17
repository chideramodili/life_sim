// Adulthood: friends, private messages, phone numbers, and sending money. Rules only (no network, no database), like bank.js and home.js.
// The server stores the friendships and messages. Phone numbers are made-up in-game numbers, never real ones.

import { capacityOf } from './bank.js';

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
const r1000 = (n) => Math.floor(n / 1000) * 1000;
// Like a real bank, the limits rise with the account: a Trusted account's limits follow its capacity (which grows with the money
// that moves through it and with the player level). Receiving is allowed twice what you can send, per transfer and per day.
export function limitsOf(bank) {
  const t = transferTier(bank.ageMin);
  let perSend = t.perSend, perDay = t.perDay;
  if (t.id === 'trusted') {
    const cap = capacityOf(bank);
    perSend = Math.max(perSend, r1000(cap * 0.15));
    perDay = Math.max(perDay, r1000(cap * 0.5));
  }
  return { perSend, perDay, perReceive: perSend * 2, perDayReceive: perDay * 2, min: TRANSFER_MIN, tier: t };
}
const fmt = (n) => n.toLocaleString('en-NG');
// sentToday = what the sender already sent in the last 24 real hours; receivedToday = what the receiver already got in that time.
export function checkTransfer({ amount, cash, bank, toBank, sentToday, receivedToday }) {
  if (!Number.isInteger(amount) || amount < TRANSFER_MIN) return fail(`The smallest amount you can send is ₦${TRANSFER_MIN}.`);
  const L = limitsOf(bank);
  if (amount > L.perSend) return fail(`You can send up to ₦${fmt(L.perSend)} at a time for now. Your limit grows as you earn, save and send money.`);
  if (sentToday + amount > L.perDay) return fail(`That goes over your limit of ₦${fmt(L.perDay)} a day.`);
  if (amount > cash) return fail('Not enough cash in your wallet.');
  const R = limitsOf(toBank);
  if (amount > R.perReceive) return fail('They cannot receive that much at once yet. Their limit grows as they use their account.');
  if (receivedToday + amount > R.perDayReceive) return fail('That is more than they can receive today.');
  return { ok: true, why: '', tier: L.tier };
}
export const transferLimits = (bank) => {
  const L = limitsOf(bank);
  return { perSend: L.perSend, perDay: L.perDay, perReceive: L.perReceive, perDayReceive: L.perDayReceive, min: TRANSFER_MIN };
};
