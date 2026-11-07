// Adulthood: friends knocking on your door. A small pop-up with "Let in" and "Not now".
const $ = (id) => document.getElementById(id);

export function initVisit(socket) {
  const box = $('knockBox');
  const waiting = new Map(); // name -> timer

  function drop(name) {
    clearTimeout(waiting.get(name));
    waiting.delete(name);
    const row = box.querySelector(`[data-name="${CSS.escape(name)}"]`);
    if (row) row.remove();
    box.hidden = waiting.size === 0;
  }
  socket.on('knock', ({ name }) => {
    if (typeof name !== 'string' || waiting.has(name)) return;
    const row = document.createElement('div');
    row.className = 'knockRow';
    row.dataset.name = name;
    const t = document.createElement('span');
    t.textContent = `${name} is at your door`;
    const yes = document.createElement('button');
    yes.textContent = 'Let in';
    yes.addEventListener('click', () => { socket.emit('knockReply', { name, ok: true }); drop(name); });
    const no = document.createElement('button');
    no.textContent = 'Not now';
    no.className = 'no';
    no.addEventListener('click', () => { socket.emit('knockReply', { name, ok: false }); drop(name); });
    row.append(t, yes, no);
    box.appendChild(row);
    box.hidden = false;
    waiting.set(name, setTimeout(() => drop(name), 30000));
  });
  // Leaving your home closes the pop-up: nobody can be let in from outside.
  socket.on('me', (m) => { if (m.room !== 'home') for (const n of [...waiting.keys()]) drop(n); });
}