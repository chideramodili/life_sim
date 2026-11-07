// Adulthood: minigames (chess, 21, Word Race). The server holds the game and checks every move; this file draws what it sends.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const PIECES = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const KINDS = [['chess', '♟️ Chess'], ['twentyone', '🃏 21 (cards)'], ['words', '🔤 Word Race']];

export function initGames(socket, { names, myName }) {
  const panel = $('gamePanel'), body = $('gameBody'), btn = $('gameBtn');
  let game = null, sel = -1, invites = [], tick = 0;
  $('gameClose').addEventListener('click', () => { panel.hidden = true; });
  btn.addEventListener('click', () => { if (game && !game.over) { paintGame(); panel.hidden = false; hideOtherPanels('gamePanel'); } else { paintLobby(); panel.hidden = false; hideOtherPanels('gamePanel'); } });

  function paintLobby() {
    $('gameTitle').textContent = 'Games';
    body.replaceChildren();
    for (const inv of invites) {
      const row = el('div', 'job');
      row.append(el('div', 'billWho', `${inv.from} invites you to ${KINDS.find((k) => k[0] === inv.kind)[1]}`));
      const yes = el('button', 'gbtn on', 'Accept'), no = el('button', 'gbtn', 'Not now');
      yes.addEventListener('click', () => { socket.emit('gameReply', { name: inv.from, ok: true }); invites = invites.filter((x) => x !== inv); paintLobby(); });
      no.addEventListener('click', () => { socket.emit('gameReply', { name: inv.from, ok: false }); invites = invites.filter((x) => x !== inv); paintLobby(); });
      row.append(yes, no);
      body.append(row);
    }
    const others = names();
    if (!others.length) { body.append(el('div', 'fine', 'Nobody else is here. Games are played with someone standing in the same place as you.')); return; }
    body.append(el('div', 'fine', 'Pick a player and a game. They have to accept.'));
    for (const n of others) {
      const row = el('div', 'job');
      row.append(el('div', 'billWho', n));
      for (const [k, label] of KINDS) {
        const b = el('button', 'gbtn', label);
        b.addEventListener('click', () => socket.emit('gameInvite', { name: n, kind: k }));
        row.append(b);
      }
      body.append(row);
    }
  }

  function paintGame() {
    const g = game;
    if (!g) return paintLobby();
    const opp = g.names[1 - g.you];
    $('gameTitle').textContent = `${KINDS.find((k) => k[0] === g.kind)[1]} · vs ${opp}`;
    body.replaceChildren();
    const result = () => (g.winner === -1 ? 'A draw.' : g.winner === g.you ? 'You won!' : 'You lost.');
    if (g.over) body.append(el('div', 'billWho', `Game over: ${result()}${g.why === 'left' ? ' (someone left)' : ''}`));
    if (g.kind === 'chess') {
      const mine = g.you === 0 ? 'w' : 'b';
      if (!g.over) body.append(el('div', 'billWho', g.turn === g.you ? `Your move (${mine === 'w' ? 'white' : 'black'})${g.status === 'check' ? ' · you are in check!' : ''}` : `${opp} is thinking…${g.status === 'check' ? ' (check)' : ''}`));
      const board = el('div', 'chess');
      const order = g.you === 0 ? [...Array(64).keys()] : [...Array(64).keys()].reverse(); // black sees the board from their side
      for (const i of order) {
        const ch = g.b[i];
        const sq = el('div', 'sq' + (((i >> 3) + (i & 7)) % 2 ? ' dark' : ''), ch === '.' ? '' : PIECES[ch]);
        if (i === sel) sq.classList.add('sel');
        if (sel >= 0 && g.legal[sel] && g.legal[sel].includes(i)) sq.classList.add('opt');
        if (g.last && (g.last[0] === i || g.last[1] === i)) sq.classList.add('last');
        sq.addEventListener('click', () => {
          if (g.over || g.turn !== g.you) return;
          if (sel >= 0 && g.legal[sel] && g.legal[sel].includes(i)) { socket.emit('gameMove', { from: sel, to: i, promo: 'q' }); sel = -1; return; }
          sel = g.legal[i] ? i : -1;
          paintGame();
        });
        board.append(sq);
      }
      body.append(board);
    } else if (g.kind === 'twentyone') {
      const cardEl = (c, hidden) => { const e = el('div', 'card' + (hidden ? ' back' : '') + (!hidden && /[♥♦]/.test(c) ? ' red' : ''), hidden ? '??' : c); return e; };
      body.append(el('div', 'billWho', `Your hand: ${g.mineValue}`));
      const mine = el('div', 'cards'); g.mine.forEach((c) => mine.append(cardEl(c))); body.append(mine);
      body.append(el('div', 'billWho', g.over ? `${opp}'s hand: ${g.theirValue}` : `${opp}'s hand: ${g.theirCount} cards`));
      const theirs = el('div', 'cards');
      if (g.theirs) g.theirs.forEach((c) => theirs.append(cardEl(c))); else for (let i = 0; i < g.theirCount; i++) theirs.append(cardEl('', true));
      body.append(theirs);
      if (!g.over) {
        body.append(el('div', 'fine', g.turn === g.you ? 'Your turn: hit takes a card, stand stops. Closest to 21 without going over wins.' : `Waiting for ${opp}…`));
        if (g.turn === g.you) {
          const hit = el('button', 'gbtn on', 'Hit (take a card)'), stand = el('button', 'gbtn', 'Stand');
          hit.addEventListener('click', () => socket.emit('gameMove', { action: 'hit' }));
          stand.addEventListener('click', () => socket.emit('gameMove', { action: 'stand' }));
          body.append(hit, stand);
        }
      }
    } else {
      body.append(el('div', 'billWho', `Word ${Math.min(g.round + 1, g.rounds)} of ${g.rounds} · you ${g.score[g.you]} – ${g.score[1 - g.you]} ${opp}`));
      if (!g.over) {
        body.append(el('div', 'wordBig', g.word));
        const input = el('input'); input.type = 'text'; input.maxLength = 20; input.placeholder = 'Unscramble it…'; input.autocomplete = 'off';
        input.style.cssText = 'width:100%;padding:8px;border-radius:8px;border:1px solid var(--track);background:transparent;color:inherit;font:inherit;';
        const go = () => { const v = input.value.trim(); if (v) socket.emit('gameMove', { guess: v }); input.value = ''; input.focus(); };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        const b = el('button', 'gbtn on', 'Guess'); b.addEventListener('click', go);
        body.append(input, b);
        setTimeout(() => input.focus(), 50);
      }
    }
    const leave = el('button', 'gbtn', g.over ? 'Close' : 'Leave game (you forfeit)');
    leave.addEventListener('click', () => { if (!g.over) socket.emit('gameLeave'); else { game = null; panel.hidden = true; } });
    body.append(leave);
  }

  socket.on('game', (g) => {
    const wasOver = game && game.over;
    if (!game || game.id !== g.id) sel = -1;
    game = g;
    hideOtherPanels('gamePanel');
    panel.hidden = false;
    paintGame();
    if (wasOver && !g.over) paintGame();
  });
  socket.on('gameInvite', (inv) => {
    invites.push(inv);
    hideOtherPanels('gamePanel');
    paintLobby();
    panel.hidden = false;
  });
  // the Play button shows when somebody else is here
  return {
    update(now) {
      if (now - tick < 500) return;
      tick = now;
      btn.hidden = !(names().length || (game && !game.over) || invites.length);
      btn.textContent = game && !game.over ? '🎮 Back to game' : '🎮 Play';
    },
  };
}