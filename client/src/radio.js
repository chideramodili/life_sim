// Adulthood: the in-game Radio. Built-in stations are synthesised live with WebAudio, so they are royalty-free
// by construction. Extra stations can be added as mp3 files listed in public/radio/stations.json.
// Live internet stations (public streams from the radio-browser.info directory) load in the player's own browser.
// Audiomack has its own app (paste a link). Spotify / Apple Music are "SOON" tiles. Nothing here touches the server.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const store = {
  get(k, d) { try { const v = localStorage.getItem('radio.' + k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('radio.' + k, String(v)); } catch { /* private mode */ } },
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Each synth station: bpm, a step function called for every 16th note with (ctx, out, t, step, bar).
function tone(ctx, out, t, midi, dur, type, vol, atk = 0.01) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = mtof(midi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function noise(ctx, out, t, dur, vol, hp) {
  const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out); s.start(t);
}
function kick(ctx, out, t, vol = 0.9) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
}
let amLink = store.get('am', '');
// Only accept real audiomack.com links; build the embed address ourselves (never trust pasted HTML).
export function audiomackEmbed(u) {
  const m = /^https:\/\/(?:www\.)?audiomack\.com\/([A-Za-z0-9._-]+)\/(song|album|playlist)\/([A-Za-z0-9._-]+)\/?(?:[?#].*)?$/.exec(String(u || '').trim());
  return m ? `https://audiomack.com/embed/${m[2]}/${m[1]}/${m[3]}` : null;
}
const pick = (a, i) => a[i % a.length];

export const SYNTH = [
  { id: 'lagos-chill', genre: 'chill', name: 'Lagos Chill FM', blurb: 'Slow, warm and easy', bpm: 76,
    play(ctx, out, t, s, bar) {
      const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 64]];
      const c = pick(chords, bar);
      if (s === 0) for (const m of c) tone(ctx, out, t, m, 3.2, 'triangle', 0.07, 0.15);
      if (s % 8 === 0) kick(ctx, out, t, 0.7);
      if (s % 8 === 4) noise(ctx, out, t, 0.12, 0.25, 1800);
      if (s % 2 === 0) noise(ctx, out, t, 0.04, 0.07, 7000);
      if ([0, 3, 6, 10, 12].includes(s)) tone(ctx, out, t, pick(c, s + bar) + 12, 0.5, 'sine', 0.09);
    } },
  { id: 'afro-groove', genre: 'afro', name: 'Afro Groove', blurb: 'Bouncy percussion and bass', bpm: 104,
    play(ctx, out, t, s, bar) {
      const root = pick([45, 43, 41, 43], bar);
      if (s % 4 === 0) kick(ctx, out, t, 0.8);
      if ([3, 6, 10, 11, 14].includes(s)) tone(ctx, out, t, root + (s > 8 ? 7 : 12), 0.22, 'sawtooth', 0.06);
      if ([2, 5, 8, 13].includes(s)) noise(ctx, out, t, 0.05, 0.28, 3500);
      if (s % 4 === 2) noise(ctx, out, t, 0.18, 0.2, 2400);
      if (s % 2 === 1) noise(ctx, out, t, 0.03, 0.1, 9000);
      if ([0, 7, 10].includes(s)) tone(ctx, out, t, root, 0.3, 'triangle', 0.22);
      if (s === 0) for (const m of [root + 24, root + 27, root + 31]) tone(ctx, out, t, m, 0.4, 'square', 0.025);
    } },
  { id: 'night-drive', genre: 'chill', name: 'Night Drive', blurb: 'Dreamy pads for the road', bpm: 90,
    play(ctx, out, t, s, bar) {
      const chords = [[50, 57, 62, 65], [46, 53, 58, 62], [43, 50, 55, 59], [45, 52, 57, 61]];
      const c = pick(chords, bar);
      if (s === 0) for (const m of c) tone(ctx, out, t, m, 5.2, 'sawtooth', 0.025, 0.9);
      if (s % 4 === 0) tone(ctx, out, t, c[0] - 12, 0.6, 'sine', 0.2);
      if (s % 2 === 0) tone(ctx, out, t, pick(c, s / 2 + 1) + 24, 0.35, 'sine', 0.04);
      if (s % 8 === 4) noise(ctx, out, t, 0.2, 0.12, 4000);
    } },
  { id: 'sunrise-keys', genre: 'chill', name: 'Sunrise Keys', blurb: 'Soft piano-style arpeggios', bpm: 84,
    play(ctx, out, t, s, bar) {
      const chords = [[60, 64, 67, 72], [62, 65, 69, 74], [59, 62, 67, 71], [60, 64, 69, 72]];
      const c = pick(chords, bar);
      if (s % 2 === 0) tone(ctx, out, t, pick(c, s / 2), 1.1, 'triangle', 0.1, 0.005);
      if (s === 0) tone(ctx, out, t, c[0] - 24, 3, 'sine', 0.16, 0.05);
      if (s === 8) tone(ctx, out, t, c[2] - 12, 1.5, 'sine', 0.08, 0.05);
    } },
  { id: 'amapiano', genre: 'dance', name: 'Piano Nights', blurb: 'Amapiano-style log drums and keys', bpm: 112,
    play(ctx, out, t, s, bar) {
      const root = pick([45, 41, 43, 40], bar);
      if (s % 4 === 0) kick(ctx, out, t, 0.6);
      if ([3, 6, 10, 14].includes(s)) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(mtof(root), t); o.frequency.exponentialRampToValueAtTime(mtof(root - 7), t + 0.3); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(g).connect(out); o.start(t); o.stop(t + 0.4); }
      if (s % 2 === 1) noise(ctx, out, t, 0.04, 0.12, 8000);
      if (s % 8 === 4) noise(ctx, out, t, 0.12, 0.22, 2500);
      if ([0, 3, 7, 10, 12].includes(s)) for (const m of [root + 19, root + 22, root + 26]) tone(ctx, out, t, m, 0.3, 'triangle', 0.035);
    } },
  { id: 'highlife', genre: 'highlife', name: 'Highlife Sunday', blurb: 'Bouncy plucked guitar feel', bpm: 108,
    play(ctx, out, t, s, bar) {
      const scale = [60, 62, 64, 67, 69, 72], root = pick([48, 53, 55, 48], bar);
      if (s % 4 === 0) tone(ctx, out, t, root, 0.28, 'triangle', 0.24);
      if ([2, 6, 10, 14].includes(s)) tone(ctx, out, t, pick(scale, s + bar * 2), 0.18, 'square', 0.04);
      if ([1, 3, 5, 7, 9, 11, 13, 15].includes(s)) tone(ctx, out, t, pick(scale, s * 3 + bar) + 12, 0.1, 'triangle', 0.045);
      if (s % 4 === 2) noise(ctx, out, t, 0.06, 0.2, 3000);
      if (s % 2 === 0) noise(ctx, out, t, 0.03, 0.07, 9000);
    } },
  { id: 'boombap', genre: 'hiphop', name: 'Boom Bap Lagos', blurb: 'Hard drums, deep 808', bpm: 88,
    play(ctx, out, t, s, bar) {
      const root = pick([36, 34, 39, 31], bar);
      if ([0, 7, 10].includes(s)) kick(ctx, out, t, 0.95);
      if (s === 4 || s === 12) noise(ctx, out, t, 0.2, 0.45, 1500);
      if (s % 2 === 0) noise(ctx, out, t, 0.03, 0.12, 8500);
      if ([0, 10].includes(s)) tone(ctx, out, t, root, 0.7, 'sine', 0.4);
      if (s === 0) for (const m of [root + 31, root + 34, root + 38]) tone(ctx, out, t, m, 1.6, 'triangle', 0.03, 0.05);
    } },
  { id: 'gospel', genre: 'gospel', name: 'Praise Hour', blurb: 'Warm organ and slow claps', bpm: 72,
    play(ctx, out, t, s, bar) {
      const chords = [[55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]];
      const c = pick(chords, bar);
      if (s === 0 || s === 8) for (const m of c) { tone(ctx, out, t, m, 2.2, 'sawtooth', 0.02, 0.08); tone(ctx, out, t, m - 12, 2.2, 'sine', 0.05, 0.08); }
      if (s === 4 || s === 12) noise(ctx, out, t, 0.08, 0.3, 1200);
      if (s % 8 === 0) tone(ctx, out, t, c[0] - 24, 1.2, 'sine', 0.2);
    } },
  { id: 'smoothrnb', genre: 'rnb', name: 'Velvet Soul', blurb: 'Smooth keys, late-night mood', bpm: 70,
    play(ctx, out, t, s, bar) {
      const chords = [[58, 62, 65, 69], [55, 58, 62, 65], [53, 57, 60, 64], [55, 59, 62, 66]];
      const c = pick(chords, bar);
      if (s === 0) for (const m of c) tone(ctx, out, t, m, 2.8, 'triangle', 0.06, 0.02);
      if ([0, 10].includes(s)) kick(ctx, out, t, 0.6);
      if (s === 8) noise(ctx, out, t, 0.14, 0.25, 2000);
      if (s % 2 === 0) noise(ctx, out, t, 0.03, 0.06, 8000);
      if ([6, 11, 14].includes(s)) tone(ctx, out, t, pick(c, s) + 12, 0.4, 'sine', 0.07);
    } },
  { id: 'reggae', genre: 'reggae', name: 'Island Vibes', blurb: 'One-drop reggae groove', bpm: 78,
    play(ctx, out, t, s, bar) {
      const root = pick([45, 45, 50, 43], bar);
      if (s === 8) kick(ctx, out, t, 0.8);
      if (s === 8) noise(ctx, out, t, 0.12, 0.3, 2200);
      if (s === 4 || s === 12) for (const m of [root + 12, root + 16, root + 19]) tone(ctx, out, t, m, 0.12, 'square', 0.04);
      if ([0, 3, 6, 8, 11, 14].includes(s)) tone(ctx, out, t, root - 12 + ([6, 14].includes(s) ? 7 : 0), 0.35, 'sine', 0.3);
      if (s % 2 === 0) noise(ctx, out, t, 0.03, 0.07, 9000);
    } },
  { id: 'dancehall', genre: 'dance', name: 'Dancehall Heat', blurb: 'Dembow rhythm, party energy', bpm: 100,
    play(ctx, out, t, s, bar) {
      const root = pick([43, 43, 46, 41], bar);
      if (s % 4 === 0) kick(ctx, out, t, 0.85);
      if ([3, 6, 11, 14].includes(s)) noise(ctx, out, t, 0.1, 0.4, 2800);
      if (s % 2 === 1) noise(ctx, out, t, 0.03, 0.09, 9500);
      if ([0, 3, 8, 11].includes(s)) tone(ctx, out, t, root, 0.3, 'sine', 0.35);
      if ([2, 10].includes(s)) for (const m of [root + 24, root + 27]) tone(ctx, out, t, m, 0.18, 'sawtooth', 0.03);
    } },
  { id: 'jazz', genre: 'jazz', name: 'Midnight Jazz', blurb: 'Walking bass and soft brushes', bpm: 128,
    play(ctx, out, t, s, bar) {
      const roots = [38, 43, 36, 43], r = pick(roots, bar), walk = [0, 4, 7, 9];
      if (s % 4 === 0) tone(ctx, out, t, r + pick(walk, s / 4 + bar), 0.4, 'sine', 0.3);
      if ([0, 6, 10].includes(s)) for (const m of [r + 22, r + 26, r + 29, r + 33]) tone(ctx, out, t, m, 0.5, 'triangle', 0.035);
      if (s % 4 === 2) noise(ctx, out, t, 0.1, 0.1, 6000);
      if (s % 2 === 0) noise(ctx, out, t, 0.04, 0.05, 9000);
    } },
  { id: 'lofi', genre: 'chill', name: 'Late Study Lo-fi', blurb: 'Dusty beats to focus', bpm: 72,
    play(ctx, out, t, s, bar) {
      const chords = [[57, 61, 64, 68], [54, 57, 61, 64], [52, 56, 59, 63], [54, 57, 61, 66]];
      const c = pick(chords, bar);
      if (s === 0) for (const m of c) tone(ctx, out, t, m, 3, 'triangle', 0.05, 0.1);
      if ([0, 7, 10].includes(s)) kick(ctx, out, t, 0.6);
      if (s === 4 || s === 12) noise(ctx, out, t, 0.1, 0.2, 1500);
      noise(ctx, out, t, 0.2, 0.012, 3000);
      if (s % 2 === 0) noise(ctx, out, t, 0.03, 0.05, 7500);
    } },
];

