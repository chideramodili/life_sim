// Adulthood: poses for the new people (man, woman, elder, baby). They share one 24-bone skeleton and only come with walk and run,
// so standing, sitting and working are done here by turning bones a little from their rest pose.
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _e = new THREE.Euler();

export function captureRig(root) {
  const bones = {}, rest = {};
  root.traverse((o) => { if (o.isBone) { bones[o.name] = o; rest[o.name] = { e: o.rotation.clone(), p: o.position.clone() }; } });
  return { bones, rest };
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
    turn(rig, 'LeftArm', 0, 0, -0.7, w);
    turn(rig, 'RightArm', 0, 0, 0.7, w);
    turn(rig, 'LeftForeArm', 0.12, 0, 0, w);
    turn(rig, 'RightForeArm', 0.12, 0, 0, w);
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
