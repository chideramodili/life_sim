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
  const tabs = el('div', 'prTabs'); const tMine = el('button', 'prTab on', 'Mine'); const tMarket = el('button', 'prTab', 'For sale'); const tRent = el('button', 'prTab', 'For rent'); tabs.append(tMine, tMarket, tRent);
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

  let tab = 'mine', props = null, market = null, rentals = null;
  const dayDraft = {};
  const left = (secs, dayMs) => { const d = secs / (dayMs / 1000); return d >= 1 ? `${d.toFixed(1)} days left` : `${Math.max(1, Math.ceil(secs / 3600))} h left`; };
  const paint = () => {
    body.replaceChildren();
    tMine.classList.toggle('on', tab === 'mine'); tMarket.classList.toggle('on', tab === 'market'); tRent.classList.toggle('on', tab === 'rent');
    if (tab === 'mine') {
      if (!props) return body.append(el('div', 'fine', 'Loading…'));
      if (!props.length) return body.append(el('div', 'fine', 'You do not own any land yet. Find a FOR SALE lot on the street, or look under For sale.'));
      for (const p of props) {
        const card = el('div', 'prCard'), main = el('div', 'prMain');
        main.append(el('div', 'prName', p.name || `Empty lot #${p.id + 1}`),
          el('div', 'prMeta', `${p.cityName} · ${p.kind ? (p.auto ? 'Automated' : `Level ${p.level}`) : 'No business yet'} · worth ${naira(p.value)}`));
        if (p.kind) main.append(el('div', 'prMeta', p.auto ? 'Runs itself and sends you the profit.' : `Till ${naira(p.till)}`));
        if (p.ask) main.append(el('div', 'prMeta', `Listed for players at ${naira(p.ask)}`));
        if (p.rentAsk) main.append(el('div', 'prMeta', `Listed for rent at ${naira(p.rentAsk)} a day`));
        if (p.rentedOut) main.append(el('div', 'prMeta', `Rented to ${p.rentedOut.to} at ${naira(p.rentedOut.perDay)} a day · ${left(p.rentedOut.left, rentals ? rentals.dayMs : 86400000)}`));
        if (p.rented) main.append(el('div', 'prMeta', `You rent it from ${p.rented.from} at ${naira(p.rented.perDay)} a day · ${left(p.rented.left, rentals ? rentals.dayMs : 86400000)} · deposit ${naira(p.rented.deposit)}`));
        const b = el('button', 'prBtn', p.here ? 'Go there' : `In ${p.cityName}`); b.disabled = !p.here;
        b.addEventListener('click', () => { socket.emit('propGo', { city: p.city, id: p.id }); panel.hidden = true; });
        main.append(b);
        if (p.rented) {
          const ex = el('button', 'prBtn', `Pay 1 more day (${naira(p.rented.perDay)})`); ex.addEventListener('click', () => socket.emit('rentExtend', { city: p.city, id: p.id, days: 1 }));
          const en = el('button', 'prBtn', 'End the lease (get deposit and till back)'); en.addEventListener('click', () => { if (confirm('End the lease now? Unused days are not refunded.')) socket.emit('rentEnd', { city: p.city, id: p.id }); });
          main.append(ex, en);
        }
        if (p.rentAsk) { const un = el('button', 'prBtn', 'Take off the rental list'); un.addEventListener('click', () => socket.emit('rentListing', { city: p.city, id: p.id, rent: 0 })); main.append(un); }
        card.append(el('div', 'prIcon', KIND[p.kind] || '🏞️'), main); body.append(card);
      }
    } else if (tab === 'rent') {
      if (!rentals) return body.append(el('div', 'fine', 'Loading…'));
      body.append(el('div', 'fine', `You rent ${rentals.tenancies} of ${rentals.max} allowed. Pay the first days up front plus a deposit of one day's rent, which you get back. You run the business and keep its profit. When the lease ends, any stock left stays with the owner.`));
      if (!rentals.list.length) return body.append(el('div', 'fine', 'No business is for rent right now.'));
      for (const m of rentals.list) {
        const key = m.city + m.id; if (!dayDraft[key]) dayDraft[key] = 3;
        const card = el('div', 'prCard'), main = el('div', 'prMain');
        main.append(el('div', 'prName', m.name), el('div', 'prMeta', `${m.cityName} · from ${m.owner} · ${m.auto ? 'Automated' : `Level ${m.level}`} · rating ${m.rep} · ${m.staff} staff · stock ${m.stock}/${m.cap}`));
        const sel = el('select'); for (let d = 1; d <= rentals.maxDays; d++) { const o = el('option', '', `${d} day${d > 1 ? 's' : ''}`); o.value = d; if (d === dayDraft[key]) o.selected = true; sel.append(o); }
        const b = el('button', 'prBtn'); const upd = () => { b.textContent = `Rent for ${naira(m.perDay * dayDraft[key] + m.perDay)} (${naira(m.perDay)} a day + deposit)`; }; upd();
        sel.addEventListener('change', () => { dayDraft[key] = Number(sel.value); upd(); });
        b.addEventListener('click', () => socket.emit('rentTake', { city: m.city, id: m.id, rent: m.perDay, days: dayDraft[key] }));
        main.append(sel, b); card.append(el('div', 'prIcon', KIND[m.kind] || '🏪'), main); body.append(card);
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
  socket.on('rentals', (d) => { rentals = d; if (!panel.hidden) paint(); });
  socket.on('marketDone', () => { socket.emit('marketOpen'); socket.emit('propsOpen'); });
  const load = () => { socket.emit('propsOpen'); socket.emit('marketOpen'); socket.emit('rentOpen'); };
  tMine.addEventListener('click', () => { tab = 'mine'; paint(); });
  tMarket.addEventListener('click', () => { tab = 'market'; paint(); socket.emit('marketOpen'); });
  tRent.addEventListener('click', () => { tab = 'rent'; paint(); socket.emit('rentOpen'); });
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    if (open) hideOtherPanels('propsPanel');
    panel.hidden = !open;
    if (open) { paint(); load(); }
  });
  close.addEventListener('click', () => { panel.hidden = true; });
}
