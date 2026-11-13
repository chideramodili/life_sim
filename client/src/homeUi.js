// Adulthood: the Home Store and the Decorate screen. The server owns the truth (what you own, where it is, prices, limits).
// This file only shows it and sends requests.
import { hideOtherPanels } from './panels.js';
import { thumbFor } from './thumbs.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const naira = (n) => `₦${fmt(n)}`;

export function initHome(socket, hooks = {}) {
  let info = null;
  let selected = null;   // uid of the piece you are adjusting
  let storeSig = '';
  let decoSig = '';
  let paintSig = '';

  const label = (id) => (info.catalog.find((c) => c.id === id) || { label: id }).label;
  const def = (id) => info.catalog.find((c) => c.id === id);

  // ----- Home Store -----
  // A slide-up catalogue: category chips, a price filter, and cards in three columns. Tap a card, then Buy.
  // "Pick several" lets you tick a few cards and buy them together. The server still checks every single purchase.
  const TAGS = { bed: 'Sleep', tv: 'Fun', fridge: 'Food', desk: 'Study', cool: 'Cool', sofa: 'Comfort', rug: 'Style', art: 'Style', lamp: 'Light', plant: 'Calm', shelf: 'Style', seat: 'Comfort', bath: 'Bathroom', decor: 'Style', pro: 'Style' };
  const PRICES = [['any', 'Any price', () => true], ['low', 'Under ₦50,000', (c) => c.cost < 50000], ['mid', '₦50,000 to ₦150,000', (c) => c.cost >= 50000 && c.cost <= 150000], ['high', 'Over ₦150,000', (c) => c.cost > 150000]];
  const view = { group: 'all', q: '', price: 'any', multi: false, picked: new Set(), searchOpen: false };
  const stars = (c) => 1 + Math.round((c.tier / Math.max(1, c.tiers - 1)) * 2);
  function paintStore() {
    if (!info) return;
    const sig = JSON.stringify([info.catalog, info.items.map((i) => [i.uid, i.id]), info.where, view.group, view.q, view.price, view.multi, [...view.picked], view.searchOpen]);
    if (sig === storeSig) return;
    storeSig = sig;
    const here = info.where === 'store';
    $('storeCount').textContent = `You own ${info.items.length} of ${info.limit} pieces.`;
    $('storeHere').hidden = here;
    const body = $('storeBody');
    body.replaceChildren();

    const chips = el('div', 'catChips');
    const chip = (id, text) => {
      const b = el('button', `catChip${view.group === id ? ' on' : ''}`, text);
      b.dataset.group = id;
      b.addEventListener('click', () => { view.group = id; storeSig = ''; paintStore(); });
      return b;
    };
    chips.append(chip('all', 'All'));
    for (const g of info.groups) chips.append(chip(g.id, g.label));
    body.append(chips);

    const filters = el('div', 'catFilters');
    const price = el('select', 'catSelect');
    price.id = 'storePrice';
    price.setAttribute('aria-label', 'Price filter');
    for (const [id, text] of PRICES) {
      const o = el('option', '', text);
      o.value = id;
      o.selected = view.price === id;
      price.append(o);
    }
    price.addEventListener('change', () => { view.price = price.value; storeSig = ''; paintStore(); });
    const multi = el('button', `catToggle${view.multi ? ' on' : ''}`, view.multi ? '✓ Pick several' : 'Pick several');
    multi.id = 'storeMulti';
    multi.addEventListener('click', () => { view.multi = !view.multi; view.picked = new Set([...view.picked].slice(0, view.multi ? 99 : 1)); storeSig = ''; paintStore(); });
    const search = el('button', 'catToggle', '🔍');
    search.id = 'storeSearchBtn';
    search.setAttribute('aria-label', 'Search');
    search.addEventListener('click', () => { view.searchOpen = !view.searchOpen; if (!view.searchOpen) view.q = ''; storeSig = ''; paintStore(); });
    filters.append(price, multi, search);
    body.append(filters);
    if (view.searchOpen) {
      const q = el('input', 'catSearch');
      q.id = 'storeSearch';
      q.type = 'search';
      q.placeholder = 'Search furniture';
      q.value = view.q;
      q.addEventListener('input', () => { view.q = q.value; storeSig = ''; paintStore(); const again = $('storeSearch'); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } });
      body.append(q);
    }

    const test = PRICES.find((p) => p[0] === view.price)[2];
    const q = view.q.trim().toLowerCase();
    const list = info.catalog.filter((c) => (view.group === 'all' || c.group === view.group) && test(c) && (!q || c.label.toLowerCase().includes(q)));
    const grid = el('div', 'catGrid');
    grid.id = 'storeGrid';
    if (!list.length) grid.append(el('div', 'fine', 'Nothing matches. Try another category or price.'));
    for (const c of list) {
      const owned = info.items.filter((i) => i.id === c.id).length;
      const ownedInGroup = info.items.filter((i) => def(i.id).group === c.group).length;
      const grp = info.groups.find((g) => g.id === c.group);
      const blocked = owned >= c.max || ownedInGroup >= grp.cap;
      const card = el('button', `catCard${view.picked.has(c.id) ? ' on' : ''}${blocked ? ' off' : ''}`);
      card.dataset.id = c.id;
      const pic = el('div', 'catPic');
      const url = c.glb ? `/models/furniture/${c.glb}.png` : thumbFor(c);
      if (url) { const im = el('img'); im.src = url; im.alt = c.label; pic.append(im); } else pic.append(el('span', 'catFallback', '🛋️'));
      pic.append(el('span', 'catSize', `${c.size[0]}×${c.size[1]}`), el('span', 'catStars', '★'.repeat(stars(c))));
      if (owned) pic.append(el('span', 'catOwned', `Own ${owned}`));
      card.append(pic, el('div', 'catName', c.label), el('div', 'catPrice', naira(c.cost)), el('div', 'catTag', `+${TAGS[c.group] || 'Style'}`));
      card.addEventListener('click', () => {
        if (view.multi) { if (view.picked.has(c.id)) view.picked.delete(c.id); else view.picked.add(c.id); }
        else view.picked = view.picked.has(c.id) ? new Set() : new Set([c.id]);
        storeSig = '';
        paintStore();
      });
      grid.append(card);
    }
    body.append(grid);

    const picks = [...view.picked].map((id) => def(id)).filter(Boolean);
    if (picks.length) {
      const total = picks.reduce((n, c) => n + c.cost, 0);
      const bar = el('div', 'catBuy');
      bar.id = 'storeBuy';
      const info1 = el('div', 'catBuyInfo');
      info1.append(el('div', 'skillName', picks.length === 1 ? picks[0].label : `${picks.length} pieces`), el('div', 'billWho', picks.length === 1 ? picks[0].text : `${picks.map((c) => c.label).join(', ')}`));
      const buy = el('button', 'mini hot', `Buy ${naira(total)}`);
      buy.id = 'storeBuyBtn';
      buy.disabled = !here;
      buy.addEventListener('click', () => {
        for (const c of picks) socket.emit('homeBuy', c.id);
        view.picked = new Set();
        storeSig = '';
      });
      bar.append(info1, buy);
      body.append(bar);
    }

    const mine = $('storeMine');
    mine.replaceChildren();
    if (!info.items.length) mine.append(el('div', 'fine', 'You do not own any furniture yet.'));
    for (const it of info.items) {
      const row = el('div', 'person');
      const d = def(it.id);
      row.append(el('div', 'skillName', `${d.label}${it.placed ? '' : ' (not placed)'}`));
      const b = el('button', 'mini', `Sell ${naira(Math.floor(d.cost * info.sellBack))}`);
      b.disabled = !here;
      b.addEventListener('click', () => socket.emit('homeSell', it.uid));
      row.append(b);
      mine.append(row);
    }
  }

  // ----- Decorate -----
  const EFFECT_TEXT = [
    ['sleep', (v) => `Sleeping at home: +${v} extra`],
    ['fun', (v) => `Playing at home: +${v} extra fun`],
    ['eat', (v) => `Eating at home: +${v} extra food`],
    ['course', (v) => `Online courses: +${Math.round(v * 100)}% XP`],
    ['calm', (v) => `Calm at home (plants and cooling): ${v.toFixed(2)} stress a minute`],
  ];
  function paintDeco() {
    if (!info) return;
    const here = info.where === 'home';
    $('decoHere').hidden = here;
    $('decoStyle').textContent = `Home style: ${info.styleLabel} (${info.style})`;
    const fx = EFFECT_TEXT.filter(([k]) => info.effects[k] > 0).map(([k, f]) => f(info.effects[k]));
    if (info.effects.lamp) fx.push('Lamp: your home is not pitch dark in a power cut');
    $('decoEffects').textContent = fx.length ? fx.join(' · ') : 'Place a bed, TV, fridge, desk or plants to make your home better to live in. Furniture only counts once it is placed.';

    const sig = JSON.stringify([info.items, info.where, selected]);
    if (sig !== decoSig) {
      decoSig = sig;
      if (selected !== null && !info.items.some((i) => i.uid === selected)) {
        selected = null;
        if (hooks.onSelect) hooks.onSelect(null);
      }
      const list = $('decoList');
      list.replaceChildren();
      if (!info.items.length) list.append(el('div', 'fine', 'Buy furniture at the Home Store first. Find it on the Map.'));
      for (const it of info.items) {
        const row = el('button', `decoItem${it.uid === selected ? ' on' : ''}`);
        row.append(el('span', null, label(it.id)), el('span', 'tagc', it.placed ? 'Placed' : 'Not placed'));
        row.addEventListener('click', () => {
          selected = selected === it.uid ? null : it.uid;
          if (hooks.onSelect) hooks.onSelect(selected);
          decoSig = '';
          paintDeco();
        });
        list.append(row);
      }
      const it = info.items.find((i) => i.uid === selected);
      $('decoMove').hidden = !it;
      if (it) {
        $('decoSelName').textContent = `${label(it.id)}${it.placed ? '' : ' (not placed yet)'}`;
        $('decoPlace').hidden = it.placed;
        $('decoPad').hidden = !it.placed;
        $('decoAway').hidden = !it.placed;
        for (const b of $('decoMove').querySelectorAll('button')) b.disabled = !here;
      }
    }

    // While a placed piece is selected only the move buttons stay, so the room is visible while you place it.
    const sel = info.items.find((i) => i.uid === selected);
    $('decoPanel').classList.toggle('moving', !!(sel && sel.placed && here));

    // Paint swatches
    const psig = JSON.stringify([info.wall, info.floor, info.walls, info.floors, here]);
    if (psig !== paintSig) {
      paintSig = psig;
      for (const [boxId, list, current, key] of [['paintWalls', info.walls, info.wall, 'wall'], ['paintFloors', info.floors, info.floor, 'floor']]) {
        const box = $(boxId);
        box.replaceChildren();
        for (const c of list) {
          const b = el('button', `swatch${c.id === current ? ' on' : ''}`);
          b.style.background = c.color || (key === 'wall' ? '#6b5646' : '#4a3668');
          b.title = c.id;
          b.setAttribute('aria-label', `${key} ${c.id}`);
          b.disabled = !here;
          b.addEventListener('click', () => socket.emit('homePaint', { [key]: c.id }));
          box.append(b);
        }
      }
      $('paintCost').textContent = `Each change costs ${naira(info.styleCost)}.`;
    }
  }

  // Moving, turning, putting away.
  const cur = () => (info ? info.items.find((i) => i.uid === selected) : null);
  const nudge = (dx, dz) => {
    const it = cur();
    if (it && it.placed) socket.emit('homePlace', { uid: it.uid, x: it.x + dx, z: it.z + dz, rot: it.rot });
  };
  $('decoPlace').addEventListener('click', () => {
    const it = cur();
    if (it) socket.emit('homePlace', { uid: it.uid, auto: true });
  });
  $('decoAway').addEventListener('click', () => {
    const it = cur();
    if (it) socket.emit('homeAway', it.uid);
  });
  $('decoDone').addEventListener('click', () => {
    selected = null;
    if (hooks.onSelect) hooks.onSelect(null);
    decoSig = '';
    paintDeco();
  });
  $('decoBack').addEventListener('click', () => nudge(0, -1));
  $('decoFront').addEventListener('click', () => nudge(0, 1));
  $('decoLeft').addEventListener('click', () => nudge(-1, 0));
  $('decoRight').addEventListener('click', () => nudge(1, 0));
  $('decoTurn').addEventListener('click', () => {
    const it = cur();
    if (it && it.placed) socket.emit('homePlace', { uid: it.uid, x: it.x, z: it.z, rot: it.rot ? 0 : 1 });
  });

  socket.on('home', (h) => {
    info = h;
    if (hooks.onData) hooks.onData(h);
    $('storeBtn').hidden = h.where !== 'store';
    $('decoBtn').hidden = h.where !== 'home';
    if (h.where !== 'store') $('storePanel').hidden = true;
    if (h.where !== 'home') $('decoPanel').hidden = true;
    paintStore();
    paintDeco();
  });

  function toggle(id) {
    const open = $(id).hidden;
    hideOtherPanels();
    $(id).hidden = !open;
    if (open) {
      storeSig = '';
      decoSig = '';
      paintSig = '';
      paintStore();
      paintDeco();
    }
  }
  $('storeBtn').addEventListener('click', () => toggle('storePanel'));
  $('storeClose').addEventListener('click', () => ($('storePanel').hidden = true));
  $('decoBtn').addEventListener('click', () => toggle('decoPanel'));
  $('decoClose').addEventListener('click', () => ($('decoPanel').hidden = true));

  return {
    reset() {
      info = null;
      selected = null;
      storeSig = decoSig = paintSig = '';
      for (const id of ['storePanel', 'decoPanel']) $(id).hidden = true;
      $('storeBtn').hidden = true;
      $('decoBtn').hidden = true;
      if (hooks.onData) hooks.onData(null);
      if (hooks.onSelect) hooks.onSelect(null);
    },
  };
}
