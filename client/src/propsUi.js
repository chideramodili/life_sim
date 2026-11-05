// Adulthood: the Properties phone app. Lists the land and businesses you own with a "Go there" button, and the player land market.
// It never moves money out of a till (collecting stays in person, or automatic at level 4). The server decides everything.
import { hideOtherPanels } from './panels.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
const KIND = { cafe: '☕', minimart: '🛒', salon: '💈', gym: '🏋️' };

export function initProps(socket) {
  const btn = el('button'); btn.id = 'propsBtn'; btn.hidden = true; btn.textContent = 'Properties';
  const panel = el('div', 'panel'); panel.id = 'propsPanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', 'Properties'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close properties'); head.append(close);
  const tabs = el('div', 'prTabs'); const tMine = el('button', 'prTab on', 'Mine'); const tMarket = el('button', 'prTab', 'For sale'); tabs.append(tMine, tMarket);
  const body = el('div'); body.id = 'propsBody';
  panel.append(head, tabs, body, el('div', 'fine', 'Tills are collected at the property, unless it is automated (level 4), which sends you the profit by itself. To sell a lot to another player, stand at it and set a price.'));
  document.body.append(btn, panel);
  const st = document.createElement('style');
  st.textContent = '#propsPanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 72vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #propsPanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.prTabs { display: flex; gap: 6px; margin: 6px 0; } .prTab { flex: 1; height: 34px; border: 0.5px solid var(--line); border-radius: 10px; background: var(--bg2); color: inherit; font-weight: 700; } .prTab.on { background: var(--hi); color: var(--on-hi); }'
    + '.prCard { display: flex; gap: 12px; align-items: flex-start; padding: 10px; margin: 8px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); }'
    + '.prIcon { font-size: 28px; line-height: 1; } .prMain { flex: 1; min-width: 0; } .prName { font-weight: 700; } .prMeta { font-size: 12px; opacity: .8; margin: 2px 0; }'
    + '.prBtn { margin-top: 8px; width: 100%; height: 38px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); } .prBtn:disabled { opacity: .45; }';
  document.head.append(st);

  let tab = 'mine', props = null, market = null;
  const paint = () => {
    body.replaceChildren();
    tMine.classList.toggle('on', tab === 'mine'); tMarket.classList.toggle('on', tab === 'market');
    if (tab === 'mine') {
      if (!props) return body.append(el('div', 'fine', 'Loading…'));
      if (!props.length) return body.append(el('div', 'fine', 'You do not own any land yet. Find a FOR SALE lot on the street, or look under For sale.'));
      for (const p of props) {
        const card = el('div', 'prCard'), main = el('div', 'prMain');
        main.append(el('div', 'prName', p.name || `Empty lot #${p.id + 1}`),
          el('div', 'prMeta', `${p.cityName} · ${p.kind ? (p.auto ? 'Automated' : `Level ${p.level}`) : 'No business yet'} · worth ${naira(p.value)}`));
        if (p.kind) main.append(el('div', 'prMeta', p.auto ? 'Runs itself and sends you the profit.' : `Till ${naira(p.till)}`));
        if (p.ask) main.append(el('div', 'prMeta', `Listed for players at ${naira(p.ask)}`));
        const b = el('button', 'prBtn', p.here ? 'Go there' : `In ${p.cityName}`); b.disabled = !p.here;
        b.addEventListener('click', () => { socket.emit('propGo', { city: p.city, id: p.id }); panel.hidden = true; });
        main.append(b); card.append(el('div', 'prIcon', KIND[p.kind] || '🏞️'), main); body.append(card);
      }
    } else {
      if (!market) return body.append(el('div', 'fine', 'Loading…'));
      body.append(el('div', 'fine', `You own ${market.owned} of ${market.max} lots allowed.`));
      if (!market.list.length) return body.append(el('div', 'fine', 'No player is selling a lot right now.'));
      for (const m of market.list) {
        const card = el('div', 'prCard'), main = el('div', 'prMain');
        main.append(el('div', 'prName', m.name || `Empty lot #${m.id + 1}`), el('div', 'prMeta', `${m.cityName} · from ${m.seller} · ${m.kind ? (m.auto ? 'Automated' : `Level ${m.level}`) : 'No business yet'}`));
        const b = el('button', 'prBtn', `Buy for ${naira(m.ask)}`);
        b.addEventListener('click', () => socket.emit('marketBuy', { city: m.city, id: m.id, ask: m.ask }));
        main.append(b); card.append(el('div', 'prIcon', KIND[m.kind] || '🏞️'), main); body.append(card);
      }
    }
  };
  socket.on('properties', (d) => { props = d.list; if (!panel.hidden) paint(); });
  socket.on('market', (d) => { market = d; if (!panel.hidden) paint(); });
  socket.on('marketDone', () => { socket.emit('marketOpen'); socket.emit('propsOpen'); });
  const load = () => { socket.emit('propsOpen'); socket.emit('marketOpen'); };
  tMine.addEventListener('click', () => { tab = 'mine'; paint(); });
  tMarket.addEventListener('click', () => { tab = 'market'; paint(); socket.emit('marketOpen'); });
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    if (open) hideOtherPanels('propsPanel');
    panel.hidden = !open;
    if (open) { paint(); load(); }
  });
  close.addEventListener('click', () => { panel.hidden = true; });
}
