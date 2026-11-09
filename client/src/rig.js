// Adulthood: poses for the new people (man, woman, elder, baby). They share one 24-bone skeleton and only come with walk and run,
// so standing, sitting and working are done here by turning bones a little from their rest pose.
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _e = new THREE.Euler();

export function captureRig(root) {
  const bones = {}, rest = {};
  root.traverse((o) => { if (o.isBone) { bones[o.name] = o; rest[o.name] = { e: o.rotation.clone(), p: o.position.clone() }; } });
  const rig = { bones, rest };
  rig.stand = fitArms(root, rig);
  return rig;
}

// ---- Arms hanging down -------------------------------------------------------------------------------------------
// Every model has its own bone axes, so one fixed angle cannot work for all of them (it left some arms raised or crossed).
// Instead, try angles on the real skeleton once per model type and keep the ones that hang the arm straight down
// (a hair out from the body) with a small natural bend at the elbow.
const armCache = {};
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _inv = new THREE.Matrix4();
function fitArms(root, rig) {
  const L = rig.rest.LeftArm, B = rig.bones;
  if (!L || !B.LeftForeArm || !B.RightForeArm || !B.RightArm || !B.LeftHand || !B.RightHand) return null;
  const key = [L.e.x, L.e.y, L.e.z, rig.rest.RightArm.e.x, rig.rest.RightArm.e.y, rig.rest.RightArm.e.z, rig.rest.LeftForeArm.e.x].map((n) => n.toFixed(3)).join(',');
  if (armCache[key]) return armCache[key];
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  // Direction of the character's own sides: +x in the root frame is the left hand side only if the model faces +Z; we read it from the shoulders.
  const sideSign = _v1.setFromMatrixPosition(B.LeftArm.matrixWorld).applyMatrix4(_inv).x > _v2.setFromMatrixPosition(B.RightArm.matrixWorld).applyMatrix4(_inv).x ? 1 : -1;
  const dir = (a, b) => { _v1.setFromMatrixPosition(a.matrixWorld).applyMatrix4(_inv); _v2.setFromMatrixPosition(b.matrixWorld).applyMatrix4(_inv); return _v3.subVectors(_v2, _v1).normalize(); };
  const out = {};
  for (const side of ['Left', 'Right']) {
    const arm = B[side + 'Arm'], fore = B[side + 'ForeArm'], hand = B[side + 'Hand'];
    const ra = rig.rest[side + 'Arm'].e, rf = rig.rest[side + 'ForeArm'].e;
    const outward = (side === 'Left' ? 1 : -1) * sideSign;
    let best = null;
    for (let dz = -1.6; dz <= 1.6001; dz += 0.1) for (let dx = -0.8; dx <= 0.8001; dx += 0.1) for (let dy = -0.8; dy <= 0.8001; dy += 0.2) {
      _q.setFromEuler(_e.set(ra.x + dx, ra.y + dy, ra.z + dz, ra.order)); arm.quaternion.copy(_q);
      arm.updateMatrixWorld(true);
      const d = dir(arm, fore);
      const err = Math.abs(d.x * outward - 0.1) + Math.abs(d.z) * 0.8 + (d.y > -0.9 ? (d.y + 0.9) * 2 : 0);
      if (!best || err < best.err) best = { err, dx, dy, dz };
    }
    arm.quaternion.setFromEuler(_e.set(ra.x + best.dx, ra.y + best.dy, ra.z + best.dz, ra.order));
    arm.updateMatrixWorld(true);
    let bf = null;
    for (let fx = -0.8; fx <= 0.8001; fx += 0.1) for (let fz = -0.4; fz <= 0.4001; fz += 0.2) {
      _q.setFromEuler(_e.set(rf.x + fx, rf.y, rf.z + fz, rf.order)); fore.quaternion.copy(_q);
      fore.updateMatrixWorld(true);
      const d = dir(fore, hand);
      const err = Math.abs(d.z - 0.22) + Math.abs(d.x * outward - 0.05);
      if (!bf || err < bf.err) bf = { err, fx, fz };
    }
    out[side] = { a: [best.dx, best.dy, best.dz], f: [bf.fx, 0, bf.fz] };
    arm.quaternion.setFromEuler(_e.set(ra.x, ra.y, ra.z, ra.order)); fore.quaternion.setFromEuler(_e.set(rf.x, rf.y, rf.z, rf.order));
  }
  root.updateMatrixWorld(true);
  return (armCache[key] = out);
}

// Turn a bone to (rest + these angles), blended w of the way from where it is now.
function turn(rig, name, dx, dy, dz, w) {
  const b = rig.bones[name];
  if (!b || w <= 0) return;
  const r = rig.rest[name].e;
  _q.setFromEuler(_e.set(r.x + dx, r.y + dy, r.z + dz, r.order));
  if (w >= 1) b.quaternion.copy(_q); else b.quaternion.slerp(_q, w);
}

