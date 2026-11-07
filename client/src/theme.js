// Look and feel: three style presets, a set of accent colors, and two text sizes.
// The page is built from CSS variables, so applying a theme just sets those variables.
export const PRESETS = {
  sunset: { name: 'Sunset', bg: '#2b1b3d', panel: 'rgba(43, 27, 61, 0.9)', bg2: '#3d2a55', track: '#4a3668', line: '#8a6fb0', text: '#fff4e0', muted: '#d9c9e8', dim: '#a995c4', accent: '#ff6b4a', hi: '#ffc857', on: '#2b1b3d' },
  fresh:  { name: 'Fresh', bg: '#0f3d2e', panel: 'rgba(15, 61, 46, 0.9)', bg2: '#1b5a44', track: '#2a6b52', line: '#4f9a7c', text: '#f6fff8', muted: '#bfe8d3', dim: '#acdcc6', accent: '#3ddc97', hi: '#ffe66d', on: '#0f3d2e' },
  night:  { name: 'Night city', bg: '#0b1b3b', panel: 'rgba(11, 27, 59, 0.9)', bg2: '#1a2f5e', track: '#243b6e', line: '#4a68b0', text: '#f4f7ff', muted: '#b9c8ee', dim: '#8ea2d1', accent: '#ffb703', hi: '#ff7eb6', on: '#0b1b3b' },
};

// Accent colors a player can pick. The server accepts only these names.
export const ACCENTS = {
  coral: '#ff7a5c', orange: '#ff9f43', gold: '#ffc857', mint: '#3ddc97',
  teal: '#2ec4b6', sky: '#6bb8ff', pink: '#ff7eb6', lavender: '#b69cff',
};
export const SIZES = ['normal', 'large'];
export const DEFAULT_THEME = { preset: 'sunset', accent: null, size: 'normal' };

const STORAGE_KEY = 'adulthood-theme';

// Brightness contrast between two colors (4.5 or more is easy to read).
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Turn anything (a saved value, something from the server, nothing) into a safe theme.
export function normalizeTheme(t) {
  const o = t && typeof t === 'object' ? t : {};
  return {
    preset: Object.hasOwn(PRESETS, o.preset) ? o.preset : DEFAULT_THEME.preset,
    accent: typeof o.accent === 'string' && Object.hasOwn(ACCENTS, o.accent) ? o.accent : null,
    size: SIZES.includes(o.size) ? o.size : 'normal',
  };
}

export function loadLocalTheme() {
  try {
    return normalizeTheme(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return { ...DEFAULT_THEME };
  }
}
export function saveLocalTheme(t) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeTheme(t)));
  } catch {
    /* private browsing: the theme just will not be remembered on this device */
  }
}

// Set the CSS variables. Returns the background color so the 3D scene can match.
export function applyTheme(t, root = document.documentElement) {
  const th = normalizeTheme(t);
  const p = PRESETS[th.preset];
  const set = (k, v) => root.style.setProperty(`--${k}`, v);
  for (const k of ['bg', 'panel', 'bg2', 'track', 'line', 'text', 'muted', 'dim']) set(k, p[k]);
  let accent = p.accent;
  let hi = p.hi;
  if (th.accent) {
    accent = ACCENTS[th.accent];
    // Use the accent for highlighted text too, but only where it stays easy to read.
    if (contrast(accent, p.bg) >= 4.5 && contrast(accent, p.bg2) >= 4.5) hi = accent;
  }
  // Text on a colored button: whichever of the dark or light text reads better.
  const best = (bg) => (contrast(p.on, bg) >= contrast(p.text, bg) ? p.on : p.text);
  set('accent', accent);
  set('hi', hi);
  set('on', best(accent));
  set('on-hi', best(hi));
  set('fs', th.size === 'large' ? '1.2' : '1');
  return { bg: p.bg };
}