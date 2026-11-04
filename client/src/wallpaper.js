// Adulthood: phone wallpapers. A gallery of built-in wallpapers plus one photo from the player's own device.
// The choice is remembered on this device. A photo you pick is shrunk first and never leaves the device.
const KEY = 'adulthood.wall';
const KEY_CUSTOM = 'adulthood.wall.custom';

export const WALLS = [
  { id: 'liquid', name: 'Liquid glass' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'dusk', name: 'Dusk' },
  { id: 'lagoon', name: 'Lagoon' },
  { id: 'rose', name: 'Rose' },
  { id: 'obsidian', name: 'Obsidian' },
  { id: 'gold', name: 'Gold hour' },
];

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

export function currentWall() {
  const id = read(KEY) || 'liquid';
  if (id === 'custom' && read(KEY_CUSTOM)) return { id, url: read(KEY_CUSTOM) };
  const w = WALLS.find((x) => x.id === id) || WALLS[0];
  return { id: w.id, url: `/wallpapers/${w.id}.webp` };
}

export function applyWall(node) {
  node.style.setProperty('--wall', `url("${currentWall().url}")`);
}

// Shrink a picked photo to phone size so it fits in browser storage.
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const W = 720, H = 1280;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const k = Math.max(W / img.width, H / img.height);   // cover the whole screen
      g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
      URL.revokeObjectURL(src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('That file is not a picture.')); };
    img.src = src;
  });
}

// The gallery sheet that slides over the phone screen.
export function createWallPicker(host, { onChange, toast }) {
  const panel = document.createElement('div');
  panel.id = 'wallPanel';
  panel.hidden = true;
  const head = document.createElement('div');
  head.className = 'wallHead';
  const title = document.createElement('span');
  title.textContent = 'Wallpaper';
  const done = document.createElement('button');
  done.id = 'wallDone';
  done.textContent = 'Done';
  head.append(title, done);
  const grid = document.createElement('div');
  grid.id = 'wallGrid';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.hidden = true;
  file.id = 'wallFile';
  panel.append(head, grid, file);
  host.append(panel);

  function paint() {
    const cur = currentWall().id;
    grid.replaceChildren();
    for (const w of WALLS) {
      const b = document.createElement('button');
      b.className = 'wallTile' + (cur === w.id ? ' on' : '');
      b.dataset.wall = w.id;
      b.style.backgroundImage = `url("/wallpapers/${w.id}-thumb.webp")`;
      b.setAttribute('aria-label', w.name);
      const lab = document.createElement('span');
      lab.textContent = w.name;
      b.append(lab);
      b.addEventListener('click', () => { write(KEY, w.id); onChange(); paint(); });
      grid.append(b);
    }
    const mine = document.createElement('button');
    mine.className = 'wallTile mine' + (cur === 'custom' ? ' on' : '');
    mine.dataset.wall = 'custom';
    if (read(KEY_CUSTOM)) mine.style.backgroundImage = `url("${read(KEY_CUSTOM)}")`;
    const lab = document.createElement('span');
    lab.textContent = read(KEY_CUSTOM) ? 'My photo (tap to change)' : '＋ From my photos';
    mine.append(lab);
    mine.addEventListener('click', () => {
      if (cur === 'custom' || !read(KEY_CUSTOM)) file.click();
      else { write(KEY, 'custom'); onChange(); paint(); }
    });
    grid.append(mine);
  }
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    try {
      const url = await shrink(f);
      if (!write(KEY_CUSTOM, url)) return toast('Your browser has no room to keep that photo.');
      write(KEY, 'custom');
      onChange();
      paint();
    } catch (e) { toast(e.message || 'Could not use that photo.'); }
  });
  done.addEventListener('click', () => { panel.hidden = true; });
  return { open() { paint(); panel.hidden = false; }, close() { panel.hidden = true; }, panel };
}
