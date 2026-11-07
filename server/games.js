// Adulthood: two-player minigames. This file is only rules (no network, no database), so it is easy to test.
// Chess, "21" (a card duel) and Word Race. The server keeps the state and checks every move; the browser only draws it.

// ======================================================================= CHESS
// Squares are numbered 0..63, row by row from the top (rank 8) to the bottom (rank 1): index = row * 8 + col.
// White pieces are capital letters, black pieces are lower case, '.' is an empty square.
export const START_BOARD = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR'.split('');

export function newChess() {
  return { b: START_BOARD.slice(), turn: 'w', castle: 'KQkq', ep: -1, half: 0, full: 1 };
}
const isWhite = (ch) => ch !== '.' && ch === ch.toUpperCase();
const colorOf = (ch) => (ch === '.' ? null : isWhite(ch) ? 'w' : 'b');
const rc = (i) => [i >> 3, i & 7];
const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

// Is square `sq` attacked by a piece of colour `by`?
export function attacked(b, sq, by) {
  const [r, c] = rc(sq);
  // pawns
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (inb(pr, c + dc) && b[pr * 8 + c + dc] === (by === 'w' ? 'P' : 'p')) return true;
  // knights
  for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
    if (inb(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === (by === 'w' ? 'N' : 'n')) return true;
  }
  // king
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if ((dr || dc) && inb(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === (by === 'w' ? 'K' : 'k')) return true;
  }
  // sliders
  const rook = by === 'w' ? 'R' : 'r', bishop = by === 'w' ? 'B' : 'b', queen = by === 'w' ? 'Q' : 'q';
  for (const [dr, dc, kinds] of [[1, 0, [rook, queen]], [-1, 0, [rook, queen]], [0, 1, [rook, queen]], [0, -1, [rook, queen]], [1, 1, [bishop, queen]], [1, -1, [bishop, queen]], [-1, 1, [bishop, queen]], [-1, -1, [bishop, queen]]]) {
    let rr = r + dr, cc = c + dc;
    while (inb(rr, cc)) {
      const p = b[rr * 8 + cc];
      if (p !== '.') { if (kinds.includes(p)) return true; break; }
      rr += dr; cc += dc;
    }
  }
  return false;
}

const kingSquare = (b, color) => b.indexOf(color === 'w' ? 'K' : 'k');
export const inCheck = (st, color = st.turn) => attacked(st.b, kingSquare(st.b, color), color === 'w' ? 'b' : 'w');

// Every move the side to move could make if its king did not matter. A move is { from, to, promo? }.
function pseudoMoves(st) {
  const { b, turn } = st;
  const out = [];
  const enemy = turn === 'w' ? 'b' : 'w';
  for (let from = 0; from < 64; from++) {
    const ch = b[from];
    if (ch === '.' || colorOf(ch) !== turn) continue;
    const [r, c] = rc(from);
    const kind = ch.toLowerCase();
    const add = (to, extra) => out.push({ from, to, ...extra });
    if (kind === 'p') {
      const dir = turn === 'w' ? -1 : 1, start = turn === 'w' ? 6 : 1, last = turn === 'w' ? 0 : 7;
      const push = (to) => { if (rc(to)[0] === last) for (const promo of ['q', 'r', 'b', 'n']) add(to, { promo }); else add(to); };
      if (inb(r + dir, c) && b[(r + dir) * 8 + c] === '.') {
        push((r + dir) * 8 + c);
        if (r === start && b[(r + 2 * dir) * 8 + c] === '.') add((r + 2 * dir) * 8 + c);
      }
      for (const dc of [-1, 1]) {
        if (!inb(r + dir, c + dc)) continue;
        const to = (r + dir) * 8 + c + dc;
        if (b[to] !== '.' && colorOf(b[to]) === enemy) push(to);
        else if (to === st.ep) add(to);
      }
    } else if (kind === 'n') {
      for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
        if (inb(r + dr, c + dc) && colorOf(b[(r + dr) * 8 + c + dc]) !== turn) add((r + dr) * 8 + c + dc);
      }
    } else if (kind === 'k') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if ((dr || dc) && inb(r + dr, c + dc) && colorOf(b[(r + dr) * 8 + c + dc]) !== turn) add((r + dr) * 8 + c + dc);
      }
      // castling: the king and rook have not moved, the squares between are empty, and the king does not pass through check
      const home = turn === 'w' ? 60 : 4;
      if (from === home && !attacked(b, home, enemy)) {
        const K = turn === 'w' ? 'K' : 'k', Q = turn === 'w' ? 'Q' : 'q', R = turn === 'w' ? 'R' : 'r';
        if (st.castle.includes(K) && b[home + 1] === '.' && b[home + 2] === '.' && b[home + 3] === R && !attacked(b, home + 1, enemy) && !attacked(b, home + 2, enemy)) add(home + 2, { castle: 'k' });
        if (st.castle.includes(Q) && b[home - 1] === '.' && b[home - 2] === '.' && b[home - 3] === '.' && b[home - 4] === R && !attacked(b, home - 1, enemy) && !attacked(b, home - 2, enemy)) add(home - 2, { castle: 'q' });
      }
    } else {
      const dirs = kind === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : kind === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (inb(rr, cc)) {
          const t = b[rr * 8 + cc];
          if (t === '.') add(rr * 8 + cc);
          else { if (colorOf(t) !== turn) add(rr * 8 + cc); break; }
          rr += dr; cc += dc;
        }
      }
    }
  }
  return out;
}

