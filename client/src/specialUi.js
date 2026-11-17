// Adulthood: Special Events on screen. A pill at the top while an event is running and a glowing pillar to the next chest or rally checkpoint.
// The server runs the events and pays; the full event card and the token shop live in the Activities app (progressUi.js).
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const clock = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

export function initSpecial(socket, getStreet) {
  const pill = el('div'); pill.id = 'specialPill'; pill.hidden = true;
  document.body.append(pill);
  const st = document.createElement('style');
  st.textContent = '#specialPill { position: fixed; top: 150px; left: 50%; transform: translateX(-50%); z-index: 6; width: max-content; max-width: calc(100vw - 24px); padding: 6px 14px; border-radius: 18px; background: rgba(20, 22, 28, .86); color: #fff; font-size: 13px; font-weight: 600; text-align: center; border: 1px solid #c46bff; }';
  document.head.append(st);
  let d = null, at = 0, first = true;
  const paint = () => {
    const a = d && d.active;
    if (!a || (a.id === 'rally' && !a.joined) || a.finished) { pill.hidden = !(a && a.id === 'rally' && !a.joined); if (!pill.hidden) pill.textContent = `${a.icon} Driving Rally is on! Open Activities > Events to join.`; return; }
    const left = Math.max(0, a.secondsLeft - Math.floor((Date.now() - at) / 1000));
    pill.hidden = false;
    pill.textContent = `${a.icon} ${a.title} · ${a.found}/${a.total} · ${clock(left)}`;
  };
  const beacon = () => {
    const sv = getStreet();
    if (!sv) return;
    const a = d && d.active, t = a && a.target && !a.finished && (a.id === 'hunt' || a.joined) ? a.target : null;
    if (t) { sv.setBeacon(t, '#c46bff'); sv.beaconOwner = 'event'; }
    else if (sv.beaconOwner === 'event') { sv.setBeacon(null); sv.beaconOwner = null; }
  };
  socket.on('special', (x) => { d = x; at = Date.now(); paint(); beacon(); });
  socket.on('me', () => { if (first) { first = false; socket.emit('specialOpen'); } });
  setInterval(() => { if (d) paint(); }, 1000);
  return { beacon };
}
