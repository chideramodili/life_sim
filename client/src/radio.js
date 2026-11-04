// Adulthood: the in-game Radio. Built-in stations are synthesised live with WebAudio, so they are royalty-free
// by construction. Extra stations can be added as mp3 files listed in public/radio/stations.json.
// Spotify / Apple Music / Audiomack are shown as "SOON" tiles only. Nothing here touches the server.
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
  { id: 'lagos-chill', name: 'Lagos Chill FM', blurb: 'Slow, warm and easy', bpm: 76,
    play(ctx, out, t, s, bar) {
      const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 64]];
      const c = pick(chords, bar);
      if (s === 0) for (const m of c) tone(ctx, out, t, m, 3.2, 'triangle', 0.07, 0.15);
      if (s % 8 === 0) kick(ctx, out, t, 0.7);
      if (s % 8 === 4) noise(ctx, out, t, 0.12, 0.25, 1800);
      if (s % 2 === 0) noise(ctx, out, t, 0.04, 0.07, 7000);
      if ([0, 3, 6, 10, 12].includes(s)) tone(ctx, out, t, pick(c, s + bar) + 12, 0.5, 'sine', 0.09);
    } },
  { id: 'afro-groove', name: 'Afro Groove', blurb: 'Bouncy percussion and bass', bpm: 104,
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
  { id: 'night-drive', name: 'Night Drive', blurb: 'Dreamy pads for the road', bpm: 90,
    play(ctx, out, t, s, bar) {
      const chords = [[50, 57, 62, 65], [46, 53, 58, 62], [43, 50, 55, 59], [45, 52, 57, 61]];
      const c = pick(chords, bar);
      if (s === 0) for (const m of c) tone(ctx, out, t, m, 5.2, 'sawtooth', 0.025, 0.9);
      if (s % 4 === 0) tone(ctx, out, t, c[0] - 12, 0.6, 'sine', 0.2);
      if (s % 2 === 0) tone(ctx, out, t, pick(c, s / 2 + 1) + 24, 0.35, 'sine', 0.04);
      if (s % 8 === 4) noise(ctx, out, t, 0.2, 0.12, 4000);
    } },
  { id: 'sunrise-keys', name: 'Sunrise Keys', blurb: 'Soft piano-style arpeggios', bpm: 84,
    play(ctx, out, t, s, bar) {
      const chords = [[60, 64, 67, 72], [62, 65, 69, 74], [59, 62, 67, 71], [60, 64, 69, 72]];
      const c = pick(chords, bar);
      if (s % 2 === 0) tone(ctx, out, t, pick(c, s / 2), 1.1, 'triangle', 0.1, 0.005);
      if (s === 0) tone(ctx, out, t, c[0] - 24, 3, 'sine', 0.16, 0.05);
      if (s === 8) tone(ctx, out, t, c[2] - 12, 1.5, 'sine', 0.08, 0.05);
    } },
];

export function initRadio() {
  let ctx = null, master = null, comp = null;
  let current = null;          // { id, stop() }
  let files = [];
  let volume = Math.min(1, Math.max(0, Number(store.get('vol', 0.6))));
  const audio = new Audio(); audio.preload = 'none'; audio.loop = true;

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
    current = { id: st.id, stop() { clearInterval(timer); bus.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => bus.disconnect(), 400); } };
  }

  function playFile(f) {
    audio.src = f.url; audio.volume = volume;
    audio.play().catch(() => {});
    current = { id: f.id, stop() { audio.pause(); } };
  }

  function play(st) {
    if (current) { try { current.stop(); } catch { /* ignore */ } current = null; }
    if (st.file) playFile(st); else playSynth(st);
    store.set('last', st.id); store.set('on', 1);
    paint();
  }

  function paint() {
    const body = $('radioBody'); if (!body) return;
    body.replaceChildren();
    const all = [...SYNTH.map((s) => ({ ...s })), ...files];
    for (const st of all) {
      const on = current && current.id === st.id;
      const row = el('div', 'job radioRow');
      const head = el('div', 'skillHead');
      head.append(el('span', 'skillName', `${on ? '▶ ' : ''}${st.name}`));
      row.append(head, el('div', 'fine', st.credit ? `${st.blurb || ''} ${st.credit}`.trim() : st.blurb || ''));
      const b = el('button', 'mini', on ? 'Stop' : 'Play');
      b.addEventListener('click', () => (on ? stop() : play(st)));
      row.append(b);
      body.append(row);
    }
    const soon = el('div', 'radioSoon');
    // Audiomack: paste a public song/album/playlist link and play it in Audiomack's own embedded player.
    const am = el('div', 'job radioRow');
    am.append(el('div', 'skillName', 'Audiomack'), el('div', 'fine', 'Paste an Audiomack song, album or playlist link.'));
    const inp = el('input'); inp.type = 'url'; inp.placeholder = 'https://audiomack.com/artist/song/title'; inp.value = amLink;
    inp.style.cssText = 'width:100%;box-sizing:border-box;margin-top:6px;height:36px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;padding:0 8px;';
    const go = el('button', 'mini', 'Load'); const msg = el('div', 'fine');
    go.addEventListener('click', () => {
      const emb = audiomackEmbed(inp.value);
      if (!emb) { msg.textContent = 'That is not an Audiomack song, album or playlist link.'; return; }
      stop(true); amLink = inp.value.trim(); store.set('am', amLink);
      msg.textContent = 'Loaded. Press play inside the player below.';
      amBox.replaceChildren();
      const f = document.createElement('iframe');
      f.src = emb; f.height = '252'; f.style.cssText = 'width:100%;border:0;border-radius:10px;margin-top:8px;';
      f.allow = 'autoplay'; f.loading = 'lazy'; f.title = 'Audiomack player';
      amBox.append(f);
    });
    const amBox = el('div');
    am.append(inp, go, msg, amBox, el('div', 'fine', 'Songs are played by Audiomack and follow its own rules. Songs may be unavailable in some regions.'));
    body.append(am);
    for (const n of ['Spotify', 'Apple Music']) {
      const t = el('div', 'radioTile'); t.append(el('b', '', n), el('span', '', 'SOON'));
      soon.append(t);
    }
    body.append(soon);
    $('radioNow').textContent = current ? `Now playing: ${all.find((s) => s.id === current.id)?.name || ''}` : 'Radio is off';
  }

  fetch('/radio/stations.json').then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j || !Array.isArray(j.stations)) return;
    files = j.stations.filter((s) => s && s.file && s.name).map((s, i) => ({
      id: 'file-' + i, name: String(s.name).slice(0, 40), blurb: 'Your music', credit: s.credit ? String(s.credit).slice(0, 80) : '',
      file: true, url: '/radio/' + encodeURIComponent(String(s.file)),
    }));
    paint();
  }).catch(() => {});

  $('radioBtn').addEventListener('click', () => {
    const p = $('radioPanel');
    const open = p.hidden;
    hideOtherPanels(open ? 'radioPanel' : null);
    p.hidden = !open;
    if (open && !document.querySelector('#radioBody iframe')) paint();
    if (open && window.matchMedia('(max-width: 600px)').matches) {
      $('hud')?.classList.add('compact');
      const m = $('hudMore'); if (m) m.textContent = 'More ▾';
    }
  });
  $('radioClose').addEventListener('click', () => { $('radioPanel').hidden = true; });
  const vol = $('radioVol');
  vol.value = String(Math.round(volume * 100));
  vol.addEventListener('input', () => {
    volume = vol.value / 100; store.set('vol', volume);
    if (master) master.gain.value = volume;
    audio.volume = volume;
  });
  paint();
  return { stop };
}
