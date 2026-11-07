// Adulthood: the map screen with icon bubbles, and the mini-map that shows where you are going.
// The server owns the truth (opening hours, who may go where, the route). This file only draws the city from the
// layout the server sends and lets you pick a place. It never decides anything.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// One icon per kind of place. Our own picks, not copied from anywhere.
export const ICONS = {
  shop: '🛍️', boutique: '👗', homestore: '🛋️', pharmacy: '💊', jobs: '💼', market: '🧺', bank: '🏦', plaza: '⛲', police: '🚓',
  gym: '🏋️', terminal: '🚆', hospital: '🏥', library: '📚', airport: '✈️', garage: '🚗', club: '🪩', home: '🏠',
};
export const iconOf = (id) => ICONS[id] || '📍';

const KIND_COLORS = { campus: '#c9c3b6', office: '#b9bfc9', shop: '#d4b88e', flat: '#c8a89a', house: '#d8c8b0', industrial: '#a9a9a0', civic: '#cbbf9a' };
const WALK_MS = 2.2; // metres a second on the street (the same speed the server uses to walk you)

// Paints the city into a canvas. view: where the canvas shows (ox,oz = world point at the canvas centre, s = pixels per metre).
export function paintPlan(g, plan, view) {
  const { w, h, ox, oz, s } = view;
  const X = (x) => (x - ox) * s + w / 2;
  const Z = (z) => (z - oz) * s + h / 2;
  g.fillStyle = '#6a8f52';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#9bbd7c';
  for (const p of plan.parks || []) g.fillRect(X(p.x0), Z(p.z0), (p.x1 - p.x0) * s, (p.z1 - p.z0) * s);
  g.fillStyle = '#e4e0d2';
  for (const r of plan.roadsEW) g.fillRect(X(-plan.bx), Z(r.z - r.half - 2.5), plan.bx * 2 * s, (r.half + 2.5) * 2 * s);
  for (const r of plan.roadsNS) g.fillRect(X(r.x - r.half - 2.5), Z(-plan.bz), (r.half + 2.5) * 2 * s, plan.bz * 2 * s);
  g.fillStyle = '#4b4b52';
  for (const r of plan.roadsEW) g.fillRect(X(-plan.bx), Z(r.z - r.half), plan.bx * 2 * s, r.half * 2 * s);
  for (const r of plan.roadsNS) g.fillRect(X(r.x - r.half), Z(-plan.bz), r.half * 2 * s, plan.bz * 2 * s);
  g.fillStyle = '#8c8f98';
  for (const t of plan.tracks || []) g.fillRect(X(t.x0), Z(t.z0), (t.x1 - t.x0) * s, Math.max(2, (t.z1 - t.z0) * s));
  for (const b of plan.buildings) {
    g.fillStyle = KIND_COLORS[b.k] || '#d0c6b4';
    g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * s, b.d * s);
  }
}

