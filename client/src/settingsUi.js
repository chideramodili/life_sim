// The Look panel: pick a style, an accent color, and a text size. Saved to the account and to this device.
import { PRESETS, ACCENTS, SIZES, DEFAULT_THEME, normalizeTheme, applyTheme, loadLocalTheme, saveLocalTheme } from './theme.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function initLook(socket, onApply = () => {}) {
  let theme = loadLocalTheme();

  function render() {
    const presets = $('lookPresets');
    presets.replaceChildren();
    for (const [id, p] of Object.entries(PRESETS)) {
      const b = el('button', 'pbtn' + (theme.preset === id ? ' on' : ''));
      for (const c of [p.bg, p.accent, p.hi]) {
        const dot = el('span', 'dot');
        dot.style.background = c;
        b.append(dot);
      }
      b.append(document.createTextNode(p.name));
      b.addEventListener('click', () => change({ preset: id }));
      presets.append(b);
    }

    const accents = $('lookAccents');
    accents.replaceChildren();
    const auto = el('button', 'pbtn' + (theme.accent === null ? ' on' : ''), 'Style default');
    auto.addEventListener('click', () => change({ accent: null }));
    accents.append(auto);
    for (const [id, hex] of Object.entries(ACCENTS)) {
      const s = el('button', 'swatch' + (theme.accent === id ? ' on' : ''));
      s.style.background = hex;
      s.setAttribute('aria-label', `Accent ${id}`);
      s.addEventListener('click', () => change({ accent: id }));
      accents.append(s);
    }

    const sizes = $('lookSizes');
    sizes.replaceChildren();
    for (const size of SIZES) {
      const b = el('button', 'pbtn' + (theme.size === size ? ' on' : ''), size === 'large' ? 'Large' : 'Normal');
      b.addEventListener('click', () => change({ size }));
      sizes.append(b);
    }
  }

  function apply() {
    onApply(applyTheme(theme));
    saveLocalTheme(theme);
    render();
  }

  function change(patch) {
    theme = normalizeTheme({ ...theme, ...patch });
    apply();
    socket.emit('setTheme', theme); // the server saves it to the account
  }

  // The account's saved theme arrives after login. A new account has none yet, so it adopts this device's look.
  socket.on('theme', (t) => {
    if (t) {
      theme = normalizeTheme(t);
      apply();
    } else {
      socket.emit('setTheme', theme);
    }
  });

  $('lookBtn').addEventListener('click', () => {
    const open = $('lookPanel').hidden;
    if (open) for (const id of ['sheet', 'journal', 'map', 'chatPanel']) $(id).hidden = true; // one panel at a time on small screens
    $('lookPanel').hidden = !open;
  });
  $('lookClose').addEventListener('click', () => ($('lookPanel').hidden = true));
  $('lookReset').addEventListener('click', () => change({ ...DEFAULT_THEME }));

  apply();
  return { current: () => theme, setPreset: (id) => change({ preset: id }) };
}