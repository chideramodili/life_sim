// Adulthood: buying land and running a business. The server owns every price, stock count and till;
// this file shows what the server sends and asks for things. Stand at a lot's door and tap "Property".
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function initBiz(socket) {
  let lastLots = null;   // { city, list }
  let streetApi = null;
  let nearId = -1;
  let openId = -1;
  let tick = 0;
  let nameDraft = '';

  const apply = () => { if (streetApi && lastLots) streetApi.setLots(lastLots.list); };

  socket.on('lots', (l) => { lastLots = l; apply(); if (openId >= 0 && !$('bizPanel').hidden) socket.emit('bizOpen', openId); });
  socket.on('biz', (i) => { if (i.id === openId) paint(i); });

  function paint(i) {
    const body = $('bizBody');
    body.replaceChildren();
    const row = el('div', 'job');
    const btn = (text, cls, fn, disabled = false) => { const b = el('button', cls, text); b.disabled = disabled; b.addEventListener('click', fn); return b; };
    if (!i.owner) {
      row.append(el('div', 'skillName', `Empty lot #${i.id + 1}`), el('div', 'billWho', `Price ₦${fmt(i.price)}. You own ${i.owned} of ${i.max} lots allowed.`));
      row.append(btn(`Buy for ₦${fmt(i.price)}`, 'mini hot billPay', () => socket.emit('lotBuy', i.id)));
    } else if (i.mine && !i.biz) {
      row.append(el('div', 'skillName', `Your lot #${i.id + 1}`), el('div', 'billWho', 'Name your business, then pick what to build.'));
      const inp = el('input'); inp.type = 'text'; inp.maxLength = 20; inp.placeholder = 'Business name'; inp.value = nameDraft;
      inp.addEventListener('input', () => { nameDraft = inp.value; });
      row.append(inp);
      for (const k of i.kinds) row.append(btn(`${k.label} · ₦${fmt(k.build)} (sells ${k.item.toLowerCase()}s at ₦${fmt(k.price)})`, 'mini hot billPay', () => socket.emit('bizBuild', { id: i.id, kind: k.id, name: nameDraft })));
      row.append(btn(`Sell the lot back (₦${fmt(i.sell)})`, 'mini billPay', () => socket.emit('lotSell', i.id)));
    } else if (i.mine && i.biz) {
      const b = i.biz;
      const head = el('div', 'skillHead');
      head.append(el('span', 'skillName', `${b.name} · ${b.label}`), el('span', 'tagc', `Level ${b.level}`));
      row.append(head, el('div', 'billWho', `${b.open ? 'Open now' : 'Closed now'} (${b.hours[0]}:00 to ${b.hours[1]}:00). Stock ${b.stock}/${b.cap}. Till ₦${fmt(b.till)}.`));
      row.append(el('div', 'billWho', `Customers pay ₦${fmt(b.price)} per ${b.item.toLowerCase()}. Each costs you ₦${fmt(b.cost)} from the wholesaler.`));
      row.append(el('div', 'billWho', `Team ${b.staff}/${b.staffMax}. Each adds ${b.boost}% more customers and costs ₦${fmt(b.wage)} an hour while open, paid from the till${b.owed > 0 ? ` (₦${fmt(b.owed)} unpaid)` : ''}.`));
      row.append(btn(`Hire someone · ₦${fmt(b.hireFee)}`, 'mini billPay', () => socket.emit('bizHire', i.id), b.staff >= b.staffMax));
      row.append(btn('Let one go', 'mini billPay', () => socket.emit('bizFire', i.id), b.staff <= 0));
      row.append(btn('Order 10', 'mini billPay', () => socket.emit('bizStock', { id: i.id, n: 10 })));
      row.append(btn('Fill the storeroom', 'mini billPay', () => socket.emit('bizStock', { id: i.id, n: b.cap - b.stock })));
      row.append(btn(`Collect ₦${fmt(b.till)}`, 'mini hot billPay', () => socket.emit('bizCollect', i.id), b.till <= 0));
      if (b.upgrade) row.append(btn(`Upgrade to level ${b.level + 1} · ₦${fmt(b.upgrade)}`, 'mini billPay', () => socket.emit('bizUpgrade', i.id)));
      row.append(btn(`Sell the lot and business (₦${fmt(i.sell)} plus the till)`, 'mini billPay', () => socket.emit('lotSell', i.id)));
    } else if (i.biz) {
      const b = i.biz;
      const head = el('div', 'skillHead');
      head.append(el('span', 'skillName', b.name), el('span', 'tagc', b.label));
      row.append(head, el('div', 'billWho', `Owned by ${i.owner}. ${b.open ? 'Open now' : `Closed (open ${b.hours[0]}:00 to ${b.hours[1]}:00)`}.`));
      row.append(btn(b.soldOut ? 'Sold out' : `Buy a ${b.item.toLowerCase()} · ₦${fmt(b.price)}`, 'mini hot billPay', () => socket.emit('bizBuy', i.id), b.soldOut || !b.open));
    } else {
      row.append(el('div', 'skillName', `${i.owner}'s lot`), el('div', 'billWho', 'Nothing is built here yet.'));
    }
    body.append(row);
  }

  $('bizBtn').addEventListener('click', () => {
    const open = $('bizPanel').hidden;
    hideOtherPanels('bizPanel');
    $('bizPanel').hidden = !open;
    if (open && nearId >= 0) { openId = nearId; socket.emit('bizOpen', nearId); }
  });
  $('bizClose').addEventListener('click', () => { $('bizPanel').hidden = true; });

  return {
    // The street was (re)built: draw the lots we know about.
    built() { return lastLots ? lastLots.list.filter((l) => l.kind) : []; },
    setStreet(api, cityId) { streetApi = api; if (api && lastLots && lastLots.city === cityId) apply(); },
    // Called a few times a second: is the player standing at a lot door?
    update(now, pos, roomInfo, busy) {
      if (now - tick < 200) return;
      tick = now;
      let near = -1;
      const inside = Boolean(roomInfo && roomInfo.id === 'biz' && Number.isInteger(roomInfo.bizLot));
      if (inside && !busy) near = roomInfo.bizLot;
      else if (pos && roomInfo && roomInfo.city && roomInfo.city.lots && !busy) {
        let best = 5;
        for (const l of roomInfo.city.lots) { const d = Math.hypot(pos.x - l.door.x, pos.z - l.door.z); if (d < best) { best = d; near = l.id; } }
      }
      nearId = near;
      $('bizBtn').hidden = near < 0;
      $('bizBtn').textContent = inside ? '🧾 Counter' : '🏪 Property';
      if (near < 0) $('bizPanel').hidden = true;
      else if (!$('bizPanel').hidden && openId !== near) { openId = near; socket.emit('bizOpen', near); }
    },
  };
}