// Adulthood: avatar creator TEST page (isolated from the game). Builds a character with the Ara 3D Gen library in the browser,
// lets you change body, face, hair, clothes and extras, play animations, save the settings and load them again.
// Nothing here touches the game, the server or the existing characters.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createCharacter, DEFAULT_ASSETS_URL } from 'ara3d';
import { CAT, ANIMS, COLOURS, START, premiumUsed } from './avatarCatalog.js';

const q = new URLSearchParams(location.search);
const ASSETS = q.get('local') || DEFAULT_ASSETS_URL;      // ?local=/ara-data/ for self-hosted character data
const $ = (id) => document.getElementById(id);
const KEY = 'adulthood-avatar-test';

// ----- scene
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2b1b3d');
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false; controls.minDistance = 1.2; controls.maxDistance = 6; controls.maxPolarAngle = Math.PI * 0.55;
scene.add(new THREE.HemisphereLight('#ffffff', '#6a5a7a', 1.1));
const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(2, 4, 3); scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4a3a5e', roughness: 1 })); scene.add(floor);
function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize);
function frame(h = 1.75) { controls.target.set(0, h * 0.52, 0); camera.position.set(0, h * 0.62, h * 2.1); controls.update(); }

// ----- state
let params = { ...START, modifiers: {}, accessories: [], tattoos: [] };
try { const s = localStorage.getItem(KEY); if (s) params = { ...params, ...JSON.parse(s) }; } catch { /* no storage */ }
let ch = null, mixer = null, curAction = null, curAnim = 'idle', building = false, again = false, tBuild = 0, sliderGroups = [];
let owned = false;      // "pretend I bought the premium items" (test only)

function setStatus(t) { $('status').textContent = t; }

