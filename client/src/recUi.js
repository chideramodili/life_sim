// Adulthood: Fun Spots (phone app). Five spots in every city: swimming, cinema, fishing, dancing, football.
// The server runs every timer and decides every result. This file shows the spots, a pillar to walk to, and the activity screens.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');

export function initRec(socket, getStreet) {
  const btn = el('button'); btn.id = 'recBtn'; btn.hidden = true; btn.textContent = 'Fun';
  const panel = el('div', 'panel'); panel.id = 'recPanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); const title = el('span', '', '🎡 Fun spots'); head.append(title);
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close'); head.append(close);
  const body = el('div'); body.id = 'recBody';
  panel.append(head, body);
  document.body.append(btn, panel);
  const st = document.createElement('style');
  st.textContent = '#recPanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 78vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #recPanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.rcRow { padding: 10px; margin: 8px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); }'
    + '.rcTop { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; } .rcSub { font-size: 12px; opacity: .8; margin-top: 2px; }'
    + '.rcGo { margin-top: 8px; width: 100%; height: 38px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); } .rcGo:disabled { opacity: .5; } .rcGo.alt { background: var(--bg); color: inherit; border: 0.5px solid var(--line); }'
    + '.rcBig { height: 84px; font-size: 20px; border-radius: 16px; touch-action: manipulation; user-select: none; -webkit-user-select: none; } .rcBite { background: #e5484d !important; color: #fff !important; animation: rcPulse .3s infinite alternate; }'
    + '@keyframes rcPulse { from { transform: scale(1); } to { transform: scale(1.04); } }'
    + '.rcBar { height: 12px; border-radius: 6px; background: #3a3f4b; overflow: hidden; margin-top: 10px; } .rcBar > div { height: 100%; width: 0; background: #3ddc84; }'
    + '.rcDots { display: flex; gap: 6px; justify-content: center; margin: 12px 0; } .rcDot { width: 26px; height: 26px; border-radius: 50%; background: #3a3f4b; transition: background .08s, transform .08s; } .rcDot.on { background: #ffd43b; transform: scale(1.25); } .rcDot.hit { background: #3ddc84; }'
    + '.rcGoal { display: flex; justify-content: center; gap: 8px; margin: 10px 0; font-size: 34px; } .rcGoal span { width: 70px; height: 56px; display: flex; align-items: center; justify-content: center; border: 2px solid var(--line); border-radius: 8px; }'
    + '.rcDir { display: flex; gap: 8px; } .rcDir button { flex: 1; }';
  document.head.append(st);

  let d = null, recvAt = 0, target = null, bite = false, kickRes = null, danceHit = [];
  const act = () => (d && d.active) || null;
  const beacon = () => {
    const sv = getStreet();
    if (!sv) return;
    if (target) { sv.setBeacon({ x: target.x, z: target.z }, '#3ddcff'); sv.beaconOwner = 'rec'; }
    else if (sv.beaconOwner === 'rec') { sv.setBeacon(null); sv.beaconOwner = null; }
  };
  const live = {};   // elements that move every frame without rebuilding the screen

  function paintSpots() {
    title.textContent = '🎡 Fun spots';
    body.append(el('div', 'fine', `Walk up to a spot (within about 18 m) and start. Cash from fishing and football is capped at ${naira(d.cap.max)} an hour; ${naira(d.cap.room)} left this hour.`));
    for (const s of d.spots) {
      const r = el('div', 'rcRow');
      r.append(el('div', 'rcTop', `${s.icon} ${s.title}`), el('div', 'rcSub', s.text), el('div', 'rcSub', `${s.fee ? `${naira(s.fee)}${s.kind === 'fish' ? ' per cast' : ''}` : 'Free'} · ${s.here ? 'you are here!' : `${s.dist} m away`}`));
      const go = el('button', 'rcGo', s.kind === 'football' && d.fbWait > 0 && s.here ? `Keeper's break: ${d.fbWait} s` : s.here ? 'Start' : 'Walk closer to start');
      go.disabled = !s.here || (s.kind === 'football' && d.fbWait > 0);
      go.addEventListener('click', () => { socket.emit('recStart', { kind: s.kind }); });
      const w = el('button', 'rcGo alt', target && target.kind === s.kind ? 'Hide the pillar' : 'Show me where');
      w.addEventListener('click', () => { target = target && target.kind === s.kind ? null : s; beacon(); paint(); });
      r.append(go, w); body.append(r);
    }
  }
  const stopBtn = (text) => { const b = el('button', 'rcGo alt', text); b.addEventListener('click', () => socket.emit('recStop')); return b; };

  function paintActive(a) {
    const spot = d.spots.find((s) => s.kind === a.kind);
    title.textContent = `${spot.icon} ${spot.title}`;
    const r = el('div', 'rcRow');
    if (a.kind === 'swim' || a.kind === 'cinema') {
      r.append(el('div', 'rcTop', a.kind === 'swim' ? '🏊 Swimming…' : '🎬 Now showing…'), el('div', 'rcSub', 'Stay here until it finishes.' + (a.kind === 'cinema' ? ' Watch with a friend for extra social.' : '')));
      const bar = el('div', 'rcBar'), fill = el('div'); bar.append(fill); live.fill = fill; live.total = a.total; live.endAt = recvAt + a.endsIn;
      r.append(bar, el('div', 'rcSub', a.withFriend ? '👫 Watching with a friend!' : ''), stopBtn('Stop (no refund)'));
    } else if (a.kind === 'fish') {
      const status = el('div', 'rcTop', a.state === 'idle' ? '🎣 Ready to cast' : a.state === 'wait' ? '🌊 Waiting for a bite…' : '🐟 BITE!');
      r.append(status, el('div', 'rcSub', `Caught ${a.catches} · earned ${naira(a.earned)} this session`));
      if (a.last) r.append(el('div', 'rcSub', a.last));
      const go = el('button', 'rcGo rcBig' + (a.state === 'bite' ? ' rcBite' : ''), a.state === 'idle' ? `Cast the line (${naira(d.spots.find((s) => s.kind === 'fish').fee)})` : a.state === 'wait' ? 'Reel in (wait for the bite!)' : 'REEL IN NOW!');
      go.addEventListener('pointerdown', (e) => { e.preventDefault(); socket.emit(a.state === 'idle' ? 'recCast' : 'recReel'); });
      r.append(go, el('div', 'rcSub', 'Pull only after the bite. Too early or too slow and the fish is gone.'), stopBtn('Pack up'));
    } else if (a.kind === 'dance') {
      r.append(el('div', 'rcTop', '💃 Tap on the beat'), el('div', 'rcSub', 'Each yellow dot is a beat. Tap the big button right when it lights up.'));
      const dots = el('div', 'rcDots'); live.dots = [];
      for (let i = 0; i < a.beats; i++) { const x = el('div', 'rcDot'); dots.append(x); live.dots.push(x); }
      live.t0 = recvAt + a.t0In; live.lead = a.leadMs; live.beat = a.beatMs; live.beats = a.beats; danceHit = [];
      const msg = el('div', 'rcSub', 'Get ready…'); live.msg = msg;
      const go = el('button', 'rcGo rcBig', 'TAP');
      go.addEventListener('pointerdown', (e) => { e.preventDefault(); socket.emit('recTap'); go.style.transform = 'scale(.97)'; setTimeout(() => { go.style.transform = ''; }, 90); });
      r.append(dots, msg, go);
    } else if (a.kind === 'football') {
      r.append(el('div', 'rcTop', `⚽ Penalties · ${a.left} kick${a.left === 1 ? '' : 's'} left`), el('div', 'rcSub', `Goals: ${a.goals}`));
      const goal = el('div', 'rcGoal'); const cells = [0, 1, 2].map((i) => { const c = el('span', '', ''); goal.append(c); return c; });
      if (kickRes) { cells[kickRes.keeper].textContent = '🧤'; if (!kickRes.wide && kickRes.goal) cells[kickRes.dir].textContent = '⚽'; if (kickRes.wide) goal.append(el('div', 'rcSub', '')); }
      r.append(goal, el('div', 'rcSub', a.last || 'Pick where to shoot.'));
      const dirs = el('div', 'rcDir');
      for (const [i, t] of [[0, '◀ Left'], [1, '▲ Middle'], [2, 'Right ▶']]) { const b = el('button', 'rcGo', t); b.addEventListener('click', () => socket.emit('recKick', i)); dirs.append(b); }
      r.append(dirs);
    }
    body.append(r);
  }

  let sig = '';
  function paint() {
    const a = act();
    sig = JSON.stringify([d && d.spots.map((s) => [s.kind, s.here, s.dist >> 3]), a && [a.kind, a.state, a.catches, a.earned, a.last, a.left, a.goals, a.withFriend], d && d.fbWait > 0, target && target.kind, bite]);
    body.replaceChildren(); for (const k of Object.keys(live)) delete live[k];
    if (!d) return body.append(el('div', 'fine', 'Loading…'));
    if (a) paintActive(a); else paintSpots();
    beacon();
  }
  const repaintIfChanged = () => {
    const a = act();
    const s2 = JSON.stringify([d && d.spots.map((s) => [s.kind, s.here, s.dist >> 3]), a && [a.kind, a.state, a.catches, a.earned, a.last, a.left, a.goals, a.withFriend], d && d.fbWait > 0, target && target.kind, bite]);
    if (s2 === sig) return;
    const k = panel.scrollTop; paint(); panel.scrollTop = k;
  };
  socket.on('rec', (x) => { d = x; recvAt = Date.now(); if (!x.active || x.active.kind !== 'fish' || x.active.state !== 'bite') bite = false; if (!x.active) kickRes = null; if (!panel.hidden) repaintIfChanged(); });
  socket.on('recBite', () => {
    bite = true; try { navigator.vibrate && navigator.vibrate(120); } catch {}
    if (d && d.active && d.active.kind === 'fish') { d.active.state = 'bite'; }
    if (!panel.hidden) { const k = panel.scrollTop; paint(); panel.scrollTop = k; }
  });
  socket.on('recKickResult', (r) => { kickRes = r; });
  btn.addEventListener('click', () => { panel.hidden = false; paint(); socket.emit('recOpen'); });
  close.addEventListener('click', () => { panel.hidden = true; });
  // Light animation that never rebuilds the screen.
  setInterval(() => {
    if (panel.hidden || !d) return;
    const now = Date.now();
    if (live.fill) live.fill.style.width = Math.min(100, Math.max(0, ((now - (live.endAt - live.total)) / live.total) * 100)) + '%';
    if (live.dots) {
      const t = now - live.t0 - live.lead;
      const cur = t < -200 ? -1 : Math.floor((t + 500) / live.beat);   // the beat nearest to now
      live.dots.forEach((x, i) => x.classList.toggle('on', i === cur && Math.abs(t - i * live.beat) < 260));
      if (live.msg) live.msg.textContent = t < -200 ? `Get ready… ${Math.max(0, Math.ceil(-t / 1000))}` : t > live.beats * live.beat ? 'Finishing…' : 'Tap now when the dot lights!';
    }
  }, 60);
  setInterval(() => { if (!panel.hidden && !act()) socket.emit('recOpen'); }, 3000);
  return { beacon };
}
