// Adulthood: phones. Pure rules (no network or database).
// Everyone starts with the Basic phone (messages, calls and money transfers). Better phones are sold at the Shop.
// Only phones with a camera can take Photos and Selfies. The other differences are for show (placeholders to tune).
export const PHONES = {
  basic:    { label: 'Kanis Basic',    brand: 'Kanis',  cost: 0,       camera: false, color: '#6b7280', text: 'Calls, messages and sending money. No camera.' },
  lite:     { label: 'Kanis Lite',     brand: 'Kanis',  cost: 12000,   camera: false, color: '#4b8f6a', text: 'Tough and cheap. Long battery, still no camera.' },
  plus:     { label: 'Kanis Plus',     brand: 'Kanis',  cost: 25000,   camera: true,  color: '#2f9e8f', text: 'Your first camera phone. Simple and honest.' },
  smart:    { label: 'Zephyr S',       brand: 'Zephyr', cost: 45000,   camera: true,  color: '#3b82f6', text: 'A camera for Photos and Selfies.' },
  go:       { label: 'Nuvo Go',        brand: 'Nuvo',   cost: 60000,   camera: true,  color: '#ec4899', text: 'Colourful and light. Popular with students.' },
  a1:       { label: 'Orbit A1',       brand: 'Orbit',  cost: 85000,   camera: true,  color: '#f97316', text: 'Good screen for the price. Everyone has one.' },
  pro:      { label: 'Zephyr Pro',     brand: 'Zephyr', cost: 150000,  camera: true,  color: '#a855f7', text: 'Bigger screen, better camera. People notice it.' },
  max:      { label: 'Nuvo Max',       brand: 'Nuvo',   cost: 220000,  camera: true,  color: '#be185d', text: 'Huge screen and a fast chip. For serious scrolling.' },
  x:        { label: 'Orbit X',        brand: 'Orbit',  cost: 280000,  camera: true,  color: '#0ea5e9', text: 'Three cameras and a very bright screen.' },
  flagship: { label: 'Zephyr Ultra',   brand: 'Zephyr', cost: 400000,  camera: true,  color: '#f59e0b', text: 'The best phone in the city.' },
  fold:     { label: 'Lumen Fold',     brand: 'Lumen',  cost: 650000,  camera: true,  color: '#14b8a6', text: 'Folds in half. A phone and a tablet in one.' },
  titan:    { label: 'Nuvo Titan',     brand: 'Nuvo',   cost: 900000,  camera: true,  color: '#64748b', text: 'Titanium body. Survives anything, even your kids.' },
  gold:     { label: 'Orbit Gold',     brand: 'Orbit',  cost: 1500000, camera: true,  color: '#d4a017', text: 'Gold-coloured and very loud about it.' },
  royale:   { label: 'Lumen Royale',   brand: 'Lumen',  cost: 3000000, camera: true,  color: '#7c3aed', text: 'The most expensive phone money can buy. Not for browsing.' },
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
