// Story screens: chapter card, event pop-up, message banner and chat, and the journal.
// The server decides what is on screen. This file only draws it and sends the player's picks back.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function initStory(socket) {
  let story = null;
  let openedId = null;    // the message currently open in the chat sheet
  let dismissedId = null; // a message the player chose to answer later

  const ack = (id) => socket.emit('storyAck', id);
  const pick = (id, idx) => socket.emit('storyChoose', { id, idx });
  const button = (cls, text, onClick) => {
    const b = el('button', cls, text);
    b.addEventListener('click', onClick);
    return b;
  };

  function hideAll() {
    for (const id of ['modal', 'banner', 'chat', 'backdrop']) $(id).hidden = true;
  }

  function reset() {
    story = null;
    openedId = null;
    dismissedId = null;
    hideAll();
    $('chip').hidden = true;
    $('journal').hidden = true;
  }

  function objectivesList(list) {
    const box = el('div', 'objs');
    for (const o of list) {
      const row = el('div', 'obj' + (o.done ? ' done' : ''));
      row.append(el('span', '', o.done ? '✓' : '○'), el('span', '', o.text));
      box.append(row);
    }
    return box;
  }

  function chipRow(chips) {
    const row = el('div', 'chiprow');
    for (const c of chips) row.append(el('span', 'rchip ' + (c.includes('−') ? 'bad' : 'good'), c));
    return row;
  }

  function showCard(a) {
    const m = $('modal');
    m.replaceChildren(
      el('div', 'kicker', a.recap ? 'Chapter complete' : 'New chapter'),
      el('div', 'mtitle', a.title),
      el('div', 'mtext', a.text),
      objectivesList(a.objectives)
    );
    if (a.recap && a.recap.length) {
      const r = el('div', 'recap');
      for (const line of a.recap) r.append(el('div', '', line));
      m.append(r);
    }
    if (a.reward && a.reward.length) m.append(el('div', 'reward', 'Reward: ' + a.reward.join(', ')));
    m.append(button('big', a.recap ? 'Continue' : 'Start chapter', () => ack(a.id)));
    $('backdrop').hidden = false;
    m.hidden = false;
  }

  function showEvent(a) {
    const m = $('modal');
    m.replaceChildren(el('div', 'kicker', 'Event'), el('div', 'mtitle', a.title), el('div', 'mtext', a.text));
    if (a.stage === 'choose') {
      a.choices.forEach((label, i) => m.append(button('choice', label, () => pick(a.id, i))));
      m.append(el('div', 'fine', 'Your choice is saved and changes later scenes.'));
    } else {
      m.append(el('div', 'bub me', a.pickLabel), el('div', 'mtext', a.result));
      if (a.chips && a.chips.length) m.append(chipRow(a.chips));
      m.append(button('big', 'Continue', () => ack(a.id)));
    }
    $('backdrop').hidden = false;
    m.hidden = false;
  }

  function showBanner(a) {
    const b = $('banner');
    const words = el('div', 'bwords');
    words.append(el('div', 'bwho', a.who), el('div', 'bprev', a.text));
    const top = el('div', 'brow');
    top.append(el('div', 'avatar'), words);
    const btns = el('div', 'bbtns');
    btns.append(
      button('mini', 'Later', () => { dismissedId = a.id; openedId = null; render(); }),
      button('mini hot', 'Open', () => { openedId = a.id; dismissedId = null; render(); })
    );
    b.replaceChildren(top, btns);
    b.hidden = false;
  }

  function showChat(a) {
    const c = $('chat');
    const head = el('div', 'chead');
    head.append(el('span', '', a.who));
    if (a.stage === 'choose') {
      const x = button('closeX', '×', () => { dismissedId = a.id; openedId = null; render(); });
      x.setAttribute('aria-label', 'Answer later');
      head.append(x);
    }
    c.replaceChildren(head, el('div', 'bub', a.text));
    if (a.stage === 'choose') {
      const box = el('div', 'choices');
      a.choices.forEach((label, i) => box.append(button('choice', label, () => pick(a.id, i))));
      c.append(box);
    } else {
      c.append(el('div', 'bub me', a.pickLabel));
      if (a.result) c.append(el('div', 'bub', a.result));
      if (a.chips && a.chips.length) c.append(chipRow(a.chips));
      c.append(button('big', 'Continue', () => ack(a.id)));
    }
    $('backdrop').hidden = false;
    c.hidden = false;
  }

  function renderJournal() {
    const body = $('journalBody');
    body.replaceChildren(el('div', 'jlabel', 'Objectives'), objectivesList(story.chapter.objectives), el('div', 'jlabel', 'Saved choices'));
    const saved = el('div', 'saved');
    if (story.flags.length) for (const f of story.flags) saved.append(el('span', 'tagc', f));
    else saved.append(el('span', 'fine', 'None yet'));
    body.append(saved);
    const a = story.active;
    if (a && a.type === 'message' && a.stage === 'choose' && dismissedId === a.id) {
      body.append(button('big', `Open message from ${a.who}`, () => {
        openedId = a.id;
        dismissedId = null;
        $('journal').hidden = true;
        render();
      }));
    }
  }

  function render() {
    if (!story) return;
    const ch = story.chapter;
    const a = story.active;
    const waiting = Boolean(a && a.type === 'message' && a.stage === 'choose' && dismissedId === a.id);
    const next = ch.objectives.find((o) => !o.done);
    $('chip').hidden = false;
    $('chipTitle').textContent = ch.title;
    $('chipNext').textContent = ch.finished ? 'Chapter complete' : next ? `Next: ${next.text}` : '';
    $('chipBadge').hidden = !waiting;
    renderJournal();
    hideAll();
    if (!a) {
      openedId = null;
      return;
    }
    if (a.type === 'card') showCard(a);
    else if (a.type === 'event') showEvent(a);
    else if (a.stage === 'result' || openedId === a.id) showChat(a);
    else if (dismissedId !== a.id) showBanner(a);
  }

  socket.on('story', (s) => {
    story = s;
    render();
  });
  $('chip').addEventListener('click', () => {
    if (story) $('journal').hidden = !$('journal').hidden;
  });
  $('journalClose').addEventListener('click', () => ($('journal').hidden = true));

  return { reset };
}