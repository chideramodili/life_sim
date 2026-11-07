// Adulthood: the shared world rules. The game clock, opening hours, bills, and city events.
// This file only holds rules and small helper functions (no network, no database), so it is easy to test and to tune.

// ---------- The clock ----------
// 1 game day = 2 real hours by default (DAY_REAL_MIN=60 gives the old one-hour day). So 1 game minute = 5 real seconds.
export const DAY_MIN = 1440;                 // minutes in a game day
export const REAL_MS_PER_DAY = (Number(process.env.DAY_REAL_MIN) > 0 ? Number(process.env.DAY_REAL_MIN) : 120) * 60 * 1000;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Game minutes that pass during realMs real milliseconds.
export const gameMinutesFor = (realMs, speed = 1) => (realMs / REAL_MS_PER_DAY) * DAY_MIN * speed;

// gameMin is the total game minutes since the world began. Day 1 is a Monday.
export function clockParts(gameMin) {
  const total = Math.max(0, Math.floor(gameMin));
  const day = Math.floor(total / DAY_MIN) + 1;
  const minute = total % DAY_MIN;
  return {
    day,
    minute,
    hour: Math.floor(minute / 60),
    mins: minute % 60,
    weekday: WEEKDAYS[(day - 1) % 7],
  };
}

// night 21:00-05:00, dawn 05:00-08:00, day 08:00-17:00, dusk 17:00-21:00
export function phaseOf(hour) {
  if (hour >= 21 || hour < 5) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 17) return 'day';
  return 'dusk';
}

export const pad2 = (n) => String(n).padStart(2, '0');
export const timeText = (minuteOfDay) => `${pad2(Math.floor(minuteOfDay / 60))}:${pad2(Math.floor(minuteOfDay % 60))}`;

// ---------- Opening hours ----------
// hours: null means always open. { open: 6, close: 22 } means 06:00 to 22:00.
// If close is smaller than open the venue stays open past midnight (the club: 20 to 5).
export function isOpen(hours, minuteOfDay) {
  if (!hours) return true;
  const h = minuteOfDay / 60;
  return hours.open <= hours.close ? h >= hours.open && h < hours.close : h >= hours.open || h < hours.close;
}
export function hoursText(hours) {
  return hours ? `${pad2(hours.open)}:00 to ${pad2(hours.close)}:00` : 'Always open';
}
// Game minutes until a venue that is open right now closes (Infinity if it never closes).
export function minutesUntilClose(hours, minuteOfDay) {
  if (!hours) return Infinity;
  const closeMin = hours.close * 60;
  let d = closeMin - minuteOfDay;
  if (d <= 0) d += DAY_MIN;
  return d;
}

// ---------- Bills ----------
// Every bill repeats every 7 game days. "left" is the game minutes until it is due.
// Past zero it is "due" for one game day (grace period), then "overdue" and the consequence starts.
// Bills only count down while the player is online, so being away never costs you.
export const BILL_PERIOD_MIN = 7 * DAY_MIN;   // rent every 7 days (14 real hours by default)
export const GRACE_MIN = DAY_MIN;             // 1 game day to pay after the due time
export const PAY_WINDOW_MIN = 3 * DAY_MIN;    // you may pay when it is due in 3 days or less
export const LATE_FEE_RATE = 0.1;             // 10 percent extra if you pay after it went overdue

// Amounts are placeholders to tune after watching real testers play.
export const BILLS = {
  rent:  { label: 'Rent',        amount: 120000, first: 7 * DAY_MIN, who: 'Mr. Sule',
           due: 'Rent is due. Mr. Sule is giving you until tomorrow.',
           bad: 'Mr. Sule changed the lock. You cannot enter your home until the rent is paid.',
           ok: 'Rent paid. Your key works again.' },
  power: { label: 'Electricity', amount: 20000,  first: 5 * DAY_MIN, who: 'Power company',
           due: 'Your electricity token is almost finished. Pay soon to avoid a power cut.',
           bad: 'Power cut! Your home is dark, and sleeping and showering there work badly.',
           ok: 'Power is back on.' },
  data:  { label: 'Phone data',  amount: 8000,   first: 3 * DAY_MIN, who: 'Network',
           due: 'Your data bundle is almost finished.',
           bad: 'You are out of data. You cannot send chat messages until you renew.',
           ok: 'Data renewed. Chat works again.' },
};
export const BILL_IDS = Object.keys(BILLS);