// ----- build the character (the old one stays on screen until the new one is ready)
async function build() {
  if (building) { again = true; return; }
  building = true; setStatus('Building…');
  const t0 = performance.now();
  try {
    const next = await createCharacter({ preset: 'The Adventurer', params: { ...params } }, { animations: ANIMS.map((a) => a[0]), detail: params.detail || 'low', assetsUrl: ASSETS });
    if (ch) { scene.remove(ch.scene); ch.dispose(); }
    ch = next; scene.add(ch.scene); mixer = new THREE.AnimationMixer(ch.scene); curAction = null;
    play(curAnim); frame(ch.height);
    tBuild = Math.round(performance.now() - t0);
    let tri = 0; ch.scene.traverse((o) => { if (o.isMesh && o.geometry) tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    setStatus(`Built in ${(tBuild / 1000).toFixed(1)} s · ${Math.round(tri / 1000)}k triangles · ${Math.round(ch.height * 100)} cm`);
    window.__avatar = { ms: tBuild, tri: Math.round(tri), clips: ch.animations.length, height: ch.height };
  } catch (e) { setStatus('Could not build: ' + (e && e.message ? e.message : e)); window.__avatarError = String(e && e.message || e); }
  building = false; premiumNote();
  if (again) { again = false; build(); }
}
let tmr = 0; function rebuildSoon() { clearTimeout(tmr); tmr = setTimeout(build, 280); }

function play(id) {
  curAnim = id; if (!ch || !mixer) return;
  const clip = ch.clip(id); if (!clip) return;
  const a = mixer.clipAction(clip); a.reset().play();
  if (curAction && curAction !== a) curAction.crossFadeTo(a, 0.25, false);
  curAction = a;
  document.querySelectorAll('.anim').forEach((b) => b.classList.toggle('on', b.dataset.a === id));
}

function premiumNote() {
  const list = premiumUsed(params), el = $('prem');
  if (!list.length) { el.hidden = true; $('save').disabled = false; return; }
  el.hidden = false; el.textContent = `💎 Premium in use: ${list.join(', ')}` + (owned ? ' (test: marked as owned)' : ' — needs purchase to save');
  $('save').disabled = !owned;
}

// ----- panel
const TABS = ['Body', 'Face', 'Hair', 'Clothes', 'Extras', 'Move'];
let tab = 'Body';
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
function slider(label, get, set, min = 0, max = 1, step = 0.01) {
  const row = el('label', 'row'); const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
  const fmt = (x) => (step >= 1 ? String(Math.round(x)) : Number(x).toFixed(2)); const v = el('span', 'val', fmt(i.value));
  i.addEventListener('input', () => { set(Number(i.value)); v.textContent = fmt(i.value); rebuildSoon(); });
  row.append(el('span', 'lbl', label), i, v); return row;
}
function chips(title, key, multi = false) {
  const box = el('div', 'grp'); box.append(el('div', 'ttl', title)); const wrap = el('div', 'chips');
  for (const it of CAT[key]) {
    const b = el('button', 'chip', (it.prem ? '💎 ' : '') + it.label);
    const isOn = () => (multi ? (params[key] || []).includes(it.id) : params[key] === it.id);
    const paint = () => b.classList.toggle('on', isOn());
    b.addEventListener('click', () => {
      if (multi) { const a = new Set(params[key] || []); a.has(it.id) ? a.delete(it.id) : a.add(it.id); params[key] = [...a]; }
      else params[key] = it.id;
      if (key === 'outfit' && it.id !== 'none') { params.top = 'none'; params.bottom = 'none'; params.jacket = 'none'; }
      if ((key === 'top' || key === 'bottom' || key === 'jacket') && it.id !== 'none') params.outfit = 'none';
      paint(); wrap.querySelectorAll('.chip').forEach((c) => c.dispatchEvent(new Event('repaint'))); rebuildSoon(); premiumNote();
    });
    b.addEventListener('repaint', paint); paint(); wrap.append(b);
  }
  box.append(wrap); return box;
}
function colours(title, key) {
  const box = el('div', 'grp'); box.append(el('div', 'ttl', title)); const wrap = el('div', 'chips');
  for (const c of COLOURS) { const b = el('button', 'sw'); b.style.background = c; b.addEventListener('click', () => { params[key] = c; rebuildSoon(); }); wrap.append(b); }
  box.append(wrap); return box;
}
async function loadSliders() {
  try { const r = await fetch(ASSETS + 'catalog.json'); const c = await r.json(); sliderGroups = c.sliders.filter((g) => g.category === 'Face' && !/^left /.test(g.group)); window.__sliderGroups = sliderGroups.length; } catch { sliderGroups = []; }
}
function paintTab() {
  const p = $('panel'); p.textContent = '';
  if (tab === 'Body') {
    p.append(slider('Age', () => params.ageYears, (v) => (params.ageYears = Math.round(v)), 18, 90, 1));
    p.append(slider('Male ↔ Female', () => params.gender, (v) => (params.gender = v)));
    p.append(slider('Height', () => params.height, (v) => (params.height = v)));
    p.append(slider('Weight', () => params.weight, (v) => (params.weight = v)));
    p.append(slider('Muscle', () => params.muscle, (v) => (params.muscle = v)));
    p.append(slider('Proportions', () => params.proportions, (v) => (params.proportions = v)));
    const g = el('div', 'grp'); g.append(el('div', 'ttl', 'Skin tone (heritage mix)'));
    p.append(g);
    p.append(slider('African', () => params.african, (v) => (params.african = v)));
    p.append(slider('Asian', () => params.asian, (v) => (params.asian = v)));
    p.append(slider('Caucasian', () => params.caucasian, (v) => (params.caucasian = v)));
    p.append(chips('Eyes', 'eyes'));
  } else if (tab === 'Face') {
    const sel = el('select'); for (const g of sliderGroups) { const o = el('option', '', g.group.replace(/^right /, '')); o.value = g.group; sel.append(o); }
    const saved = paintTab.group || (sliderGroups[0] && sliderGroups[0].group); sel.value = saved; paintTab.group = sel.value;
    sel.addEventListener('change', () => { paintTab.group = sel.value; paintTab(); }); p.append(sel);
    const g = sliderGroups.find((x) => x.group === sel.value), left = sliderGroups.length ? null : null;
    if (g) for (const s of g.sliders) {
      const id = s.id; const get = () => (params.modifiers && params.modifiers[id]) || 0;
      p.append(slider(s.label, get, (v) => { params.modifiers = { ...(params.modifiers || {}), [id]: v }; }, s.bipolar ? -1 : 0, 1, 0.02));
    }
    if (!g) p.append(el('div', 'note', 'Face sliders did not load.'));
    p.append(chips('Eyebrows', 'eyebrows'));
  } else if (tab === 'Hair') {
    p.append(chips('Hairstyle', 'hair')); p.append(colours('Hair colour', 'hairColor')); p.append(chips('Beard & moustache', 'facialHair')); p.append(colours('Beard colour', 'beardColor'));
  } else if (tab === 'Clothes') {
    p.append(chips('Full outfits', 'outfit')); p.append(chips('Tops', 'top')); p.append(chips('Jackets', 'jacket')); p.append(chips('Bottoms', 'bottom')); p.append(chips('Shoes', 'shoes')); p.append(colours('Outfit colour', 'outfitTint'));
  } else if (tab === 'Extras') {
    p.append(chips('Hats', 'hat')); p.append(chips('Earrings', 'earrings')); p.append(chips('Accessories', 'accessories', true)); p.append(chips('Tattoos (18+)', 'tattoos', true));
  } else if (tab === 'Move') {
    const g = el('div', 'grp'); g.append(el('div', 'ttl', 'Animations (these come with the character)')); const w = el('div', 'chips');
    for (const [id, lb] of ANIMS) { const b = el('button', 'chip anim', lb); b.dataset.a = id; b.addEventListener('click', () => play(id)); w.append(b); }
    g.append(w); p.append(g); play(curAnim);
  }
}
function paintTabs() {
  const t = $('tabs'); t.textContent = '';
  for (const n of TABS) { const b = el('button', 'tab' + (n === tab ? ' on' : ''), n); b.addEventListener('click', () => { tab = n; paintTabs(); paintTab(); }); t.append(b); }
}

// ----- buttons
$('rand').addEventListener('click', () => {
  const pick = (k, free = true) => { const l = CAT[k].filter((x) => !free || !x.prem); return l[Math.floor(Math.random() * l.length)].id; };
  params = { ...params, gender: Math.random() < 0.5 ? 0.1 : 0.9, height: Math.random(), weight: Math.random() * 0.8, muscle: Math.random() * 0.8, hair: pick('hair'), outfit: pick('outfit'), shoes: pick('shoes'), eyes: pick('eyes'), top: 'none', bottom: 'none', jacket: 'none', modifiers: {}, accessories: [], tattoos: [] };
  paintTab(); rebuildSoon();
});
$('reset').addEventListener('click', () => { params = { ...START, modifiers: {}, accessories: [], tattoos: [] }; paintTab(); rebuildSoon(); });
$('save').addEventListener('click', () => {
  const p = ch ? ch.params : params;
  try { localStorage.setItem(KEY, JSON.stringify(p)); setStatus('Saved on this device (test).'); } catch { setStatus('Could not save here.'); }
  $('json').value = JSON.stringify(p);
});
$('owned').addEventListener('change', (e) => { owned = e.target.checked; premiumNote(); });
$('load').addEventListener('click', () => { try { params = { ...params, ...JSON.parse($('json').value) }; paintTab(); rebuildSoon(); } catch { setStatus('That is not valid settings text.'); } });

// ----- run
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => { const d = Math.min(clock.getDelta(), 0.1); if (mixer) mixer.update(d); if (ch) ch.update(d); controls.update(); renderer.render(scene, camera); });
resize(); frame(); paintTabs();
loadSliders().then(() => { paintTab(); });
paintTab(); build();
window.__avatarTest = { set: (o) => { params = { ...params, ...o }; rebuildSoon(); }, play, get params() { return params; }, get ch() { return ch; } };
