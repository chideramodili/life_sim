// Adulthood: voice chat rules (no network, no database). The audio itself goes straight between phones (WebRTC);
// the server only decides who may hear whom and passes the connection set-up messages along.
export const VOICE_RANGE = 25;          // metres on the street
export const VOICE_MAX_PEERS = 6;       // most people one player connects to at once (a call partner always counts)
export const CALL_RING_SECONDS = 30;
export const SIGNAL_TYPES = ['offer', 'answer', 'candidate'];
export const volumeAt = (d) => Math.max(0.15, Math.min(1, 1 - d / VOICE_RANGE));

// Is this a safe connection message? Only the three WebRTC kinds, and small.
export function okSignal(data) {
  if (!data || typeof data !== 'object' || !SIGNAL_TYPES.includes(data.type)) return false;
  try { return JSON.stringify(data).length < 10000; } catch { return false; }
}
// Who should p be connected to right now? `others` = other players who have voice on; each needs { userId, name, sid, x, z, city, room, space }.
// hearsNot(a, b) says whether either has muted/blocked the other. Returns [{ id, name, sid, vol, call }].
export function pickPeers(p, space, others, hearsNot, callWith) {
  const out = [];
  for (const o of others) {
    if (hearsNot(p, o)) continue;
    const call = callWith === o.userId;
    if (call) { out.push({ id: o.userId, name: o.name, sid: o.sid, vol: 1, call: true, d: 0 }); continue; }
    if (o.space !== space || o.city !== p.city) continue;
    let d = 0;
    if (p.room === 'street') { d = Math.hypot(p.x - o.x, p.z - o.z); if (d > VOICE_RANGE) continue; }
    out.push({ id: o.userId, name: o.name, sid: o.sid, vol: Math.round(volumeAt(d) * 10) / 10, call: false, d });
  }
  out.sort((a, b) => (b.call - a.call) || a.d - b.d);
  return out.slice(0, VOICE_MAX_PEERS).map(({ d, ...r }) => r);
}
