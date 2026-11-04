// Adulthood: the laptop store at the Shop. The server owns prices, trade-ins and ownership; this file shows it and sends requests.
// You need a laptop to learn Coding and to do developer jobs from home.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function initLaptops(socket) {
  let info = null;
  function paint() {
    if (!info) return;
    const body = $('laptopBody');
    body.replaceChildren();
    body.append(el('div', 'fine', info.owned ? `Your laptop: ${info.list.find((l) => l.id === info.owned).label}` : 'You do not own a laptop yet.'));
    for (const l of info.list) {
      const row = el('div', 'job');
      const head = el('div', 'skillHead');
      const name = el('span', 'skillName', `${l.label}${l.owned ? ' ✓ yours' : ''}`);
      name.style.color = l.color;
      const pic = el('span', 'phonePic'); pic.style.background = l.color; pic.style.borderRadius = '3px'; pic.style.width = '26px'; pic.style.height = '18px';
      head.append(pic, name, el('span', 'tagc', l.owned ? 'Yours' : `₦${fmt(l.price)}`));
      row.append(head, el('div', 'billWho', l.text));
      if (!l.owned && l.better) {
        const b = el('button', 'mini hot billPay', info.here ? (info.owned ? 'Upgrade (trade in old one)' : 'Buy') : 'The Shop is closed');
        b.disabled = !info.here;
        b.addEventListener('click', () => socket.emit('laptopBuy', l.id));
        row.append(b);
      }
      body.append(row);
    }
  }
  socket.on('laptops', (x) => { info = x; paint(); });
  $('laptopBtn').addEventListener('click', () => {
    const open = $('laptopPanel').hidden;
    if (open) { hideOtherPanels(); socket.emit('laptopsOpen'); }
    $('laptopPanel').hidden = !open;
  });
  $('laptopClose').addEventListener('click', () => ($('laptopPanel').hidden = true));
  socket.on('me', (m) => {
    const atShop = m.room === 'shop';
    $('laptopBtn').hidden = !atShop;
    if (!atShop) $('laptopPanel').hidden = true;
  });
  return {
    reset() {
      info = null;
      $('laptopBody').replaceChildren();
      $('laptopPanel').hidden = true;
      $('laptopBtn').hidden = true;
    },
  };
}
