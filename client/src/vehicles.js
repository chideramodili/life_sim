// Simple code-made vehicles for rides. They face +Z, so a heading of atan2(dx, dz) points them along the road.
import * as THREE from 'three';

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

export function makeVehicle(kind) {
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