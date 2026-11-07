// Adulthood: Friends. Add friends by username or phone number, private messages, share your number, send money.
// The server owns the truth (who is a friend, limits, messages). This file only shows it and sends requests.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function initFriends(socket) {
  let info = null;
  let chatWith = null;       // friend whose chat is open
  let messages = [];
  let sig = '';

  const badge = () => {
    const n = info ? info.unread + info.incoming.length : 0;
    $('friendsBadge').hidden = !n;
    $('friendsBadge').textContent = n;
  };

  function paintList() {
    if (!info) return;
    const s = JSON.stringify(info);
    if (s === sig) return;
    sig = s;
    badge();
    $('friendsPhone').textContent = info.phone ? `Your phone number: ${info.phone}` : '';
    const inc = $('friendsIncoming');
    inc.replaceChildren();
    if (info.incoming.length) inc.append(el('div', 'jlabel', 'Friend requests'));
    for (const n of info.incoming) {
      const row = el('div', 'person');
      row.append(el('div', 'skillName', n));
      const yes = el('button', 'mini hot', 'Accept');
      yes.addEventListener('click', () => socket.emit('friendRespond', { name: n, accept: true }));
      const no = el('button', 'mini', 'Decline');
      no.addEventListener('click', () => socket.emit('friendRespond', { name: n, accept: false }));
      row.append(yes, no);
      inc.append(row);
    }
    const list = $('friendsList');
    list.replaceChildren();
    if (!info.friends.length) list.append(el('div', 'fine', 'No friends yet. Add someone by username or phone number, or tap Add next to a player nearby.'));
    for (const f of info.friends) {
      const row = el('button', 'decoItem');
      row.append(el('span', null, `${f.online ? '🟢' : '⚪'} ${f.name}`), el('span', 'tagc', f.unread ? `${f.unread} new` : f.online ? 'Online' : 'Offline'));
      row.addEventListener('click', () => openChat(f.name));
      list.append(row);
    }
    const out = $('friendsOut');
    out.replaceChildren();
    for (const n of info.outgoing) {
      const row = el('div', 'person');
      row.append(el('div', 'billWho', `Request sent to ${n}`));
      const b = el('button', 'mini', 'Cancel');
      b.addEventListener('click', () => socket.emit('friendRemove', { name: n }));
      row.append(b);
      out.append(row);
    }
    const here = $('friendsHere');
    here.replaceChildren();
    if (info.here.length) here.append(el('div', 'jlabel', 'Players nearby'));
    for (const n of info.here) {
      const row = el('div', 'person');
      row.append(el('div', 'skillName', n));
      const b = el('button', 'mini', 'Add');
      b.addEventListener('click', () => socket.emit('friendAdd', { name: n }));
      row.append(b);
      here.append(row);
    }
    $('moneyLimit').textContent = `You can send ₦${fmt(info.limits.min)} to ₦${fmt(info.limits.perSend)} at a time, up to ₦${fmt(info.limits.perDay)} a day.`;
  }

  function paintChat() {
    $('friendsMain').hidden = Boolean(chatWith);
    $('friendsChat').hidden = !chatWith;
    if (!chatWith) return;
    $('chatWithName').textContent = chatWith;
    const box = $('dmBox');
    box.replaceChildren();
    if (!messages.length) box.append(el('div', 'fine', 'No messages yet. Say hello!'));
    for (const m of messages) {
      const b = el('div', `dm ${m.mine ? 'mine' : 'theirs'}${m.kind === 'money' ? ' money' : ''}`, `${m.kind === 'money' ? '💸 ' : m.kind === 'phone' ? '📱 ' : ''}${m.text}`);
      box.append(b);
    }
    box.scrollTop = box.scrollHeight;
  }

  function openChat(name) {
    chatWith = name;
    messages = [];
    paintChat();
    socket.emit('dmOpen', { with: name });
  }
  function closeChat() {
    chatWith = null;
    paintChat();
    socket.emit('friendsOpen');
  }

  socket.on('friends', (f) => {
    info = f;
    paintList();
    if (chatWith && !info.friends.some((x) => x.name === chatWith)) closeChat();
  });
  socket.on('dmThread', (t) => {
    if (t.with !== chatWith) return;
    messages = t.messages;
    paintChat();
  });
  socket.on('dm', (m) => {
    if (chatWith && m.with === chatWith) {
      messages.push({ mine: m.mine, text: m.text, kind: m.kind, at: m.at });
      if (messages.length > 60) messages.shift();
      paintChat();
      if (!m.mine) socket.emit('dmOpen', { with: chatWith }); // mark it read
    }
  });

  const submitAdd = () => {
    const v = $('friendInput').value.trim();
    if (!v) return;
    socket.emit('friendAdd', /^[\d\s-]{8,}$/.test(v) ? { phone: v } : { name: v });
    $('friendInput').value = '';
  };
  $('friendAddBtn').addEventListener('click', submitAdd);
  $('friendInput').addEventListener('keydown', (e) => e.key === 'Enter' && submitAdd());
  $('dmSendBtn').addEventListener('click', () => {
    const t = $('dmInput').value.trim();
    if (!t || !chatWith) return;
    socket.emit('dmSend', { to: chatWith, text: t });
    $('dmInput').value = '';
  });
  $('dmInput').addEventListener('keydown', (e) => e.key === 'Enter' && $('dmSendBtn').click());
  $('dmPhoneBtn').addEventListener('click', () => chatWith && socket.emit('sharePhone', { to: chatWith }));
  $('moneyBtn').addEventListener('click', () => {
    const amount = Math.floor(Number($('moneyInput').value));
    if (!chatWith || !Number.isFinite(amount) || amount <= 0) return;
    if (!confirm(`Send ₦${fmt(amount)} to ${chatWith}? You cannot take it back.`)) return;
    socket.emit('sendMoney', { to: chatWith, amount });
    $('moneyInput').value = '';
  });
  $('dmRemoveBtn').addEventListener('click', () => {
    if (chatWith && confirm(`Remove ${chatWith} from your friends?`)) socket.emit('friendRemove', { name: chatWith });
  });
  $('dmBlockBtn').addEventListener('click', () => {
    if (chatWith && confirm(`Block ${chatWith}? They are removed and muted.`)) socket.emit('friendRemove', { name: chatWith, block: true });
  });
  $('dmBack').addEventListener('click', closeChat);

  $('friendsBtn').addEventListener('click', () => {
    const open = $('friendsPanel').hidden;
    hideOtherPanels();
    $('friendsPanel').hidden = !open;
    if (open) {
      chatWith = null;
      sig = '';
      paintChat();
      paintList();
      socket.emit('friendsOpen');
    }
  });
  $('friendsClose').addEventListener('click', () => ($('friendsPanel').hidden = true));

  return {
    reset() {
      info = null;
      chatWith = null;
      messages = [];
      sig = '';
      $('friendsPanel').hidden = true;
      badge();
    },
  };
}