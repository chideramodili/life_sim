// Adulthood: the Staff phone app. Hire a driver (needs a car), a cleaner or a cook. The server decides everything; this only shows it.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');

export function initStaff(socket) {
  // A hidden button the phone's Staff app presses, and the panel itself.
  const btn = el('button'); btn.id = 'staffBtn'; btn.hidden = true; btn.textContent = 'Staff';
  const panel = el('div', 'panel'); panel.id = 'staffPanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', 'Staff'));
  const close = el('button', 'closeX', '×'); close.id = 'staffClose'; close.setAttribute('aria-label', 'Close staff'); head.append(close);
  const body = el('div'); body.id = 'staffBody';
  panel.append(head, body, el('div', 'fine', 'Hiring costs a one-off fee. Wages come out of your cash for every real hour you are online with them hired. If you cannot pay, they quit.'));
  document.body.append(btn, panel);
  const st = document.createElement('style');
  st.textContent = '#staffPanel { bottom: 70px; right: 12px; width: min(360px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 72vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #staffPanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.stCard { display: flex; gap: 12px; align-items: flex-start; padding: 10px; margin: 8px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); }'
    + '.stIcon { font-size: 28px; line-height: 1; } .stMain { flex: 1; min-width: 0; } .stName { font-weight: 700; } .stText { font-size: 13px; opacity: .85; margin: 3px 0; }'
    + '.stMeta { font-size: 12px; opacity: .8; } .stBtn { margin-top: 8px; width: 100%; height: 38px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); }'
    + '.stBtn.fire { background: rgba(200,60,60,.85); color: #fff; } .stBtn:disabled { opacity: .45; } .stLock { font-size: 12px; color: #e8a14a; margin-top: 4px; }';
  document.head.append(st);

  let info = null;
  function paint() {
    if (!info) return;
    body.replaceChildren(el('div', 'fine', `Cash: ${naira(info.cash)}`));
    for (const s of info.list) {
      const card = el('div', 'stCard'), main = el('div', 'stMain');
      main.append(el('div', 'stName', s.label), el('div', 'stText', s.text),
        el('div', 'stMeta', s.hired ? `Hired · ${naira(s.wage)} per hour online · next wage in about ${s.minsToWage} min` : `Hire for ${naira(s.fee)} · then ${naira(s.wage)} per hour online`));
      if (!s.hired && s.locked) main.append(el('div', 'stLock', s.locked));
      const b = el('button', `stBtn${s.hired ? ' fire' : ''}`, s.hired ? 'Let go' : 'Hire');
      b.disabled = !s.hired && Boolean(s.locked);
      b.addEventListener('click', () => socket.emit(s.hired ? 'staffFire' : 'staffHire', s.id));
      main.append(b);
      card.append(el('div', 'stIcon', s.icon), main);
      body.append(card);
    }
  }
  socket.on('staff', (i) => { info = i; if (!panel.hidden) paint(); });
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    if (open) hideOtherPanels('staffPanel');
    panel.hidden = !open;
    if (open) { paint(); socket.emit('staffRefresh'); }
  });
  close.addEventListener('click', () => { panel.hidden = true; });
}
