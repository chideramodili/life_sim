// Adulthood: dresses an avatar from the ids in `look` (top, bottom, shoes, accessory). Looks only; the server decides what you own.
import * as THREE from 'three';
import { dressModel } from './model.js';

const mat = (c) => new THREE.MeshStandardMaterial({ color: c });

export function dressAvatar(group, look, catalog) {
  const key = look ? look.join(',') : '';
  if (group.userData.lookKey === key) return;
  group.userData.lookKey = key;
  if (group.userData.model) { dressModel(group, look, catalog, group.userData.baseColor); return; }
  for (const m of group.userData.dress || []) {
    group.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
  group.userData.dress = [];
  const body = group.children[0]; // the plain body
  const dressed = Boolean(look && catalog && look.some(Boolean));
  body.visible = !dressed;
  if (!dressed) return;
  const add = (mesh) => {
    group.add(mesh);
    group.userData.dress.push(mesh);
  };
  const base = body.material.color.getStyle();
  const [top, bottom, shoes, acc] = look.map((id) => (id ? catalog.byId[id] : null));
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.55, 16), mat(top ? top.color : base));
  torso.position.y = 0.72;
  add(torso);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.4, 16), mat(bottom ? bottom.color : '#3a3a48'));
  legs.position.y = 0.25;
  add(legs);
  if (shoes) {
    for (const dx of [-0.14, 0.14]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.34), mat(shoes.color));
      s.position.set(dx, 0.05, 0.05);
      add(s);
    }
  }
  if (acc) {
    let m = null;
    if (acc.kind === 'cap') {
      m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(acc.color));
      m.position.y = 1.36;
    } else if (acc.kind === 'shades') {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), mat(acc.color));
      m.position.set(0, 1.33, 0.27);
    } else if (acc.kind === 'watch') {
      m = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 8, 12), mat(acc.color));
      m.position.set(0.4, 0.65, 0);
      m.rotation.y = Math.PI / 2;
    } else if (acc.kind === 'bag') {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.12), mat(acc.color));
      m.position.set(0.42, 0.5, 0);
    } else if (acc.kind === 'chain') {
      m = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 16), mat(acc.color));
      m.position.set(0, 0.95, 0.12);
      m.rotation.x = Math.PI / 2.4;
    }
    if (m) add(m);
  }
}