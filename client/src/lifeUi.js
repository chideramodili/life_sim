// Adulthood: the life screens. Skills, the Jobs board, stress and sickness, and the Pharmacy button.
// The server owns the truth. This file only shows it and sends requests.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const MODE_ORDER = ['book', 'course', 'practice'];

export function initLife(socket) {
  let skills = null;
  let jobs = null;
  const skillRows = new Map(); // skill id -> elements
  const jobRows = new Map();   // job id -> elements
  let inJobsRoom = false;

  // ----- Skills panel -----
  function buildSkill(s) {
    const row = el('div', 'skill');
    const head = el('div', 'skillHead');
    const name = el('span', 'skillName', s.label);
    const lvl = el('span', 'tagc');
    head.append(name, lvl);
    const bar = el('div', 'nbar');
    const fill = el('div', 'nfill');
    bar.append(fill);
    const xp = el('div', 'skillXp');
    const btns = el('div', 'skillBtns');
    const modeEls = {};
    for (const m of MODE_ORDER) {
      const wrap = el('div', 'modeWrap');
      const b = el('button', 'mini hot');
      b.addEventListener('click', () => socket.emit('study', { skill: s.id, mode: m }));
      const why = el('div', 'modeWhy');
      wrap.append(b, why);
      btns.append(wrap);
      modeEls[m] = { wrap, b, why };
    }
    row.append(head, bar, xp, btns);
    $('skillsBody').append(row);
    skillRows.set(s.id, { lvl, fill, xp, modeEls });
  }

  function paintSkills() {
    if (!skills) return;
    for (const s of skills) {
      if (!skillRows.has(s.id)) buildSkill(s);
      const r = skillRows.get(s.id);
      r.lvl.textContent = `Level ${s.level}`;
      r.fill.style.width = s.need ? `${Math.round((s.into / s.need) * 100)}%` : '100%';
      r.xp.textContent = s.need ? `${s.into} / ${s.need} XP to level ${s.level + 1}` : 'Maxed out';
      for (const m of MODE_ORDER) {
        const info = s.modes[m];
        const e = r.modeEls[m];
        e.wrap.hidden = !info;
        if (!info) continue;
        e.b.textContent = `${info.label}${info.cost ? ` ₦${fmt(info.cost)}` : ''} · +${info.xp} XP`;
        e.b.disabled = Boolean(info.why);
        e.why.textContent = info.why || `At the ${info.where}`;
        e.why.className = info.why ? 'modeWhy no' : 'modeWhy';
      }
    }
  }
  socket.on('skills', (s) => {
    skills = s;
    paintSkills();
  });

  // ----- Jobs board -----
  function buildJob(j) {
    const row = el('div', 'job');
    const head = el('div', 'skillHead');
    const name = el('span', 'skillName', j.title);
    const pay = el('span', 'tagc');
    head.append(name, pay);
    const where = el('div', 'billWho');
    const req = el('div', 'billWhen');
    const perk = el('div', 'perkLine');
    const btn = el('button', 'mini hot billPay');
    btn.addEventListener('click', () => socket.emit('applyJob', j.id));
    row.append(head, where, req, perk, btn);
    $('jobsBody').append(row);
    jobRows.set(j.id, { name, pay, where, req, perk, btn });
  }
  function paintJobs() {
    if (!jobs) return;
    for (const j of jobs.list) {
      if (!jobRows.has(j.id)) buildJob(j);
      const r = jobRows.get(j.id);
      const mine = jobs.current === j.id || jobs.current2 === j.id || jobs.current3 === j.id;
      r.pay.textContent = `₦${fmt(j.pay)} / shift`;
      r.where.textContent = `${j.part ? 'Part-time · ' : ''}${j.where} · Needs: ${j.req}`;
      r.perk.textContent = j.perk ? `Skill perk: ${j.perk}` : '';
      r.req.textContent = mine ? 'Your current job' : j.qualified ? 'You qualify' : j.why;
      r.req.className = mine || j.qualified ? 'billWhen' : 'billNote';
      r.btn.hidden = mine;
      r.btn.disabled = !j.qualified || !jobs.here;
      r.btn.textContent = !j.qualified ? 'Not qualified' : !jobs.here ? 'Jobs Center is closed' : j.part ? 'Take this part-time job' : 'Take this job';
    }
    $('quitJob').hidden = !jobs.current;
    $('quitJob2').hidden = !jobs.current2;
    $('quitJob3').hidden = !jobs.current3;
  }
  socket.on('jobs', (j) => {
    jobs = j;
    paintJobs();
  });
  $('quitJob').addEventListener('click', () => socket.emit('quitJob', 'main'));
  $('quitJob2').addEventListener('click', () => socket.emit('quitJob', 'part'));
  $('quitJob3').addEventListener('click', () => socket.emit('quitJob', 'extra'));

  // ----- Buttons and panels -----
  function toggle(panelId) {
    const open = $(panelId).hidden;
    if (open) hideOtherPanels(); // one panel at a time on small screens
    $(panelId).hidden = !open;
    if (open && panelId === 'skillsPanel') paintSkills();
    if (open && panelId === 'jobsPanel') paintJobs();
  }
  $('skillsBtn').addEventListener('click', () => toggle('skillsPanel'));
  $('skillsClose').addEventListener('click', () => ($('skillsPanel').hidden = true));
  $('jobsBtn').addEventListener('click', () => toggle('jobsPanel'));
  $('jobsClose').addEventListener('click', () => ($('jobsPanel').hidden = true));
  $('medBtn').addEventListener('click', () => socket.emit('buyMedicine'));

  // ----- Wellness (stress, burnout, sickness) -----
  socket.on('me', (m) => {
    // The Jobs button only shows at the Jobs Center.
    inJobsRoom = m.room === 'jobs';
    $('jobsBtn').hidden = !inJobsRoom;
    if (!inJobsRoom) $('jobsPanel').hidden = true;

    if (m.rep) {
      const pct = Math.round(((m.rep.score + 100) / 200) * 100);
      $('repText').textContent = `${m.rep.tier} (${m.rep.score > 0 ? '+' : ''}${m.rep.score})`;
      $('repFill').style.width = `${pct}%`;
      $('repFill').style.background = m.rep.score < -10 ? 'var(--danger)' : 'var(--hi)';
      $('repPct').textContent = m.rep.tier;
    }
    const w = m.wellness;
    if (!w) return;
    $('stressFill').style.width = `${w.stress}%`;
    $('stressFill').style.background = w.stress >= 70 ? 'var(--danger)' : 'var(--hi)';
    $('stressPct').textContent = `${w.stress}%`;
    const status = w.sick ? 'Sick' : w.burnout ? 'Burned out' : '';
    $('statusRow').hidden = !status;
    $('status').textContent = status;
    $('wellNote').textContent = w.sick
      ? 'You have a cold. You cannot work or study. Rest, or buy medicine at the Pharmacy.'
      : w.burnout
        ? 'You are burned out. Sleep (best at Home), play, or chat until stress drops to 50%.'
        : 'Work and study add stress. Sleeping, playing, chatting and exercise lower it.';
    // Medicine is sold at the Pharmacy, and only matters when you are sick.
    window.__sick = Boolean(w.sick);
    $('medBtn').hidden = !(m.room === 'pharmacy' && w.sick);
  });

  return {
    reset() {
      skills = null;
      jobs = null;
      skillRows.clear();
      jobRows.clear();
      $('skillsBody').replaceChildren();
      $('jobsBody').replaceChildren();
      for (const id of ['skillsPanel', 'jobsPanel']) $(id).hidden = true;
      $('statusRow').hidden = true;
      $('medBtn').hidden = true;
      $('jobsBtn').hidden = true;
    },
  };
}
