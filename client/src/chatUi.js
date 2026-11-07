// Chat screen: the message list, the send box, the report and mute menu, and the muted-players list.
// The server filters and delivers messages. This file only draws them and sends the player's requests.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const button = (cls, text, onClick) => {
  const b = el('button', cls, text);
  b.addEventListener('click', onClick);
  return b;
};

export function initChat(socket) {
  const MAX_SHOWN = 60;
  let messages = [];
  let muted = [];
  let unread = 0;
  let menuFor = null;     // index of the message whose Report / Mute menu is open
  let showMuted = false;  // showing the muted-players list instead of the messages

  const isOpen = () => !$('chatPanel').hidden;

  function renderBadge() {
    $('chatBadge').hidden = unread === 0;
    $('chatBadge').textContent = String(unread);
  }

  function render() {
    $('mutedBtn').textContent = `Muted (${muted.length})`;
    const list = $('chatList');
    list.replaceChildren();
    if (showMuted) {
      if (!muted.length) list.append(el('div', 'cm sys', 'You have not muted anyone.'));
      for (const name of muted) {
        const row = el('div', 'cm mrow');
        row.append(el('span', '', name), button('mini', 'Unmute', () => socket.emit('unmute', name)));
        list.append(row);
      }
      return;
    }
    messages.forEach((m, i) => {
      const row = el('div', 'cm' + (m.system ? ' sys' : '') + (m.self ? ' self' : ''));
      if (m.system) {
        row.textContent = m.text;
        list.append(row);
        return;
      }
      const line = el('div', 'cline');
      line.append(el('span', 'nm', m.self ? 'You' : m.name), el('span', '', ' ' + m.text));
      if (!m.self) line.append(button('dots', '⋯', () => { menuFor = menuFor === i ? null : i; render(); }));
      row.append(line);
      if (menuFor === i) {
        const menu = el('div', 'cmenu');
        menu.append(
          button('mini', 'Report', () => { socket.emit('report', { sid: m.sid }); menuFor = null; render(); }),
          button('mini', 'Mute', () => { socket.emit('mute', { sid: m.sid }); menuFor = null; render(); }),
          button('mini', 'Cancel', () => { menuFor = null; render(); })
        );
        row.append(menu);
      }
      list.append(row);
    });
    list.scrollTop = list.scrollHeight;
  }

  function send() {
    const input = $('chatInput');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chat', text);
    input.value = '';
  }

  function setOpen(open) {
    if (open) {
      for (const id of ['sheet', 'journal', 'map']) $(id).hidden = true; // one panel at a time on small screens
      unread = 0;
      renderBadge();
    }
    $('chatPanel').hidden = !open;
    render();
  }

  socket.on('chat', (m) => {
    messages.push({ sid: m.sid, name: m.name, text: m.text, self: m.sid === socket.id });
    if (messages.length > MAX_SHOWN) messages.shift();
    if (!isOpen() && m.sid !== socket.id) {
      unread += 1;
      renderBadge();
    }
    render();
  });
  socket.on('mutes', (list) => {
    muted = Array.isArray(list) ? list : [];
    render();
  });
  socket.on('room', (info) => {
    messages = [{ system: true, text: `You are in the ${info.name}.` }];
    menuFor = null;
    $('chatTitle').textContent = `Chat · ${info.name}`;
    render();
  });

  $('chatBtn').addEventListener('click', () => setOpen(!isOpen()));
  $('chatClose').addEventListener('click', () => setOpen(false));
  $('chatSend').addEventListener('click', send);
  $('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });
  $('mutedBtn').addEventListener('click', () => {
    showMuted = !showMuted;
    render();
  });

  return {
    reset() {
      messages = [];
      muted = [];
      unread = 0;
      menuFor = null;
      showMuted = false;
      $('chatPanel').hidden = true;
      renderBadge();
      render();
    },
  };
}