// Standing (and working). w = how much of the standing pose to use (the walk clip fades out as w rises).
export function poseStand(rig, t, w, working = false, phase = 0) {
  const s = Math.sin(t * 7 + phase);
  if (working) {
    turn(rig, 'LeftArm', -0.9 + s * 0.5, 0, -0.35, w);
    turn(rig, 'RightArm', -0.9 - s * 0.5, 0, 0.35, w);
    turn(rig, 'LeftForeArm', 0.5, 0, 0, w);
    turn(rig, 'RightForeArm', 0.5, 0, 0, w);
  } else {
    const st = rig.stand;
    if (st) {
      turn(rig, 'LeftArm', ...st.Left.a, w); turn(rig, 'RightArm', ...st.Right.a, w);
      turn(rig, 'LeftForeArm', ...st.Left.f, w); turn(rig, 'RightForeArm', ...st.Right.f, w);
    } else {
      turn(rig, 'LeftArm', 0, 0, -0.7, w);
      turn(rig, 'RightArm', 0, 0, 0.7, w);
      turn(rig, 'LeftForeArm', 0.12, 0, 0, w);
      turn(rig, 'RightForeArm', 0.12, 0, 0, w);
    }
  }
  // a slow breath
  turn(rig, 'Spine', Math.sin(t * 1.6 + phase) * 0.012, 0, 0, w);
}

// Sitting: hips down, thighs forward, knees bent, hands on the lap. `drop` is how far the hips go down, in metres.
export function poseSit(rig, group, drop = 0.45, lean = 0) {
  const hips = rig.bones.Hips;
  if (hips) {
    group.updateMatrixWorld(true);
    const sc = new THREE.Vector3();
    hips.parent.getWorldScale(sc);
    hips.position.copy(rig.rest.Hips.p);
    hips.position.y -= drop / (sc.y || 1);
  }
  for (const side of ['Left', 'Right']) {
    turn(rig, side + 'UpLeg', -1.45, 0, 0, 1);
    turn(rig, side + 'Leg', 1.45, 0, 0, 1);
    turn(rig, side + 'Foot', -0.1, 0, 0, 1);
    turn(rig, side + 'Arm', 0.25, 0, side === 'Left' ? -0.55 : 0.55, 1);
    turn(rig, side + 'ForeArm', 0.9, 0, 0, 1);
  }
  turn(rig, 'Spine', lean, 0, 0, 1);
}

// A hand wave (right arm up, forearm swinging).
export function poseWave(rig, t, w) {
  turn(rig, 'RightArm', 0, 0, -1.6, w);
  turn(rig, 'RightForeArm', 0.4 + Math.sin(t * 9) * 0.5, 0, 0, w);
}

// Gym moves. kind 1 = dumbbell curls, 2 = push-ups, 3 = crunches. The body tilt itself is done by the caller (see animateModel).
export function poseExercise(rig, kind, t, w) {
  const s = Math.sin(t * 4.2);
  const up = (s + 1) / 2; // 0..1
  if (kind === 1) {
    turn(rig, 'LeftArm', 0.05, 0, -0.18, w);
    turn(rig, 'RightArm', 0.05, 0, 0.18, w);
    turn(rig, 'LeftForeArm', 0.2 + 1.9 * up, 0, 0, w);
    turn(rig, 'RightForeArm', 0.2 + 1.9 * (1 - up), 0, 0, w);
    turn(rig, 'LeftLeg', 0, 0, 0, w); turn(rig, 'RightLeg', 0, 0, 0, w);
  } else if (kind === 2) {
    // arms straight to the floor; elbows bend as the body goes down
    turn(rig, 'LeftArm', -1.5, 0, -0.25, w);
    turn(rig, 'RightArm', -1.5, 0, 0.25, w);
    turn(rig, 'LeftForeArm', 0.05 + 0.9 * up, 0, 0, w);
    turn(rig, 'RightForeArm', 0.05 + 0.9 * up, 0, 0, w);
    for (const side of ['Left', 'Right']) { turn(rig, side + 'UpLeg', 0, 0, 0, w); turn(rig, side + 'Leg', 0, 0, 0, w); }
  } else if (kind === 3) {
    for (const side of ['Left', 'Right']) { turn(rig, side + 'UpLeg', -1.2, 0, 0, w); turn(rig, side + 'Leg', 1.6, 0, 0, w); turn(rig, side + 'Arm', 2.4, 0, side === 'Left' ? -0.3 : 0.3, w); turn(rig, side + 'ForeArm', 1.9, 0, 0, w); }
    turn(rig, 'Spine', 0.55 * up, 0, 0, w);
    turn(rig, 'Spine01', 0.5 * up, 0, 0, w);
  }
}
// How far the whole body tilts for each move, and how high it sits, at time t.
export function exerciseTilt(kind, t) {
  const up = (Math.sin(t * 4.2) + 1) / 2;
  if (kind === 2) return { x: 1.42 - 0.3 * (1 - up) * 0.9, y: 0.0 };
  if (kind === 3) return { x: -1.5, y: 0.14 };
  if (kind === 9) return { x: -1.5708, y: 0.98 };   // lying on a hospital bed, face up, head towards the back wall
  return { x: 0, y: 0 };
}

// Reaching out to push a door open: the right arm comes forward and the hand opens at chest height.
export function poseReach(rig, w) {
  turn(rig, 'RightArm', -1.25, 0, 0.1, w);
  turn(rig, 'RightForeArm', 0.35, 0, 0, w);
}
