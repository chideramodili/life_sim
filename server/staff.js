// Hired help for your home and your car. Everything here is decided by the server: the browser only asks.
export const STAFF = {
  driver:  { label: 'Driver',  icon: '🚘', fee: 3000, wage: 1800, text: 'Drives you in your own car. Car trips cost nothing and you rest in the back, so you gain some Energy. You need a car.' },
  cleaner: { label: 'Cleaner', icon: '🧹', fee: 3000, wage: 1200, text: 'Keeps your home tidy: your Clean need drops half as fast while you are at home.' },
  cook:    { label: 'Cook',    icon: '🍲', fee: 3000, wage: 1500, text: 'Cooks for you at home: your Food need drops half as fast while you are at home.' },
};
export const STAFF_IDS = Object.keys(STAFF);
export const WAGE_EVERY_MS = 60 * 60 * 1000;   // a wage is paid for every real hour you are online with them hired
export const HOME_SLOWDOWN = 0.5;               // cleaner and cook halve that need's drop at home
export const DRIVER_ENERGY = 8;                 // Energy gained on each car trip with a driver

// What is saved: { driver: { acc: ms online since the last wage }, ... } for the staff you have hired.
export function parseStaff(json) {
  const out = {};
  try {
    const o = json ? JSON.parse(json) : {};
    for (const id of STAFF_IDS) if (o && typeof o[id] === 'object' && o[id]) out[id] = { acc: Math.max(0, Math.min(WAGE_EVERY_MS, Number(o[id].acc) || 0)) };
  } catch { /* nobody hired */ }
  return out;
}

// What the phone shows.
export function staffInfo(staff, cash, hasCar) {
  return {
    cash,
    list: STAFF_IDS.map((id) => {
      const s = STAFF[id], hired = Object.hasOwn(staff, id);
      return {
        id, label: s.label, icon: s.icon, text: s.text, fee: s.fee, wage: s.wage, hired,
        minsToWage: hired ? Math.max(1, Math.ceil((WAGE_EVERY_MS - staff[id].acc) / 60000)) : null,
        locked: id === 'driver' && !hasCar ? 'You need a car first. Buy one at the car dealer.' : null,
      };
    }),
  };
}

// Hire: returns { ok, why, cost }. Firing is free and always works.
export function hire(staff, cash, id, hasCar) {
  if (!Object.hasOwn(STAFF, id)) return { ok: false, why: 'There is no such job.' };
  if (Object.hasOwn(staff, id)) return { ok: false, why: `You already have a ${STAFF[id].label.toLowerCase()}.` };
  if (id === 'driver' && !hasCar) return { ok: false, why: 'You need a car before you can hire a driver.' };
  if (cash < STAFF[id].fee) return { ok: false, why: `The hiring fee is ₦${STAFF[id].fee.toLocaleString('en-NG')}. You do not have enough cash.` };
  staff[id] = { acc: 0 };
  return { ok: true, cost: STAFF[id].fee };
}
export function fire(staff, id) {
  if (!Object.hasOwn(staff, id)) return false;
  delete staff[id];
  return true;
}

// Called every needs tick while the player is online. Pays wages that are due. Returns { paid, quit: [ids] }.
export function payWages(staff, cash, dtMs, hasCar) {
  let paid = 0; const quit = [];
  for (const id of Object.keys(staff)) {
    if (id === 'driver' && !hasCar) { quit.push(id); continue; }          // the car is gone, so is the job
    staff[id].acc += dtMs;
    while (staff[id].acc >= WAGE_EVERY_MS) {
      staff[id].acc -= WAGE_EVERY_MS;
      if (cash - paid >= STAFF[id].wage) paid += STAFF[id].wage;
      else { quit.push(id); break; }                                       // could not pay: they leave
    }
  }
  for (const id of quit) delete staff[id];
  return { paid, quit };
}
