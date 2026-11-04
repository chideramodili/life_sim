// Adulthood: the Boutique and the Wardrobe. The server owns the truth (what you own, prices, limits). This file only shows it and sends requests.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const naira = (n) => `₦${fmt(n)}`;

export function initFashion(socket, hooks = {}) {
  let cat = null;   // catalog (never changes)
  let info = null;  // wardrobe from the server
  let shopSig = '';
  let wardSig = '';
  const open = new Set(['top']);
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

  const byId = () => cat.byId;

  // The Boutique is a slide-up catalogue like the Home Store: category chips, a price filter, 3-column cards, a Buy bar.
  const view = { group: 'all', price: 'any', multi: false, picked: new Set(), q: '', searchOpen: false };
  const PRICES = [['any', 'Any price', () => true], ['low', 'Under ₦20,000', (c) => c.cost < 20000], ['mid', '₦20,000 to ₦100,000', (c) => c.cost >= 20000 && c.cost <= 100000], ['high', 'Over ₦100,000', (c) => c.cost > 100000]];
  const GLYPH = { top: '👕', bottom: '👖', shoes: '👟', accessory: '🕶️', perfume: '🧴' };
  const starsOf = (tier, max) => 1 + Math.round((tier / Math.max(1, max)) * 2);

  function paintShop() {
    if (!cat || !info) return;
    const sig = JSON.stringify([info.owned, info.bottles, info.where, view.group, view.price, view.multi, [...view.picked], view.q, view.searchOpen]);
    if (sig === shopSig) return;
    shopSig = sig;
    const here = info.where === 'boutique';
    $('boutiqueHere').hidden = here;
    $('boutiqueCount').textContent = `You own ${info.owned.length} of ${info.limits.clothes} clothes and ${info.bottles.length} of ${info.limits.bottles} perfume bottles.`;
    const body = $('boutiqueBody');
    body.replaceChildren();
    const redraw = () => { shopSig = ''; paintShop(); };

    const chips = el('div', 'catChips');
    const chip = (id, text) => {
      const b = el('button', `catChip${view.group === id ? ' on' : ''}`, text);
      b.dataset.group = id;
      b.addEventListener('click', () => { view.group = id; redraw(); });
      return b;
    };
    chips.append(chip('all', 'All'));
    for (const sl of cat.slots) chips.append(chip(sl.id, sl.label));
    chips.append(chip('perfume', 'Perfume'));
    body.append(chips);

    const filters = el('div', 'catFilters');
    const price = el('select', 'catSelect');
    price.id = 'boutiquePrice';
    price.setAttribute('aria-label', 'Price filter');
    for (const [id, text] of PRICES) {
      const o = el('option', '', text);
      o.value = id;
      o.selected = view.price === id;
      price.append(o);
    }
    price.addEventListener('change', () => { view.price = price.value; redraw(); });
    const multi = el('button', `catToggle${view.multi ? ' on' : ''}`, view.multi ? '✓ Pick several' : 'Pick several');
    multi.id = 'boutiqueMulti';
    multi.addEventListener('click', () => { view.multi = !view.multi; view.picked = new Set([...view.picked].slice(0, view.multi ? 99 : 1)); redraw(); });
    const search = el('button', 'catToggle', '🔍');
    search.setAttribute('aria-label', 'Search');
    search.addEventListener('click', () => { view.searchOpen = !view.searchOpen; if (!view.searchOpen) view.q = ''; redraw(); });
    filters.append(price, multi, search);
    body.append(filters);
    if (view.searchOpen) {
      const q = el('input', 'catSearch');
      q.id = 'boutiqueSearch';
      q.type = 'search';
      q.placeholder = 'Search clothes and perfume';
      q.value = view.q;
      q.addEventListener('input', () => { view.q = q.value; redraw(); const again = $('boutiqueSearch'); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } });
      body.append(q);
    }

    // One list for clothes and perfume. Each entry: key, kind, id, name, brand, cost, tier label, stars, tag, glyph, swatch.
    const tierMax = Math.max(...cat.clothes.map((c) => c.tier), 4);
    const entries = [];
    for (const c of cat.clothes) entries.push({ key: `clothes:${c.id}`, kind: 'clothes', id: c.id, group: c.slot, name: c.name, sub: c.brand, cost: c.cost, stars: starsOf(c.tier, tierMax), tag: c.tier >= 3 ? '+Charm' : '+Looks', glyph: GLYPH[c.slot] || '👕', swatch: c.color, have: info.owned.includes(c.id), tierLabel: c.tierLabel });
    for (const p of cat.perfumes) entries.push({ key: `perfume:${p.id}`, kind: 'perfume', id: p.id, group: 'perfume', name: p.name, sub: p.brand, cost: p.cost, stars: Math.max(1, Math.min(3, Math.round(p.stars / 2))), tag: '+Scent', glyph: GLYPH.perfume, swatch: null, have: false, tierLabel: p.tierLabel, extra: `${p.family}: ${p.notes}. ${p.sprays} sprays, each lasts ${p.minutes} minutes.` });
    const test = PRICES.find((p) => p[0] === view.price)[2];
    const q = view.q.trim().toLowerCase();
    const list = entries.filter((e) => (view.group === 'all' || e.group === view.group) && test(e) && (!q || `${e.name} ${e.sub}`.toLowerCase().includes(q)));
    const grid = el('div', 'catGrid');
    grid.id = 'boutiqueGrid';
    if (!list.length) grid.append(el('div', 'fine', 'Nothing matches. Try another category or price.'));
    for (const e of list) {
      const card = el('button', `catCard${view.picked.has(e.key) ? ' on' : ''}${e.have ? ' off' : ''}`);
      card.dataset.id = e.key;
      const pic = el('div', 'catPic');
      if (e.swatch) pic.style.background = `radial-gradient(circle at 50% 55%, ${e.swatch}, rgba(0,0,0,0.25))`;
      pic.append(el('span', 'catFallback', e.glyph), el('span', 'catStars', '★'.repeat(e.stars)));
      if (e.have) pic.append(el('span', 'catOwned', 'Owned'));
      card.append(pic, el('div', 'catName', e.name), el('div', 'catPrice', naira(e.cost)), el('div', 'catTag', `${e.tag} · ${e.tierLabel}`));
      card.addEventListener('click', () => {
        if (e.have) return;
        if (view.multi) { if (view.picked.has(e.key)) view.picked.delete(e.key); else view.picked.add(e.key); }
        else view.picked = view.picked.has(e.key) ? new Set() : new Set([e.key]);
        redraw();
      });
      grid.append(card);
    }
    body.append(grid);

    const picks = [...view.picked].map((k) => entries.find((e) => e.key === k)).filter((e) => e && !e.have);
    if (picks.length) {
      const total = picks.reduce((n, e) => n + e.cost, 0);
      const bar = el('div', 'catBuy');
      bar.id = 'boutiqueBuy';
      const left = el('div', 'catBuyInfo');
      left.append(el('div', 'skillName', picks.length === 1 ? picks[0].name : `${picks.length} pieces`), el('div', 'billWho', picks.length === 1 ? `${picks[0].sub}${picks[0].extra ? ` · ${picks[0].extra}` : ''}` : picks.map((e) => e.name).join(', ')));
      const buy = el('button', 'mini hot', `Buy ${naira(total)}`);
      buy.id = 'boutiqueBuyBtn';
      buy.disabled = !here;
      buy.addEventListener('click', () => {
        for (const e of picks) socket.emit('shopBuy', { kind: e.kind, id: e.id });
        view.picked = new Set();
        redraw();
      });
      bar.append(left, buy);
      body.append(bar);
    }

    const mine = $('boutiqueMine');
    mine.replaceChildren();
    if (!info.owned.length && !info.bottles.length) mine.append(el('div', 'fine', 'You do not own anything yet.'));
    for (const id of info.owned) {
      const c = byId()[id];
      const row = el('div', 'person');
      row.append(el('div', 'skillName', c.name));
      const b = el('button', 'mini', `Sell ${naira(Math.floor(c.cost * info.sellBack))}`);
      b.disabled = !here;
      b.addEventListener('click', () => socket.emit('shopSell', { kind: 'clothes', id }));
      row.append(b);
      mine.append(row);
    }
    for (const bt of info.bottles) {
      const p = cat.perfumes.find((x) => x.id === bt.id);
      const row = el('div', 'person');
      row.append(el('div', 'skillName', `${p.name} (${bt.sprays} sprays)`));
      const b = el('button', 'mini', `Sell ${naira(Math.floor((p.cost * info.sellBack * bt.sprays) / p.sprays))}`);
      b.disabled = !here;
      b.addEventListener('click', () => socket.emit('shopSell', { kind: 'perfume', uid: bt.uid }));
      row.append(b);
      mine.append(row);
    }
  }

  const wview = { group: 'all' };
  const WGLYPH = { top: '👕', bottom: '👖', shoes: '👟', accessory: '🕶️' };

  function paintWard() {
    if (!cat || !info) return;
    const sig = JSON.stringify([info.owned, info.worn, info.bottles, info.scent, info.fit, info.charm, wview.group]);
    if (sig === wardSig) return;
    wardSig = sig;
    $('wardShop').hidden = false;
    $('wardFit').textContent = `Outfit: ${info.fit.label}${info.fit.flair ? ` (flair ${info.fit.flair})` : ''}${info.charm ? ` · charm +${info.charm}` : ''}`;
    $('wardScent').textContent = info.scent ? `Scent: ${info.scent.name} · about ${info.scent.left} min left` : 'Scent: none';
    const list = $('wardList');
    list.replaceChildren();
    if (!info.owned.length) list.append(el('div', 'fine', 'You have no clothes yet. The Boutique is on the Map.'));
    else {
      const chips = el('div', 'catChips');
      const mk = (id, text) => {
        const b = el('button', `catChip${wview.group === id ? ' on' : ''}`, text);
        b.dataset.group = id;
        b.addEventListener('click', () => { wview.group = id; wardSig = ''; paintWard(); });
        return b;
      };
      chips.append(mk('all', 'All'));
      for (const sl of cat.slots) if (info.owned.some((id) => byId()[id].slot === sl.id)) chips.append(mk(sl.id, sl.label));
      list.append(chips);
      const grid = el('div', 'catGrid');
      grid.id = 'wardGrid';
      for (const id of info.owned) {
        const c = byId()[id];
        if (wview.group !== 'all' && c.slot !== wview.group) continue;
        const on = info.worn[c.slot] === id;
        const card = el('button', `catCard${on ? ' on' : ''}`);
        card.dataset.id = id;
        const pic = el('div', 'catPic');
        pic.style.background = `radial-gradient(circle at 50% 55%, ${c.color}, rgba(0,0,0,0.25))`;
        pic.append(el('span', 'catFallback', WGLYPH[c.slot] || '👕'));
        if (on) pic.append(el('span', 'catOwned', 'Wearing'));
        card.append(pic, el('div', 'catName', c.name), el('div', 'catPrice', c.brand), el('div', 'catTag', on ? 'Tap to take off' : c.tierLabel));
        card.addEventListener('click', () => socket.emit(on ? 'takeOff' : 'wear', on ? c.slot : id));
        grid.append(card);
      }
      list.append(grid);
    }
    const bl = $('wardBottles');
    bl.replaceChildren();
    if (!info.bottles.length) bl.append(el('div', 'fine', 'No perfume yet.'));
    for (const bt of info.bottles) {
      const p = cat.perfumes.find((x) => x.id === bt.id);
      const row = el('div', 'person');
      row.append(el('div', 'skillName', `${p.name} · ${bt.sprays} sprays`));
      const b = el('button', 'mini hot', 'Spritz');
      b.addEventListener('click', () => socket.emit('spritz', bt.uid));
      row.append(b);
      bl.append(row);
    }
  }

  socket.on('fashion', (c) => {
    cat = c;
    cat.byId = Object.fromEntries(c.clothes.map((x) => [x.id, x]));
    if (hooks.onCatalog) hooks.onCatalog(cat);
    shopSig = wardSig = '';
    paintShop();
    paintWard();
  });
  socket.on('wardrobe', (w) => {
    info = w;
    $('boutiqueBtn').hidden = w.where !== 'boutique';
    if (w.where !== 'boutique') $('boutiquePanel').hidden = true;
    // The wardrobe is where you change: at Home or in the Boutique.
    $('wardrobeBtn').hidden = !w.where;
    if (!w.where) $('wardrobePanel').hidden = true;
    paintShop();
    paintWard();
  });

  function toggle(id) {
    const wasHidden = $(id).hidden;
    hideOtherPanels();
    $(id).hidden = !wasHidden;
    if (wasHidden) {
      shopSig = wardSig = '';
      paintShop();
      paintWard();
    }
  }
  $('boutiqueBtn').addEventListener('click', () => toggle('boutiquePanel'));
  $('boutiqueClose').addEventListener('click', () => ($('boutiquePanel').hidden = true));
  $('wardrobeBtn').addEventListener('click', () => toggle('wardrobePanel'));
  $('wardShop').addEventListener('click', () => {
    $('wardrobePanel').hidden = true;
    const b = $('mapBtn');
    if (b) b.click();
  });
  $('wardClose').addEventListener('click', () => ($('wardrobePanel').hidden = true));

  return {
    reset() {
      info = null;
      shopSig = wardSig = '';
      for (const id of ['boutiquePanel', 'wardrobePanel']) $(id).hidden = true;
      $('boutiqueBtn').hidden = true;
    },
  };
}
