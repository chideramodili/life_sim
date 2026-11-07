// Adulthood: the phone store at the Shop, and which phone you carry. The server owns prices and ownership;
// this file only shows it and sends requests. A phone without a camera hides the Photo and Selfie buttons.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function initPhones(socket) {
  let info = null;
  let sig = '';

  function paint() {
    if (!info) return;
    const s = JSON.stringify(info);
    if (s === sig) return;
    sig = s;
    const body = $('phoneBody');
    body.replaceChildren();
    for (const ph of info.list) {
      const row = el('div', 'job');
      const head = el('div', 'skillHead');
      const name = el('span', 'skillName', `${ph.label}${info.active === ph.id ? ' ✓ in use' : ''}`);
      name.style.color = ph.color;
      head.append(name, el('span', 'tagc', ph.cost ? `₦${fmt(ph.cost)}` : 'Free'));
      row.append(head, el('div', 'billWho', `${ph.text}${ph.camera ? ' 📷' : ''}`));
      if (ph.owned) {
        const b = el('button', 'mini billPay', info.active === ph.id ? 'In use' : 'Use this phone');
        b.disabled = info.active === ph.id;
        b.addEventListener('click', () => socket.emit('phoneUse', ph.id));
        row.append(b);
      } else {
        const b = el('button', 'mini hot billPay', info.here ? 'Buy' : 'The Shop is closed');
        b.disabled = !info.here;
        b.addEventListener('click', () => socket.emit('phoneBuy', ph.id));
        row.append(b);
      }
      body.append(row);
    }
  }
  socket.on('phones', (p) => {
    info = p;
    paint();
  });
  $('phoneBtn').addEventListener('click', () => {
    const open = $('phonePanel').hidden;
    if (open) { hideOtherPanels(); socket.emit('phonesOpen'); }
    $('phonePanel').hidden = !open;
  });
  $('phoneClose').addEventListener('click', () => ($('phonePanel').hidden = true));
  socket.on('me', (m) => {
    const atShop = m.room === 'shop';
    $('phoneBtn').hidden = !atShop;
    if (!atShop) $('phonePanel').hidden = true;
    // No camera on this phone: no Photo or Selfie buttons.
    if (m.handset) $('camBar').hidden = !m.handset.camera;
  });
  return {
    reset() {
      info = null;
      sig = '';
      $('phoneBody').replaceChildren();
      $('phonePanel').hidden = true;
      $('phoneBtn').hidden = true;
    },
  };
}