// The distance left and the walking time, from where you are to a door. Straight line, with a little extra for the corners.
export function tripFigures(pos, dest) {
  const dist = Math.hypot(dest.x - pos.x, dest.z - pos.z) * 1.15;
  const secs = dist / WALK_MS;
  const distText = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.max(5, Math.round(dist / 5) * 5)} m`;
  const timeText = secs < 60 ? 'under 1 min' : `${Math.round(secs / 60)} min`;
  return { dist, secs, distText, timeText };
}

export function createMapUi({ socket, getPos, getRooms, getCurrentRoom, getMethod, onGo }) {
  const state = { plan: null, home: null, cityId: null, selected: null, scroll: null, askedFor: null };
  let dest = null; // { id, name, x, z, pinned }
  let navSource = null; // 'pin' | 'walk' | 'trip'

  socket.on('cityPlan', (m) => {
    state.plan = m.plan;
    state.home = m.home;
    state.cityId = m.city;
    if (!$('map').hidden) window.dispatchEvent(new CustomEvent('adulthood-mapdata'));
  });
  const ask = (cityId) => {
    if (state.askedFor === cityId && state.plan) return;
    state.askedFor = cityId;
    socket.emit('cityPlan');
  };

  const doorOf = (id) => {
    if (!state.plan) return null;
    if (id === 'home') return state.home;
    const d = state.plan.doors[id];
    return d ? { x: d.x, z: d.z } : null;
  };

  // ---------- the plan on the Map screen ----------
  const SCALE = 2.6;
  function planNode(onChange) {
    const wrap = el('div', 'planWrap');
    wrap.id = 'planWrap';
    if (!state.plan) {
      wrap.append(el('div', 'fine', 'Loading the city map...'));
      return wrap;
    }
    const plan = state.plan;
    const W = Math.round((plan.bx * 2 + 40) * SCALE);
    const H = Math.round((plan.bz * 2 + 40) * SCALE);
    const scroller = el('div', 'planScroll');
    scroller.id = 'planScroll';
    const inner = el('div', 'planInner');
    inner.style.width = `${W}px`;
    inner.style.height = `${H}px`;
    const canvas = el('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    paintPlan(canvas.getContext('2d'), plan, { w: W, h: H, ox: 0, oz: 0, s: SCALE });
    inner.append(canvas);
    const px = (x) => x * SCALE + W / 2;
    const pz = (z) => z * SCALE + H / 2;
    const rooms = getRooms() || [];
    const here = getCurrentRoom();
    const ids = new Set(Object.keys(plan.doors));
    if (state.home) ids.add('home');
    for (const id of ids) {
      const d = doorOf(id);
      if (!d) continue;
      const r = rooms.find((q) => q.id === id);
      const b = el('button', `planBubble${state.selected === id ? ' on' : ''}${r && !r.open ? ' shut' : ''}${here === id ? ' here' : ''}`, iconOf(id));
      b.dataset.id = id;
      b.setAttribute('aria-label', r ? r.name : id);
      b.style.left = `${px(d.x)}px`;
      b.style.top = `${pz(d.z)}px`;
      b.addEventListener('click', () => {
        state.selected = id;
        state.scroll = [scroller.scrollLeft, scroller.scrollTop];
        onChange();
      });
      inner.append(b);
    }
    const me = getPos();
    if (me) {
      const dot = el('div', 'planMe');
      dot.style.left = `${px(me.x)}px`;
      dot.style.top = `${pz(me.z)}px`;
      inner.append(dot);
    }
    scroller.addEventListener('scroll', () => { state.scroll = [scroller.scrollLeft, scroller.scrollTop]; });
    scroller.append(inner);
    wrap.append(scroller);
    // Start centred on you (or the selected place), and keep your place when the screen redraws.
    queueMicrotask(() => {
      if (state.scroll) { scroller.scrollLeft = state.scroll[0]; scroller.scrollTop = state.scroll[1]; return; }
      const focus = (state.selected && doorOf(state.selected)) || me || { x: 0, z: 0 };
      scroller.scrollLeft = px(focus.x) - scroller.clientWidth / 2;
      scroller.scrollTop = pz(focus.z) - scroller.clientHeight / 2;
    });
    return wrap;
  }

  // The card under the plan for the place you tapped.
  function detailNode(onChange) {
    const id = state.selected;
    if (!id) return el('div', 'planHint', 'Tap an icon to see the place.');
    const r = (getRooms() || []).find((q) => q.id === id);
    const card = el('div', 'planCard');
    card.id = 'planCard';
    const name = r ? r.name : id;
    const head = el('div', 'planCardHead');
    head.append(el('span', 'planCardIcon', iconOf(id)), el('span', 'skillName', name));
    card.append(head);
    if (r) card.append(el('div', 'billWho', r.solo ? r.hours : r.open ? `Open ${r.hours}` : `Closed · open ${r.hours}`));
    const pos = getPos();
    const d = doorOf(id);
    if (pos && d) {
      const f = tripFigures(pos, d);
      card.append(el('div', 'billWho', `${f.distText} away · about ${f.timeText} on foot`));
    }
    const row = el('div', 'planBtns');
    const pin = el('button', 'mini', dest && dest.id === id ? 'Pinned ✓' : '📍 Pin');
    pin.id = 'planPin';
    pin.addEventListener('click', () => { setDest(id, true); onChange(); });
    row.append(pin);
    if (r && r.id !== getCurrentRoom() && r.open) {
      const go = el('button', 'mini hot', 'Go');
      go.id = 'planGo';
      go.addEventListener('click', () => onGo(r.id));
      row.append(go);
    } else if (r && r.id === getCurrentRoom()) row.append(el('span', 'tag', 'You are here'));
    card.append(row);
    return card;
  }

  // ---------- the mini-map ----------
  const mini = el('div');
  mini.id = 'miniMap';
  mini.hidden = true;
  const miniCanvas = el('canvas');
  const MINI = 116;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  miniCanvas.width = MINI * dpr;
  miniCanvas.height = MINI * dpr;
  miniCanvas.style.width = `${MINI}px`;
  miniCanvas.style.height = `${MINI}px`;
  mini.append(miniCanvas);
  const nav = el('div');
  nav.id = 'navBar';
  nav.hidden = true;
  const navText = el('div', 'navText');
  navText.id = 'navText';
  const navGo = el('button', 'navGo', 'Walk there');
  navGo.id = 'navGo';
  const navX = el('button', 'navX', '×');
  navX.id = 'navX';
  navX.setAttribute('aria-label', 'Stop directions');
  nav.append(navText, navGo, navX);
  document.body.append(mini, nav);

  navX.addEventListener('click', () => {
    if (navSource === 'walk') {
      const p = getPos();
      if (p) socket.emit('moveTo', { x: p.x, z: p.z });
    }
    clearDest();
  });
  navGo.addEventListener('click', () => {
    if (dest) onGo(dest.id, 'walk');
  });

  function setDest(id, pinned) {
    const d = doorOf(id);
    const r = (getRooms() || []).find((q) => q.id === id);
    if (!d) return;
    dest = { id, name: r ? r.name : id, x: d.x, z: d.z, pinned: Boolean(pinned) };
    navSource = pinned ? 'pin' : navSource;
    tick();
  }
  function clearDest() {
    dest = null;
    navSource = null;
    tick();
  }

  // Called a few times a second. Shows the mini-map only while there is somewhere you are heading and you are out on the street.
  let walking = null; // the 'walk' field from the server
  let trip = null;
  function follow(m) {
    walking = m.walk || null;
    trip = m.trip && !m.trip.ambulance ? m.trip : null;
    if (walking && walking.toId) {
      if (!dest || dest.id !== walking.toId || navSource !== 'walk') { setDest(walking.toId, false); navSource = 'walk'; }
    } else if (navSource === 'walk') {
      clearDest();
    }
    if (dest && getCurrentRoom() === dest.id) clearDest();
  }
  function tick() {
    const pos = getPos();
    const out = getCurrentRoom() === 'street';
    const show = Boolean(dest && state.plan && pos && out);
    mini.hidden = !show;
    nav.hidden = !show;
    document.body.classList.toggle('miniOn', show);
    if (!show) return;
    const f = tripFigures(pos, dest);
    if (f.dist < 6 && !walking) return clearDest();
    navText.textContent = `${iconOf(dest.id)} ${dest.name} · ${f.distText} · ${f.timeText}`;
    navGo.hidden = Boolean(walking) || Boolean(trip);
    navGo.textContent = 'Walk there';
    const g = miniCanvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = 55;
    const s = MINI / (R * 2);
    paintPlan(g, state.plan, { w: MINI, h: MINI, ox: pos.x, oz: pos.z, s });
    // the dotted line to where you are going
    const cx = MINI / 2, cy = MINI / 2;
    const tx = (dest.x - pos.x) * s + cx, ty = (dest.z - pos.z) * s + cy;
    g.save();
    g.strokeStyle = '#2f7bff';
    g.lineWidth = 2.5;
    g.setLineDash([5, 5]);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(tx, ty);
    g.stroke();
    g.restore();
    // the place itself: its icon if it is on the map, otherwise a pointer at the edge
    const inside = tx > 8 && tx < MINI - 8 && ty > 8 && ty < MINI - 8;
    g.font = '15px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (inside) {
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(tx, ty, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000';
      g.fillText(iconOf(dest.id), tx, ty + 1);
    } else {
      const k = Math.min((MINI / 2 - 9) / Math.max(1, Math.abs(tx - cx)), (MINI / 2 - 9) / Math.max(1, Math.abs(ty - cy)));
      const ex = cx + (tx - cx) * k, ey = cy + (ty - cy) * k;
      g.fillStyle = '#2f7bff';
      g.beginPath(); g.arc(ex, ey, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.fillText('›', ex, ey);
    }
    // you: an arrow that points the way you face
    g.save();
    g.translate(cx, cy);
    g.rotate(Math.atan2(Math.sin(pos.yaw), -Math.cos(pos.yaw)));
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#1a2a55';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
  setInterval(tick, 250);

  return { state, planNode, detailNode, ask, setDest, clearDest, follow, tick, doorOf };
}
