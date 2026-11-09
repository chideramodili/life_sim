// Hairstyles. The model's own hair is a separate piece (shown for "original"). The other styles are built from the skull shape
// and attached to the Head bone, so they turn and bob with the head. Sizes are in metres, in the head bone's space.
// Looks: a smooth scalp shell with a strand texture, plus clumps (curls, knots) or tubes (cornrows, braids, locs) on top.
import * as THREE from 'three';

export const STYLES = {
  original: 'Original',
  bald: 'Bald',
  buzz: 'Buzz cut',
  low: 'Low cut',
  curls: 'Short curls',
  afro: 'Afro',
  cornrows: 'Cornrows',
  braids: 'Box braids',
  locs: 'Locs',
  knots: 'Bantu knots',
  bun: 'Top bun',
  ponytail: 'Ponytail',
  puffs: 'Puffs',
};
// Skull ellipsoid (centre and radii) per body, measured from the models: the head bone is at the base of the skull.
const SKULL = {
  man:   { c: [0, 0.132, 0.015], r: [0.078, 0.102, 0.098], nose: 0.098 },
  woman: { c: [0, 0.11, 0.012], r: [0.071, 0.094, 0.09], nose: 0.075 },
};

// Strand texture: soft light and dark streaks, used as colour and bump so the hair is not a flat plastic shell.
let strands = null;
function strandTex(across) {
  if (strands && strands[across ? 1 : 0]) return strands[across ? 1 : 0];
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, 256, 256);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const v = 90 + rnd() * 150 | 0; g.strokeStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.5})`; g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    if (across) { const y = rnd() * 256; g.moveTo(0, y); g.lineTo(256, y + (rnd() - 0.5) * 14); }   // diagonal-ish rings (braids)
    else { const x = rnd() * 256; g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 10, 256); }   // streaks from crown to ends
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  strands = strands || []; strands[across ? 1 : 0] = t;
  return t;
}
const hairMat = (hex, across = false, rough = 0.62) => new THREE.MeshStandardMaterial({
  color: hex, roughness: rough, metalness: 0.05, map: strandTex(across), bumpMap: strandTex(across), bumpScale: 0.6, side: THREE.DoubleSide,
});

// The hairline height at a point of the skull: highest at the forehead (front), lowest at the nape, and it dips down at the sides.
function hairline(front, back, rz, rx, x, z) {
  const f = Math.min(1, Math.max(0, (z / rz + 1) / 2));
  const base = back + (front - back) * f * f;   // low at the sides and nape, rising to the forehead
  return base - 0.012 * Math.min(1, Math.abs(x) / rx) * f;   // a little lower at the temples
}

// A smooth shell over the scalp: vertices below the hairline are pulled up onto it, so the edge is a clean curve.
function cap(r, t, front, back, lumps = 0) {
  const g = new THREE.SphereGeometry(1, 128, 120);
  const pos = g.attributes.position, rx = r[0] * t, ry = r[1] * t, rz = r[2] * t;
  for (let i = 0; i < pos.count; i++) {
    const X = pos.getX(i), Y = pos.getY(i), Z = pos.getZ(i);
    const th0 = Math.acos(Math.max(-1, Math.min(1, Y))), az = Math.atan2(X, Z);   // polar angle from the crown, azimuth from the front
    const sa = Math.sin(az), ca = Math.cos(az);
    // the lowest polar angle allowed at this azimuth, where the ellipsoid meets the hairline (found by a few steps)
    let thMax = 1.2;
    for (let k = 0; k < 6; k++) {
      const x = sa * Math.sin(thMax) * rx, z = ca * Math.sin(thMax) * rz;
      const lo = Math.max(-ry * 0.95, Math.min(ry * 0.95, hairline(front, back, rz, rx, x, z)));
      thMax = Math.acos(lo / ry);
    }
    const th = (th0 / Math.PI) * thMax;
    let x = sa * Math.sin(th), y = Math.cos(th), z = ca * Math.sin(th);
    if (lumps) { const n = 1 + lumps * Math.sin(x * 9 + y * 7) * Math.sin(z * 8 - y * 5); x *= n; y *= n; z *= n; }
    pos.setXYZ(i, x * rx, y * ry, z * rz);
  }
  g.computeVertexNormals();
  return g;
}

// A point on the skull surface (offset out by `t`): u across (-1..1), phi from the front (rad) over the top to the back.
const onSkull = (r, t, u, phi) => {
  const s = Math.sqrt(Math.max(0, 1 - u * u));
  return new THREE.Vector3(u * r[0] * t, r[1] * t * s * Math.sin(phi), r[2] * t * s * Math.cos(phi));
};
// Evenly spread points over the top and back of the scalp (golden-angle spiral).
function scatter(n, r, t, minY, back = true) {
  const out = [];
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const y = 1 - (i + 0.5) / (n * 3) * 1.2, rad = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996;
    const p = new THREE.Vector3(Math.cos(a) * rad * r[0] * t, y * r[1] * t, Math.sin(a) * rad * r[2] * t);
    if (p.y < minY) continue;
    if (!back && p.z < -r[2] * 0.2 && p.y < 0.02) continue;
    out.push(p);
  }
  return out;
}
// Many small clumps (spheres) on the scalp: curls and afro texture.
function clumps(points, radius, jitter = 0.35) {
  const geo = new THREE.SphereGeometry(1, 8, 6), list = [];
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const p of points) {
    const s = radius * (1 - jitter + rnd() * jitter * 2);
    list.push({ p, s });
  }
  return { geo, list };
}

// Build the parts of a style. A part is { geo, x, y, z, rx, inst: [{p, s}], skin: bool, across: bool }.
function build(style, body) {
  const S = SKULL[body] || SKULL.man, [cx, cy, cz] = S.c, r = S.r;
  const front = S.nose + 0.08 - cy, back = -r[1] * 0.75;   // hairline heights relative to the skull centre
  const parts = [];
  const shell = (t, lumps, opt = {}) => parts.push({ geo: cap(r, t, front, back, lumps), x: cx, y: cy, z: cz, shell: true, ...opt });
  const addClumps = (n, t, rad, minY = -0.01) => {
    const c = clumps(scatter(n, r, t, minY), rad);
    parts.push({ geo: c.geo, inst: c.list, x: cx, y: cy, z: cz });
  };
  if (style === 'bald') shell(1.05, 0, { skin: true });
  else if (style === 'buzz') shell(1.045, 0);
  else if (style === 'low') shell(1.085, 0);
  else if (style === 'curls') { shell(1.06, 0); addClumps(260, 1.1, 0.0155); }
  else if (style === 'afro') { shell(1.28, 0.03); addClumps(320, 1.4, 0.034, -0.03); }
  else if (style === 'cornrows') {
    shell(1.05, 0, { skin: true });
    const rows = 9;
    for (let i = 0; i < rows; i++) {
      const u = -0.74 + (1.48 * i) / (rows - 1), pts = [];
      for (let k = 0; k <= 22; k++) { const phi = 0.62 + (2.45 - 0.62) * (k / 22); pts.push(onSkull(r, 1.07, u, phi)); }
      parts.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0042, 6, false), x: cx, y: cy, z: cz, across: true });
    }
  } else if (style === 'braids') {
    shell(1.07, 0);
    const n = 30;
    for (let i = 0; i < n; i++) {
      const u = -0.95 + (1.9 * (i + 0.5)) / n, side = Math.abs(u);
      const phi = 2.0 + (i % 3) * 0.26 - side * 0.1;
      const p0 = onSkull(r, 1.05, u, phi);
      const len = 0.3 + ((i * 37) % 7) * 0.012;
      const pts = [p0, p0.clone().add(new THREE.Vector3(u * 0.012, -0.05, -0.02)), p0.clone().add(new THREE.Vector3(u * 0.02, -len * 0.55, -0.035)), p0.clone().add(new THREE.Vector3(u * 0.024, -len, -0.03))];
      parts.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0075, 6, false), x: cx, y: cy, z: cz, across: true });
    }
  } else if (style === 'locs') {
    shell(1.05, 0);
    for (const p of scatter(80, r, 1.06, 0.0).filter((q) => q.z < r[2] * 0.3)) {
      const out = p.clone().normalize(), len = 0.1 + ((Math.abs(p.x * 977) | 0) % 6) * 0.018;
      const pts = [p, p.clone().add(out.clone().multiplyScalar(0.025)), p.clone().add(out.clone().multiplyScalar(0.045)).add(new THREE.Vector3(0, -len * 0.55, 0)), p.clone().add(out.clone().multiplyScalar(0.05)).add(new THREE.Vector3(0, -len, 0))];
      parts.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.0105, 6, false), x: cx, y: cy, z: cz, across: true });
    }
  } else if (style === 'knots') {
    shell(1.05, 0);
    const spots = scatter(11, r, 1.04, 0.045);
    for (const p of spots) {
      const g = new THREE.SphereGeometry(1, 12, 9); g.scale(0.03, 0.022, 0.03);
      g.rotateX(Math.PI / 2 - 0.4); const n = p.clone().normalize();
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), n, new THREE.Vector3(0, 1, 0));
      g.applyMatrix4(m);
      g.translate(p.x + n.x * 0.014, p.y + n.y * 0.014, p.z + n.z * 0.014);
      parts.push({ geo: g, x: cx, y: cy, z: cz });
    }
  } else if (style === 'bun') {
    shell(1.085, 0);
    parts.push({ geo: new THREE.SphereGeometry(0.052, 20, 14), x: cx, y: cy + r[1] * 1.12, z: cz - 0.01 });
  } else if (style === 'ponytail') {
    shell(1.085, 0);
    const tail = new THREE.CylinderGeometry(0.03, 0.01, 0.27, 14); tail.translate(0, -0.135, 0);
    parts.push({ geo: tail, x: cx, y: cy + 0.02, z: cz - r[2] * 1.12, rx: 0.35, across: true });
    parts.push({ geo: new THREE.SphereGeometry(0.035, 14, 10), x: cx, y: cy + 0.02, z: cz - r[2] * 1.1 });
  } else if (style === 'puffs') {
    shell(1.065, 0);
    for (const s of [-1, 1]) parts.push({ geo: new THREE.SphereGeometry(0.055, 18, 14), x: cx + s * 0.07, y: cy + r[1] * 0.78, z: cz - 0.005 });
    const c = clumps(scatter(60, [0.055, 0.055, 0.055], 1.0, -1), 0.02);
    for (const s of [-1, 1]) parts.push({ geo: c.geo, inst: c.list, x: cx + s * 0.07, y: cy + r[1] * 0.78, z: cz - 0.005 });
  }
  // the woman's model has no skin at the back of the neck (her baked long hair used to cover it): fill it in
  if (body === 'woman') parts.push({ geo: new THREE.CylinderGeometry(0.042, 0.046, 0.2, 24, 1, true), x: 0, y: -0.03, z: -0.035, skin: true, neck: true });
  return parts;
}

// Show `style` on this person. `hairHex` is the hair colour, `skinHex` the skin colour (used by bald and cornrows).
export function applyHairStyle(M, style, hairHex, skinHex, factor) {
  const key = `${style}|${hairHex}|${skinHex}|${M.body}`;
  if (M.hairKey === key) return;
  M.hairKey = key;
  for (const m of M.hairParts || []) { m.parent && m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }
  M.hairParts = [];
  if (M.hairMesh) M.hairMesh.visible = style === 'original';
  if (style === 'original' || !STYLES[style]) return;
  const head = M.bones && M.bones.Head;
  if (!head) return;
  // The bones sit inside a model whose armature is scaled down (centimetres), so measure the real scale here.
  M.root.updateMatrixWorld(true);
  const ws = new THREE.Vector3().setFromMatrixScale(head.matrixWorld).x || 1;
  const k = (factor || 1) / ws;
  const hair = hairMat(hairHex), hairX = hairMat(hairHex, true, 0.5);
  const skin = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.7, side: THREE.DoubleSide });
  const dummy = new THREE.Object3D();
  for (const p of build(style, M.body)) {
    const mat = (p.skin ? skin : p.across ? hairX : hair).clone();
    if (p.shell) mat.side = THREE.FrontSide;
    let mesh;
    if (p.inst) {
      mesh = new THREE.InstancedMesh(p.geo, mat, p.inst.length);
      p.inst.forEach((c, i) => {
        dummy.position.copy(c.p); dummy.scale.setScalar(c.s); dummy.lookAt(c.p.clone().multiplyScalar(2)); dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    } else mesh = new THREE.Mesh(p.geo, mat);
    mesh.position.set(p.x * k, p.y * k, p.z * k);
    mesh.scale.setScalar(k);
    if (p.rx) mesh.rotation.x = p.rx;
    mesh.frustumCulled = false;
    head.add(mesh);
    M.hairParts.push(mesh);
  }
  hair.dispose(); hairX.dispose(); skin.dispose();
}
