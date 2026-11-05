// Adulthood: the driving control panel. A steering wheel (left), brake + gas pedals and a P/R/N/D gear selector (right).
// It only works out "steer" and "thr" (-1..1); the server still does all the driving and checks every input.
const MAX_ANGLE = 100;        // degrees the wheel turns each way
const GEARS = ['P', 'R', 'N', 'D'];

export function createCarPanel() {
  const root = document.createElement('div');
  root.id = 'carPanel';
  root.hidden = true;
  root.innerHTML = `
    <div id="cpWheel" aria-label="Steering wheel"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#222" stroke-width="9"/><circle cx="50" cy="50" r="44" fill="none" stroke="#777" stroke-width="3"/><path d="M8 50h84M50 50v42" stroke="#222" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="50" r="11" fill="#333" stroke="#888" stroke-width="2"/><rect x="46" y="2" width="8" height="10" rx="2" fill="#e33"/></svg></div>
    <div id="cpRight">
      <div id="cpGears">${GEARS.map((g) => `<button data-g="${g}">${g}</button>`).join('')}</div>
      <div id="cpPedals"><button id="cpBrake">BRAKE</button><button id="cpGas">GAS</button></div>
    </div>`;
  document.body.appendChild(root);
  const wheel = root.querySelector('#cpWheel');
  const gasBtn = root.querySelector('#cpGas'), brakeBtn = root.querySelector('#cpBrake');
  const gearBtns = [...root.querySelectorAll('#cpGears button')];

  let gear = 'D', angle = 0, wheelId = null, gasHeld = false, gas = 0, brake = false;
  let kmh = 0, rev = false, raf = 0, last = 0;

  const paintGear = () => gearBtns.forEach((b) => {
    b.classList.toggle('on', b.dataset.g === gear);
    b.classList.toggle('off', (b.dataset.g === 'R' || b.dataset.g === 'P') && kmh > 4 && b.dataset.g !== gear);
  });
  gearBtns.forEach((b) => b.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const g = b.dataset.g;
    if ((g === 'R' || g === 'P') && kmh > 4) return;   // stop first
    gear = g; paintGear();
  }));

  const setWheel = (e) => {
    const r = wheel.getBoundingClientRect();
    const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI; // 0 = straight up
    angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, a));
    wheel.style.transform = `rotate(${angle}deg)`;
  };
  wheel.addEventListener('pointerdown', (e) => { wheelId = e.pointerId; wheel.setPointerCapture(wheelId); setWheel(e); e.preventDefault(); e.stopPropagation(); });
  wheel.addEventListener('pointermove', (e) => { if (e.pointerId === wheelId) setWheel(e); });
  const wheelUp = (e) => { if (e.pointerId === wheelId) wheelId = null; };
  wheel.addEventListener('pointerup', wheelUp);
  wheel.addEventListener('pointercancel', () => { wheelId = null; });

  const hold = (el, on, off) => {
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); on(); el.classList.add('down'); e.preventDefault(); e.stopPropagation(); });
    const up = () => { off(); el.classList.remove('down'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  hold(gasBtn, () => { gasHeld = true; }, () => { gasHeld = false; });
  hold(brakeBtn, () => { brake = true; }, () => { brake = false; });

  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (t - (last || t)) / 1000); last = t;
    gas = gasHeld ? Math.min(1, gas + dt * 2.2) : Math.max(0, gas - dt * 4);       // press ramps up, release eases off
    if (wheelId === null && angle !== 0) {                                        // wheel springs back
      const step = 260 * dt;
      angle = Math.abs(angle) <= step ? 0 : angle - Math.sign(angle) * step;
      wheel.style.transform = `rotate(${angle}deg)`;
    }
  }

  return {
    show(on) {
      root.hidden = !on;
      document.body.classList.toggle('driving', on);
      if (on) { gear = 'D'; angle = 0; gas = 0; gasHeld = brake = false; wheel.style.transform = ''; paintGear(); last = 0; if (!raf) raf = requestAnimationFrame(loop); }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    },
    setSpeed(k, r) { if (k !== kmh || r !== rev) { kmh = k; rev = r; paintGear(); } },
    // What the panel is asking for right now. active = a pedal or the wheel is in use, so the keyboard should not override it.
    read() {
      const fwdMoving = kmh > 0 && !rev, revMoving = kmh > 0 && rev;
      let thr = 0;
      if (brake) thr = fwdMoving ? -1 : revMoving ? 1 : 0;
      else if (gear === 'D') thr = gas;
      else if (gear === 'R') thr = -gas;
      return { steer: angle / MAX_ANGLE, thr, pedals: brake || gas > 0.02 || gasHeld, wheel: Math.abs(angle) > 1 };
    },
    gear: () => gear,
  };
}