// Play a move on a copy of the position (no legality check here).
export function __play(st, m) { return play(st, m); }
function play(st, m) {
  const b = st.b.slice();
  const ch = b[m.from];
  const kind = ch.toLowerCase();
  const white = isWhite(ch);
  let capture = b[m.to] !== '.';
  let ep = -1;
  b[m.to] = ch; b[m.from] = '.';
  if (kind === 'p') {
    if (m.to === st.ep && !capture) { b[m.to + (white ? 8 : -8)] = '.'; capture = true; }
    if (Math.abs(m.to - m.from) === 16) ep = (m.to + m.from) / 2;
    if (m.promo) b[m.to] = white ? m.promo.toUpperCase() : m.promo;
  }
  if (m.castle === 'k') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = '.'; }
  if (m.castle === 'q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = '.'; }
  let castle = st.castle;
  const drop = (s) => { castle = castle.replace(s, ''); };
  if (ch === 'K') { drop('K'); drop('Q'); }
  if (ch === 'k') { drop('k'); drop('q'); }
  for (const sq of [m.from, m.to]) { if (sq === 63) drop('K'); if (sq === 56) drop('Q'); if (sq === 7) drop('k'); if (sq === 0) drop('q'); }
  return { b, turn: st.turn === 'w' ? 'b' : 'w', castle, ep, half: kind === 'p' || capture ? 0 : st.half + 1, full: st.full + (st.turn === 'b' ? 1 : 0) };
}

export function legalMoves(st) {
  const me = st.turn;
  return pseudoMoves(st).filter((m) => !attacked(play(st, m).b, kingSquare(play(st, m).b, me), me === 'w' ? 'b' : 'w'));
}

// The result of a move: { st } on success, { error } if it is not allowed.
export function chessMove(st, m) {
  if (!m || !Number.isInteger(m.from) || !Number.isInteger(m.to) || m.from < 0 || m.from > 63 || m.to < 0 || m.to > 63) return { error: 'Bad move.' };
  const promo = typeof m.promo === 'string' ? m.promo.toLowerCase() : undefined;
  const legal = legalMoves(st).filter((x) => x.from === m.from && x.to === m.to);
  if (!legal.length) return { error: 'That move is not allowed.' };
  let pick = legal[0];
  if (legal.some((x) => x.promo)) pick = legal.find((x) => x.promo === (promo || 'q')) || legal.find((x) => x.promo === 'q');
  return { st: play(st, pick), move: pick };
}

// 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw' (fifty moves, or too few pieces left to win)
export function chessStatus(st) {
  const moves = legalMoves(st);
  const check = inCheck(st);
  if (!moves.length) return check ? 'checkmate' : 'stalemate';
  if (st.half >= 100) return 'draw';
  const rest = st.b.filter((x) => x !== '.' && x.toLowerCase() !== 'k');
  if (rest.length === 0 || (rest.length === 1 && 'nb'.includes(rest[0].toLowerCase()))) return 'draw';
  return check ? 'check' : 'playing';
}

