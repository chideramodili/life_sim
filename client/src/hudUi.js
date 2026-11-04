// Adulthood: the clean screen. It does not replace any panel or button. It re-arranges them:
//  - time, mood and cash become small pills in the top corners
//  - Chat, Phone, Map and Menu become round icons on the left
//  - the old info panel opens as the Menu
//  - Work, Jobs, Bank, Wardrobe and the other "here" buttons become small pills at the bottom right
//  - notices show at the top for 6 seconds
//  - the Phone opens a full home screen with apps, search and a Night mode switch
// Every original button keeps its id and its listeners, so the rest of the game does not know anything changed.
import './hud.css';
import { applyWall, createWallPicker } from './wallpaper.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export const TOAST_MS = 6000;
const HINT = 'Tap the ground to walk.';
const MOODS = { Happy: '😊', Okay: '😐', Down: '😞' };
const NIGHT_KEY = 'adulthood-day-preset';

// The phone apps. "click" names an existing button that opens the panel. "soon" apps are placeholders.
export const APPS = [
  { id: 'chat', label: 'Messages', icon: '💬', bg: 'linear-gradient(145deg,#4c8dff,#2f5fe0)', click: 'chatBtn' },
  { id: 'friends', label: 'Friends', icon: '👥', bg: 'linear-gradient(145deg,#ff8fb1,#e0507f)', click: 'friendsBtn', badge: 'friendsBadge' },
  { id: 'people', label: 'People', icon: '🧑‍🤝‍🧑', bg: 'linear-gradient(145deg,#ffb35c,#e07a1f)', click: 'peopleBtn', badge: 'peopleBadge' },
  { id: 'bills', label: 'Bills', icon: '🧾', bg: 'linear-gradient(145deg,#8be0a8,#2f9e63)', click: 'billsBtn', badge: 'billsBadge' },
  { id: 'skills', label: 'Skills', icon: '📈', bg: 'linear-gradient(145deg,#5fd6d0,#1f9aa0)', click: 'skillsBtn' },
  { id: 'look', label: 'Look', icon: '🎨', bg: 'linear-gradient(145deg,#c7a2ff,#7d4fe0)', click: 'lookBtn' },
  { id: 'story', label: 'Story', icon: '📖', bg: 'linear-gradient(145deg,#ffd36b,#d99a1c)', click: 'chip', force: true },
  { id: 'map', label: 'Map', icon: '🗺️', bg: 'linear-gradient(145deg,#7ed6a0,#2b9a5b)', click: 'mapBtn' },
  { id: 'jobs', label: 'Jobs', icon: '💼', bg: 'linear-gradient(145deg,#34c98a,#12865a)', click: 'jobsBtn', need: 'Visit the Jobs Center to see the jobs board.' },
  { id: 'photos', label: 'Camera', icon: '📷', bg: 'linear-gradient(145deg,#6f7787,#3b4150)', click: 'photoBtn', need: 'This phone has no camera. Buy one with a camera at the Shop.' },
  { id: 'games', label: 'Games', icon: '🎮', bg: 'linear-gradient(145deg,#2fcf9a,#0d7f64)', isNew: true, say: 'Stand next to another player, then tap 🎮 Play.' },
  { id: 'wall', label: 'Wallpaper', icon: '🖼️', bg: 'linear-gradient(145deg,#6fa8ff,#7a5cff)', wall: true },
  { id: 'radio', label: 'Radio', icon: '📻', bg: 'linear-gradient(145deg,#ff7a6b,#d6343d)', isNew: true, soon: true, say: 'Radio is coming soon.' },
  { id: 'audiomack', label: 'Audiomack', icon: '🎵', bg: 'linear-gradient(145deg,#ffb52e,#d9801a)', soon: true, say: 'Music apps are coming soon.' },
  { id: 'spotify', label: 'Spotify', icon: '🎧', bg: 'linear-gradient(145deg,#4fd37c,#1a8f4a)', soon: true, say: 'Music apps are coming soon.' },
  { id: 'apple', label: 'Apple Music', icon: '🎶', bg: 'linear-gradient(145deg,#ff6b8a,#c9264f)', soon: true, say: 'Music apps are coming soon.' },
];

