// Adulthood: the game is made to be played with the phone held sideways.
// 1) Where the browser allows it (Android in full screen or installed), ask for a sideways lock.
// 2) On an upright phone, show a friendly "turn your phone" screen. "Play upright anyway" hides it for this visit.
// iPhone does not let any website lock the screen, so there the turn-your-phone screen is how it works.
const phone = () => window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700;
const portrait = () => window.innerHeight > window.innerWidth;

export function initOrientation() {
  const el = document.createElement('div');
  el.id = 'turnPhone'; el.hidden = true;
  el.innerHTML = '<div class="tpIcon"></div><div class="tpTitle">Turn your phone sideways</div><div class="tpText">Adulthood plays best in wide view. If nothing happens, switch off your phone\'s rotation lock.</div><button type="button">Play upright anyway</button>';
  document.body.append(el);
  let upright = false;
  try { upright = sessionStorage.getItem('uprightOK') === '1'; } catch {}
  el.querySelector('button').addEventListener('click', () => { upright = true; try { sessionStorage.setItem('uprightOK', '1'); } catch {} paint(); });
  function paint() { el.hidden = !(phone() && portrait() && !upright); }
  const lock = () => { try { if (phone() && !upright && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch {} };
  window.addEventListener('resize', paint);
  window.addEventListener('orientationchange', paint);
  window.addEventListener('pointerdown', lock, { once: true });
  paint();
  return { lock };
}
