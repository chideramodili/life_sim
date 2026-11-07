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

  function paintShop() {
    if (!cat || !info) return;
    const sig = JSON.stringify([info.owned, info.bottles, info.where, [...open]]);
    if (sig === shopSig) return;
    shopSig = sig;
    const here = info.where === 'boutique';
    $('boutiqueHere').hidden = here;
    $('boutiqueCount').textContent = `You own ${info.owned.length} of ${info.limits.clothes} clothes and ${info.bottles.length} of ${info.limits.bottles} perfume bottles.`;
    const body = $('boutiqueBody');
    body.replaceChildren();
    const section = (key, title, sub, rows) => {
      const isOpen = open.has(key);
      const head = el('button', `groupHead${isOpen ? ' on' : ''}`);
      head.append(el('span', 'skillName', `${isOpen ? '▾' : '▸'} ${title}`), el('span', 'billWho', sub));
      head.addEventListener('click', () => {
        if (open.has(key)) open.delete(key);
        else open.add(key);
        shopSig = '';
        paintShop();
      });
      body.append(head);
      if (isOpen) for (const r of rows) body.append(r);
    };
    for (const s of cat.slots) {
      const items = cat.clothes.filter((c) => c.slot === s.id);
      const rows = items.map((c) => {
        const have = info.owned.includes(c.id);
        const row = el('div', 'job');
        const top = el('div', 'skillHead');
        top.append(el('span', 'skillName', c.name), el('span', 'tagc', naira(c.cost)));
        const b = el('button', 'mini hot billPay', have ? 'You own this' : 'Buy');
        b.disabled = !here || have;
        b.addEventListener('click', () => socket.emit('shopBuy', { kind: 'clothes', id: c.id }));
        row.append(top, el('div', 'billWho', `${c.brand} · ${c.tierLabel}${c.tier >= 3 ? ' · small charm bonus' : ''}`), b);
        return row;
      });
      section(s.id, s.label, `${items.length} pieces · ${items.filter((c) => info.owned.includes(c.id)).length} owned`, rows);
    }
    const prow = cat.perfumes.map((p) => {
      const row = el('div', 'job');
      const top = el('div', 'skillHead');
      top.append(el('span', 'skillName', `${p.name}${p.pick ? ' ⭐ Staff pick' : ''}`), el('span', 'tagc', naira(p.cost)));
      const b = el('button', 'mini hot billPay', 'Buy a bottle');
      b.disabled = !here;
      b.addEventListener('click', () => socket.emit('shopBuy', { kind: 'perfume', id: p.id }));
      row.append(
        top,
        el('div', 'billWho', `${p.brand} · ${p.tierLabel} · ${stars(p.stars)}`),
        el('div', 'billWho', `${p.family}: ${p.notes}`),
        el('div', 'billWho', `${p.sprays} sprays, each lasts ${p.minutes} minutes`),
        b,
      );
      return row;
    });
    section('perfume', 'Perfume', `${cat.perfumes.length} scents`, prow);

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

  function paintWard() {
    if (!cat || !info) return;
    const sig = JSON.stringify([info.owned, info.worn, info.bottles, info.scent, info.fit, info.charm]);
    if (sig === wardSig) return;
    wardSig = sig;
    $('wardShop').hidden = false;
    $('wardFit').textContent = `Outfit: ${info.fit.label}${info.fit.flair ? ` (flair ${info.fit.flair})` : ''}${info.charm ? ` · charm +${info.charm}` : ''}`;
    $('wardScent').textContent = info.scent ? `Scent: ${info.scent.name} · about ${info.scent.left} min left` : 'Scent: none';
    const list = $('wardList');
    list.replaceChildren();
    if (!info.owned.length) list.append(el('div', 'fine', 'You have no clothes yet. The Boutique is on the Map.'));
    for (const s of cat.slots) {
      const mine = info.owned.filter((id) => byId()[id].slot === s.id);
      if (!mine.length) continue;
      list.append(el('div', 'jlabel', s.label));
      for (const id of mine) {
        const c = byId()[id];
        const on = info.worn[s.id] === id;
        const row = el('button', `decoItem${on ? ' on' : ''}`);
        row.append(el('span', null, `${c.name} · ${c.brand}`), el('span', 'tagc', on ? 'Wearing' : c.tierLabel));
        row.addEventListener('click', () => socket.emit(on ? 'takeOff' : 'wear', on ? s.id : id));
        list.append(row);
      }
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