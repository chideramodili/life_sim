// Adulthood: the Taxi Driver career. A phone app: go on duty in your own car, accept a request, follow the glowing pillar to the passenger and then to the drop-off.
// The server picks the places, runs the clock and pays; this file shows the app, the request pill and the pillar.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function initTaxi(socket, getStreet) {
  const btn = el('button'); btn.id = 'taxiBtn'; btn.hidden = true; btn.textContent = 'Taxi';
  const panel = el('div', 'panel'); panel.id = 'taxiPanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', '🚕 Taxi'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close'); head.append(close);
  const body = el('div'); body.id = 'taxiBody';
  panel.append(head, body);
  const pill = el('div'); pill.id = 'taxiPill'; pill.hidden = true;
  document.body.append(btn, panel, pill);
  const st = document.createElement('style');
  st.textContent = '#taxiPanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 76vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #taxiPanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.txRow { padding: 10px; margin: 8px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); }'
    + '.txTop { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; } .txSub { font-size: 12px; opacity: .8; margin-top: 2px; }'
    + '.txGo { margin-top: 8px; width: 100%; height: 36px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); }'
    + '.txGo.alt { background: var(--bg); color: inherit; border: 0.5px solid var(--line); }'
    + '.txBar { height: 8px; border-radius: 6px; background: var(--line); overflow: hidden; margin-top: 6px; } .txBar i { display: block; height: 100%; background: var(--hi); }'
    + '#taxiPill { position: fixed; top: 112px; left: 50%; transform: translateX(-50%); z-index: 7; width: max-content; max-width: calc(100vw - 24px); padding: 8px 14px; border-radius: 18px; background: rgba(20, 22, 28, .86); color: #fff; font-size: 13px; font-weight: 600; text-align: center; border: 1px solid #38d0e8; }'
    + '#taxiPill .txBtns { display: flex; gap: 8px; margin-top: 6px; } #taxiPill button { flex: 1; height: 32px; border: 0; border-radius: 10px; font-weight: 700; background: #38d0e8; color: #06222a; } #taxiPill button.alt { background: #3a3f4b; color: #fff; }';
  document.head.append(st);

  let d = null, tick = null;
  const left = (s) => Math.max(0, s - Math.floor((Date.now() - d.at) / 1000));
  const paintPill = () => {
    pill.replaceChildren();
    if (!d || !d.on || (!d.job && !d.request)) { pill.hidden = true; return; }
    pill.hidden = false;
    if (d.job) {
      const j = d.job, t = j.stage === 'pickup' ? j.pick : j.drop;
      pill.append(el('div', '', `🚕 ${j.stage === 'pickup' ? 'Pick up ' + j.name + ' at' : 'Take ' + j.name + ' to'} ${t.name} · ${clock(left(j.secondsLeft))} · ${naira(j.fare)}`));
    } else {
      const r = d.request;
      pill.append(el('div', '', `🚕 ${r.pick} → ${r.drop} · about ${r.ride} m · ${naira(r.fare)} · ${left(r.secondsLeft)}s`));
      const row = el('div', 'txBtns'), a = el('button', '', 'Accept'), x = el('button', 'alt', 'Decline');
      a.addEventListener('click', () => socket.emit('taxiAccept')); x.addEventListener('click', () => socket.emit('taxiDecline'));
      row.append(a, x); pill.append(row);
    }
  };
  const beacon = () => {
    const sv = getStreet();
    if (!sv) return;
    const j = d && d.on && d.job;
    if (j) { sv.setBeacon(j.stage === 'pickup' ? j.pick : j.drop, j.stage === 'deliver' ? '#46d36b' : '#38d0e8'); sv.beaconOwner = 'taxi'; }
    else if (sv.beaconOwner === 'taxi') { sv.setBeacon(null); sv.beaconOwner = null; }
  };
  const paint = () => {
    body.replaceChildren();
    if (!d) return body.append(el('div', 'fine', 'Loading…'));
    const lv = el('div', 'txRow');
    lv.append(el('div', 'txTop', `Taxi level ${d.level}`), el('div', 'txSub', `${d.fares} fares · earned ${naira(d.earned)} · rating ${d.rating ? d.rating + ' ★' : 'none yet'} · +${(d.level - 1) * 5}% fares`));
    if (d.next) { const b = el('div', 'txBar'), i = el('i'); i.style.width = Math.min(100, ((d.fares % 6) / 6) * 100) + '%'; b.append(i); lv.append(b, el('div', 'txSub', `${d.next - d.fares} more fares to level ${d.level + 1}`)); }
    body.append(lv);
    const duty = el('div', 'txRow');
    duty.append(el('div', 'txTop', d.on ? '🟢 You are on duty' : '⚪ Off duty'));
    if (!d.hasCar) duty.append(el('div', 'txSub', 'You need your own car to drive a taxi. Kanis Motors sells them.'));
    else duty.append(el('div', 'txSub', d.on ? 'Drive around in your car. Passenger requests appear at the top of the screen.' : 'Go on duty, get in your car and drive. Passengers will ask for rides.'));
    const g = el('button', d.on ? 'txGo alt' : 'txGo', d.on ? 'Go off duty' : 'Go on duty');
    g.addEventListener('click', () => socket.emit('taxiDuty', !d.on)); duty.append(g);
    body.append(duty);
    if (d.job) {
      const r = el('div', 'txRow');
      r.append(el('div', 'txTop', `Passenger: ${d.job.name}`), el('div', 'txSub', `Pick up: ${d.job.pick.name}`), el('div', 'txSub', `Drop off: ${d.job.drop.name}`), el('div', 'txSub', `Fare ${naira(d.job.fare)}. Faster arrival means more stars and a 20% tip for 5 stars.`));
      const c = el('button', 'txGo alt', 'Cancel ride'); c.addEventListener('click', () => socket.emit('taxiCancel')); r.append(c); body.append(r);
    }
  };
  socket.on('taxi', (x) => { d = { ...x, at: Date.now() }; paintPill(); beacon(); if (!panel.hidden) paint(); });
  btn.addEventListener('click', () => { panel.hidden = false; paint(); socket.emit('taxiOpen'); });
  close.addEventListener('click', () => { panel.hidden = true; });
  clearInterval(tick); tick = setInterval(() => { if (d) paintPill(); }, 1000);
  return { beacon };
}