// ======================================================================= 21 (a card duel)
// Each player is dealt two cards and then draws one at a time. Get as close to 21 as you can without going over.
// Both players choose, one after the other: hit (take a card) or stand (stop). Highest total not over 21 wins; a tie is a draw.
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export function newDeck(rand = Math.random) {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
export function handValue(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    const r = c.slice(0, -1);
    if (r === 'A') { aces++; total += 11; } else if ('JQK'.includes(r)) total += 10; else total += Number(r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
export function newTwentyOne(rand = Math.random) {
  const deck = newDeck(rand);
  return { deck, hands: [[deck.pop(), deck.pop()], [deck.pop(), deck.pop()]], stood: [false, false], turn: 0, over: false, winner: null };
}
// who: 0 or 1; action: 'hit' | 'stand'
export function twentyOneAct(st, who, action) {
  if (st.over) return { error: 'The game is over.' };
  if (st.turn !== who) return { error: 'Not your turn.' };
  if (action !== 'hit' && action !== 'stand') return { error: 'Hit or stand.' };
  if (action === 'hit') {
    if (!st.deck.length) st.deck = newDeck(); // cannot really happen with 52 cards, but never draw from nothing
    st.hands[who].push(st.deck.pop());
    if (handValue(st.hands[who]) > 21) { st.over = true; st.winner = 1 - who; return { st }; }
    if (handValue(st.hands[who]) === 21) st.stood[who] = true;
  } else st.stood[who] = true;
  if (st.stood[0] && st.stood[1]) {
    const a = handValue(st.hands[0]), b = handValue(st.hands[1]);
    st.over = true; st.winner = a === b ? -1 : a > b ? 0 : 1;
    return { st };
  }
  // the next player to move is the other one, unless they have already stood
  st.turn = st.stood[1 - who] ? who : 1 - who;
  return { st };
}

// ======================================================================= WORD RACE
// Five scrambled words; the first to unscramble the most of them wins. Each word can only be won once.
export const WORDS = ['market', 'bridge', 'garden', 'planet', 'silver', 'island', 'jungle', 'rocket', 'basket', 'candle', 'dinner', 'engine', 'flower', 'guitar', 'hammer', 'insect', 'jacket', 'kitten', 'ladder', 'mirror', 'napkin', 'orange', 'pencil', 'rabbit', 'sunset', 'turkey', 'valley', 'window', 'yellow', 'zipper', 'bakery', 'cabin', 'desert', 'forest', 'harbor', 'lemon', 'monkey', 'nectar', 'oyster', 'pepper', 'rhythm', 'saddle', 'tunnel', 'velvet', 'wallet', 'anchor', 'bottle', 'camera', 'doctor', 'family', 'ground', 'happy', 'jersey', 'kernel', 'lizard', 'mango', 'noodle', 'palace', 'quiet', 'ribbon', 'summer', 'tomato', 'unique', 'vendor', 'winter', 'yogurt', 'zebra', 'school', 'street', 'driver', 'police', 'nurse', 'teacher', 'cashier', 'friend', 'money', 'phone', 'house', 'plaza', 'train', 'water', 'music', 'dance', 'smile', 'dream'];
export const WORD_ROUNDS = 5;
export function scramble(word, rand = Math.random) {
  const a = word.split('');
  for (let tries = 0; tries < 20; tries++) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.join('') !== word) break;
  }
  return a.join('');
}
export function newWordRace(rand = Math.random) {
  const pool = WORDS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const words = pool.slice(0, WORD_ROUNDS);
  return { words, shown: words.map((w) => scramble(w, rand)), round: 0, score: [0, 0], over: false, winner: null };
}
export function wordGuess(st, who, guess) {
  if (st.over) return { error: 'The game is over.' };
  if (typeof guess !== 'string' || guess.length > 20) return { error: 'Type a word.' };
  const g = guess.trim().toLowerCase();
  if (!g) return { error: 'Type a word.' };
  if (g !== st.words[st.round]) return { ok: false, st };
  st.score[who]++;
  st.round++;
  if (st.round >= WORD_ROUNDS) {
    st.over = true;
    st.winner = st.score[0] === st.score[1] ? -1 : st.score[0] > st.score[1] ? 0 : 1;
  }
  return { ok: true, st };
}

export const GAME_KINDS = { chess: { label: 'Chess', icon: '♟️' }, twentyone: { label: '21 (cards)', icon: '🃏' }, words: { label: 'Word Race', icon: '🔤' } };