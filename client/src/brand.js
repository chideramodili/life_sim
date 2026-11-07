// The game's name and logo, in one place. To rename the game, change NAME here (and in index.html's <title>).
export const BRAND = {
  name: 'Adulthood',
  tagline: 'Build your life. Meet real people.',
};

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// The icon: a house with the sun behind it. It uses the theme colors, so it changes with the player's style.
export function logoIcon(size = 56) {
  const root = svg('svg', { viewBox: '0 0 64 64', width: size, height: size, role: 'img', 'aria-label': `${BRAND.name} logo` });
  root.append(
    svg('rect', { width: 64, height: 64, rx: 14, fill: 'var(--bg2)' }),
    svg('circle', { cx: 32, cy: 25, r: 14, fill: 'var(--hi)' }),
    svg('path', { d: 'M10 54 V35 L32 17 L54 35 V54 Z', fill: 'var(--accent)' }),
    svg('rect', { x: 27, y: 38, width: 10, height: 16, rx: 2, fill: 'var(--bg)' })
  );
  return root;
}

// Fill a container with the icon, the name, and the tagline.
export function renderLogo(container) {
  const name = document.createElement('div');
  name.className = 'brandName';
  name.textContent = BRAND.name;
  const tag = document.createElement('div');
  tag.className = 'brandTag';
  tag.textContent = BRAND.tagline;
  container.replaceChildren(logoIcon(56), name, tag);
}