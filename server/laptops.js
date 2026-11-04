// Adulthood: laptops. Pure rules (no network or database).
// You need a laptop to learn Coding and to do remote developer jobs. Better laptops are needed for better jobs.
// Sold at the Shop. Prices are placeholders to tune. Brands are invented.
export const LAPTOPS = {
  student: { label: 'Kanis Student 11',  tier: 1, cost: 150000,  color: '#4b8f6a', text: 'Slow but it works. Enough to learn to code and take junior developer work.' },
  work:    { label: 'Zephyr Book 14',    tier: 2, cost: 350000,  color: '#3b82f6', text: 'A proper work laptop. Needed for senior developer work.' },
  pro:     { label: 'Orbit Pro 16',      tier: 3, cost: 900000,  color: '#f97316', text: 'Fast and light. Developers love it.' },
  studio:  { label: 'Lumen Studio 17',   tier: 4, cost: 2200000, color: '#7c3aed', text: 'The best laptop in the city. Mostly for showing off.' },
};
export const LAPTOP_IDS = Object.keys(LAPTOPS);
const has = (o, k) => Object.hasOwn(o, k);

// The laptop you own (the best one you bought, or null). Anything odd in the saved text is dropped.
export const parseLaptop = (s) => (typeof s === 'string' && has(LAPTOPS, s) ? s : null);
export const laptopTier = (id) => (id && has(LAPTOPS, id) ? LAPTOPS[id].tier : 0);

// Buy a laptop. You can buy only a better one than you own (the old one is traded in at half price).
export function buyLaptop(owned, cash, id) {
  if (typeof id !== 'string' || !has(LAPTOPS, id)) return { ok: false, why: 'No such laptop.' };
  if (owned === id) return { ok: false, why: 'You already own that laptop.' };
  if (laptopTier(owned) >= LAPTOPS[id].tier) return { ok: false, why: 'You already own a better laptop.' };
  const trade = owned ? Math.floor(LAPTOPS[owned].cost / 2) : 0;
  const cost = LAPTOPS[id].cost - trade;
  if (cash < cost) return { ok: false, why: `${LAPTOPS[id].label} costs ₦${cost.toLocaleString('en-US')}${trade ? ' after trading in your old one' : ''}.` };
  return { ok: true, why: '', cost, trade, laptop: id };
}
// What a job needs: job.laptop is the lowest tier. Returns '' when fine.
export function laptopWhy(job, owned) {
  if (!job.laptop) return '';
  if (laptopTier(owned) >= job.laptop) return '';
  const need = LAPTOP_IDS.find((id) => LAPTOPS[id].tier >= job.laptop);
  return `Needs a laptop (${LAPTOPS[need].label} or better)`;
}