export function initHud(socket, look) {
  document.body.classList.add('clean');
  try { if (localStorage.getItem('adulthood.glass') === 'reduced') document.body.classList.add('noglass'); } catch { /* glass stays on */ }
  const hudEl = $('hud');
  hudEl.classList.remove('compact');

  // ----- top bar -----
  const bar = el('div');
  bar.id = 'topBar';
  const left = el('div', 'tbPill');
  left.id = 'tbLeft';
  const tbClock = el('span');
  tbClock.id = 'tbClock';
  const tbMood = el('span');
  tbMood.id = 'tbMood';
  left.append(tbClock, tbMood);
  const tbCash = el('div', 'tbPill');
  tbCash.id = 'tbCash';
  bar.append(left, tbCash);
  document.body.append(bar);
  left.addEventListener('click', () => $('needsStrip').click());

  const mirror = () => {
    tbClock.textContent = $('clock').textContent.replace(/^Mon|^Tue|^Wed|^Thu|^Fri|^Sat|^Sun/, (d) => d).trim();
    const mood = ($('mood').textContent || '').trim();
    tbMood.textContent = MOODS[mood] || '🙂';
    tbMood.title = mood;
    tbCash.textContent = $('cash').textContent;
  };
  for (const id of ['clock', 'mood', 'cash']) new MutationObserver(mirror).observe($(id), { childList: true, characterData: true, subtree: true });
  mirror();

  // ----- left dock -----
  const dock = el('div');
  dock.id = 'dock';
  const mkDock = (id, icon, label, onClick) => {
    const b = el('button');
    b.id = id;
    b.dataset.icon = icon;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.textContent = label;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };
  const menuBtn = mkDock('dockMenu', '☰', 'Menu', () => toggleMenu());
  const menuDot = el('span', 'dotBadge');
  menuDot.hidden = true;
  menuBtn.append(menuDot);
  const chatBtn = $('chatBtn');
  chatBtn.dataset.icon = '💬';
  chatBtn.setAttribute('aria-label', 'Chat');
  const phoneBtnDock = mkDock('dockPhone', '📱', 'Phone', () => openPhone());
  const mapDock = mkDock('dockMap', '🗺️', 'Map', () => $('mapBtn').click());
  mapDock.hidden = true;
  const lightDock = mkDock('dockLight', '💡', 'Lights', () => socket.emit('homeLights', !lightsOn));
  const rotateDock = mkDock('dockRotate', '🔄', 'Turn the room', () => window.dispatchEvent(new CustomEvent('adulthood-rotate')));
  lightDock.hidden = true;
  rotateDock.hidden = true;
  let lightsOn = true;
  socket.on('home', (h) => {
    lightsOn = h.lights !== false;
    lightDock.classList.toggle('off', !lightsOn);
    lightDock.title = lightsOn ? 'Lights: on (tap to switch off)' : 'Lights: off (tap to switch on)';
  });
  dock.append(menuBtn, chatBtn, phoneBtnDock, mapDock, lightDock, rotateDock);
  document.body.append(dock);

  // ----- menu (the old info panel) -----
  const head = el('div', 'menuHead');
  head.append(el('span', '', 'Menu'));
  const x = el('button', 'closeX', '×');
  x.setAttribute('aria-label', 'Close menu');
  x.addEventListener('click', () => toggleMenu(false));
  head.append(x);
  hudEl.prepend(head);
  const back = el('div');
  back.id = 'menuBack';
  back.hidden = true;
  back.addEventListener('click', () => toggleMenu(false));
  document.body.append(back);
  function toggleMenu(on) {
    const open = on === undefined ? !hudEl.classList.contains('menuOpen') : on;
    hudEl.classList.toggle('menuOpen', open);
    back.hidden = !open;
  }
  hudEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.id !== 'logout' && !b.classList.contains('closeX')) setTimeout(() => toggleMenu(false), 0);
  });
  setInterval(() => {
    menuDot.hidden = !['billsBadge', 'peopleBadge', 'friendsBadge'].some((id) => $(id) && !$(id).hidden);
  }, 800);

  // ----- action pills -----
  const actions = el('div');
  actions.id = 'actions';
  for (const id of ['workBtn', 'workBtn2', 'jobsBtn', 'carsBtn', 'phoneBtn', 'bankBtn', 'storeBtn', 'decoBtn', 'boutiqueBtn', 'wardrobeBtn', 'medBtn']) {
    const b = $(id);
    if (b) actions.append(b);
  }
  document.body.append(actions);

  // ----- toast -----
  const toastEl = el('div');
  toastEl.id = 'toast';
  document.body.append(toastEl);
  let toastTimer = null;
  function toast(text) {
    if (!text || text === HINT) return;
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), TOAST_MS);
  }
  new MutationObserver(() => toast($('notice').textContent)).observe($('notice'), { childList: true, characterData: true, subtree: true });

  // ----- story chip: small, tap to expand -----
  const chip = $('chip');
  // When the chapter is finished there is nothing left to show, so the pill goes away (the Story app in the phone still opens it).
  if (chip) {
    const sync = () => chip.classList.toggle('done', /complete/i.test(($('chipNext') && $('chipNext').textContent) || ''));
    new MutationObserver(sync).observe(chip, { childList: true, characterData: true, subtree: true });
    sync();
  }

  // ----- map icon only when you are outside -----
  let room = null;
  socket.on('me', (m) => {
    if (m.room !== room) {
      room = m.room;
      mapDock.hidden = room !== 'street';
      lightDock.hidden = room !== 'home';
      rotateDock.hidden = room !== 'home' && room !== 'friendhome';
    }
  });

  // ----- phone home screen -----
  const wrap = el('div');
  wrap.id = 'phoneHome';
  wrap.hidden = true;
  const frame = el('div');
  frame.id = 'phoneFrame';
  const screen = el('div');
  screen.id = 'phoneScreen';
  const notch = el('div');
  notch.id = 'phoneNotch';
  const status = el('div');
  status.id = 'phoneStatus';
  const sTime = el('span');
  status.append(sTime);
  const clock = el('div');
  clock.id = 'phoneClock';
  const date = el('div');
  date.id = 'phoneDate';
  const night = el('button', '', '🌙 Night mode');
  night.id = 'nightBtn';
  const search = el('input');
  search.id = 'phoneSearch';
  search.type = 'search';
  search.placeholder = 'Search apps';
  search.setAttribute('aria-label', 'Search apps');
  const grid = el('div');
  grid.id = 'appGrid';
  const closeBtn = el('button', '', 'Close');
  closeBtn.id = 'phoneClose2';
  const homeBar = el('div');
  homeBar.id = 'phoneBar';
  screen.append(notch, status, clock, date, night, search, grid, homeBar);
  const wallPicker = createWallPicker(screen, { onChange: () => applyWall(screen), toast });
  applyWall(screen);
  frame.append(screen, closeBtn);
  wrap.append(frame);
  document.body.append(wrap);

  const tiles = new Map();
  for (const app of APPS) {
    const b = el('button', 'app' + (app.soon ? ' disabled' : ''));
    b.dataset.app = app.id;
    b.setAttribute('aria-label', app.label);
    const ico = el('span', 'ico', app.icon);
    ico.style.background = app.bg;
    if (app.isNew && !app.soon) ico.append(el('span', 'tag', 'NEW'));
    if (app.soon) ico.append(el('span', 'tag soon', 'SOON'));
    if (app.badge) {
      const dot = el('span', 'dotBadge');
      dot.hidden = true;
      dot.dataset.for = app.badge;
      b.append(dot);
    }
    b.append(ico, el('span', 'lbl', app.label));
    b.addEventListener('click', () => runApp(app));
    grid.append(b);
    tiles.set(app.id, b);
  }

  function runApp(app) {
    if (app.wall) return wallPicker.open();
    const target = app.click ? $(app.click) : null;
    if (app.click && !app.force && (!target || target.hidden)) {
      if (app.need) return toast(app.need);
    }
    if (app.say && !app.click) return toast(app.say);
    closePhone();
    if (target) setTimeout(() => target.click(), 0);
  }

  function paintPhone() {
    const txt = ($('clock').textContent || '').trim();
    const m = txt.match(/(\d{1,2}:\d{2})/);
    clock.textContent = m ? m[1] : txt;
    sTime.textContent = m ? m[1] : '';
    date.textContent = txt.replace(/\d{1,2}:\d{2}\s*/, '').replace(/^[^A-Za-z0-9]+/, '').replace(/^[·\s]+/, '') || txt;
    night.textContent = look.current().preset === 'night' ? '☀️ Day mode' : '🌙 Night mode';
    night.classList.toggle('on', look.current().preset === 'night');
    document.body.classList.toggle('nightphone', look.current().preset === 'night');
    for (const dot of grid.querySelectorAll('.dotBadge')) dot.hidden = !$(dot.dataset.for) || $(dot.dataset.for).hidden;
    for (const app of APPS) if (app.click === 'photoBtn' || app.click === 'jobsBtn') tiles.get(app.id).classList.toggle('disabled', !$(app.click) || $(app.click).hidden);
  }
  function filterApps() {
    const q = search.value.trim().toLowerCase();
    for (const app of APPS) tiles.get(app.id).hidden = Boolean(q) && !app.label.toLowerCase().includes(q);
  }
  search.addEventListener('input', filterApps);

  function openPhone() {
    for (const id of ['sheet', 'journal', 'map', 'chatPanel', 'lookPanel']) if ($(id)) $(id).hidden = true;
    toggleMenu(false);
    search.value = '';
    filterApps();
    paintPhone();
    wrap.hidden = false;
  }
  function closePhone() {
    wallPicker.close();
    wrap.hidden = true;
  }
  closeBtn.addEventListener('click', closePhone);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) closePhone();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !wrap.hidden) closePhone();
  });
  setInterval(() => {
    if (!wrap.hidden) paintPhone();
  }, 1000);

  // Night mode: switch to the dark Night city style, and back to the style you had.
  night.addEventListener('click', () => {
    const cur = look.current().preset;
    if (cur === 'night') {
      let prev = 'sunset';
      try { prev = localStorage.getItem(NIGHT_KEY) || 'sunset'; } catch { /* no storage: use the default */ }
      look.setPreset(prev === 'night' ? 'sunset' : prev);
    } else {
      try { localStorage.setItem(NIGHT_KEY, cur); } catch { /* no storage: it will go back to Sunset */ }
      look.setPreset('night');
    }
    setTimeout(paintPhone, 0);
  });

  return { toast, openPhone, closePhone, toggleMenu };
}
