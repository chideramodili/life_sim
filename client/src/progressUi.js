// Adulthood: the Activities hub (phone app). Daily missions, weekly challenges, careers, achievements and events, plus your level, XP,
// tokens, badges and what each level unlocks. The server counts everything and pays rewards when you tap Claim; this file only shows it.
import { hideOtherPanels } from './panels.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)));

export function initProgress(socket) {
  const btn = el('button'); btn.id = 'goalsBtn'; btn.hidden = true; btn.textContent = 'Activities';
  const badge = el('span'); badge.id = 'goalsBadge'; badge.hidden = true; badge.style.display = 'none'; badge.textContent = '0';
  const panel = el('div', 'panel'); panel.id = 'goalsPanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', 'Activities'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close activities'); head.append(close);
  const tabs = el('div', 'glTabs');
  const TABS = [['daily', 'Daily'], ['weekly', 'Weekly'], ['careers', 'Careers'], ['ach', 'Trophies'], ['events', 'Events'], ['shop', 'Shop']];
  const tabBtn = {};
  for (const [id, label] of TABS) { const b = el('button', 'glTab', label); b.dataset.t = id; tabs.append(b); tabBtn[id] = b; }
  const top = el('div'); top.id = 'goalsTop';
  const body = el('div'); body.id = 'goalsBody';
  panel.append(head, top, tabs, body);
  document.body.append(btn, badge, panel);
  const st = document.createElement('style');
  st.textContent = '#goalsPanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 78vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #goalsPanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.glLevel { display: flex; align-items: center; gap: 12px; padding: 10px; margin: 6px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); }'
    + '.glLv { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: 20px; font-weight: 800; background: var(--hi); color: var(--on-hi); flex: none; }'
    + '.glTitle { font-weight: 700; } .glSub { font-size: 12px; opacity: .8; }'
    + '.glBar { height: 8px; border-radius: 6px; background: var(--line); overflow: hidden; margin-top: 6px; } .glBar i { display: block; height: 100%; background: var(--hi); border-radius: 6px; }'
    + '.glTabs { display: flex; gap: 4px; margin: 8px 0 4px; } .glTab { position: relative; flex: 1; height: 34px; padding: 0 2px; border: 0.5px solid var(--line); border-radius: 10px; background: var(--bg2); color: inherit; font-weight: 700; font-size: 12px; } .glTab.on { background: var(--hi); color: var(--on-hi); }'
    + '.glTab .dot { position: absolute; top: -3px; right: -2px; min-width: 16px; height: 16px; border-radius: 8px; background: #ff4d4d; color: #fff; font-size: 10px; line-height: 16px; text-align: center; }'
    + '.glH { margin: 12px 0 4px; font-weight: 700; display: flex; justify-content: space-between; } .glH span { font-weight: 400; font-size: 12px; opacity: .7; }'
    + '.glRow { padding: 8px 10px; margin: 6px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); } .glRow.done { opacity: .65; } .glRow.ready { border-color: var(--hi); opacity: 1; }'
    + '.glTop { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; } .glRew { font-size: 12px; opacity: .85; white-space: nowrap; }'
    + '.glClaim { margin-top: 8px; width: 100%; height: 36px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); }'
    + '.glChips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; } .glChip { padding: 4px 10px; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); font-size: 12px; }'
    + '.glLock { opacity: .55; }';
  document.head.append(st);

  let tab = 'daily', d = null, event = null, sp = null, spAt = 0;
  const clock = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  const send = (kind, id) => socket.emit('progClaim', { kind, id });
  const bar = (pr, goal) => { const b = el('div', 'glBar'); const i = el('i'); i.style.width = Math.min(100, (pr / goal) * 100) + '%'; b.append(i); return b; };
  const rewardText = (m) => `${naira(m.cash)} · ${m.xp} XP · ${m.tok} 🪙`;
  const mission = (m) => {
    const r = el('div', 'glRow' + (m.got ? ' done' : m.done ? ' ready' : ''));
    const t = el('div', 'glTop'); t.append(el('span', '', (m.got ? '✅ ' : '') + m.text), el('span', 'glRew', rewardText(m)));
    r.append(t, bar(m.pr, m.goal), el('div', 'glSub', m.got ? 'Reward claimed' : m.done ? 'Complete!' : `${short(m.pr)} / ${short(m.goal)}`));
    if (m.done && !m.got) { const c = el('button', 'glClaim', 'Claim reward'); c.addEventListener('click', () => send('m', m.id)); r.append(c); }
    return r;
  };
  const header = () => {
    const lv = el('div', 'glLevel'), mid = el('div'); mid.style.flex = '1';
    mid.append(el('div', 'glTitle', `${d.title}`), el('div', 'glSub', d.max ? `${d.xp.toLocaleString('en-NG')} XP · top level` : `${d.into.toLocaleString('en-NG')} / ${d.need.toLocaleString('en-NG')} XP to level ${d.lvl + 1}`), bar(d.max ? 1 : d.into, d.max ? 1 : d.need));
    mid.append(el('div', 'glSub', `🪙 ${d.tok} tokens · 🏅 ${d.badges.length} badge${d.badges.length === 1 ? '' : 's'}`));
    lv.append(el('div', 'glLv', String(d.lvl)), mid);
    top.append(lv);
  };
  const levelsBlock = () => {
    body.append(el('div', 'glH', 'Level unlocks'));
    for (const u of d.unlocks) body.append(el('div', 'glRow' + (u.got ? '' : ' glLock'), `${u.got ? '🔓' : '🔒'} Level ${u.lvl}: ${u.text}`));
  };
  const paintTabs = () => {
    const n = (id) => (id === 'daily' ? d.daily.filter((m) => m.done && !m.got).length
      : id === 'weekly' ? d.weekly.filter((m) => m.done && !m.got).length + (d.bonus.ready ? 1 : 0)
      : id === 'ach' ? d.ach.filter((a) => a.done && !a.got).length : 0);
    for (const [id] of TABS) {
      tabBtn[id].classList.toggle('on', tab === id);
      const old = tabBtn[id].querySelector('.dot'); if (old) old.remove();
      const c = d ? n(id) : 0;
      if (c) tabBtn[id].append(el('span', 'dot', String(c)));
    }
  };
  const paint = () => {
    top.replaceChildren(); body.replaceChildren();
    if (!d) { return body.append(el('div', 'fine', 'Loading…')); }
    header(); paintTabs();
    if (tab === 'daily') {
      const hrs = Math.max(0, Math.round(d.dailyLeftMs / 3600000));
      const h1 = el('div', 'glH', 'Daily missions'); h1.append(el('span', '', `refresh in about ${hrs} h`)); body.append(h1);
      for (const m of d.daily) body.append(mission(m));
      body.append(el('div', 'fine', 'Complete missions, then tap Claim. Unclaimed rewards are paid for you at the reset.'));
      levelsBlock();
    } else if (tab === 'weekly') {
      const done = d.weekly.filter((m) => m.done).length;
      const h = el('div', 'glH', 'Weekly challenges'); h.append(el('span', '', `${done} / ${d.weekly.length} done · resets Monday`)); body.append(h);
      for (const m of d.weekly) body.append(mission(m));
      const b = el('div', 'glRow' + (d.bonus.got ? ' done' : d.bonus.ready ? ' ready' : ''));
      const t = el('div', 'glTop'); t.append(el('span', '', (d.bonus.got ? '✅ ' : '🎁 ') + 'Finish all five'), el('span', 'glRew', `${naira(d.bonus.cash)} · ${d.bonus.xp} XP · ${d.bonus.tok} 🪙`));
      b.append(t, el('div', 'glSub', 'Bonus reward and a Weekly Champion badge.'));
      if (d.bonus.ready) { const c = el('button', 'glClaim', 'Claim bonus'); c.addEventListener('click', () => send('bonus')); b.append(c); }
      body.append(b);
    } else if (tab === 'careers') {
      body.append(el('div', 'glH', 'Careers'));
      for (const [icon, name, text] of [
        ['🚚', 'Delivery Driver', `Take jobs at the Delivery Depot, then drive packages across the city. ${d.career ? `${d.career.deliv} deliveries so far, ${naira(d.career.earned)} earned.` : ''}`],
        ['🚕', 'Taxi Driver', `Open the Taxi app, go on duty in your own car and take passengers where they want to go. ${d.career ? `${d.career.fares} fares so far, ${naira(d.career.taxiEarned)} earned${d.career.rating ? `, rating ${d.career.rating} ★` : ''}.` : ''}`],
        ['🏪', 'Business Owner', `Own cafes, shops, salons and gyms. Open the Properties app to buy a lot and build, then do management tasks inside it (clean, serve customers, run promotions, train staff) to raise its customer rating. ${d.career ? `${d.career.mgmt} tasks done.` : ''}`],
      ]) { const r = el('div', 'glRow'); const t = el('div', 'glTop'); t.append(el('span', '', `${icon} ${name}`)); r.append(t, el('div', 'glSub', text)); body.append(r); }
      body.append(el('div', 'fine', 'Your day job is still on the Jobs board and the Job Center.'));
    } else if (tab === 'ach') {
      const got = d.ach.filter((a) => a.done).length;
      const h = el('div', 'glH', 'Trophies'); h.append(el('span', '', `${got} / ${d.ach.length}`)); body.append(h);
      if (d.badges.length) { const chips = el('div', 'glChips'); for (const b of d.badges) chips.append(el('span', 'glChip', '🏅 ' + b)); body.append(chips); }
      for (const a of [...d.ach].sort((x, y) => Number(y.done && !y.got) - Number(x.done && !x.got) || Number(y.done) - Number(x.done))) {
        const r = el('div', 'glRow' + (a.got ? ' done' : a.done ? ' ready' : ''));
        const t = el('div', 'glTop'); t.append(el('span', '', (a.done ? '🏆 ' : '🔒 ') + a.name), el('span', 'glRew', naira(a.cash) + (a.xp ? ` · ${a.xp} XP` : '')));
        r.append(t, el('div', 'glSub', a.text));
        if (!a.done) r.append(bar(a.pr, a.goal), el('div', 'glSub', `${short(a.pr)} / ${short(a.goal)}`));
        if (a.done && !a.got) { const c = el('button', 'glClaim', 'Claim reward'); c.addEventListener('click', () => send('a', a.id)); r.append(c); }
        body.append(r);
      }
    } else if (tab === 'shop') {
      body.append(el('div', 'glH', 'Token shop'));
      body.append(el('div', 'glSub', `You have 🪙 ${d.tok} tokens. Earn them from missions, treasure chests and rallies.`));
      for (const it of (sp ? sp.shop : [])) {
        const r = el('div', 'glRow' + (it.owned ? ' done' : ''));
        const t = el('div', 'glTop'); t.append(el('span', '', it.name), el('span', 'glRew', `${it.cost} 🪙`));
        r.append(t, el('div', 'glSub', it.text));
        if (it.owned) r.append(el('div', 'glSub', 'Owned'));
        else { const c = el('button', 'glClaim', d.tok >= it.cost ? 'Buy' : `Need ${it.cost - d.tok} more`); c.disabled = d.tok < it.cost; c.addEventListener('click', () => socket.emit('shopBuy', it.id)); r.append(c); }
        body.append(r);
      }
    } else {
      body.append(el('div', 'glH', 'Special events'));
      const a = sp && sp.active;
      if (a) {
        const left = Math.max(0, a.secondsLeft - Math.floor((Date.now() - spAt) / 1000));
        const r = el('div', 'glRow ready');
        r.append(el('div', 'glTop', `${a.icon} ${a.title} · ${clock(left)} left`), el('div', 'glSub', a.text));
        if (a.id === 'hunt') r.append(bar(a.found, a.total || 1), el('div', 'glSub', `${a.found} / ${a.total} chests found in this city. Follow the glowing pillar.`));
        else if (!a.joined) { const c = el('button', 'glClaim', 'Join the rally'); c.addEventListener('click', () => socket.emit('rallyJoin')); r.append(c); }
        else r.append(bar(a.found, a.total || 1), el('div', 'glSub', a.finished ? `Finished in ${(a.myMs / 1000).toFixed(1)} s` : `Checkpoint ${a.found} / ${a.total}. Drive your car to the glowing pillar.`));
        if (a.id === 'rally' && a.results && a.results.length) { r.append(el('div', 'glSub', 'Fastest so far:')); a.results.forEach((x, k) => r.append(el('div', 'glSub', `${k + 1}. ${x.name} · ${(x.ms / 1000).toFixed(1)} s`))); }
        body.append(r);
      } else if (sp) body.append(el('div', 'fine', `Next special event in about ${Math.max(1, Math.ceil(sp.nextInSeconds / 60))} min. Treasure Hunts and Driving Rallies take turns.`));
      if (event) { const r = el('div', 'glRow ready'); r.append(el('div', 'glTop', '📣 ' + event.title), el('div', 'glSub', event.text)); body.append(r); }
      else body.append(el('div', 'fine', 'No city announcement right now.'));
    }
  };
  socket.on('progress', (x) => {
    d = x;
    badge.hidden = !x.claimable; badge.textContent = String(x.claimable);
    if (!panel.hidden) paint();
  });
  socket.on('special', (x) => { sp = x; spAt = Date.now(); if (!panel.hidden && (tab === 'events' || tab === 'shop')) paint(); });
  socket.on('event', (e) => { event = e; if (!panel.hidden && tab === 'events') paint(); });
  tabs.addEventListener('click', (e) => { const b = e.target.closest('.glTab'); if (b) { tab = b.dataset.t; paint(); } });
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    if (open) hideOtherPanels('goalsPanel');
    panel.hidden = !open;
    if (open) { paint(); socket.emit('progOpen'); socket.emit('specialOpen'); }
  });
  close.addEventListener('click', () => { panel.hidden = true; });
}
