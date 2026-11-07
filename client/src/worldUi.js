// Adulthood: the world on screen. The game clock, the city event line, the Bills panel, and the day/night level.
// The server owns the truth. This file only shows it and sends "pay this bill" requests.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pad2 = (n) => String(n).padStart(2, '0');

const DAY_MIN = 1440;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATUS = { ok: ['Happy', 'On track'], due: ['Okay', 'Due now'], overdue: ['Down', 'Overdue'] };

// Same split as the server: night 21-05, dawn 05-08, day 08-17, dusk 17-21.
export function phaseOf(hour) {
  if (hour >= 21 || hour < 5) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 17) return 'day';
  return 'dusk';
}

// 0 = darkest (about 01:00), 1 = full daylight (about 13:00). Smooth, with flat bright and dark stretches.
export function daylightAt(minuteOfDay) {
  const raw = 0.5 + 0.5 * Math.cos((2 * Math.PI * (minuteOfDay - 780)) / DAY_MIN);
  return Math.min(1, Math.max(0, (raw - 0.2) / 0.6));
}

// "2 days 3 h" from game minutes.
export function gameSpan(mins) {
  const m = Math.max(0, Math.round(mins));
  const d = Math.floor(m / DAY_MIN);
  const h = Math.floor((m % DAY_MIN) / 60);
  if (d > 0) return `${d} day${d === 1 ? '' : 's'} ${h} h`;
  if (h > 0) return `${h} h ${m % 60} min`;
  return `${m} min`;
}
// "about 2h 10m" of real time from game minutes.
export function realSpan(mins, msPerMin) {
  const totalMin = Math.max(0, Math.round((mins * msPerMin) / 60000));
  const h = Math.floor(totalMin / 60);
  return h > 0 ? `${h}h ${pad2(totalMin % 60)}m` : `${totalMin}m`;
}

export function initWorld(socket) {
  let clock = null;          // { gameMin, msPerMin, at }
  let startDay = 0;          // the world day this account began on, so a new player sees Day 1 (time of day and weekday stay shared)
  socket.on('welcome', (w) => { startDay = Number.isInteger(w.startDay) ? w.startDay : 0; });
  let event = null;          // { title, text, endsAt }
  let bills = null;
  let cash = 0;
  const rows = new Map();    // bill id -> its elements

  const gameMinNow = () => (clock ? clock.gameMin + (performance.now() - clock.at) / clock.msPerMin : 0);
  const minuteOfDay = () => ((Math.floor(gameMinNow()) % DAY_MIN) + DAY_MIN) % DAY_MIN;

  // ----- Clock and event line -----
  function paintClock() {
    if (!clock) {
      $('clock').textContent = '-';
      return;
    }
    const total = Math.floor(gameMinNow());
    const day = Math.floor(total / DAY_MIN) + 1;
    const mod = ((total % DAY_MIN) + DAY_MIN) % DAY_MIN;
    const hour = Math.floor(mod / 60);
    const icon = { night: '🌙', dawn: '🌅', day: '☀️', dusk: '🌇' }[phaseOf(hour)];
    $('clock').textContent = `${icon} ${WEEKDAYS[(day - 1) % 7]} ${pad2(hour)}:${pad2(mod % 60)} · Day ${Math.max(1, day - startDay)}`;
  }
  function paintEvent() {
    const line = $('eventLine');
    if (!event) {
      line.hidden = true;
      return;
    }
    const left = Math.max(0, Math.ceil((event.endsAt - performance.now()) / 1000));
    line.hidden = false;
    const t = `${Math.floor(left / 60)}:${pad2(left % 60)} left`;
    // On a phone the line is short (the full text is in the pop-up notice).
    line.textContent = window.innerWidth <= 600 ? `${event.title} (${t})` : `${event.title}: ${event.text} (${t})`;
  }
  const timer = setInterval(() => {
    paintClock();
    paintEvent();
  }, 250);

  socket.on('clock', (c) => {
    clock = { gameMin: c.gameMin, msPerMin: c.msPerMin, at: performance.now() };
    paintClock();
  });
  socket.on('event', (e) => {
    event = e ? { title: e.title, text: e.text, endsAt: performance.now() + e.secondsLeft * 1000 } : null;
    paintEvent();
  });
  socket.on('me', (m) => {
    cash = m.cash;
  });

  // ----- Bills panel -----
  function buildRow(b) {
    const row = el('div', 'bill');
    const head = el('div', 'billHead');
    const name = el('span', 'billName', b.label);
    const pill = el('span', 'pill');
    head.append(name, pill);
    const who = el('div', 'billWho', b.who);
    const when = el('div', 'billWhen');
    const note = el('div', 'billNote');
    const pay = el('button', 'mini hot billPay');
    pay.addEventListener('click', () => socket.emit('payBill', b.id));
    row.append(head, who, when, note, pay);
    $('billsBody').append(row);
    rows.set(b.id, { pill, when, note, pay });
  }

  function paintBills() {
    if (!bills) return;
    for (const b of bills.list) {
      if (!rows.has(b.id)) buildRow(b);
      const r = rows.get(b.id);
      const [cls, label] = STATUS[b.status] || STATUS.ok;
      r.pill.className = `pill ${cls}`;
      r.pill.textContent = label;
      if (b.left > 0) r.when.textContent = `Due in ${gameSpan(b.left)} (about ${realSpan(b.left, bills.msPerMin)} real time)`;
      else r.when.textContent = b.status === 'due' ? 'Due now. You have a short grace period.' : 'Overdue. A 10% late fee applies.';
      r.note.textContent = b.note || '';
      r.note.hidden = !b.note;
      r.pay.disabled = !b.canPay;
      r.pay.textContent = b.canPay ? `Pay ₦${fmt(b.total)}` : `Payable in ${gameSpan(b.left - 3 * DAY_MIN)}`;
    }
    const urgent = bills.list.some((b) => b.status !== 'ok');
    $('billsBadge').hidden = !urgent;
  }

  socket.on('bills', (b) => {
    bills = b;
    paintBills();
  });

  $('billsBtn').addEventListener('click', () => {
    const open = $('billsPanel').hidden;
    if (open) hideOtherPanels(); // one panel at a time on small screens
    $('billsPanel').hidden = !open;
    if (open) paintBills();
  });
  $('billsClose').addEventListener('click', () => ($('billsPanel').hidden = true));

  return {
    // 0 (night) to 1 (day) for the 3D scene.
    daylight: () => (clock ? daylightAt(minuteOfDay() + (gameMinNow() % 1)) : 1),
    noPower: () => Boolean(bills && bills.cons.noPower),
    cash: () => cash,
    reset() {
      clock = null;
      event = null;
      bills = null;
      rows.clear();
      $('billsBody').replaceChildren();
      $('billsPanel').hidden = true;
      $('billsBadge').hidden = true;
      paintClock();
      paintEvent();
    },
    stop: () => clearInterval(timer),
  };
}