export function defaultBills() {
  return Object.fromEntries(BILL_IDS.map((id) => [id, BILLS[id].first]));
}

// Read saved bills safely. Anything missing or broken gets the starting value.
export function parseBills(json) {
  let raw = null;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  const out = defaultBills();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const id of BILL_IDS) {
      if (Number.isFinite(raw[id])) out[id] = Math.max(-30 * DAY_MIN, Math.min(raw[id], BILL_PERIOD_MIN + PAY_WINDOW_MIN));
    }
  }
  return out;
}

export function billStatus(left) {
  if (left > 0) return 'ok';
  return left > -GRACE_MIN ? 'due' : 'overdue';
}

// Move every bill forward by dtMin game minutes (online time only).
export function tickBills(bills, dtMin) {
  for (const id of BILL_IDS) bills[id] -= dtMin;
}

// What would paying cost right now? Also says whether paying is allowed yet.
export function quote(bills, id) {
  const left = bills[id];
  const status = billStatus(left);
  const amount = BILLS[id].amount;
  const fee = status === 'overdue' ? Math.round(amount * LATE_FEE_RATE) : 0;
  return { id, status, amount, fee, total: amount + fee, canPay: left <= PAY_WINDOW_MIN };
}

// Pay one period. Does not touch cash (the caller does that after checking).
// Paying while due or overdue starts a fresh full period (missed weeks are forgiven, the late fee is the penalty).
// Paying early adds one period on to what is left, up to a cap.
export function applyPayment(bills, id) {
  bills[id] = bills[id] <= 0 ? BILL_PERIOD_MIN : Math.min(bills[id] + BILL_PERIOD_MIN, BILL_PERIOD_MIN + PAY_WINDOW_MIN);
  return bills[id];
}

// What the player's home and phone are like right now.
export function consequences(bills) {
  return {
    locked: billStatus(bills.rent) === 'overdue',
    noPower: billStatus(bills.power) === 'overdue',
    noData: billStatus(bills.data) === 'overdue',
  };
}

// ---------- City events ----------
// Random events for the whole city. "seconds" is real seconds. Add a new event by adding a block here.
export const EVENTS = {
  rush_hour: {
    title: 'Rush Hour',
    text: 'The roads are jammed. Bus and taxi trips take longer and taxis cost more.',
    seconds: 600,
    travelTime: 1.5,
    taxiCost: 1.5,
  },
  flash_sale: {
    title: 'Flash Sale',
    text: 'The city is out shopping. Work shifts pay double right now!',
    seconds: 480,
    payMult: 2,
  },
  festival: {
    title: 'Street Festival',
    text: 'There is a festival at the Plaza. Playing there is twice as fun!',
    seconds: 480,
    funMult: 2,
    funRoom: 'plaza',
  },
};
export const EVENT_IDS = Object.keys(EVENTS);

// Choose the next event, never the same one twice in a row.
export function pickEvent(rand = Math.random, last = null) {
  const pool = EVENT_IDS.filter((id) => id !== last);
  return pool[Math.floor(rand() * pool.length)];
}

// Travel prices and times with the current event applied.
export function effectiveTravel(base, event) {
  const out = {};
  for (const [id, t] of Object.entries(base)) {
    let { cost, seconds } = t;
    if (event && event.travelTime && id !== 'walk' && id !== 'bike') seconds = Math.ceil(seconds * event.travelTime);
    if (event && event.taxiCost && id === 'taxi') cost = Math.round(cost * event.taxiCost);
    out[id] = { cost, seconds };
  }
  return out;
}

// How busy the roads and pavements are at a time of day, 0 to 1. Builds up smoothly before the morning and evening rush.
const TRAFFIC_KEYS = [
  [0, 0.25], [5, 0.3], [6, 0.5], [7, 0.85], [8, 1], [9, 0.9], [10, 0.7], [12, 0.75], [14, 0.7], [15.5, 0.8], [16.5, 0.95], [17.5, 1], [19, 0.85], [21, 0.55], [23, 0.35], [24, 0.25],
];
export function trafficLevel(minuteOfDay) {
  const h = ((minuteOfDay / 60) % 24 + 24) % 24;
  for (let i = 1; i < TRAFFIC_KEYS.length; i++) {
    const [h1, v1] = TRAFFIC_KEYS[i];
    if (h <= h1) {
      const [h0, v0] = TRAFFIC_KEYS[i - 1];
      return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
    }
  }
  return TRAFFIC_KEYS[0][1];
}