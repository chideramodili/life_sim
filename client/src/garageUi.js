// Adulthood: Garage (phone app). Park your vehicles in your private home garage or in public car parks, take them out, or call a valet.
// The server keeps the truth (who is parked where, fees, space); this file shows it and lets you follow a pillar to a car park.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');

export function initGarage(socket, getStreet) {
  const btn = el('button'); btn.id = 'garageBtn'; btn.hidden = true; btn.textContent = 'Garage';
  const panel = el('div', 'panel'); panel.id = 'garagePanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', '🅿️ Garage'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close'); head.append(close);
  const body = el('div'); body.id = 'garageBody';
  panel.append(head, body);
  document.body.append(btn, panel);
  const st = document.createElement('style');
  st.textContent = '#garagePanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 76vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #garagePanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.gaRow { padding: 10px; margin: 8px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); } .gaTop { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; } .gaSub { font-size: 12px; opacity: .8; margin-top: 2px; }'
    + '.gaBtns { display: flex; gap: 6px; margin-top: 8px; } .gaGo { flex: 1; height: 34px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); } .gaGo.alt { background: var(--bg); color: inherit; border: 0.5px solid var(--line); } .gaGo:disabled { opacity: .5; }';
  document.head.append(st);

  let d = null, target = null, openUp = null;
  const beacon = () => {
    const sv = getStreet();
    if (!sv) return;
    if (target) { sv.setBeacon({ x: target.x, z: target.z }, '#4da3ff'); sv.beaconOwner = 'garage'; }
    else if (sv.beaconOwner === 'garage') { sv.setBeacon(null); sv.beaconOwner = null; }
  };
  const showBtn = (key, label, x, z) => { const b = el('button', 'gaGo alt', target && target.key === key ? 'Hide the pillar' : label); b.addEventListener('click', () => { target = target && target.key === key ? null : { key, x, z }; beacon(); paint(); }); return b; };
  function paint() {
    body.replaceChildren();
    if (!d) return body.append(el('div', 'fine', 'Loading…'));
    const z = d.zone;
    const here = el('div', 'gaRow');
    here.append(el('div', 'gaTop', z ? `📍 You are at: ${z.name}` : '📍 You are not at a parking place'),
      el('div', 'gaSub', z ? 'You can park a vehicle here or take one out.' : 'Walk or drive into a car park (or your home garage area) to park. Parking is free in your own garage and costs ' + naira(d.lotFee) + ' in a public car park.'));
    body.append(here);

    const hg = el('div', 'gaRow');
    hg.append(el('div', 'gaTop', '🏠 Private home garage'));
    if (d.hasGarage) {
      hg.append(el('div', 'gaSub', `Free parking for up to ${d.slots} vehicles, right at your front door (${d.usedHome} / ${d.slots} used).${d.inHomeCity ? '' : ' Your home is in another city.'}`));
      if (d.home && d.inHomeCity) hg.append(el('div', 'gaBtns'));
      if (d.home && d.inHomeCity) hg.lastChild.append(showBtn('home', `Show my garage${d.home.dist >= 0 ? ` (${d.home.dist} m)` : ''}`, d.home.x, d.home.z));
    } else {
      hg.append(el('div', 'gaSub', `Build a private garage at your home for ${naira(d.garageCost)}. It holds ${d.slots} vehicles and parking is free. Without one, use the public car parks below.`));
      const b = el('button', 'gaGo', `Build garage · ${naira(d.garageCost)}`); b.addEventListener('click', () => { if (confirm(`Build a private garage for ${naira(d.garageCost)}?`)) socket.emit('garageBuild'); }); hg.append(b);
    }
    body.append(hg);

    body.append(el('div', 'gaTop', `🅿️ Public car parks (${d.usedLots} / ${d.lotSlots} used)`));
    for (const l of d.lots) { const r = el('div', 'gaRow'); r.append(el('div', 'gaTop', l.name), el('div', 'gaSub', l.dist >= 0 ? `${l.dist} m away` : 'Go outside to see the distance')); const b = el('div', 'gaBtns'); b.append(showBtn(l.id, 'Show me where', l.x, l.z)); r.append(b); body.append(r); }

    body.append(el('div', 'gaTop', 'Your vehicles'));
    if (!d.vehicles.length) body.append(el('div', 'fine', 'You do not own a vehicle yet. Kanis Motors sells bicycles and cars.'));
    for (const v of d.vehicles) {
      const r = el('div', 'gaRow');
      r.append(el('div', 'gaTop', `${v.kind === 'bike' ? '🚲' : '🚗'} ${v.label}`), el('div', 'gaSub', v.parked ? `🅿️ Parked at ${v.where}` : v.active ? '✅ With you (the one you drive)' : 'With you'));
      const b = el('div', 'gaBtns');
      if (v.parked) {
        const t = el('button', 'gaGo', 'Take out'); t.disabled = !v.here_zone; t.addEventListener('click', () => socket.emit('garageTake', v.id));
        const va = el('button', 'gaGo alt', `Valet · ${naira(d.valetFee)}`); va.disabled = !v.here; va.addEventListener('click', () => socket.emit('garageValet', v.id));
        b.append(t, va);
        if (!v.here) r.append(el('div', 'gaSub', 'It is parked in another city.'));
      } else {
        const p = el('button', 'gaGo', 'Park here'); p.disabled = !z; p.addEventListener('click', () => socket.emit('garagePark', v.id)); b.append(p);
      }
      r.append(b);
      const open = openUp === v.id, tg = el('button', 'gaGo alt', open ? 'Hide upgrades' : `Upgrades · top speed ${v.kmh} km/h`); tg.style.marginTop = '6px'; tg.style.width = '100%';
      tg.addEventListener('click', () => { openUp = open ? null : v.id; paint(); }); r.append(tg);
      if (open) for (const u of v.ups) {
        const ur = el('div', 'gaRow'); ur.style.background = 'var(--bg)';
        ur.append(el('div', 'gaTop', `${u.label}  ${'●'.repeat(u.level)}${'○'.repeat(u.max - u.level)}`), el('div', 'gaSub', u.text));
        const ub = el('button', 'gaGo', u.level >= u.max ? 'Maxed out' : `Level ${u.level + 1} · ${naira(u.cost)}`); ub.disabled = u.level >= u.max; ub.style.marginTop = '8px'; ub.style.width = '100%';
        ub.addEventListener('click', () => socket.emit('vehicleUpgrade', { id: v.id, cat: u.cat })); ur.append(ub); r.append(ur);
      }
      body.append(r);
    }
  }
  let lastSig = '';
  socket.on('garage', (x) => { d = x; if (!panel.hidden) { const sg = JSON.stringify(x); if (sg === lastSig) return; lastSig = sg; const k = panel.scrollTop; paint(); panel.scrollTop = k; } });
  btn.addEventListener('click', () => { panel.hidden = false; paint(); socket.emit('garageOpen'); });
  close.addEventListener('click', () => { panel.hidden = true; });
  setInterval(() => { if (!panel.hidden) socket.emit('garageOpen'); }, 3000);
  return { beacon };
}
