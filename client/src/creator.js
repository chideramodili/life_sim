// The character editor: a big live 3D preview on top, category tabs at the bottom, a grid of choices, undo/redo and Save.
// It opens when you create an account and again from the Look panel. It only edits a look object; the caller saves it.
// Categories with `parts` need separate head and hair pieces from Blender; until those arrive they show a "coming" note.
import * as THREE from 'three';
import { STYLES } from './hair.js';
import { dressModel, loadModel, whenModelReady, attachModel, applyLook, animateModel, EYE_COLOURS, HAIR_COLOURS, SKIN_TONES, FACE_KEYS } from './model.js';

const BASE_SKIN = [224, 172, 142];   // roughly the model's own skin, for the colour dots
const dotSkin = (t) => `rgb(${BASE_SKIN.map((c, i) => Math.min(255, Math.round(c * t[i]))).join(',')})`;
const HAIR_DOT = { brown: '#4a2f1d', black: '#2a2523', chestnut: '#7a4a2a', auburn: '#8a3a22', ginger: '#c0592a', blonde: '#cfa75a', grey: '#8f8f93', white: '#d8d6d0' };
const EYE_DOT = { brown: '#5a3a22', hazel: '#9a7b2f', green: '#3f8f4f', blue: '#3a7bd5', grey: '#8d9aa6', amber: '#c9822b' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// The tabs. `view` is where the camera goes: 'face' for head choices, 'body' for the whole person.
export const CATEGORIES = [
  { id: 'body', label: 'Body', icon: '🧍', view: 'body' },
  { id: 'skin', label: 'Skin', icon: '🎨', view: 'face' },
  { id: 'hair', label: 'Hair colour', icon: '💇', view: 'face' },
  { id: 'eyes', label: 'Eyes', icon: '👁️', view: 'face' },
  { id: 'style', label: 'Hairstyle', icon: '✂️', view: 'face' },
  { id: 'brows', label: 'Brows', icon: '〰️', view: 'face', parts: 'Eyebrow shapes' },
  { id: 'nose', label: 'Nose', icon: '👃', view: 'face', sliders: [['noseW', 'Nose width'], ['noseL', 'Nose length']] },
  { id: 'lips', label: 'Lips', icon: '👄', view: 'face', sliders: [['lipFull', 'Lip fullness'], ['mouthW', 'Mouth width']] },
  { id: 'face', label: 'Face', icon: '🙂', view: 'face', sliders: [['jawW', 'Jaw width'], ['chinL', 'Chin length'], ['faceW', 'Face width']] },
  { id: 'beard', label: 'Facial hair', icon: '🧔', view: 'face', parts: 'Beards and moustaches' },
];

function optionsFor(cat) {
  if (cat === 'body') return [{ v: 'man', text: 'Man', icon: '🧍‍♂️' }, { v: 'woman', text: 'Woman', icon: '🧍‍♀️' }];
  if (cat === 'skin') return SKIN_TONES.map((t, i) => ({ v: i, text: `Skin tone ${i + 1}`, dot: dotSkin(t) }));
  if (cat === 'hair') return Object.keys(HAIR_COLOURS).map((id) => ({ v: id, text: cap(id), dot: HAIR_DOT[id] }));
  if (cat === 'style') return Object.entries(STYLES).map(([id, text]) => ({ v: id, text, icon: { original: '💇', bald: '🥚', buzz: '🪒', low: '💈', curls: '➰', afro: '🌀', cornrows: '〰️', braids: '🪢', locs: '🧶', knots: '🍥', bun: '🍙', ponytail: '🎀', puffs: '☁️' }[id] }));
  if (cat === 'eyes') return Object.keys(EYE_COLOURS).map((id) => ({ v: id, text: cap(id), dot: EYE_DOT[id] }));
  return [];
}
const KEY = { body: 'body', skin: 'skin', hair: 'hair', eyes: 'eyes', style: 'style' };

// Open the editor. opts: { initial: {body, eyes, skin, hair}, onSave(look), title }. Returns { close }.
export function openCreator(opts) {
  const start = { body: 'man', eyes: 'brown', skin: 0, hair: 'brown', face: null, ...(opts.initial || {}) };
  start.style = start.style || 'original';
  let look = { ...start };
  const undo = [], redo = [];
  const cats = CATEGORIES.filter((c) => !(opts.lockBody && c.id === 'body'));
  let cat = cats[0].id, view = cats[0].view;

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
      attachModel(group, look.body);
      applyLook(group, look);
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
  for (const c of cats) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.cat = c.id; b.className = 'crTab';
    b.innerHTML = `<span class="crIc">${c.icon}</span><span>${c.label}</span>`;
    b.addEventListener('click', () => select(c.id));
    tabs.append(b);
  }
  function select(id) {
    cat = id;
    const c = CATEGORIES.find((x) => x.id === id);
    view = c.view;
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.cat === id);
    renderGrid();
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
      const cur = () => (Array.isArray(look.face) ? look.face.slice() : new Array(FACE_KEYS.length).fill(0));
      for (const [key, label] of c.sliders) {
        const idx = FACE_KEYS.indexOf(key), row = document.createElement('label'); row.className = 'crSlide';
        row.innerHTML = `<span>${label}</span><input type="range" min="-3" max="3" step="1" value="${cur()[idx] || 0}"><em>${cur()[idx] || 0}</em>`;
        const inp = row.querySelector('input'), val = row.querySelector('em');
        let before = null;
        inp.addEventListener('input', () => {   // live preview while dragging; one undo step per drag
          if (!before) before = look;
          const f = cur(); f[idx] = Number(inp.value); val.textContent = String(f[idx]);
          look = { ...look, face: f }; applyLook(group, look);
        });
        inp.addEventListener('change', () => { if (before) { undo.push(before); redo.length = 0; before = null; $('.crUndo').disabled = false; $('.crRedo').disabled = true; } });
        grid.append(row);
      }
      const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'crReset'; reset.textContent = 'Reset these';
      reset.addEventListener('click', () => { const f = cur(); for (const [k] of c.sliders) f[FACE_KEYS.indexOf(k)] = 0; change({ face: f }); });
      grid.append(reset);
      return;
    }
    for (const o of optionsFor(cat)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'crOpt' + (look[KEY[cat]] === o.v ? ' on' : ''); b.dataset.v = String(o.v); b.title = o.text;
      if (o.dot) { b.classList.add('dotOpt'); const d = document.createElement('span'); d.style.background = o.dot; b.append(d); }
      else b.innerHTML = `<span class="crBig">${o.icon}</span><em>${o.text}</em>`;
      b.setAttribute('aria-label', o.text);
      b.addEventListener('click', () => change({ [KEY[cat]]: o.v }));
      grid.append(b);
    }
  }
  function refresh() {
    renderGrid();
    $('.crUndo').disabled = !undo.length; $('.crRedo').disabled = !redo.length;
    attachModel(group, look.body);   // does nothing when the body is unchanged
    applyLook(group, look);
  }
  function change(patch) {
    const next = { ...look, ...patch };
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
  select(cat); refresh();
  requestAnimationFrame(() => { resize(); raf = requestAnimationFrame(frame); });
  return { close, current: () => ({ ...look }) };
}
