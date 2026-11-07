// Adulthood: crime and fines. A Steal button at the Market, a Fines panel at the Police Station, and a banner while you are held.
import { hideOtherPanels } from './panels.js';

const naira = (n) => `₦${Number(n).toLocaleString('en-NG')}`;
const $ = (id) => document.getElementById(id);

export function initCrime(socket) {
  let fines = { list: [], total: 0, overdue: 0, wanted: false, atStation: false };
  let room = null;

  function render() {
    const body = $('finesBody');
    body.replaceChildren();
    const head = document.createElement('div');
    head.className = 'finesHead';
    head.textContent = fines.list.length ? `You owe ${naira(fines.total)}` : 'Your record is clean.';
    body.appendChild(head);
    if (fines.wanted) {
      const w = document.createElement('div');
      w.className = 'finesWarn';
      w.textContent = 'Police are looking for you. Pay your overdue fines.';
      body.appendChild(w);
    }
    for (const f of fines.list) {
      const line = document.createElement('div');
      line.className = 'trainLine';
      const l = document.createElement('span');
      l.textContent = `Day ${f.day} · ${f.label} · ${naira(f.amount)}${f.overdue ? ' (overdue)' : f.dueIn ? ` (${f.dueIn}h at this price)` : ''}`;
      const b = document.createElement('button');
      b.textContent = 'Pay';
      b.addEventListener('click', () => socket.emit('payFine', f.id));
      line.append(l, b);
      body.appendChild(line);
    }
    if (fines.list.length > 1) {
      const all = document.createElement('button');
      all.className = 'finesAll';
      all.textContent = 'Pay all I can';
      all.addEventListener('click', () => socket.emit('payFine', 'all'));
      body.appendChild(all);
    }
    if (!fines.atStation && fines.list.length) {
      const n = document.createElement('div');
      n.className = 'finesNote';
      n.textContent = 'Fines are paid at the Police Station counter.';
      body.appendChild(n);
    }
  }

  socket.on('fines', (v) => { fines = v; render(); });
  socket.on('me', (m) => {
    room = m.room;
    $('stealBtn').hidden = !(m.room === 'market' && !m.trip);
    $('finesBtn').hidden = m.room !== 'police';
    const j = $('jailBanner');
    if (m.jail > 0 && m.room === 'police') {
      j.hidden = false;
      j.textContent = `Held at the station: ${m.jail}s`;
    } else j.hidden = true;
    if (m.room !== 'police' && !$('finesPanel').hidden) $('finesPanel').hidden = true;
  });
  $('stealBtn').addEventListener('click', () => socket.emit('steal'));
  $('finesBtn').addEventListener('click', () => {
    hideOtherPanels('finesPanel');
    render();
    $('finesPanel').hidden = !$('finesPanel').hidden;
  });
  $('finesClose').addEventListener('click', () => { $('finesPanel').hidden = true; });
  render();
}