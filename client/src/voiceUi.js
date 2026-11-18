// Adulthood: voice chat. Proximity voice (players near you, or in the same building) and friend calls, push-to-talk.
// The audio goes straight between phones (WebRTC). The server only says who may connect and passes the set-up messages along.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function initVoice(socket) {
  let cfg = { ice: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] };
  let stream = null, on = false, talking = false, locked = false;
  let peers = [], call = { with: null, ring: null }, friends = [];
  const conns = new Map();            // userId -> { pc, audio, analyser, pending: [], vol, level }
  const silenced = new Set();         // userIds silenced on this phone for this session
  let ctx = null, autoLock = false, mic = { an: null, level: 0 };
  const audioHost = el('div'); audioHost.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;overflow:hidden'; document.body.append(audioHost);
  // Phones only let a page play incoming audio after you touch the screen. Retry on any touch.
  const wake = () => { try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch {} for (const c of conns.values()) if (c.audio && c.audio.paused) c.audio.play().catch(() => {}); };
  document.addEventListener('pointerdown', wake, true);

  // ---------- screen bits ----------
  const btn = el('button'); btn.id = 'voiceBtn'; btn.setAttribute('aria-label', 'Push to talk'); btn.textContent = '🎙️';
  const appBtn = el('button'); appBtn.id = 'voiceAppBtn'; appBtn.hidden = true; appBtn.textContent = 'Voice';
  const panel = el('div', 'panel'); panel.id = 'voicePanel'; panel.hidden = true;
  const head = el('div', 'sheetHead'); head.append(el('span', '', '🎙️ Voice'));
  const close = el('button', 'closeX', '×'); close.setAttribute('aria-label', 'Close'); head.append(close);
  const body = el('div'); body.id = 'voiceBody';
  panel.append(head, body);
  const pill = el('div'); pill.id = 'voicePill'; pill.hidden = true;
  const speak = el('div'); speak.id = 'voiceSpeak'; speak.hidden = true;
  document.body.append(btn, appBtn, panel, pill, speak);
  const st = document.createElement('style');
  st.textContent = '#voiceBtn { position: fixed; right: 12px; top: 200px; z-index: 6; width: 46px; height: 46px; border-radius: 50%; border: 1px solid var(--line); background: rgba(20, 22, 28, .78); color: #fff; font-size: 20px; touch-action: none; user-select: none; -webkit-user-select: none; }'
    + '#voiceBtn.off { opacity: .6; } #voiceBtn.live { border-color: #3ddc84; } #voiceBtn.talk { background: #e0354b; border-color: #ff8a98; transform: scale(1.1); }'
    + '#voicePanel { bottom: 70px; right: 12px; width: min(380px, calc(100vw - 24px)); box-sizing: border-box; z-index: 8; max-height: 76vh; overflow-y: auto; }'
    + '@media (max-width: 600px) { #voicePanel { left: 12px; right: 12px; width: auto; background: var(--bg); } }'
    + '.vcRow { padding: 10px; margin: 8px 0; border-radius: 12px; background: var(--bg2); border: 0.5px solid var(--line); } .vcTop { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; } .vcSub { font-size: 12px; opacity: .8; margin-top: 2px; }'
    + '.vcBtns { display: flex; gap: 6px; margin-top: 8px; } .vcGo { flex: 1; height: 34px; border: 0; border-radius: 10px; font-weight: 700; background: var(--hi); color: var(--on-hi); } .vcGo.alt { background: var(--bg); color: inherit; border: 0.5px solid var(--line); } .vcGo:disabled { opacity: .5; }'
    + '#voicePill, #voiceSpeak { position: fixed; left: 50%; transform: translateX(-50%); z-index: 9; width: max-content; max-width: calc(100vw - 24px); padding: 7px 14px; border-radius: 18px; background: rgba(20, 22, 28, .9); color: #fff; font-size: 13px; font-weight: 600; text-align: center; }'
    + '#voicePill { top: 112px; border: 1px solid #3ddc84; } #voicePill .vcBtns button { flex: 1; height: 32px; border: 0; border-radius: 10px; font-weight: 700; background: #3ddc84; color: #06220f; } #voicePill .vcBtns button.alt { background: #3a3f4b; color: #fff; }'
    + '#voiceSpeak { top: 76px; font-weight: 500; font-size: 12px; opacity: .92; }';
  document.head.append(st);

  // ---------- microphone ----------
  const setTalk = (v) => {
    talking = v || locked;
    if (stream) for (const t of stream.getAudioTracks()) t.enabled = talking;
    paintBtn();
  };
  async function enable() {
    if (on) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert('This browser cannot use the microphone.'); return false; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch { alert('Microphone blocked. Allow the microphone for this site in your browser settings, then try again.'); return false; }
    for (const t of stream.getAudioTracks()) t.enabled = false;
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch { ctx = null; }
    try { if (ctx) { const src = ctx.createMediaStreamSource(stream); mic.an = ctx.createAnalyser(); mic.an.fftSize = 256; src.connect(mic.an); } } catch { mic.an = null; }
    on = true; socket.emit('voiceOn', true); paintBtn(); paint();
    return true;
  }
  function disable() {
    on = false; locked = false; talking = false;
    socket.emit('voiceOn', false);
    for (const id of [...conns.keys()]) drop(id);
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
    peers = []; mic.an = null; mic.level = 0; paintBtn(); paint();
  }
  const paintBtn = () => { btn.className = !on ? 'off' : talking ? 'talk' : 'live'; btn.textContent = !on ? '🎙️' : talking ? '🔴' : '🎤'; };

  // Hold the button to talk. A quick tap while voice is off turns it on.
  let downAt = 0;
  btn.addEventListener('pointerdown', async (e) => {
    e.preventDefault(); downAt = Date.now();
    if (!on) return;
    setTalk(true);
  });
  const up = () => { if (!on) { if (downAt) { downAt = 0; enable(); } return; } downAt = 0; if (!locked) setTalk(false); };
  btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', () => { if (on && !locked) setTalk(false); });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- connections ----------
  function drop(id, retry = false) {
    const c = conns.get(id);
    if (!c) return;
    if (retry) setTimeout(() => { if (on && !conns.has(id)) { const p = peers.find((x) => x.id === id); if (p) open(p); } }, 3000);
    try { c.pc.close(); } catch {}
    if (c.audio) { c.audio.srcObject = null; c.audio.remove(); }
    conns.delete(id);
  }
  function open(peer) {
    if (conns.has(peer.id) || !stream) return;
    const pc = new RTCPeerConnection({ iceServers: cfg.ice });
    const c = { pc, audio: null, analyser: null, level: 0, vol: peer.vol, pending: [] };
    conns.set(peer.id, c);
    for (const t of stream.getAudioTracks()) pc.addTrack(t, stream);
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('voiceSignal', { to: peer.id, data: { type: 'candidate', candidate: e.candidate.toJSON() } }); };
    pc.ontrack = (e) => {
      const a = document.createElement('audio'); a.autoplay = true; a.playsInline = true; a.setAttribute('playsinline', ''); a.srcObject = e.streams[0]; a.volume = silenced.has(peer.id) ? 0 : c.vol; c.audio = a; audioHost.append(a);
      a.play().catch(() => {});
      if (ctx) { try { const src = ctx.createMediaStreamSource(e.streams[0]); const an = ctx.createAnalyser(); an.fftSize = 256; src.connect(an); c.analyser = an; } catch {} }
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { if (conns.get(peer.id) === c) { drop(peer.id, pc.connectionState === 'failed'); if (!panel.hidden) paint(); } } else if (!panel.hidden) paint(); };
    pc.oniceconnectionstatechange = () => { if (!panel.hidden) paint(); };
    // The player with the smaller id makes the offer, so two phones never both offer at once.
    if (myId !== null && myId < peer.id) {
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => socket.emit('voiceSignal', { to: peer.id, data: { type: 'offer', sdp: pc.localDescription.sdp } })).catch(() => drop(peer.id));
    }
  }
  let myId = null;
  async function onSignal({ from, data }) {
    if (!on) return;
    let c = conns.get(from);
    if (!c) { const peer = peers.find((x) => x.id === from); if (!peer) return; open(peer); c = conns.get(from); if (!c) return; }
    const pc = c.pc;
    try {
      if (data.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        for (const k of c.pending.splice(0)) await pc.addIceCandidate(k).catch(() => {});
        const a = await pc.createAnswer(); await pc.setLocalDescription(a);
        socket.emit('voiceSignal', { to: from, data: { type: 'answer', sdp: pc.localDescription.sdp } });
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        for (const k of c.pending.splice(0)) await pc.addIceCandidate(k).catch(() => {});
      } else if (data.type === 'candidate') {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {}); else c.pending.push(data.candidate);
      }
    } catch { drop(from); }
  }
  const applyVolumes = () => { for (const [id, c] of conns) { const p = peers.find((x) => x.id === id); if (p) c.vol = p.vol; if (c.audio) c.audio.volume = silenced.has(id) ? 0 : c.vol; } };

  // ---------- panel ----------
  const connText = (c) => {
    if (!c) return 'not connected yet';
    const s = c.pc.iceConnectionState;
    if (s === 'connected' || s === 'completed') return c.level > 0.04 ? 'connected, you can hear them' : 'connected';
    if (s === 'failed') return 'could not connect (your network blocks direct audio)';
    if (s === 'disconnected') return 'connection dropped, retrying';
    return 'connecting…';
  };
  const nameOf = (id) => (peers.find((x) => x.id === id) || {}).name || '';
  function paint() {
    body.replaceChildren();
    const top = el('div', 'vcRow');
    top.append(el('div', 'vcTop', on ? '🟢 Voice is on' : '⚪ Voice is off'), el('div', 'vcSub', on ? 'Hold the round 🎤 button on the right of the screen to talk. Only people near you (or in the same building) can hear you.' : 'Turn voice on to talk to nearby players. Your phone will ask for permission to use the microphone. Nothing is recorded.'));
    const row = el('div', 'vcBtns');
    const g = el('button', 'vcGo', on ? 'Turn voice off' : 'Turn voice on'); g.addEventListener('click', () => (on ? disable() : enable()));
    row.append(g);
    if (on) { const l = el('button', 'vcGo alt', locked ? 'Mic stays open ✓' : 'Keep mic open'); l.addEventListener('click', () => { locked = !locked; setTalk(false); paint(); }); row.append(l); }
    top.append(row);
    if (on) {
      const meter = el('div', 'vcSub', 'Your mic (hold 🎤 and say hello: the bar should move)');
      const bar = el('div'); bar.id = 'vcMeter'; bar.style.cssText = 'height:8px;border-radius:4px;background:#3a3f4b;margin-top:4px;overflow:hidden';
      const fill = el('div'); fill.id = 'vcMeterFill'; fill.style.cssText = 'height:100%;width:0;background:#3ddc84;transition:width .1s'; bar.append(fill);
      top.append(meter, bar);
    }
    body.append(top);
    if (!on) return;
    body.append(el('div', 'vcTop', 'Who can hear you'));
    if (!peers.length) body.append(el('div', 'fine', 'Nobody close by with voice on.'));
    for (const p of peers) {
      const r = el('div', 'vcRow'), c = conns.get(p.id);
      r.append(el('div', 'vcTop', `${c && c.level > 0.04 ? '🔊' : '🎧'} ${p.name}`), el('div', 'vcSub', `${connText(c)}${p.call ? ' · on a call' : ` · volume ${Math.round(p.vol * 100)}%`}`));
      const b = el('div', 'vcBtns');
      const s = el('button', 'vcGo alt', silenced.has(p.id) ? 'Unsilence' : 'Silence'); s.addEventListener('click', () => { silenced.has(p.id) ? silenced.delete(p.id) : silenced.add(p.id); applyVolumes(); paint(); });
      const rp = el('button', 'vcGo alt', 'Report'); rp.addEventListener('click', () => { if (confirm(`Report ${p.name}?`)) socket.emit('report', { sid: p.sid }); });
      const bl = el('button', 'vcGo alt', 'Block'); bl.addEventListener('click', () => { if (confirm(`Block ${p.name}? You will not hear each other or see each other's chat.`)) socket.emit('mute', { sid: p.sid }); });
      b.append(s, rp, bl); r.append(b); body.append(r);
    }
    body.append(el('div', 'vcTop', 'Call a friend'));
    if (call.with) { const r = el('div', 'vcRow'); r.append(el('div', 'vcTop', `📞 On a call with ${call.with}`)); const e = el('button', 'vcGo', 'Hang up'); e.addEventListener('click', () => socket.emit('callEnd')); r.append(e); body.append(r); }
    else {
      const online = friends.filter((f) => f.online);
      if (!online.length) body.append(el('div', 'fine', 'None of your friends are online.'));
      for (const f of online) { const r = el('div', 'vcRow'); r.append(el('div', 'vcTop', `🟢 ${f.name}`)); const c = el('button', 'vcGo', 'Call 📞'); c.addEventListener('click', () => socket.emit('callStart', f.name)); r.append(c); body.append(r); }
    }
  }
  function paintPill() {
    pill.replaceChildren();
    if (call.ring && !call.with) {
      pill.hidden = false; pill.append(el('div', '', `📞 ${call.ring} is calling you`));
      const row = el('div', 'vcBtns'), y = el('button', '', 'Answer'), n = el('button', 'alt', 'Decline');
      y.addEventListener('click', async () => { if (await enable()) socket.emit('callAnswer', true); });
      n.addEventListener('click', () => socket.emit('callAnswer', false));
      row.append(y, n); pill.append(row);
    } else if (call.with) {
      pill.hidden = false; pill.append(el('div', '', `📞 On a call with ${call.with}`));
      const row = el('div', 'vcBtns'), e = el('button', 'alt', 'Hang up'); e.addEventListener('click', () => socket.emit('callEnd')); row.append(e); pill.append(row);
    } else pill.hidden = true;
  }

  // ---------- socket ----------
  socket.on('voiceCfg', (x) => { if (x && Array.isArray(x.ice)) cfg = x; if (x && Number.isInteger(x.me)) myId = x.me; });
  socket.on('voicePeers', (x) => {
    peers = x.peers || [];
    for (const id of [...conns.keys()]) if (!peers.some((p) => p.id === id)) drop(id);
    if (on) for (const p of peers) open(p);
    applyVolumes(); if (!panel.hidden) paint();
  });
  socket.on('voiceSignal', onSignal);
  socket.on('call', (x) => {
    call = x;
    // On a call, nobody should have to hold a button: keep the mic open until the call ends.
    if (call.with && on && !locked) { locked = true; autoLock = true; setTalk(false); }
    else if (!call.with && autoLock) { locked = false; autoLock = false; setTalk(false); }
    paintPill(); if (!panel.hidden) paint();
  });
  socket.on('friends', (f) => { friends = (f && f.friends) || []; if (!panel.hidden) paint(); });
  socket.on('disconnect', () => { for (const id of [...conns.keys()]) drop(id); });
  socket.on('connect', () => { if (on) socket.emit('voiceOn', true); });
  appBtn.addEventListener('click', () => { panel.hidden = false; paint(); });
  close.addEventListener('click', () => { panel.hidden = true; });

  // Who is talking? Look at how loud each incoming voice is a few times a second.
  const buf = new Uint8Array(128);
  setInterval(() => {
    let who = [];
    for (const [id, c] of conns) {
      if (!c.analyser) continue;
      c.analyser.getByteTimeDomainData(buf);
      let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128));
      c.level = m / 128;
      if (c.level > 0.04 && !silenced.has(id)) who.push(nameOf(id) || 'Someone');
    }
    if (mic.an) {
      mic.an.getByteTimeDomainData(buf);
      let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128));
      mic.level = m / 128;
      const f = document.getElementById('vcMeterFill'); if (f) f.style.width = Math.min(100, Math.round(mic.level * 300)) + '%';
    }
    if (who.length) { speak.hidden = false; speak.textContent = '🗣 ' + who.join(', '); } else speak.hidden = true;
  }, 250);
  window.__voice = { conns, get peers() { return peers; }, get on() { return on; }, enable, setTalk };
}
