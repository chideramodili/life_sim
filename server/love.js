// Adulthood: relationships. Rules only (no network, no database).
// Two friends can start dating, go on date nights to grow their love score, and later marry. Everything needs both players online.
export const DATE_COST = 3000;            // paid by whoever starts the date night
export const DATE_LOVE = 10;              // love gained by both, per date night
export const DATE_COOLDOWN = (Number(process.env.LOVE_DATE_CD_MS) || 20 * 60 * 1000);
export const MARRY_LOVE = 40;             // love needed to propose
export const MARRY_AFTER = (process.env.LOVE_MARRY_AFTER_MS !== undefined ? Number(process.env.LOVE_MARRY_AFTER_MS) : 12 * 3600 * 1000);   // dating time needed to propose
export const RING = 200000;
export const WEDDING_GIFT = 25000;        // each partner
export const DIVORCE_FEE = 100000;
export const ASK_SECONDS = 120;           // how long a question waits for an answer
export const DATE_FX = { fun: 30, social: 25 };

export const stageName = (status) => (status === 'married' ? 'Married 💍' : 'Dating ❤️');
// What can this couple do now? c = { status, love, at, lastDate }.
export function coupleView(c, now) {
  const dateWait = Math.max(0, Math.ceil(((c.last_date || 0) + DATE_COOLDOWN - now) / 1000));
  const marryIn = c.status === 'dating' ? Math.max(0, Math.ceil((c.at + MARRY_AFTER - now) / 1000)) : 0;
  return { status: c.status, love: Math.min(100, Math.round(c.love)), dateWait, marryIn, needLove: c.status === 'dating' && c.love < MARRY_LOVE ? MARRY_LOVE - Math.round(c.love) : 0 };
}
export const canMarry = (c, now) => c.status === 'dating' && c.love >= MARRY_LOVE && now >= c.at + MARRY_AFTER;
