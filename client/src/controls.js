// Adulthood: movement controls. A drag joystick on touch screens, arrow keys / WASD, and a gamepad stick,
// next to the existing tap-to-move. The server still decides where you can go: these only send "walk that way".
const STEP = 7;          // how far ahead (metres) the walking target is placed
const SEND_MS = 90;      // how often a new target is sent while a direction is held
const DEAD = 0.18;
const RIM = 0.85;        // push the stick this far out (0 to 1) to run       // ignore tiny stick movement

export function initControls({ socket, getMe, orbit, camera }) {
  const keys = new Set();
  let joy = { x: 0, y: 0 };      // joystick, each -1..1 (y up is +1)
  let pad = { x: 0, y: 0 };      // gamepad stick
  let moving = false;
  let sentAt = 0;
  let driving = false;
  let driveSent = 0;
  let driveZero = true;

  const typing = () => {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  };
  const KEYMAP = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r', W: 'u', S: 'd', A: 'l', D: 'r' };
  let shift = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') shift = true;
    const k = KEYMAP[e.key];
    if (!k || typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    keys.add(k);
    if (e.key.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') shift = false; const k = KEYMAP[e.key]; if (k) keys.delete(k); });
  window.addEventListener('blur', () => { shift = false; keys.clear(); joy = { x: 0, y: 0 }; });

  // ----- On-screen joystick (only on touch screens or small windows) -----
  const base = document.getElementById('joy');
  const knob = document.getElementById('joyKnob');
  const coarse = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 600;
  if (base && coarse) {
    base.hidden = false;
    let id = null;
    const R = 46; // how far the knob can travel
    const set = (e) => {
      const r = base.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > R) { dx = (dx / m) * R; dy = (dy / m) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      joy = { x: dx / R, y: -dy / R };
    };
    const end = () => { id = null; joy = { x: 0, y: 0 }; knob.style.transform = 'translate(0, 0)'; };
    base.addEventListener('pointerdown', (e) => { id = e.pointerId; base.setPointerCapture(id); set(e); e.preventDefault(); e.stopPropagation(); });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    base.addEventListener('pointerup', (e) => { if (e.pointerId === id) end(); });
    base.addEventListener('pointercancel', end);
  }

  function readPad() {
    pad = { x: 0, y: 0 };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of pads) {
      if (!g || !g.connected) continue;
      let x = g.axes[0] || 0, y = -(g.axes[1] || 0);
      if (g.buttons[14] && g.buttons[14].pressed) x = -1;   // d-pad left
      if (g.buttons[15] && g.buttons[15].pressed) x = 1;    // right
      if (g.buttons[12] && g.buttons[12].pressed) y = 1;    // up
      if (g.buttons[13] && g.buttons[13].pressed) y = -1;   // down
      if (Math.hypot(x, y) > Math.hypot(pad.x, pad.y)) pad = { x, y };
    }
  }

  // Call once per frame.
  function update() {
    readPad();
    let x = joy.x + pad.x, y = joy.y + pad.y;
    if (keys.has('l')) x -= 1;
    if (keys.has('r')) x += 1;
    if (keys.has('u')) y += 1;
    if (keys.has('d')) y -= 1;
    const mag = Math.hypot(x, y);
    const me = getMe();
    if (!me) return;
    const now = performance.now();
    if (driving) {
      // Steering and throttle, relative to the car (not the camera). Send only when changed, plus a steady stream while held.
      const steer = Math.max(-1, Math.min(1, x)), thr = Math.max(-1, Math.min(1, y));
      const zero = Math.abs(steer) < 0.05 && Math.abs(thr) < 0.05;
      if (zero && driveZero) return;
      if (now - driveSent < 60 && !(zero && !driveZero)) return;
      driveSent = now;
      driveZero = zero;
      socket.emit('driveInput', { steer: zero ? 0 : steer, thr: zero ? 0 : thr });
      return;
    }
    if (mag < DEAD) {
      if (moving) { moving = false; socket.emit('moveTo', { x: me.target.x, z: me.target.z }); } // let go: stop where you are
      return;
    }
    if (now - sentAt < SEND_MS) return;
    sentAt = now;
    moving = true;
    // "Up" on the screen is away from the camera, on the ground.
    let fx = orbit.target.x - camera.position.x, fz = orbit.target.z - camera.position.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const rx = -fz, rz = fx;
    const nx = x / Math.max(1, mag), ny = y / Math.max(1, mag);
    const wx = fx * ny + rx * nx, wz = fz * ny + rz * nx;
    // A gentle push (or the arrow keys) walks. Only the outer rim of the joystick, or holding Shift, runs.
    const stick = Math.max(Math.hypot(joy.x, joy.y), Math.hypot(pad.x, pad.y));
    const run = stick >= RIM || shift ? 1 : 0;
    socket.emit('moveTo', { x: me.target.x + wx * STEP, z: me.target.z + wz * STEP, d: 1, r: run });
  }
  return { update, setDriving(on) { driving = on; if (!on) { driveZero = true; moving = false; } } };
}