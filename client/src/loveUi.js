// Adulthood: relationships (phone app "Love"). Ask a friend out, go on date nights, propose, end it.
// The server owns the truth; this file shows it. Questions from other players appear as a pill at the top.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
const wait = (s) => (s >= 3600 ? Math.ceil(s / 3600) + ' h' : s >= 60 ? Math.ceil(s / 60) + ' min' : s + ' s');

export function initLove(socket) {
  const btn = el('button'); btn.id = 'loveBtn'; btn.hidden = true; btn.textContent = 'Love';
  const panel = el('div', 'panel'); panel.id = 'lovePanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', '💞 Love'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close'); head.append(close);
  const body = el('div'); body.id = 'loveBody';
  panel.append(head, body);
  const pill = el('div'); pill.id = 'lovePill'; pill.hidden = true;
  document.body.append(btn, panel, pill);
  const st = document.createElement('style');
  st.textContent = '#lovePanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 76vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #lovePanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.lvRow { padding: 10px; margin: 8px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); }'
    + '.lvTop { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; } .lvSub { font-size: 12px; opacity: .8; margin-top: 2px; }'
    + '.lvGo { margin-top: 8px; width: 100%; height: 36px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); } .lvGo:disabled { opacity: .5; } .lvGo.alt { background: var(--bg); color: inherit; border: 0.5px solid var(--line); }'
    + '.lvBar { height: 10px; border-radius: 6px; background: var(--line); overflow: hidden; margin-top: 8px; } .lvBar i { display: block; height: 100%; background: #ff5c8a; }'
    + '#lovePill { position: fixed; top: 112px; left: 50%; transform: translateX(-50%); z-index: 9; width: max-content; max-width: calc(100vw - 24px); padding: 8px 14px; border-radius: 18px; background: rgba(20, 22, 28, .9); color: #fff; font-size: 13px; font-weight: 600; text-align: center; border: 1px solid #ff5c8a; }'
    + '#lovePill .lvBtns { display: flex; gap: 8px; margin-top: 6px; } #lovePill button { flex: 1; height: 32px; border: 0; border-radius: 10px; font-weight: 700; background: #ff5c8a; color: #fff; } #lovePill button.alt { background: #3a3f4b; }';
  document.head.append(st);

  let d = null;
  const paintPill = () => {
    pill.replaceChildren();
    if (!d || !d.ask) { pill.hidden = true; return; }
    pill.hidden = false;
    pill.append(el('div', '', d.ask.kind === 'marry' ? `💍 ${d.ask.from} wants to marry you!` : `❤️ ${d.ask.from} asked you out!`));
    const row = el('div', 'lvBtns'), y = el('button', '', 'Yes'), n = el('button', 'alt', 'No');
    y.addEventListener('click', () => socket.emit('loveReply', { yes: true })); n.addEventListener('click', () => socket.emit('loveReply', { yes: false }));
    row.append(y, n); pill.append(row);
  };
  const paint = () => {
    body.replaceChildren();
    if (!d) return body.append(el('div', 'fine', 'Loading…'));
    const c = d.costs;
    if (d.partner) {
      const p = d.partner, r = el('div', 'lvRow');
      r.append(el('div', 'lvTop', `${p.stage}: ${p.name}`), el('div', 'lvSub', p.online ? '🟢 Online' : '⚪ Offline (they must be online for date nights)'));
      const b = el('div', 'lvBar'), i = el('i'); i.style.width = p.love + '%'; b.append(i);
      r.append(b, el('div', 'lvSub', `Love ${p.love} / 100`));
      body.append(r);
      const dn = el('div', 'lvRow');
      dn.append(el('div', 'lvTop', '🌹 Date night'), el('div', 'lvSub', `Stand close to ${p.name}. Costs ${naira(c.date)}. Both get more fun and social, and love grows.`));
      const g = el('button', 'lvGo', p.dateWait > 0 ? `Again in ${wait(p.dateWait)}` : 'Go on a date night'); g.disabled = p.dateWait > 0; g.addEventListener('click', () => socket.emit('dateNight')); dn.append(g);
      body.append(dn);
      if (p.stage.startsWith('Dating')) {
        const pr = el('div', 'lvRow');
        pr.append(el('div', 'lvTop', '💍 Propose'), el('div', 'lvSub', `Needs love ${c.needLove} and some time together. The ring costs ${naira(c.ring)}; you each get a ${naira(c.gift)} wedding gift.`));
        const why = p.needLove > 0 ? `Needs ${p.needLove} more love` : p.marryIn > 0 ? `Wait ${wait(p.marryIn)} more` : 'Propose';
        const m = el('button', 'lvGo', why); m.disabled = !p.canMarry; m.addEventListener('click', () => socket.emit('loveAsk', { name: p.name, kind: 'marry' })); pr.append(m); body.append(pr);
      }
      const e = el('button', 'lvGo alt', p.stage.startsWith('Married') ? `Divorce (${naira(c.divorce)})` : 'Break up');
      e.addEventListener('click', () => { if (confirm(p.stage.startsWith('Married') ? `Divorce ${p.name}? It costs ${naira(c.divorce)}.` : `Break up with ${p.name}?`)) socket.emit('loveEnd'); });
      body.append(e);
    } else {
      body.append(el('div', 'lvRow', 'You are single. Ask one of your friends who is online out on a date.'));
      if (!d.candidates.length) body.append(el('div', 'fine', 'None of your friends are online and single right now. Add friends in the Friends app.'));
      for (const n of d.candidates) {
        const r = el('div', 'lvRow'); r.append(el('div', 'lvTop', `🟢 ${n}`));
        const g = el('button', 'lvGo', 'Ask out ❤️'); g.addEventListener('click', () => socket.emit('loveAsk', { name: n, kind: 'date' })); r.append(g); body.append(r);
      }
    }
  };
  let lastSig = '';
  socket.on('love', (x) => { d = x; paintPill(); if (!panel.hidden) { const sg = JSON.stringify(x); if (sg === lastSig) return; lastSig = sg; const k = panel.scrollTop; paint(); panel.scrollTop = k; } });
  socket.on('me', () => { if (!d) socket.emit('loveOpen'); });
  btn.addEventListener('click', () => { panel.hidden = false; paint(); socket.emit('loveOpen'); });
  close.addEventListener('click', () => { panel.hidden = true; });
  setInterval(() => { if (!panel.hidden) socket.emit('loveOpen'); }, 10000);
}
