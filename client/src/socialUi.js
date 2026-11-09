// Adulthood: people, quests, and vehicles on screen. The server owns the truth. This file only shows it and sends requests.
import { hideOtherPanels } from './panels.js';
import { carThumb, loadCar } from './vehicles.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function initSocial(socket) {
  let people = null;
  let peopleSig = '';
  let dialogNpc = null;   // id of the person you are talking to, or null
  let vehicles = null;
  let vehiclesSig = '';

  // ----- People panel -----
  function paintPeople() {
    if (!people) return;
    const sig = JSON.stringify(people);
    if (sig === peopleSig) return;
    peopleSig = sig;
    // If the person you were talking to has gone, close the conversation.
    if (dialogNpc && !people.here.some((p) => p.id === dialogNpc)) closeDialog();

    const list = $('peopleList');
    list.replaceChildren();
    if (!people.here.length) list.append(el('div', 'fine', 'Nobody here to talk to right now. People hang around certain places at certain times.'));
    for (const p of people.here) {
      const row = el('div', 'person');
      const info = el('div');
      info.append(el('div', 'skillName', p.name), el('div', 'billWho', `${p.role} · ${p.relLabel}`));
      const b = el('button', 'mini hot', 'Talk');
      b.addEventListener('click', () => socket.emit('npcTalk', p.id));
      row.append(info, b);
      list.append(row);
    }
    const ql = $('questList');
    ql.replaceChildren();
    if (!people.quests.length) ql.append(el('div', 'fine', 'No active quests. Get to know people and ask if they need help.'));
    for (const q of people.quests) {
      const row = el('div', 'quest');
      row.append(el('div', 'skillName', q.title), el('div', q.ready ? 'billWhen' : 'billWho', q.text));
      if (q.ready) row.querySelector('.billWhen').style.color = 'var(--good)';
      ql.append(row);
    }
    // A little dot on the People button when a quest is ready to hand in.
    $('peopleBadge').hidden = !people.quests.some((q) => q.ready);
  }
  socket.on('people', (p) => {
    people = p;
    paintPeople();
  });

  // ----- Conversation -----
  function closeDialog() {
    dialogNpc = null;
    $('dialog').hidden = true;
    $('peopleMain').hidden = false;
  }
  socket.on('npcDialog', (d) => {
    dialogNpc = d.id;
    $('peopleMain').hidden = true;
    $('dialog').hidden = false;
    $('dlgName').textContent = d.name;
    $('dlgRole').textContent = `${d.role} · ${d.relLabel} (${d.rel}/100)`;
    $('dlgFill').style.width = `${d.rel}%`;
    $('dlgLine').textContent = d.compliment ? `${d.line}\n\n“${d.compliment.text}”` : d.line;
    const box = $('dlgTopics');
    box.replaceChildren();
    for (const t of d.topics) {
      const b = el('button', 'mini hot topic', t.label);
      b.disabled = Boolean(t.why);
      b.addEventListener('click', () => socket.emit('npcChoose', { npc: d.id, topic: t.id }));
      box.append(b);
      if (t.why) box.append(el('div', 'modeWhy no', t.why));
    }
  });
  $('dlgBack').addEventListener('click', closeDialog);

  // ----- Vehicles -----
  function paintVehicles() {
    if (!vehicles) return;
    const sig = JSON.stringify(vehicles);
    if (sig === vehiclesSig) return;
    vehiclesSig = sig;
    const body = $('carsBody');
    body.replaceChildren();
    let tier = null;
    for (const v of vehicles.list) {
      if (v.tier !== tier) { tier = v.tier; body.append(el('div', 'billWho', tier.toUpperCase())); }
      const row = el('div', 'job');
      const head = el('div', 'skillHead');
      head.append(el('span', 'skillName', v.label), el('span', 'tagc', `₦${fmt(v.cost)}`));
      if (v.model) {
        const url = carThumb(v.model);
        if (url) { const img = el('img', 'carThumb'); img.src = url; img.alt = v.label; row.append(img); } else loadCar(v.model).then(() => { vehiclesSig = ''; paintVehicles(); });
      }
      const btn = v.owned
        ? el('button', 'mini hot billPay', v.using ? 'You drive this' : 'Drive this one')
        : el('button', 'mini hot billPay', vehicles.here ? 'Buy' : 'Kanis Motors is closed');
      btn.disabled = v.owned ? v.using : !vehicles.here;
      btn.addEventListener('click', () => socket.emit(v.owned ? 'useVehicle' : 'buyVehicle', v.id));
      row.append(head, el('div', 'billWho', v.text), btn);
      body.append(row);
    }
  }
  socket.on('vehicles', (v) => {
    vehicles = v;
    paintVehicles();
  });

  // ----- Buttons -----
  function toggle(panelId) {
    const open = $(panelId).hidden;
    if (open) hideOtherPanels(); // one panel at a time on small screens
    $(panelId).hidden = !open;
    if (open) {
      peopleSig = '';
      vehiclesSig = '';
      paintPeople();
      paintVehicles();
    }
  }
  $('peopleBtn').addEventListener('click', () => toggle('peoplePanel'));
  $('peopleClose').addEventListener('click', () => ($('peoplePanel').hidden = true));
  $('carsBtn').addEventListener('click', () => toggle('carsPanel'));
  $('carsClose').addEventListener('click', () => ($('carsPanel').hidden = true));

  socket.on('me', (m) => {
    const atGarage = m.room === 'garage';
    $('carsBtn').hidden = !atGarage;
    if (!atGarage) $('carsPanel').hidden = true;
  });

  return {
    reset() {
      people = null;
      vehicles = null;
      peopleSig = '';
      vehiclesSig = '';
      closeDialog();
      $('peopleList').replaceChildren();
      $('questList').replaceChildren();
      $('carsBody').replaceChildren();
      for (const id of ['peoplePanel', 'carsPanel']) $(id).hidden = true;
      $('carsBtn').hidden = true;
      $('peopleBadge').hidden = true;
    },
  };
}