export function initRadio() {
  let ctx = null, master = null, comp = null;
  let current = null;          // { id, name, stop() }
  let files = [];
  let volume = Math.min(1, Math.max(0, Number(store.get('vol', 0.6))));
  let chip = store.get('chip', 'all');
  let note = '';
  const live = {};             // chip -> { state: 'loading' | 'ok' | 'err', list }
  const audio = new Audio(); audio.preload = 'none'; audio.loop = false;
  audio.addEventListener('error', () => { if (current && current.live) { note = 'That station would not play. Try another one.'; stop(); } });

  const CHIPS = [['all', 'All'], ['ng', 'Nigeria live'], ['afro', 'Afrobeats'], ['highlife', 'Highlife'], ['hiphop', 'Hip hop'], ['gospel', 'Gospel'], ['rnb', 'R&B'], ['reggae', 'Reggae'], ['dance', 'Dance'], ['pop', 'Pop'], ['jazz', 'Jazz'], ['chill', 'Chill']];
  const TAGS = { afro: 'afrobeats', highlife: 'highlife', hiphop: 'hip hop', gospel: 'gospel', rnb: 'rnb', reggae: 'reggae', dance: 'dance', pop: 'pop', jazz: 'jazz', chill: 'chillout' };
  const SERVERS = ['de1', 'fi1', 'at1', 'nl1'];

  // Live stations: asked from the public radio-browser.info directory by the player's own browser (https streams only).
  async function loadLive(key) {
    if (key === 'all' || live[key]) return;
    live[key] = { state: 'loading', list: [] }; paint();
    try {
      const c = sessionStorage.getItem('radio.live.' + key);
      if (c) { const j = JSON.parse(c); if (Date.now() - j.t < 3600e3) { live[key] = { state: 'ok', list: j.list }; paint(); return; } }
    } catch { /* no cache */ }
    const q = key === 'ng' ? 'countrycode=NG' : `tag=${encodeURIComponent(TAGS[key])}`;
    let list = null;
    for (const sv of SERVERS) {
      try {
        const r = await fetch(`https://${sv}.api.radio-browser.info/json/stations/search?${q}&hidebroken=true&order=clickcount&reverse=true&limit=80&is_https=true`);
        if (!r.ok) continue;
        list = await r.json(); break;
      } catch { /* try the next server */ }
    }
    if (!Array.isArray(list)) { live[key] = { state: 'err', list: [] }; paint(); return; }
    const seen = new Set(), out = [];
    for (const x of list) {
      const url = String(x.url_resolved || '');
      const nm = String(x.name || '').trim().slice(0, 40);
      if (!/^https:\/\//.test(url) || !nm || seen.has(nm.toLowerCase())) continue;
      if (!/^(mp3|aac|aac\+|ogg)$/i.test(String(x.codec || ''))) continue;
      seen.add(nm.toLowerCase());
      out.push({ id: 'live-' + (x.stationuuid || nm), name: nm, blurb: [x.country, String(x.tags || '').split(',').slice(0, 3).join(', ')].filter(Boolean).join(' · '), live: true, url });
      if (out.length >= 25) break;
    }
    live[key] = { state: 'ok', list: out };
    try { sessionStorage.setItem('radio.live.' + key, JSON.stringify({ t: Date.now(), list: out })); } catch { /* too big or private */ }
    paint();
  }

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = volume;
      comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function stop(quiet) {
    if (current) { try { current.stop(); } catch { /* already stopped */ } current = null; }
    try { audio.pause(); } catch { /* ignore */ }
    store.set('on', 0);
    if (quiet !== true) paint();
  }

  function playSynth(st) {
    if (!ensureCtx()) return;
    const stepLen = 60 / st.bpm / 4;
    let step = 0, next = ctx.currentTime + 0.1;
    const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(master);
    const timer = setInterval(() => {
      while (next < ctx.currentTime + 0.3) {
        st.play(ctx, bus, next, step % 16, Math.floor(step / 16));
        step++; next += stepLen;
      }
    }, 80);
    current = { id: st.id, name: st.name, stop() { clearInterval(timer); bus.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => bus.disconnect(), 400); } };
  }

  function playFile(f) {
    audio.loop = !f.live; audio.src = f.url; audio.volume = volume;
    audio.play().catch(() => { if (current && current.id === f.id && f.live) { note = 'That station would not play. Try another one.'; stop(); } });
    current = { id: f.id, name: f.name, live: !!f.live, stop() { audio.pause(); } };
  }

  function play(st) {
    if (current) { try { current.stop(); } catch { /* ignore */ } current = null; }
    note = '';
    if (st.file || st.live) playFile(st); else playSynth(st);
    store.set('last', st.id); store.set('on', 1);
    paint();
  }

  function row(st) {
    const on = current && current.id === st.id;
    const r = el('div', 'job radioRow');
    const head = el('div', 'skillHead');
    head.append(el('span', 'skillName', `${on ? '▶ ' : ''}${st.name}`));
    r.append(head, el('div', 'fine', st.credit ? `${st.blurb || ''} ${st.credit}`.trim() : st.blurb || ''));
    const b = el('button', 'mini', on ? 'Stop' : 'Play');
    b.addEventListener('click', () => (on ? stop() : play(st)));
    r.append(b);
    return r;
  }

  function paint() {
    const body = $('radioBody'); if (!body) return;
    body.replaceChildren();
    const chips = el('div', 'radioChips');
    for (const [k, label] of CHIPS) {
      const b = el('button', k === chip ? 'on' : '', label); b.type = 'button';
      b.addEventListener('click', () => { chip = k; store.set('chip', k); loadLive(k); paint(); });
      chips.append(b);
    }
    body.append(chips);
    const gen = SYNTH.filter((s) => chip === 'all' || s.genre === chip);
    const lv = chip === 'all' ? null : live[chip];
    if (gen.length) { body.append(el('div', 'fine', 'Generated stations (instrumental, made live in your browser)')); for (const st of gen) body.append(row(st)); }
    if (chip === 'all') for (const f of files) body.append(row(f));
    if (chip !== 'all') {
      body.append(el('div', 'fine', 'Live stations'));
      if (!lv || lv.state === 'loading') body.append(el('div', 'fine', 'Finding stations…'));
      else if (lv.state === 'err') { const m = el('div', 'fine', 'Could not load live stations. Check your internet and try again.'); const rb = el('button', 'mini', 'Try again'); rb.addEventListener('click', () => { delete live[chip]; loadLive(chip); }); body.append(m, rb); }
      else if (!lv.list.length) body.append(el('div', 'fine', 'No live stations found for this one right now.'));
      else for (const st of lv.list) body.append(row(st));
    }
    if (chip === 'all') {
      const soon = el('div', 'radioSoon');
      for (const n of ['Spotify', 'Apple Music']) { const t = el('div', 'radioTile'); t.append(el('b', '', n), el('span', '', 'SOON')); soon.append(t); }
      body.append(soon);
    }
    $('radioNow').textContent = note || (current ? `Now playing: ${current.name}` : 'Radio is off');
  }

  // ---- Audiomack app: paste a public song / album / playlist link, played in Audiomack's own embedded player.
  function paintAm() {
    const body = $('amBody'); if (!body) return;
    body.replaceChildren();
    const am = el('div', 'job radioRow');
    am.append(el('div', 'fine', 'Paste an Audiomack song, album or playlist link and play it here.'));
    const inp = el('input'); inp.type = 'url'; inp.placeholder = 'https://audiomack.com/artist/song/title'; inp.value = amLink;
    inp.style.cssText = 'width:100%;box-sizing:border-box;margin-top:6px;height:36px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;padding:0 8px;';
    const go = el('button', 'mini', 'Load'); const msg = el('div', 'fine'); const amBox = el('div');
    const load = () => {
      const emb = audiomackEmbed(inp.value);
      if (!emb) { msg.textContent = 'That is not an Audiomack song, album or playlist link.'; return; }
      stop(true); amLink = inp.value.trim(); store.set('am', amLink);
      msg.textContent = 'Loaded. Press play inside the player below.';
      amBox.replaceChildren();
      const f = document.createElement('iframe');
      f.src = emb; f.height = '252'; f.style.cssText = 'width:100%;border:0;border-radius:10px;margin-top:8px;';
      f.allow = 'autoplay'; f.title = 'Audiomack player';
      amBox.append(f);
    };
    go.addEventListener('click', load);
    am.append(inp, go, msg, amBox, el('div', 'fine', 'Songs are played by Audiomack and follow its own rules. Some songs may be unavailable in your region.'));
    body.append(am);
    if (amLink && audiomackEmbed(amLink)) load();
  }

  fetch('/radio/stations.json').then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j || !Array.isArray(j.stations)) return;
    files = j.stations.filter((s) => s && s.file && s.name).map((s, i) => ({
      id: 'file-' + i, name: String(s.name).slice(0, 40), blurb: 'Your music', credit: s.credit ? String(s.credit).slice(0, 80) : '',
      file: true, url: '/radio/' + encodeURIComponent(String(s.file)),
    }));
    paint();
  }).catch(() => {});

  const togglePanel = (id, onOpen) => {
    const p = $(id), open = p.hidden;
    hideOtherPanels(open ? id : null);
    p.hidden = !open;
    if (open && onOpen) onOpen();
    if (open && window.matchMedia('(max-width: 600px)').matches) {
      $('hud')?.classList.add('compact');
      const m = $('hudMore'); if (m) m.textContent = 'More ▾';
    }
    if (open) $('phonePanel') && ($('phonePanel').hidden = true);
  };
  $('radioBtn').addEventListener('click', () => togglePanel('radioPanel', () => { loadLive(chip); paint(); }));
  $('amBtn').addEventListener('click', () => togglePanel('amPanel', () => { if (!$('amBody').firstChild) paintAm(); }));
  $('radioClose').addEventListener('click', () => { $('radioPanel').hidden = true; });
  $('amClose').addEventListener('click', () => { $('amPanel').hidden = true; });
  const vol = $('radioVol');
  vol.value = String(Math.round(volume * 100));
  vol.addEventListener('input', () => {
    volume = vol.value / 100; store.set('vol', volume);
    if (master) master.gain.value = volume;
    audio.volume = volume;
  });
  paint();
  // The dynamic island: shows the name of what is playing, with a spinning disc. Tap it to open the Radio app, ■ to stop.
  const isl = document.getElementById('island');
  if (isl) {
    const nm = isl.querySelector('.nm span');
    let shown = '';
    const sync = () => {
      const name = current ? current.name : '';
      if (name === shown) return;
      shown = name;
      isl.classList.toggle('on', !!name);
      if (name) { nm.textContent = name; nm.classList.remove('run'); requestAnimationFrame(() => nm.classList.toggle('run', nm.scrollWidth > nm.parentElement.clientWidth)); }
    };
    setInterval(sync, 400);
    isl.addEventListener('click', (e) => { if (e.target.id === 'islandStop') { stop(); sync(); return; } const b = document.getElementById('radioBtn'); if (b) b.click(); });
  }
  return { stop, nowPlaying: () => (current ? current.name : '') };
}
