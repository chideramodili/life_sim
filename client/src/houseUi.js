// Adulthood: House Builder (phone app). Quick Construction (ready-made houses) or Custom Construction (a grid you edit).
// The server checks every plan, charges the cost and saves it; this file only draws the editor and sends the plan.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k of Object.keys(attrs || {})) e.setAttribute(k, attrs[k]); return e; };
const EDGE_NAMES = ['Open', 'Wall', 'Door', 'Window'];
const clone = (o) => JSON.parse(JSON.stringify(o));

export function initHouse(socket) {
  const btn = el('button'); btn.id = 'houseBtn'; btn.hidden = true; btn.textContent = 'Builder';
  const panel = el('div', 'panel'); panel.id = 'housePanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', '🏗️ House builder'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close'); head.append(close);
  const body = el('div'); body.id = 'houseBody';
  panel.append(head, body);
  document.body.append(btn, panel);
  const st = document.createElement('style');
  st.textContent = '#housePanel { bottom: 70px; right: 12px; width: min(400px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 80vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #housePanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.hbRow { padding: 10px; margin: 8px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); } .hbTop { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; } .hbSub { font-size: 12px; opacity: .8; margin-top: 3px; }'
    + '.hbBtns { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; } .hbGo { flex: 1; min-width: 90px; height: 36px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); } .hbGo.alt { background: var(--bg); color: inherit; border: 0.5px solid var(--line); } .hbGo.on { outline: 2px solid var(--hi); } .hbGo:disabled { opacity: .5; }'
    + '.hbErr { color: #ff6b6b; font-size: 13px; margin-top: 6px; } .hbOk { color: #3ddc97; font-size: 13px; margin-top: 6px; }'
    + '.hbPal { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; } .hbPal button { width: 44px; height: 40px; font-size: 20px; border-radius: 8px; border: 0.5px solid var(--line); background: var(--bg); color: inherit; } .hbPal button.on { outline: 2px solid var(--hi); }'
    + '.hbSel { width: 100%; height: 34px; margin-top: 6px; border-radius: 8px; border: 0.5px solid var(--line); background: var(--bg); color: inherit; padding: 0 6px; } .hbLab { font-size: 12px; opacity: .8; margin-top: 8px; display: block; }'
    + '.hbCol { display: flex; gap: 8px; align-items: center; margin-top: 6px; } .hbCol input[type=color] { width: 44px; height: 32px; border: 0; padding: 0; background: none; }'
    + '#housePanel svg { width: 100%; height: auto; touch-action: manipulation; display: block; margin: 6px auto; background: var(--bg); border-radius: 8px; }';
  document.head.append(st);

  let d = null, sel = null /* {city,id} */, mode = 'home' /* home | custom */, cfg = null, tool = 'walls', furn = 'bed', chk = null, dirty = false, timer = 0;
  const key = (l) => `${l.city}:${l.id}`;
  const curLot = () => d && d.lots.find((l) => sel && l.city === sel.city && l.id === sel.id);
  const E = { NONE: 0, WALL: 1, DOOR: 2, WINDOW: 3 };
  const wide = () => document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName);

  // ----- editing helpers -----
  function resize(c, w, dd) {
    const h = Array.from({ length: dd + 1 }, (_, j) => Array.from({ length: w }, (_, i) => (c.h[j] && c.h[j][i]) || 0));
    const v = Array.from({ length: dd }, (_, j) => Array.from({ length: w + 1 }, (_, i) => (c.v[j] && c.v[j][i]) || 0));
    // the old front row moves to the new front row so the door keeps its place
    for (let i = 0; i < w; i++) h[dd][i] = (c.h[c.d] && c.h[c.d][i]) || 0;
    for (let i = 0; i < w; i++) { if (h[0][i] === 0) h[0][i] = 1; if (h[dd][i] === 0) h[dd][i] = 1; }
    for (let j = 0; j < dd; j++) for (const i of [0, w]) if (v[j][i] === 0) v[j][i] = 1;
    // outside doors other than the front one become walls; make sure there is one front door
    for (let i = 0; i < w; i++) if (h[0][i] === 2) h[0][i] = 1;
    for (let j = 0; j < dd; j++) for (const i of [0, w]) if (v[j][i] === 2) v[j][i] = 1;
    if (!h[dd].includes(2)) h[dd][Math.floor(w / 2)] = 2;
    const f = c.furn.filter((x) => x.x < w && x.z < dd);
    return { ...c, w, d: dd, h, v, furn: f };
  }
  const outerH = (j, c) => j === 0 || j === c.d, outerV = (i, c) => i === 0 || i === c.w;
  function cycleEdge(kind, j, i) {
    const arr = kind === 'h' ? cfg.h : cfg.v;
    const outer = kind === 'h' ? outerH(j, cfg) : outerV(i, cfg);
    const front = kind === 'h' && j === cfg.d;
    let e = arr[j][i];
    do { e = (e + 1) % 4; } while (e === E.DOOR && outer && !front);   // outside doors only at the front
    arr[j][i] = e;
    if (e === E.DOOR && front) for (let k = 0; k < cfg.w; k++) if (k !== i && cfg.h[cfg.d][k] === E.DOOR) cfg.h[cfg.d][k] = E.WALL;   // only one street door
    touch();
  }
  function cellTap(i, j) {
    const at = cfg.furn.findIndex((f) => f.x === i && f.z === j);
    if (furn === 'erase') { if (at >= 0) cfg.furn.splice(at, 1); }
    else if (at >= 0 && cfg.furn[at].k === furn) cfg.furn[at].r = (cfg.furn[at].r + 1) % 4;
    else { if (at >= 0) cfg.furn.splice(at, 1); if (cfg.furn.length >= d.catalog.limits.maxFurn) return; cfg.furn.push({ k: furn, x: i, z: j, r: 0 }); }
    touch();
  }
  function touch() { dirty = true; chk = null; paint(); clearTimeout(timer); timer = setTimeout(() => { if (sel && cfg) socket.emit('houseCheck', { ...sel, cfg }); }, 250); }

  // ----- drawing -----
  function drawGrid(parent) {
    const S = 56, P = 18, W = cfg.w * S + P * 2, Hh = cfg.d * S + P * 2 + 14;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${Hh}` });
    for (let j = 0; j < cfg.d; j++) for (let i = 0; i < cfg.w; i++) {
      const r = svgEl('rect', { x: P + i * S + 1, y: P + j * S + 1, width: S - 2, height: S - 2, fill: '#2b2f3a', rx: 3 });
      if (tool === 'furn') r.addEventListener('click', () => cellTap(i, j));
      svg.append(r);
      const f = cfg.furn.find((q) => q.x === i && q.z === j);
      if (f) {
        const t = svgEl('text', { x: P + i * S + S / 2, y: P + j * S + S / 2 + 8, 'text-anchor': 'middle', 'font-size': 26, 'pointer-events': 'none' }); t.textContent = d.catalog.furn[f.k].icon; svg.append(t);
        const a = svgEl('text', { x: P + i * S + S - 6, y: P + j * S + 12, 'text-anchor': 'end', 'font-size': 11, fill: '#ffd43b', 'pointer-events': 'none' }); a.textContent = ['↑', '→', '↓', '←'][f.r]; svg.append(a);
      }
    }
    const colr = ['#555b6a', '#e8e2d0', '#c9833a', '#6ec6ff'];
    const edge = (x1, y1, x2, y2, e, kind, j, i) => {
      const ln = svgEl('line', { x1, y1, x2, y2, stroke: colr[e], 'stroke-width': e === 0 ? 2 : e === 1 ? 7 : 6, 'stroke-linecap': 'round', 'stroke-dasharray': e === 0 ? '3 5' : e === 2 ? '10 6' : e === 3 ? '2 4' : '' });
      svg.append(ln);
      if (tool === 'walls') { const hit = svgEl('line', { x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': 24, 'stroke-linecap': 'round' }); hit.addEventListener('click', () => cycleEdge(kind, j, i)); svg.append(hit); }
    };
    for (let j = 0; j <= cfg.d; j++) for (let i = 0; i < cfg.w; i++) edge(P + i * S + 6, P + j * S, P + (i + 1) * S - 6, P + j * S, cfg.h[j][i], 'h', j, i);
    for (let j = 0; j < cfg.d; j++) for (let i = 0; i <= cfg.w; i++) edge(P + i * S, P + j * S + 6, P + i * S, P + (j + 1) * S - 6, cfg.v[j][i], 'v', j, i);
    const lab = svgEl('text', { x: W / 2, y: Hh - 3, 'text-anchor': 'middle', 'font-size': 11, fill: '#9aa3b5' }); lab.textContent = '▼ street / front door side ▼'; svg.append(lab);
    parent.append(svg);
  }

  function paintHome() {
    if (!d.lots.length) return body.append(el('div', 'fine', 'You need a plot of land first. Buy one from Properties, then come back and build your house on it.'));
    const l = curLot();
    if (d.lots.length > 1) {
      const s = el('select', 'hbSel');
      for (const x of d.lots) { const o = el('option', '', `${x.cityName} · plot ${x.id + 1}${x.built ? ' (house built)' : x.hasBiz ? ' (business)' : ''}`); o.value = key(x); if (key(x) === key(l)) o.selected = true; s.append(o); }
      s.addEventListener('change', () => { const x = d.lots.find((q) => key(q) === s.value); sel = { city: x.city, id: x.id }; cfg = null; paint(); });
      body.append(s);
    }
    if (l.hasBiz) return body.append(el('div', 'fine', 'There is a business on this plot. Pick another plot or sell the business first.'));
    if (l.leased) return body.append(el('div', 'fine', 'This plot is leased out.'));
    const card = el('div', 'hbRow');
    card.append(el('div', 'hbTop', l.built ? '🏠 Your house' : '🏗️ Empty plot'), el('div', 'hbSub', `Biggest house here: ${l.max.w} × ${l.max.d} cells (${l.max.w * 2} × ${l.max.d * 2} m).`));
    if (l.built) {
      card.append(el('div', 'hbSub', `Worth ${naira(l.cost.total)}. ${l.open ? 'Anyone can visit.' : 'Friends only.'}`));
      const b = el('div', 'hbBtns');
      const op = el('button', 'hbGo alt', l.open ? 'Make friends-only' : 'Open to everyone'); op.addEventListener('click', () => socket.emit('houseAccess', { city: l.city, id: l.id, open: !l.open }));
      const rn = el('button', 'hbGo', 'Renovate'); rn.addEventListener('click', () => { cfg = clone(l.built); mode = 'custom'; dirty = false; chk = null; paint(); socket.emit('houseCheck', { ...sel, cfg }); });
      const dm = el('button', 'hbGo alt', 'Demolish'); dm.addEventListener('click', () => { if (dm.dataset.sure) socket.emit('houseDemolish', { city: l.city, id: l.id }); else { dm.dataset.sure = 1; dm.textContent = `Tap again: get ${naira(l.cost.total / 2)} back`; } });
      b.append(op, rn, dm); card.append(b);
      body.append(card);
      return;
    }
    body.append(card);
    body.append(el('div', 'hbTop', '⚡ Quick construction'));
    for (const pr of d.presets) {
      const r = el('div', 'hbRow'); const fits = pr.cfg.w <= l.max.w && pr.cfg.d <= l.max.d;
      r.append(el('div', 'hbTop', `${pr.label} · ${naira(pr.cost)}`), el('div', 'hbSub', `${pr.text} (${pr.cfg.w} × ${pr.cfg.d} cells${fits ? '' : ', too big for this plot'})`));
      const b = el('div', 'hbBtns');
      const build = el('button', 'hbGo', 'Build now'); build.disabled = !fits; build.addEventListener('click', () => socket.emit('houseBuild', { ...sel, cfg: pr.cfg }));
      const ed = el('button', 'hbGo alt', 'Edit first'); ed.disabled = !fits; ed.addEventListener('click', () => { cfg = clone(pr.cfg); mode = 'custom'; dirty = true; chk = null; paint(); socket.emit('houseCheck', { ...sel, cfg }); });
      b.append(build, ed); r.append(b); body.append(r);
    }
    const c = el('button', 'hbGo', '🛠️ Custom construction (start from scratch)');
    c.addEventListener('click', () => { cfg = l.draft ? clone(l.draft) : resize(blankCfg(), Math.min(4, l.max.w), Math.min(3, l.max.d)); mode = 'custom'; dirty = false; chk = null; paint(); socket.emit('houseCheck', { ...sel, cfg }); });
    body.append(c);
  }
  const blankCfg = () => ({ v: 1, w: 4, d: 3, found: 'slab', roof: { t: 'gable', c: '#b5523b' }, mats: { wall: '#efe6d2', trim: '#8a6f4d', floor: 'wood' }, h: Array.from({ length: 4 }, () => Array(4).fill(0)), v: Array.from({ length: 3 }, () => Array(5).fill(0)), furn: [] });

  function paintCustom() {
    const l = curLot(), cat = d.catalog;
    const top = el('div', 'hbBtns'); const back = el('button', 'hbGo alt', '← Back'); back.addEventListener('click', () => { mode = 'home'; paint(); }); top.append(back);
    const save = el('button', 'hbGo alt', 'Save draft'); save.addEventListener('click', () => socket.emit('houseSave', { ...sel, cfg })); top.append(save);
    body.append(top);
    const sz = el('div', 'hbBtns');
    for (const [lab, dw, dd] of [['Wider', 1, 0], ['Narrower', -1, 0], ['Deeper', 0, 1], ['Shallower', 0, -1]]) {
      const b = el('button', 'hbGo alt', lab); const nw = cfg.w + dw, nd = cfg.d + dd;
      b.disabled = nw < cat.limits.minW || nd < cat.limits.minD || nw > l.max.w || nd > l.max.d;
      b.addEventListener('click', () => { cfg = resize(cfg, nw, nd); touch(); }); sz.append(b);
    }
    body.append(el('div', 'hbSub', `Size: ${cfg.w} × ${cfg.d} cells (max ${l.max.w} × ${l.max.d}). Each cell is 2 m.`), sz);
    const tools = el('div', 'hbBtns');
    for (const [k, lab] of [['walls', '🧱 Walls, doors, windows'], ['furn', '🛋️ Furniture']]) { const b = el('button', 'hbGo alt' + (tool === k ? ' on' : ''), lab); b.addEventListener('click', () => { tool = k; paint(); }); tools.append(b); }
    body.append(tools);
    body.append(el('div', 'hbSub', tool === 'walls' ? 'Tap a line to change it: Open → Wall → Door → Window. Only one door on the front.' : 'Pick a thing, then tap a square. Tap the same thing again to turn it.'));
    drawGrid(body);
    if (tool === 'furn') {
      const pal = el('div', 'hbPal');
      for (const k of Object.keys(cat.furn)) { const b = el('button', furn === k ? 'on' : '', cat.furn[k].icon); b.title = `${cat.furn[k].label} ${naira(cat.furn[k].price)}`; b.addEventListener('click', () => { furn = k; paint(); }); pal.append(b); }
      const e = el('button', furn === 'erase' ? 'on' : '', '🗑️'); e.addEventListener('click', () => { furn = 'erase'; paint(); }); pal.append(e);
      body.append(pal, el('div', 'hbSub', furn === 'erase' ? 'Tap a square to remove what is on it.' : `${cat.furn[furn].label}: ${naira(cat.furn[furn].price)}`));
    }
    const look = el('div', 'hbRow'); look.append(el('div', 'hbTop', 'Look'));
    const pick = (label, opts, get, set) => { look.append(el('span', 'hbLab', label)); const s = el('select', 'hbSel'); for (const [v, t] of opts) { const o = el('option', '', t); o.value = v; if (get() === v) o.selected = true; s.append(o); } s.addEventListener('change', () => { set(s.value); touch(); }); look.append(s); };
    pick('Foundation', Object.entries(cat.foundations).map(([k, v]) => [k, `${v.label} · ${naira(v.cell)}/cell`]), () => cfg.found, (v) => { cfg.found = v; });
    pick('Roof', Object.entries(cat.roofs).map(([k, v]) => [k, `${v.label} · ${naira(v.cell)}/cell`]), () => cfg.roof.t, (v) => { cfg.roof.t = v; });
    pick('Floor', Object.entries(cat.floors).map(([k, v]) => [k, `${v.label} · ${naira(v.cell)}/cell`]), () => cfg.mats.floor, (v) => { cfg.mats.floor = v; });
    const colors = el('div', 'hbCol');
    for (const [lab, get, set] of [['Walls', () => cfg.mats.wall, (v) => { cfg.mats.wall = v; }], ['Trim', () => cfg.mats.trim, (v) => { cfg.mats.trim = v; }], ['Roof', () => cfg.roof.c, (v) => { cfg.roof.c = v; }]]) {
      const i = el('input'); i.type = 'color'; i.value = get(); i.addEventListener('change', () => { set(i.value); touch(); }); colors.append(el('span', 'hbSub', lab), i);
    }
    look.append(colors); body.append(look);
    // price and checks
    const pr = el('div', 'hbRow');
    if (chk && chk.cost) {
      const c = chk.cost;
      pr.append(el('div', 'hbTop', `Total ${naira(c.total)}`), el('div', 'hbSub', `Foundation ${naira(c.foundation)} · roof ${naira(c.roof)} · floor ${naira(c.floor)} · walls ${naira(c.walls)} · doors ${naira(c.doors)} · windows ${naira(c.windows)} · furniture ${naira(c.furniture)}`));
      if (chk.old) pr.append(el('div', 'hbSub', chk.charge >= 0 ? `Renovation costs you ${naira(chk.charge)} more.` : `Renovation pays you back ${naira(-chk.charge)}.`));
      pr.append(chk.ok ? el('div', 'hbOk', '✓ This plan is allowed.') : el('div', 'hbErr', chk.why));
    } else pr.append(el('div', 'hbSub', 'Checking…'));
    const go = el('button', 'hbGo', l.built ? 'Renovate' : 'Build this house'); go.style.width = '100%'; go.style.marginTop = '8px'; go.disabled = !(chk && chk.ok);
    go.addEventListener('click', () => { socket.emit('houseBuild', { ...sel, cfg }); mode = 'home'; });
    pr.append(go); body.append(pr);
  }

  let sig = '';
  function paint() {
    const k = panel.scrollTop;
    body.replaceChildren();
    if (!d) body.append(el('div', 'fine', 'Loading…'));
    else if (mode === 'custom' && cfg && curLot()) paintCustom();
    else { mode = 'home'; if (!curLot() && d.lots.length) sel = { city: d.lots[0].city, id: d.lots[0].id }; paintHome(); }
    sig = JSON.stringify(d && d.lots.map((l) => [l.city, l.id, l.built && l.cost.total, l.open, l.hasBiz, l.leased]));
    panel.scrollTop = k;
  }
  socket.on('houses', (x) => {
    const was = sig; d = x;
    if (!panel.hidden && !(mode === 'custom' && !wide() && false)) { if (mode === 'custom') { sig = ''; if (!curLot()) { mode = 'home'; paint(); } return; } if (JSON.stringify(d.lots.map((l) => [l.city, l.id, l.built && l.cost.total, l.open, l.hasBiz, l.leased])) !== was) paint(); }
  });
  socket.on('houseChecked', (r) => { if (!sel || r.city !== sel.city || r.id !== sel.id) return; chk = r; if (!panel.hidden && mode === 'custom' && !wide()) paint(); });
  btn.addEventListener('click', () => { panel.hidden = false; mode = 'home'; sel = null; paint(); socket.emit('houseOpen'); });
  close.addEventListener('click', () => { panel.hidden = true; });
  socket.on('houses', () => { if (!panel.hidden && mode === 'home') paint(); });
  return {};
}
