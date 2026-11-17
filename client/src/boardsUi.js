// Adulthood: Leaderboards (phone app). Top 10 for each board and your own rank. The server works the lists out; this file shows them.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function initBoards(socket) {
  const btn = el('button'); btn.id = 'boardsBtn'; btn.hidden = true; btn.textContent = 'Ranks';
  const panel = el('div', 'panel'); panel.id = 'boardsPanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', '🏅 Leaderboards'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close'); head.append(close);
  const tabs = el('div', 'bdTabs'), body = el('div'); body.id = 'boardsBody';
  panel.append(head, tabs, body);
  document.body.append(btn, panel);
  const st = document.createElement('style');
  st.textContent = '#boardsPanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 76vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #boardsPanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.bdTabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; } .bdTab { height: 32px; padding: 0 10px; border: 0.5px solid var(--line); border-radius: 10px; background: var(--bg2); color: inherit; font-weight: 700; font-size: 12px; } .bdTab.on { background: var(--hi); color: var(--on-hi); }'
    + '.bdRow { display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin: 4px 0; border-radius: 10px; background: var(--bg2); border: 0.5px solid var(--line); font-size: 13px; } .bdRow.me { border-color: var(--hi); font-weight: 700; }'
    + '.bdRank { width: 28px; text-align: center; font-weight: 800; } .bdName { flex: 1; } .bdVal { opacity: .85; font-size: 12px; white-space: nowrap; }';
  document.head.append(st);
  let d = null, tab = 'level';
  const paint = () => {
    tabs.replaceChildren(); body.replaceChildren();
    if (!d) return body.append(el('div', 'fine', 'Loading…'));
    for (const b of d) { const t = el('button', 'bdTab' + (b.id === tab ? ' on' : ''), `${b.icon} ${b.title}`); t.addEventListener('click', () => { tab = b.id; paint(); }); tabs.append(t); }
    const b = d.find((x) => x.id === tab) || d[0];
    if (!b.top.length) return body.append(el('div', 'fine', 'Nobody on this board yet. Be the first!'));
    const medal = ['🥇', '🥈', '🥉'];
    for (const r of b.top) { const row = el('div', 'bdRow' + (r.me ? ' me' : '')); row.append(el('span', 'bdRank', medal[r.rank - 1] || String(r.rank)), el('span', 'bdName', r.name), el('span', 'bdVal', r.text)); body.append(row); }
    if (b.me && !b.top.some((r) => r.me)) { body.append(el('div', 'fine', 'You')); const row = el('div', 'bdRow me'); row.append(el('span', 'bdRank', String(b.me.rank)), el('span', 'bdName', 'You'), el('span', 'bdVal', b.me.text)); body.append(row); }
    body.append(el('div', 'fine', `${b.total} player${b.total === 1 ? '' : 's'} on this board. Updated every 30 seconds.`));
  };
  socket.on('boards', (x) => { d = x; if (!panel.hidden) paint(); });
  btn.addEventListener('click', () => { panel.hidden = false; paint(); socket.emit('boardsOpen'); });
  close.addEventListener('click', () => { panel.hidden = true; });
}
