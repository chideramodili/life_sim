// Adulthood: tickets to other cities, sold at the Central Terminal. The server owns prices and the trip;
// this file only shows the list the server sends and asks for a ticket.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function initIntercity(socket) {
  socket.on('tickets', (t) => {
    const body = $('cityBody');
    body.replaceChildren();
    body.appendChild(el('div', 'billWho', `You are in ${t.cityName}. Driving your own car out of the city gates also works.`));
    if (t.home) {
      const row = el('div', 'job');
      row.appendChild(el('div', 'skillName', `Your home is in ${t.home.name}`));
      if (t.home.here) row.appendChild(el('div', 'billWho', 'You live in this city.'));
      else {
        row.appendChild(el('div', 'billWho', `Move to ${t.cityName}: your furniture and clothes come with you. ₦${fmt(t.home.fee)}`));
        const b = el('button', 'mini hot', `Move my home to ${t.cityName}`);
        b.addEventListener('click', () => socket.emit('relocate'));
        row.appendChild(b);
      }
      body.appendChild(row);
    }
    if (!t.here) return;
    body.appendChild(el('div', 'billWho', t.place === 'airport' ? 'Flights leave from the Airport. Coaches leave from the Central Terminal.' : 'Coaches leave from the Central Terminal. Flights leave from the Airport.'));
    for (const c of t.list || []) {
      const row = el('div', 'job');
      row.appendChild(el('div', 'skillName', c.name));
      for (const o of c.options) {
        const line = el('div', 'trainLine');
        line.appendChild(el('span', '', `${o.label} · ₦${fmt(o.cost)} · ${o.secs}s`));
        const b = el('button', 'mini hot', 'Buy');
        b.addEventListener('click', () => { socket.emit('intercity', { method: o.method, to: c.to }); $('cityPanel').hidden = true; });
        line.appendChild(b);
        row.appendChild(line);
      }
      body.appendChild(row);
    }
  });
  $('cityBtn').addEventListener('click', () => {
    const open = $('cityPanel').hidden;
    hideOtherPanels('cityPanel');
    $('cityPanel').hidden = !open;
    if (open) socket.emit('ticketsOpen');
  });
  $('cityClose').addEventListener('click', () => { $('cityPanel').hidden = true; });
  return {
    setVisible(on) {
      $('cityBtn').hidden = !on;
      if (!on) $('cityPanel').hidden = true;
    },
  };
}