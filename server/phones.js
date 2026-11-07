// Adulthood: phones. Pure rules (no network or database).
// Everyone starts with the Basic phone (messages, calls and money transfers). Better phones are sold at the Shop.
// Only phones with a camera can take Photos and Selfies. The other differences are for show (placeholders to tune).
export const PHONES = {
  basic:    { label: 'Kanis Basic',   cost: 0,      camera: false, color: '#6b7280', text: 'Calls, messages and sending money. No camera.' },
  smart:    { label: 'Zephyr S',      cost: 45000,  camera: true,  color: '#3b82f6', text: 'A camera for Photos and Selfies.' },
  pro:      { label: 'Zephyr Pro',    cost: 150000, camera: true,  color: '#a855f7', text: 'Bigger screen, better camera. People notice it.' },
  flagship: { label: 'Zephyr Ultra',  cost: 400000, camera: true,  color: '#f59e0b', text: 'The best phone in the city.' },
};
export const PHONE_IDS = Object.keys(PHONES);
const has = (o, k) => Object.hasOwn(o, k);

// What is saved: the phones you own and the one you use. Anything odd in the saved text is dropped.
export function parsePhones(json) {
  let owned = ['basic'], active = 'basic';
  try {
    const d = json ? JSON.parse(json) : null;
    if (d && Array.isArray(d.owned)) owned = [...new Set(['basic', ...d.owned.filter((id) => typeof id === 'string' && has(PHONES, id))])];
    if (d && typeof d.active === 'string' && owned.includes(d.active)) active = d.active;
  } catch { /* keep the defaults */ }
  return { owned, active };
}
export const serializePhones = (s) => JSON.stringify({ owned: s.owned, active: s.active });

// Buy a phone. Returns { ok, why, state, cost }; the new phone becomes the one you use.
export function buyPhone(state, cash, id) {
  if (typeof id !== 'string' || !has(PHONES, id)) return { ok: false, why: 'No such phone.' };
  if (state.owned.includes(id)) return { ok: false, why: 'You already own that phone.' };
  const cost = PHONES[id].cost;
  if (cash < cost) return { ok: false, why: `${PHONES[id].label} costs ₦${cost.toLocaleString('en-US')}.` };
  return { ok: true, why: '', cost, state: { owned: [...state.owned, id], active: id } };
}
// Switch to a phone you already own.
export function usePhone(state, id) {
  if (typeof id !== 'string' || !state.owned.includes(id)) return { ok: false, why: 'You do not own that phone.' };
  return { ok: true, why: '', state: { owned: state.owned, active: id } };
}
export const hasCamera = (state) => Boolean(PHONES[state.active] && PHONES[state.active].camera);