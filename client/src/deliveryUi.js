// Adulthood: the Delivery Driver career screen. Take a job at the Delivery Depot, then follow the glowing pillar to the pickup and the drop-off.
// The server picks the places, runs the clock and pays; this file shows the offers, the job pill and the pillar.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function initDelivery(socket, getStreet) {
  const btn = el('button'); btn.id = 'deliveryBtn'; btn.hidden = true; btn.textContent = 'Delivery jobs';
  const panel = el('div', 'panel'); panel.id = 'deliveryPanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', 'Delivery Depot'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close'); head.append(close);
  const body = el('div'); body.id = 'deliveryBody';
  panel.append(head, body);
  const pill = el('div'); pill.id = 'deliveryPill'; pill.hidden = true;
  document.body.append(btn, panel, pill);
  const st = document.createElement('style');
  st.textContent = '#deliveryBtn { width: 100%; height: 40px; border: 0; border-radius: 10px; font-weight: 600; background: var(--hi); color: var(--on-hi); margin-bottom: 8px; }'
    + '#deliveryPanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 76vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #deliveryPanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.dvRow { padding: 10px; margin: 8px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); }'
    + '.dvTop { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; } .dvSub { font-size: 12px; opacity: .8; margin-top: 2px; }'
    + '.dvGo { margin-top: 8px; width: 100%; height: 36px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); }'
    + '.dvBar { height: 8px; border-radius: 6px; background: var(--line); overflow: hidden; margin-top: 6px; } .dvBar i { display: block; height: 100%; background: var(--hi); }'
    + '#deliveryPill { position: fixed; top: 112px; left: 50%; transform: translateX(-50%); z-index: 6; max-width: calc(100vw - 24px); padding: 6px 14px; border-radius: 18px; background: rgba(20, 22, 28, .82); color: #fff; font-size: 13px; font-weight: 600; text-align: center; border: 1px solid #ffb02e; }';
  document.head.append(st);

  let d = null, tick = null;
  const paintPill = () => {
    const j = d && d.job;
    pill.hidden = !j;
    if (!j) return;
    const t = j.stage === 'pickup' ? j.pick : j.drop;
    const s = Math.max(0, j.secondsLeft - Math.floor((Date.now() - d.at) / 1000));
    pill.textContent = `${j.icon} ${j.stage === 'pickup' ? 'Pick up at' : 'Deliver to'} ${t.name} · ${clock(s)} · ${naira(j.pay)}`;
  };
  const beacon = () => {
    const sv = getStreet();
    if (!sv) return;
    const j = d && d.job;
    if (j) { sv.setBeacon(j.stage === 'pickup' ? j.pick : j.drop, j.stage === 'deliver' ? '#46d36b' : '#ffb02e'); sv.beaconOwner = 'delivery'; }
    else if (sv.beaconOwner === 'delivery') { sv.setBeacon(null); sv.beaconOwner = null; }   // never clear the Taxi beacon
  };
  const paint = () => {
    body.replaceChildren();
    if (!d) return body.append(el('div', 'fine', 'Loading…'));
    const lv = el('div', 'dvRow');
    lv.append(el('div', 'dvTop', `Courier level ${d.level}`), el('div', 'dvSub', `${d.deliveries} deliveries · earned ${naira(d.earned)} · +${(d.level - 1) * 5}% pay`));
    if (d.next) { const b = el('div', 'dvBar'), i = el('i'); i.style.width = Math.min(100, ((d.deliveries % 5) / 5) * 100) + '%'; b.append(i); lv.append(b, el('div', 'dvSub', `${d.next - d.deliveries} more deliveries to level ${d.level + 1}`)); }
    body.append(lv);
    if (d.job) {
      const r = el('div', 'dvRow');
      r.append(el('div', 'dvTop', `${d.job.icon} ${d.job.title}`), el('div', 'dvSub', `Pick up: ${d.job.pick.name}`), el('div', 'dvSub', `Deliver to: ${d.job.drop.name}`), el('div', 'dvSub', 'Go outside, get in your vehicle and follow the glowing pillar.'));
      const c = el('button', 'dvGo', 'Cancel job'); c.addEventListener('click', () => socket.emit('deliveryCancel')); r.append(c); body.append(r);
      return;
    }
    if (!d.here) return body.append(el('div', 'fine', 'Visit the Delivery Depot to take a job.'));
    if (!d.hasRide) body.append(el('div', 'fine', 'You need a bicycle or a car to deliver. Kanis Motors sells them.'));
    body.append(el('div', 'dvTop', 'Jobs today'));
    for (const o of d.offers) {
      const r = el('div', 'dvRow');
      r.append(el('div', 'dvTop', `${o.icon} ${o.title}`), el('div', 'dvSub', o.text), el('div', 'dvSub', `${o.pick} → ${o.drop} · about ${o.route} m`), el('div', 'dvSub', `${clock(o.limit)} to deliver · pays ${naira(o.pay)} (+ up to 30% if early)`));
      const g = el('button', 'dvGo', 'Take this job'); g.addEventListener('click', () => { socket.emit('deliveryTake', o.i); panel.hidden = true; }); r.append(g); body.append(r);
    }
    if (!d.offers.length) body.append(el('div', 'fine', 'No jobs right now. Check again in a minute.'));
  };
  socket.on('delivery', (x) => {
    d = { ...x, at: Date.now() };
    btn.hidden = !x.here;
    if (!x.here && !x.job) panel.hidden = true;
    paintPill(); beacon();
    if (!panel.hidden) paint();
  });
  socket.on('me', (m) => { if (d && m.room !== 'depot') { btn.hidden = true; } });
  btn.addEventListener('click', () => { panel.hidden = false; paint(); socket.emit('deliveryOpen'); });
  close.addEventListener('click', () => { panel.hidden = true; });
  clearInterval(tick); tick = setInterval(paintPill, 1000);
  return { beacon };   // main.js calls this again when the street is rebuilt
}
