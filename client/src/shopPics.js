// Little pictures for the shops: a mannequin of the player's own body type wears the item and we photograph the right part of it.
// One hidden renderer, one item at a time, remembered after the first time. Until a picture is ready the card keeps its emoji.
import * as THREE from 'three';
import { loadModel, whenModelReady, attachModel, applyLook, dressModel, animateModel, modelBusy } from './model.js';
import { DEFAULT_LOOK2, cleanLook2 } from './person2.js';

const SIZE = 168;
const SLOT_AT = { top: 0, bottom: 1, shoes: 2, acc: 3, dress: 4 };
// Where the camera looks for each kind of thing: height of the camera, distance, height it looks at, sideways shift.
const FRAMES = {
  top: { y: 1.28, z: 1.6, ly: 1.25 }, bottom: { y: 0.66, z: 1.9, ly: 0.64 }, shoes: { y: 0.18, z: 1.4, ly: 0.1 },
  dress: { y: 0.93, z: 3.1, ly: 0.9 }, hat: { y: 1.66, z: 1.1, ly: 1.62 }, cap: { y: 1.66, z: 1.1, ly: 1.62 }, shades: { y: 1.6, z: 0.8, ly: 1.58 },
  chain: { y: 1.38, z: 1.3, ly: 1.34 }, watch: { y: 0.85, z: 0.9, ly: 0.83, x: 0.2 }, bag: { y: 0.9, z: 1.8, ly: 0.88 }, hair: { y: 1.64, z: 1.05, ly: 1.6 },
};
const cache = new Map();
const queue = [];
let busy = false, gl = null, scene = null, camera = null, group = null, gender = 'm';

export function setPicGender(g) { if (g === 'm' || g === 'f') { if (g !== gender) { gender = g; } } }

function boot() {
  if (gl) return;
  gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  gl.setPixelRatio(1); gl.setSize(SIZE, SIZE, false); gl.outputColorSpace = THREE.SRGBColorSpace; gl.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#6d6474', 1.25));
  const key = new THREE.DirectionalLight('#fff3e6', 1.7); key.position.set(1.5, 2.5, 2.5); scene.add(key);
  const rim = new THREE.DirectionalLight('#9bb8ff', 0.6); rim.position.set(-2, 1.8, -2); scene.add(rim);
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
  group = new THREE.Group(); scene.add(group);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle() {
  for (let i = 0; i < 40; i++) { await wait(100); if (!modelBusy()) { await wait(150); if (!modelBusy()) return; } }
}

async function shoot(job) {
  boot();
  await loadModel();
  const g = job.g || gender;
  const look = cleanLook2({ ...DEFAULT_LOOK2, g, skin: 4, hs: job.hs || (g === 'f' ? 'long' : 'none'), hc: job.hc || 'black', bd: 'none' });
  await new Promise((r) => whenModelReady(r));
  attachModel(group, null, look);
  applyLook(group, { v2: look });
  const arr = [null, null, null, null, null];
  let catalog = null;
  if (job.item) { arr[SLOT_AT[job.item.slot]] = job.item.id; catalog = { byId: { [job.item.id]: job.item } }; }
  dressModel(group, arr, catalog);
  group.rotation.y = job.item && job.item.slot === 'shoes' ? 0.5 : 0.35;
  await settle();
  animateModel(group, 0.016, 0, 0, false, 0);
  const f = FRAMES[job.frame] || FRAMES.top;
  camera.position.set(f.x || 0, f.y, f.z); camera.lookAt(f.x || 0, f.ly, 0);
  gl.render(scene, camera);
  await wait(30);
  gl.render(scene, camera);
  return gl.domElement.toDataURL('image/png');
}

async function pump() {
  if (busy) return; busy = true;
  while (queue.length) {
    const job = queue.shift();
    let url = cache.get(job.key);
    if (!url) { try { url = await shoot(job); cache.set(job.key, url); } catch { url = null; } }
    for (const cb of job.cbs) { try { cb(url); } catch { /* the card may be gone */ } }
  }
  busy = false;
}

function ask(key, make, cb) {
  if (cache.has(key)) { cb(cache.get(key)); return; }
  const hit = queue.find((j) => j.key === key);
  if (hit) { hit.cbs.push(cb); return; }
  queue.push({ key, ...make, cbs: [cb] });
  pump();
}

// A Boutique item (from the server's catalogue): item has id, slot, kind, color.
export function itemPic(item, cb) {
  if (item.slot === 'dress') return ask('dress:f:' + item.id, { item, frame: 'dress', g: 'f' }, cb);
  const frame = item.slot === 'acc' ? (FRAMES[item.kind] ? item.kind : 'hat') : item.slot;
  ask(`${item.id}:${gender}:${item.color}`, { item, frame, g: gender }, cb);
}
// A hairstyle in the character editor.
export function hairPic(hs, hc, g, cb) { ask(`hair:${g}:${hs}:${hc}`, { hs, hc, g, frame: 'hair' }, cb); }

// Put the picture on a card's picture box once it exists.
export function paintPic(box, url) {
  if (!url || !box.isConnected) return;
  box.style.backgroundImage = `url(${url})`;
  box.style.backgroundSize = 'cover'; box.style.backgroundPosition = 'center';
  const fb = box.querySelector('.catFallback'); if (fb) fb.style.display = 'none';
}
if (typeof location !== 'undefined' && location.search.includes('debug')) window.__pics = { itemPic, hairPic, setPicGender };
