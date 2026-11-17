// Adulthood: Parties (phone app). Host a party where you stand, or see where parties are and follow a pillar to one.
// The server runs the parties and the rewards; this file shows the list and the pillar.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function initParty(socket, getStreet) {
  const btn = el('button'); btn.id = 'partyBtn'; btn.hidden = true; btn.textContent = 'Party';
  const panel = el('div', 'panel'); panel.id = 'partyPanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', '🎉 Parties'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close'); head.append(close);
  const body = el('div'); body.id = 'partyBody';
  panel.append(head, body);
  document.body.append(btn, panel);
  const st = document.createElement('style');
  st.textContent = '#partyPanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 76vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #partyPanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.pyRow { padding: 10px; margin: 8px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); }'
    + '.pyTop { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; } .pySub { font-size: 12px; opacity: .8; margin-top: 2px; }'
    + '.pyGo { margin-top: 8px; width: 100%; height: 36px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); } .pyGo:disabled { opacity: .5; } .pyGo.alt { background: var(--bg); color: inherit; border: 0.5px solid var(--line); }';
  document.head.append(st);

  let d = null, at = 0, target = null;
  const left = (s) => Math.max(0, s - Math.floor((Date.now() - at) / 1000));
  const beacon = () => {
    const sv = getStreet();
    if (!sv) return;
    const still = target && d && d.list.some((x) => x.host === target.host);
    if (still) { sv.setBeacon({ x: target.x, z: target.z }, '#ff7ad9'); sv.beaconOwner = 'party'; }
    else { target = null; if (sv.beaconOwner === 'party') { sv.setBeacon(null); sv.beaconOwner = null; } }
  };
  const paint = () => {
    body.replaceChildren();
    if (!d) return body.append(el('div', 'fine', 'Loading…'));
    const mine = d.list.find((x) => x.mine);
    const h = el('div', 'pyRow');
    h.append(el('div', 'pyTop', '🥳 Throw a party'), el('div', 'pySub', `Costs ${naira(d.cost)}. Lasts ${d.minutes} minutes where you stand. You earn ${naira(d.perGuest)} for each new guest, and everyone within about 28 m gets fun and social.`));
    const g = el('button', 'pyGo', mine ? 'Your party is on' : d.cooldownLeft > 0 ? `Again in ${Math.ceil(d.cooldownLeft / 60)} min` : 'Start a party here');
    g.disabled = Boolean(mine) || d.cooldownLeft > 0; g.addEventListener('click', () => socket.emit('partyStart')); h.append(g);
    if (mine) { const e = el('button', 'pyGo alt', 'End my party'); e.addEventListener('click', () => socket.emit('partyEnd')); h.append(e); }
    body.append(h);
    body.append(el('div', 'pyTop', 'Parties in this city'));
    if (!d.list.length) body.append(el('div', 'fine', 'No parties right now.'));
    for (const x of d.list) {
      const r = el('div', 'pyRow');
      r.append(el('div', 'pyTop', `🎉 ${x.name} · ${x.host}`), el('div', 'pySub', `${clock(left(x.secondsLeft))} left · ${x.guests} guest${x.guests === 1 ? '' : 's'}${x.dist >= 0 ? ` · ${x.dist} m away` : ''}${x.here ? ' · you are here!' : ''}`));
      if (!x.mine) { const b = el('button', 'pyGo alt', target && target.host === x.host ? 'Hide the pillar' : 'Show me where'); b.addEventListener('click', () => { target = target && target.host === x.host ? null : x; beacon(); paint(); }); r.append(b); }
      body.append(r);
    }
  };
  socket.on('parties', (x) => { d = x; at = Date.now(); beacon(); if (!panel.hidden) paint(); });
  btn.addEventListener('click', () => { panel.hidden = false; paint(); socket.emit('partiesOpen'); });
  close.addEventListener('click', () => { panel.hidden = true; });
  setInterval(() => { if (!panel.hidden) { socket.emit('partiesOpen'); } }, 8000);
  return { beacon };
}
