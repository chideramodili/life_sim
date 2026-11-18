// Adulthood: Racing (phone app). Create or join player races with entry stakes, follow the red pillar through the checkpoints.
// The server holds the stakes, counts the checkpoints and pays the prizes; this file shows the lobby, the race and the results.
// Also shows a one-time hint to turn the phone sideways while driving.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 100))}`; };

export function initRace(socket, getStreet) {
  const btn = el('button'); btn.id = 'raceBtn'; btn.hidden = true; btn.textContent = 'Racing';
  const panel = el('div', 'panel'); panel.id = 'racePanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', '🏁 Racing'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close'); head.append(close);
  const body = el('div'); body.id = 'raceBody';
  panel.append(head, body);
  const pill = el('div'); pill.id = 'racePill'; pill.hidden = true;
  const hint = el('div'); hint.id = 'landHint'; hint.hidden = true; hint.textContent = '📱 Tip: turn your phone sideways for a wider view while driving. Tap to hide.';
  document.body.append(btn, panel, pill, hint);
  const st = document.createElement('style');
  st.textContent = '#racePanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 76vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #racePanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.rcRow { padding: 10px; margin: 8px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); } .rcTop { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; } .rcSub { font-size: 12px; opacity: .8; margin-top: 2px; }'
    + '.rcBtns { display: flex; gap: 6px; margin-top: 8px; } .rcGo { flex: 1; height: 34px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); } .rcGo.alt { background: var(--bg); color: inherit; border: 0.5px solid var(--line); } .rcGo:disabled { opacity: .5; }'
    + '.rcIn { width: 100%; box-sizing: border-box; height: 34px; margin-top: 6px; border-radius: 8px; border: 0.5px solid var(--line); background: var(--bg); color: inherit; padding: 0 8px; font-size: 14px; } .rcLab { font-size: 12px; opacity: .8; margin-top: 8px; display: block; }'
    + '#racePill { position: fixed; top: 112px; left: 50%; transform: translateX(-50%); z-index: 9; width: max-content; max-width: calc(100vw - 24px); padding: 8px 16px; border-radius: 18px; background: rgba(20, 22, 28, .9); color: #fff; font-size: 14px; font-weight: 700; text-align: center; border: 1px solid #ff4d4d; }'
    + '#landHint { position: fixed; bottom: 110px; left: 50%; transform: translateX(-50%); z-index: 9; width: max-content; max-width: calc(100vw - 32px); padding: 8px 14px; border-radius: 14px; background: rgba(20, 22, 28, .9); color: #fff; font-size: 12px; text-align: center; }'
    + '@media (orientation: landscape) { #landHint { display: none !important; } }';
  document.head.append(st);

  let d = null, at = 0;
  const form = { name: '', format: 'sprint', laps: 2, max: 4, minEntry: 10000, stake: 10000, split: 'win', cls: 'any', vis: 'public' };
  let showCreate = false, joinStake = {}, code = '';
  const beacon = () => {
    const sv = getStreet();
    if (!sv) return;
    const t = d && d.mine && d.mine.target;
    if (t) { sv.setBeacon(t, '#ff4d4d'); sv.beaconOwner = 'race'; }
    else if (sv.beaconOwner === 'race') { sv.setBeacon(null); sv.beaconOwner = null; }
  };
  const field = (parent, label, input) => { parent.append(el('span', 'rcLab', label), input); return input; };
  const num = (v, fn) => { const i = el('input', 'rcIn'); i.type = 'number'; i.inputMode = 'numeric'; i.value = v; i.addEventListener('input', () => fn(Number(i.value))); return i; };
  const sel = (opts, cur, fn) => { const s = el('select', 'rcIn'); for (const [v, l] of opts) { const o = el('option', '', l); o.value = v; if (String(v) === String(cur)) o.selected = true; s.append(o); } s.addEventListener('change', () => fn(s.value)); return s; };

  const paintPill = () => {
    const m = d && d.mine;
    if (!m || m.state === 'open') { pill.hidden = true; return; }
    pill.hidden = false;
    const ago = Date.now() - at;
    if (m.state === 'countdown') pill.textContent = `🏁 ${m.name}: starts in ${Math.max(0, m.goIn - Math.floor(ago / 1000))}`;
    else if (m.finished) pill.textContent = `🏁 Finished in ${clock(m.myMs)}. Waiting for the others…`;
    else pill.textContent = `🏁 ${m.name} · checkpoint ${m.progress.done}/${m.progress.total} · ${clock(m.elapsedMs + ago)}`;
  };
  function paint() {
    body.replaceChildren();
    if (!d) return body.append(el('div', 'fine', 'Loading…'));
    const m = d.mine;
    if (m) {
      const r = el('div', 'rcRow');
      r.append(el('div', 'rcTop', `🏁 ${m.name}`), el('div', 'rcSub', `${m.format}${m.format.startsWith('Circuit') ? ` · ${m.laps} lap${m.laps > 1 ? 's' : ''}` : ''} · about ${m.km} km · ${m.cls}`),
        el('div', 'rcSub', `Prize: ${m.split}. Pool ${naira(m.pool)} · min entry ${naira(m.minEntry)}`), el('div', 'rcSub', m.state === 'open' ? 'Waiting for racers. A red pillar marks the start line.' : m.state === 'countdown' ? 'Get in your vehicle!' : 'Race in progress. Follow the red pillar through every checkpoint.'));
      if (m.code) r.append(el('div', 'rcTop', `Private race code: ${m.code}`));
      for (const e of m.entries) r.append(el('div', 'rcSub', `${e.done ? '🏁' : '🚗'} ${e.name} · stake ${naira(e.stake)}${m.state === 'open' ? (e.dist >= 0 ? ` · ${e.dist} m from start` : ' · not on the street') : e.done ? ` · ${clock(e.ms)}` : ` · checkpoint ${e.idx}/${m.progress.total}`}`));
      if (m.state === 'open') {
        const b = el('div', 'rcBtns');
        if (m.isCreator) { const s = el('button', 'rcGo', 'Start the race'); s.addEventListener('click', () => socket.emit('raceStart')); b.append(s); }
        const l = el('button', 'rcGo alt', m.isCreator ? 'Cancel (refund all)' : 'Leave (refund)'); l.addEventListener('click', () => socket.emit('raceLeave')); b.append(l);
        r.append(b);
        let add = 5000; const ai = num(add, (v) => (add = v)); r.append(el('span', 'rcLab', 'Raise your stake (more pool and a little extra XP, not a bigger share)'), ai);
        const rb = el('button', 'rcGo alt', 'Add to my stake'); rb.style.marginTop = '6px'; rb.style.width = '100%'; rb.addEventListener('click', () => socket.emit('raceRaise', add)); r.append(rb);
      }
      body.append(r);
    }
    if (d.last) {
      const l = d.last, r = el('div', 'rcRow');
      r.append(el('div', 'rcTop', `🏆 Last race: ${l.name}`), el('div', 'rcSub', l.place ? `You finished ${l.place}${l.won ? ` and won ${naira(l.won)}` : ''}. Pool ${naira(l.pool)}.` : `You did not finish, so your stake was lost. Pool ${naira(l.pool)}.`));
      for (const x of l.rows) r.append(el('div', 'rcSub', `${x.place}. ${x.name} · ${clock(x.ms)} · ${naira(x.won)}`));
      if (l.dnf.length) r.append(el('div', 'rcSub', `Did not finish: ${l.dnf.join(', ')}`));
      body.append(r);
    }
    if (m) return;
    const cg = el('button', 'rcGo', showCreate ? 'Hide the form' : '➕ Create a race'); cg.addEventListener('click', () => { showCreate = !showCreate; paint(); }); body.append(cg);
    if (showCreate) {
      const f = el('div', 'rcRow'), c = d.cfg;
      const ni = el('input', 'rcIn'); ni.maxLength = 30; ni.placeholder = 'Race name'; ni.value = form.name; ni.addEventListener('input', () => (form.name = ni.value)); f.append(ni);
      field(f, 'Format', sel(c.formats.map((x) => [x.id, x.label]), form.format, (v) => { form.format = v; paint(); }));
      if (form.format === 'circuit') field(f, 'Laps', sel([1, 2, 3].filter((n) => n <= c.maxLaps).map((n) => [n, `${n}`]), form.laps, (v) => (form.laps = Number(v))));
      field(f, 'Most racers', sel(Array.from({ length: c.maxPlayers - 1 }, (_, i) => [i + 2, `${i + 2}`]), form.max, (v) => (form.max = Number(v))));
      field(f, `Minimum entry (${naira(c.minFloor)} to ${naira(c.minCap)})`, num(form.minEntry, (v) => { form.minEntry = v; }));
      field(f, 'Your stake (at least the minimum)', num(form.stake, (v) => { form.stake = v; }));
      field(f, 'Prize rule', sel(c.splits.map((x) => [x.id, x.label]), form.split, (v) => (form.split = v)));
      field(f, 'Vehicle rule', sel(c.classes.map((x) => [x.id, x.label]), form.cls, (v) => (form.cls = v)));
      field(f, 'Who can join', sel([['public', 'Public (shown in the lobby)'], ['private', 'Private (join with a code)']], form.vis, (v) => (form.vis = v)));
      f.append(el('div', 'rcSub', 'Everyone stakes at least the minimum. Stakes are held safely and go back to you if the race is cancelled. Racers who do not finish lose their stake to the finishers.'));
      const go = el('button', 'rcGo', 'Open the race'); go.style.marginTop = '8px'; go.style.width = '100%'; go.addEventListener('click', () => { socket.emit('raceCreate', { ...form }); showCreate = false; }); f.append(go);
      body.append(f);
    }
    body.append(el('div', 'rcTop', 'Open races in this city'));
    if (!d.list.length) body.append(el('div', 'fine', 'No public races open right now.'));
    for (const x of d.list) {
      const r = el('div', 'rcRow');
      r.append(el('div', 'rcTop', `🏁 ${x.name}`, ), el('div', 'rcSub', `by ${x.creator} · ${x.format}${x.format.startsWith('Circuit') ? ` · ${x.laps} laps` : ''} · ${x.km} km · ${x.cls}`),
        el('div', 'rcSub', `${x.count}/${x.max} racers · pool ${naira(x.pool)} · min entry ${naira(x.minEntry)} · ${x.split}`));
      const stake = joinStake[x.id] ?? x.minEntry; const si = num(stake, (v) => (joinStake[x.id] = v)); r.append(el('span', 'rcLab', 'Your stake'), si);
      const j = el('button', 'rcGo', `Join (stake at least ${naira(x.minEntry)})`); j.style.marginTop = '6px'; j.style.width = '100%'; j.addEventListener('click', () => socket.emit('raceJoin', { id: x.id, stake: joinStake[x.id] ?? x.minEntry })); r.append(j);
      body.append(r);
    }
    const pr = el('div', 'rcRow'); pr.append(el('div', 'rcTop', '🔒 Join a private race'));
    const ci = el('input', 'rcIn'); ci.placeholder = '4-digit code'; ci.inputMode = 'numeric'; ci.maxLength = 4; ci.value = code; ci.addEventListener('input', () => (code = ci.value));
    let pst = 10000; const pi = num(pst, (v) => (pst = v));
    pr.append(ci, el('span', 'rcLab', 'Your stake'), pi);
    const pj = el('button', 'rcGo', 'Join with code'); pj.style.marginTop = '6px'; pj.style.width = '100%'; pj.addEventListener('click', () => socket.emit('raceJoin', { id: 'code', code, stake: pst })); pr.append(pj);
    body.append(pr);
  }
  socket.on('race', (x) => { d = x; at = Date.now(); paintPill(); beacon(); if (!panel.hidden) paint(); });
  socket.on('me', () => { if (!d) socket.emit('raceOpen'); });
  btn.addEventListener('click', () => { panel.hidden = false; paint(); socket.emit('raceOpen'); });
  close.addEventListener('click', () => { panel.hidden = true; });
  setInterval(() => { paintPill(); if (!panel.hidden) socket.emit('raceOpen'); }, 1000);

  // Sideways-phone hint: once per session, the first time you drive with the phone held upright.
  let hinted = false, driving = false;
  try { hinted = sessionStorage.getItem('landHint') === '1'; } catch {}
  hint.addEventListener('click', () => { hint.hidden = true; });
  socket.on('me', (m) => {
    const on = Boolean(m && m.drive);
    if (on && !driving && !hinted && window.matchMedia('(orientation: portrait)').matches && window.innerWidth < 700) {
      hinted = true; try { sessionStorage.setItem('landHint', '1'); } catch {}
      hint.hidden = false; setTimeout(() => { hint.hidden = true; }, 7000);
    }
    driving = on;
  });
  return { beacon };
}
