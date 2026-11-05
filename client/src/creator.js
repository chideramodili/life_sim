// The character editor: a big live 3D preview on top, category tabs at the bottom, a grid of choices, undo/redo and Save.
// It opens when you create an account and again from the Look panel. It only edits a look object; the caller saves it.
// Categories with `parts` need separate head and hair pieces from Blender; until those arrive they show a "coming" note.
import * as THREE from 'three';
import { dressModel, loadModel, whenModelReady, attachModel, applyLook, animateModel } from './model.js';
import { SKIN2, EYES2, HAIRCOL2, HAIRSTYLES2, BEARDS2, DEFAULT_LOOK2, cleanLook2 } from './person2.js';

const EYE_DOT = { brown: '#5a3a22', hazel: '#9a7b2f', green: '#3f8f4f', blue: '#3a7bd5', grey: '#8d9aa6', amber: '#c9822b' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const STYLE_ICON = { none: '🥚', buzzed: '🪒', buzzedf: '🪒', parted: '💈', buns: '🍙', long: '💁‍♀️' };

// The tabs. `view` is where the camera goes: 'face' for head choices, 'body' for the whole person. `only` limits a tab to one body.
export const CATEGORIES = [
  { id: 'g', label: 'Body', icon: '🧍', view: 'body' },
  { id: 'skin', label: 'Skin', icon: '🎨', view: 'face' },
  { id: 'hs', label: 'Hairstyle', icon: '✂️', view: 'face' },
  { id: 'hc', label: 'Hair colour', icon: '💇', view: 'face' },
  { id: 'eyes', label: 'Eyes', icon: '👁️', view: 'face' },
  { id: 'bd', label: 'Beard', icon: '🧔', view: 'face', only: 'm' },
  { id: 'size', label: 'Size', icon: '📏', view: 'body', sliders: [['ht', 'Height'], ['bl', 'Build']] },
  { id: 'brows', label: 'Brows', icon: '〰️', view: 'face', parts: 'Eyebrow shapes' },
];

function optionsFor(cat, look) {
  if (cat === 'g') return [{ v: 'm', text: 'Man', icon: '🧍‍♂️' }, { v: 'f', text: 'Woman', icon: '🧍‍♀️' }];
  if (cat === 'skin') return SKIN2.map((c, i) => ({ v: i, text: `Skin tone ${i + 1}`, dot: c }));
  if (cat === 'hc') return Object.keys(HAIRCOL2).map((id) => ({ v: id, text: cap(id), dot: HAIRCOL2[id] }));
  if (cat === 'hs') return HAIRSTYLES2[look.g].map((h) => ({ v: h.id, text: h.name, icon: STYLE_ICON[h.id] || '💇' }));
  if (cat === 'bd') return BEARDS2.map((b) => ({ v: b.id, text: b.name, icon: b.id === 'none' ? '🙂' : '🧔' }));
  if (cat === 'eyes') return Object.keys(EYES2).map((id) => ({ v: id, text: cap(id), dot: EYE_DOT[id] }));
  return [];
}

// Open the editor. opts: { initial: look2 or null, onSave(look2), title, lockBody, required }. Returns { close }.
export function openCreator(opts) {
  let look = cleanLook2({ ...DEFAULT_LOOK2, ...(opts.initial || {}) });
  const undo = [], redo = [];
  const shown = () => CATEGORIES.filter((c) => !(opts.lockBody && c.id === 'g') && (!c.only || c.only === look.g));
  let cat = shown()[0].id, view = shown()[0].view;

  const root = document.createElement('div');
  root.id = 'creator';
  root.innerHTML = `
    <div class="crTop"><button class="crX" aria-label="Close" type="button">×</button><div class="crTitle"></div><button class="crSave" type="button">Save</button></div>
    <div class="crStage"><canvas></canvas><div class="crHint">Drag to turn</div>
      <div class="crHist"><button class="crUndo" aria-label="Undo" type="button">↶</button><button class="crRedo" aria-label="Redo" type="button">↷</button></div></div>
    <div class="crSheet"><div class="crTabs"></div><div class="crGrid"></div></div>`;
  document.body.append(root);
  root.querySelector('.crTitle').textContent = opts.title || 'Your character';
  const $ = (s) => root.querySelector(s);

  // --- the 3D preview ---
  const canvas = $('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a2630');
  scene.add(new THREE.HemisphereLight('#ffffff', '#554c5c', 1.15));
  const key = new THREE.DirectionalLight('#fff3e6', 1.6); key.position.set(1.5, 2.5, 2.5); scene.add(key);
  const rim = new THREE.DirectionalLight('#9bb8ff', 0.7); rim.position.set(-2, 1.8, -2); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshStandardMaterial({ color: '#3a3542', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
  const group = new THREE.Group(); scene.add(group);
  if (location.search.includes('debug')) window.__cr = { scene, camera, group, dress: (look, cat) => dressModel(group, look, cat) };
  const VIEWS = { body: { y: 0.98, z: 5.2, ly: 0.92 }, face: { y: 1.6, z: 1.15, ly: 1.57 } };
  const cur = { y: VIEWS.body.y, z: VIEWS.body.z, ly: VIEWS.body.ly };
  let spin = 0.35, dragging = false, lastX = 0, alive = true, raf = 0, last = performance.now(), t = 0;

  function resize() {
    const r = $('.crStage').getBoundingClientRect();
    const w = Math.max(10, Math.floor(r.width)), h = Math.max(10, Math.floor(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  const down = (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!dragging) return; spin += (e.clientX - lastX) * 0.012; lastX = e.clientX; };
  const up = () => { dragging = false; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  function build() {
    whenModelReady(() => {
      if (!alive) return;
      attachModel(group, null, look);
      applyLook(group, { v2: look });
    });
  }
  loadModel().then(build);
  if (!group.userData.model) build();

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const v = VIEWS[view], k = Math.min(1, dt * 5);
    cur.y += (v.y - cur.y) * k; cur.z += (v.z - cur.z) * k; cur.ly += (v.ly - cur.ly) * k;
    camera.position.set(0, cur.y, cur.z); camera.lookAt(0, cur.ly, 0);
    if (!dragging) spin += (0 - spin) * Math.min(1, dt * 0.8);   // settle back to facing you
    if (window.__cr && window.__cr.hold != null) spin = window.__cr.hold;
    group.rotation.y = spin;
    if (group.userData.model) animateModel(group, dt, 0, 0, false, t);
    renderer.render(scene, camera);
  }

  // --- the editor UI ---
  const tabs = $('.crTabs'), grid = $('.crGrid');
  function renderTabs() {
    tabs.replaceChildren();
    for (const c of shown()) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.cat = c.id; b.className = 'crTab' + (c.id === cat ? ' on' : '');
      b.innerHTML = `<span class="crIc">${c.icon}</span><span>${c.label}</span>`;
      b.addEventListener('click', () => select(c.id));
      tabs.append(b);
    }
  }
  function select(id) {
    cat = id;
    view = CATEGORIES.find((x) => x.id === id).view;
    renderTabs(); renderGrid();
  }
  function renderGrid() {
    grid.replaceChildren();
    const c = CATEGORIES.find((x) => x.id === cat);
    if (c.parts) {
      const n = document.createElement('div'); n.className = 'crSoon';
      n.textContent = `${c.parts} are coming. They will appear here as soon as the character parts are added.`;
      grid.append(n); return;
    }
    if (c.sliders) {
      for (const [key, label] of c.sliders) {
        const row = document.createElement('label'); row.className = 'crSlide';
        row.innerHTML = `<span>${label}</span><input type="range" min="-2" max="2" step="1" value="${look[key] || 0}"><em>${look[key] || 0}</em>`;
        const inp = row.querySelector('input'), val = row.querySelector('em');
        let before = null;
        inp.addEventListener('input', () => {   // live preview while dragging; one undo step per drag
          if (!before) before = look;
          look = cleanLook2({ ...look, [key]: Number(inp.value) }); val.textContent = String(look[key]); applyLook(group, { v2: look });
        });
        inp.addEventListener('change', () => { if (before) { undo.push(before); redo.length = 0; before = null; $('.crUndo').disabled = false; $('.crRedo').disabled = true; } });
        grid.append(row);
      }
      const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'crReset'; reset.textContent = 'Reset size';
      reset.addEventListener('click', () => change({ ht: 0, bl: 0 }));
      grid.append(reset);
      return;
    }
    for (const o of optionsFor(cat, look)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'crOpt' + (look[cat] === o.v ? ' on' : ''); b.dataset.v = String(o.v); b.title = o.text;
      if (o.dot) { b.classList.add('dotOpt'); const d = document.createElement('span'); d.style.background = o.dot; b.append(d); }
      else b.innerHTML = `<span class="crBig">${o.icon}</span><em>${o.text}</em>`;
      b.setAttribute('aria-label', o.text);
      b.addEventListener('click', () => change({ [cat]: o.v }));
      grid.append(b);
    }
  }
  function refresh() {
    if (!shown().some((c) => c.id === cat)) { cat = shown()[0].id; view = shown()[0].view; }
    renderTabs(); renderGrid();
    $('.crUndo').disabled = !undo.length; $('.crRedo').disabled = !redo.length;
    attachModel(group, null, look);   // swaps the body only when man / woman changed
    applyLook(group, { v2: look });
  }
  function change(patch) {
    const next = cleanLook2({ ...look, ...patch });
    if (JSON.stringify(next) === JSON.stringify(look)) return;
    undo.push(look); redo.length = 0; look = next; refresh();
  }
  $('.crUndo').addEventListener('click', () => { if (!undo.length) return; redo.push(look); look = undo.pop(); refresh(); });
  $('.crRedo').addEventListener('click', () => { if (!redo.length) return; undo.push(look); look = redo.pop(); refresh(); });

  function close() {
    if (!alive) return;
    alive = false; cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    renderer.dispose(); root.remove();
  }
  $('.crX').addEventListener('click', close);
  $('.crSave').addEventListener('click', () => { const l = { ...look }; close(); if (opts.onSave) opts.onSave(l); });

  if (opts.required) $('.crX').hidden = true;
  refresh();
  requestAnimationFrame(() => { resize(); raf = requestAnimationFrame(frame); });
  return { close, current: () => ({ ...look }) };
}
