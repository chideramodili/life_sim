// Adulthood: Real Map phone app. In a city that has a real map (Abuja, Enugu) you can walk into it; inside, it lists named places to jump to.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const ICON = { bank: '🏦', hotel: '🏨', restaurant: '🍽️', cafe: '☕', clinic: '🏥', hospital: '🏥', school: '🏫', marketplace: '🛒', supermarket: '🛒', clothes: '👕', cinema: '🎬', library: '📚', fuel: '⛽', place_of_worship: '🛐', public_building: '🏛️' };

export function initRealMap(socket) {
  const btn = el('button'); btn.id = 'realMapBtn'; btn.hidden = true; btn.textContent = 'Map';
  const panel = el('div', 'panel'); panel.id = 'realMapPanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', '🗺️ Real map'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close'); head.append(close);
  const body = el('div'); panel.append(head, body); document.body.append(btn, panel);
  const st = document.createElement('style');
  st.textContent = '#realMapPanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 75vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #realMapPanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.mpGo { width: 100%; height: 40px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); margin-top: 8px; } .mpGo.alt { background: var(--bg2); color: inherit; border: 0.5px solid var(--line); }'
    + '.mpRow { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px; margin-top: 6px; border-radius: 10px; border: 0.5px solid var(--line); background: var(--bg2); color: inherit; text-align: left; } .mpRow span:first-child { font-size: 20px; }';
  document.head.append(st);
  let cur = null;
  function paint() {
    body.replaceChildren();
    if (cur && cur.id === 'district') {
      body.append(el('div', 'fine', `You are in the real map of ${cur.cityName}. Walk or run around. Places marked "you can go in" have an Enter button at their door. Tap a place to jump there.`));
      const back = el('button', 'mpGo', '← Back to the city'); back.addEventListener('click', () => { socket.emit('districtLeave'); panel.hidden = true; }); body.append(back);
      for (const q of cur.pois || []) {
        const r = el('button', 'mpRow'); r.append(el('span', '', ICON[q.k] || '📍'), el('span', '', q.n + (q.e ? '  · you can go in' : '')));
        r.addEventListener('click', () => { socket.emit('districtTp', q.i); panel.hidden = true; }); body.append(r);
      }
      if (!(cur.pois || []).length) body.append(el('div', 'fine', 'No named places in this part of the map.'));
    } else if (cur && cur.id === 'street') {
      body.append(el('div', 'fine', 'Walk a real map of this city: real roads and buildings from OpenStreetMap. It is on foot only. Available in Abuja and Enugu for now (Lagos is coming).'));
      const go = el('button', 'mpGo', '🚶 Walk into the real map'); go.addEventListener('click', () => { socket.emit('districtGo'); panel.hidden = true; }); body.append(go);
    } else body.append(el('div', 'fine', 'Go out on the street first, then open this app.'));
  }
  socket.on('room', (info) => { cur = info; if (!panel.hidden) paint(); });
  btn.addEventListener('click', () => { panel.hidden = false; paint(); });
  close.addEventListener('click', () => { panel.hidden = true; });
  return {};
}
