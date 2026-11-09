// Simple code-made vehicles for rides. They face +Z, so a heading of atan2(dx, dz) points them along the road.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const box = (w, h, d, m, x, y, z) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  return b;
};
const glass = mat(0x1d2b36);
const tyre = mat(0x151515);
function wheels(g, w, z0, z1, r = 0.45) {
  for (const z of [z0, z1]) for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 12), tyre);
    c.rotation.z = Math.PI / 2;
    c.position.set(s * w, r, z);
    g.add(c);
  }
}
function lights(g, w, front, back, y) {
  const head = mat(0xfff2b0, { emissive: 0xfff2b0 });
  const tail = mat(0xff2b2b, { emissive: 0xff2b2b });
  for (const s of [-1, 1]) {
    g.add(box(0.28, 0.2, 0.08, head, s * w, y, front));
    g.add(box(0.28, 0.2, 0.08, tail, s * w, y, back));
  }
}

function makeBoxVehicle(kind) {
  const g = new THREE.Group();
  if (kind === 'bus') {
    // a yellow minibus with a black stripe, like the ones that fill the streets
    const body = mat(0xf2b705), stripe = mat(0x181818);
    g.add(box(2.1, 1.9, 6.2, body, 0, 1.55, 0));
    g.add(box(2.12, 0.35, 6.22, stripe, 0, 1.15, 0));
    g.add(box(2.12, 0.7, 5.0, glass, 0, 2.1, -0.3));
    g.add(box(1.9, 0.12, 5.9, mat(0xd9a000), 0, 2.56, 0));
    wheels(g, 1.0, 1.9, -1.9);
    lights(g, 0.7, 3.12, -3.12, 1.0);
  } else if (kind === 'taxi') {
    const body = mat(0xf7c600);
    g.add(box(1.8, 0.7, 4.2, body, 0, 0.85, 0));
    g.add(box(1.6, 0.6, 2.2, glass, 0, 1.45, -0.2));
    g.add(box(1.5, 0.08, 2.1, body, 0, 1.78, -0.2));
    g.add(box(0.6, 0.2, 0.3, mat(0xffffff, { emissive: 0x888888 }), 0, 1.92, -0.2)); // roof sign
    g.add(box(1.82, 0.12, 4.22, mat(0x181818), 0, 0.6, 0));
    wheels(g, 0.85, 1.35, -1.35, 0.38);
    lights(g, 0.6, 2.12, -2.12, 0.9);
  } else if (kind === 'police') {
    const body = mat(0xf4f6f8);
    g.add(box(1.85, 0.7, 4.4, body, 0, 0.85, 0));
    g.add(box(1.87, 0.25, 4.42, mat(0x1f3a8a), 0, 0.72, 0));
    g.add(box(1.6, 0.6, 2.3, glass, 0, 1.45, -0.2));
    g.add(box(1.5, 0.08, 2.2, body, 0, 1.78, -0.2));
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    red.position.set(-0.4, 1.9, -0.2); blue.position.set(0.4, 1.9, -0.2);
    g.add(red, blue);
    g.userData.lights = [red, blue];
    wheels(g, 0.85, 1.4, -1.4, 0.38);
    lights(g, 0.6, 2.22, -2.22, 0.9);
  } else if (kind === 'bike') {
    const frame = mat(0x2a6fdb);
    g.add(box(0.1, 0.1, 1.5, frame, 0, 0.7, 0));
    g.add(box(0.1, 0.5, 0.1, frame, 0, 0.95, 0.5));
    g.add(box(0.6, 0.06, 0.06, frame, 0, 1.2, 0.5));
    for (const z of [0.7, -0.7]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 14), tyre);
      c.rotation.z = Math.PI / 2;
      c.position.set(0, 0.38, z);
      g.add(c);
    }
  } else {
    // your own car
    const body = mat(0xc0392b);
    g.add(box(1.8, 0.7, 4.3, body, 0, 0.85, 0));
    g.add(box(1.6, 0.6, 2.3, glass, 0, 1.45, -0.25));
    g.add(box(1.5, 0.08, 2.2, body, 0, 1.78, -0.25));
    wheels(g, 0.85, 1.35, -1.35, 0.38);
    lights(g, 0.6, 2.17, -2.17, 0.9);
  }
  if (kind === 'bike') {
    const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), mat(0xe8b88a));
    rider.position.set(0, 1.4, 0);
    g.add(rider);
  }
  return g;
}

