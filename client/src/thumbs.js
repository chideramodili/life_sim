// Adulthood: little pictures of furniture for the shop. Each piece is drawn once, off screen, and kept.
import * as THREE from 'three';
import { buildPiece } from './furniture.js';

const SIZE = 160;
const cache = new Map();
let renderer = null;
let scene = null;
let cam = null;
let failed = false;

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8aa0, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
}

function dispose(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

// Returns a data URL picture of the piece, or '' when it cannot be drawn here (then the card shows an icon).
export function thumbFor(def) {
  if (cache.has(def.id)) return cache.get(def.id);
  let url = '';
  if (!failed) {
    try {
      if (!renderer) setup();
      const piece = buildPiece(def);
      if (piece) {
        scene.add(piece);
        const box = new THREE.Box3().setFromObject(piece);
        const c = box.getCenter(new THREE.Vector3());
        const r = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 0.4);
        const dist = r / Math.sin((cam.fov * Math.PI) / 360) * 1.05;
        cam.position.set(c.x + dist * 0.62, c.y + dist * 0.5, c.z + dist * 0.62);
        cam.lookAt(c);
        renderer.render(scene, cam);
        url = renderer.domElement.toDataURL('image/png');
        scene.remove(piece);
        dispose(piece);
      }
    } catch {
      failed = true;
    }
  }
  cache.set(def.id, url);
  return url;
}