// ---------- Real car models (client/public/models/cars/<name>.glb) ----------
// Every model faces +Z, stands on the ground and is in metres. To add a car: put the .glb there and add a row in server/social.js.
const loaded = {}, loading = {};
export function loadCar(name) {
  if (loading[name]) return loading[name];
  loading[name] = new GLTFLoader().loadAsync(`/models/cars/${name}.glb`).then((g) => { loaded[name] = g.scene; return g.scene; }).catch(() => null);
  return loading[name];
}
export const carReady = (name) => Boolean(loaded[name]);
// A fresh copy of a loaded model (shares the geometry and textures, so copies are cheap). Wheels are found for spinning.
export function carClone(name) {
  const src = loaded[name];
  if (!src) return null;
  const c = src.clone(true);
  const wheels = [];
  c.traverse((o) => { if (/wheel/.test(o.name) && !/steer/.test(o.name)) { wheels.push({ o, sign: new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion).x < 0 ? -1 : 1 }); } });
  if (/cockpit/.test(name)) c.traverse((o) => { if (/glass/.test(o.name)) o.visible = false; }); // you look out through the open frame
  c.userData.wheels = wheels;
  return c;
}
// Spin the wheels for a distance driven (metres).
export function spinWheels(g, dist) {
  const w = g.userData.wheels;
  if (!w) return;
  for (const { o, sign } of w) o.rotateX(sign * dist / 0.34);
}
// Which models appear in street traffic. Old yellow cabs are listed more than once, so they are a common sight.
export const TRAFFIC_MODELS = ['coupe70', 'taxi90', 'pickup50', 'taxi90', 'roadster50', 'lowrider', 'coupe70', 'taxi90', 'taxi'];

// A vehicle for someone else (or a patrol): a real model when we have one, with the plain box version until it loads.
export function makeVehicle(kind, model) {
  const g = makeBoxVehicle(kind);
  const name = model || (kind === 'police' ? 'police' : kind === 'taxi' ? 'taxi' : null);
  if (!name) return g;
  const swap = () => {
    const c = carClone(name);
    if (!c) return;
    for (const ch of g.children.slice()) g.remove(ch);
    g.add(c);
    g.userData.wheels = c.userData.wheels;
    g.userData.model = name;
    if (kind === 'police') {
      // flashing roof lights
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
      red.position.set(0.28, 1.68, -0.1); blue.position.set(-0.28, 1.68, -0.1);
      g.add(red, blue);
      g.userData.lights = [red, blue];
    } else g.userData.lights = undefined;
  };
  if (carReady(name)) swap(); else loadCar(name).then(swap);
  return g;
}

// A small picture of a car for the Kanis Motors catalogue, drawn once off screen. '' until the model has loaded.
const thumbCache = new Map();
let tRen = null, tScene = null, tCam = null;
export function carThumb(name) {
  if (thumbCache.has(name)) return thumbCache.get(name);
  const c = carClone(name);
  if (!c) return '';
  let url = '';
  try {
    if (!tRen) {
      tRen = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      tRen.setPixelRatio(1); tRen.setSize(240, 120); tRen.setClearColor(0x000000, 0);
      tScene = new THREE.Scene();
      tScene.add(new THREE.HemisphereLight(0xffffff, 0x8a8aa0, 1.9));
      const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(4, 6, 5); tScene.add(sun);
      tCam = new THREE.PerspectiveCamera(28, 240 / 120, 0.1, 100);
    }
    c.rotation.y = 0.6;
    tScene.add(c);
    tCam.position.set(-3.6, 2.3, 7.6); tCam.lookAt(0, 0.65, 0);
    tRen.render(tScene, tCam);
    url = tRen.domElement.toDataURL('image/png');
    tScene.remove(c);
  } catch { url = ''; }
  thumbCache.set(name, url);
  return url;
}
