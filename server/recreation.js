// Adulthood: recreation (Fun Spots). Rules only (no network, no database), like race.js and party.js.
// Every city has five fun spots, marked on the street: a swimming spot, a cinema, a fishing spot, a dance floor and a football pitch.
// You walk up to one and start an activity. The server runs the timers and decides every result, so nothing can be faked from the phone.
import { spreadPoints } from './special.js';

export const REACH = 18;                 // metres: you must be this close to start (and stay this close while it runs)
export const STAY = 26;                  // leaving further than this cancels a timed activity (no refund)
export const EARN_CAP = 12000;           // most cash recreation can pay you per rolling hour (fishing and football)
export const CAP_WINDOW_MS = 3600000;

export const SPOTS = {
  swim:     { id: 'swim', icon: '🏊', title: 'Swimming spot', fee: 1500, text: 'A 30-second swim: fun and clean go way up, energy goes down a little.' },
  cinema:   { id: 'cinema', icon: '🎬', title: 'Cinema', fee: 3000, text: 'A 40-second film: big fun and some social. Watch with a friend for extra social.' },
  fish:     { id: 'fish', icon: '🎣', title: 'Fishing spot', fee: 500, text: 'Bait costs a little. Cast, wait for the bite, then reel in quickly. Bigger fish sell for more.' },
  dance:    { id: 'dance', icon: '💃', title: 'Dance floor', fee: 1000, text: 'Eight beats. Tap in time with the beat. The better your timing, the more fun and social you get.' },
  football: { id: 'football', icon: '⚽', title: 'Football pitch', fee: 0, text: 'Five penalty kicks. Pick left, middle or right and beat the keeper. Each goal pays a little.' },
};
export const SPOT_IDS = Object.keys(SPOTS);
export const isSpot = (k) => typeof k === 'string' && Object.hasOwn(SPOTS, k);

// ----- timings and rewards -----
export const SWIM_MS = Number(process.env.REC_SWIM_MS) || 30000;
export const CINEMA_MS = Number(process.env.REC_CINEMA_MS) || 40000;
export const BITE_MIN_MS = 4000, BITE_MAX_MS = 9000, BITE_WINDOW_MS = 1500, LATENCY_MS = 400;
export const DANCE_BEATS = 8, BEAT_MS = 1000, DANCE_LEAD_MS = 3000, TAP_TOLERANCE_MS = 420, TAP_GAP_MS = 200;
export const KICKS = 5, GOAL_PAY = 600, KICK_COOLDOWN_MS = Number(process.env.REC_FOOTBALL_CD_MS) || 45000;
export const MISS_CHANCE = 0.15;         // a shot that goes wide

export const FX = {
  swim:   { fun: 30, clean: 35, energy: -10, xp: 25 },
  cinema: { fun: 38, social: 8, energy: -3, xp: 25, friendSocial: 12 },
};
export const danceFx = (hits) => ({ fun: 8 + hits * 3, social: 3 + hits, energy: -6, xp: 10 + hits * 4 });
export const kickFx = { fun: 4, energy: -2 };

// Fish, rarest last. Prices are placeholders to tune.
export const FISH = [
  { id: 'tilapia', name: 'Tilapia', w: 60, min: 500, max: 1000, xp: 6 },
  { id: 'catfish', name: 'Catfish', w: 28, min: 1200, max: 2000, xp: 10 },
  { id: 'tuna', name: 'Tuna', w: 10, min: 3000, max: 4500, xp: 18 },
  { id: 'golden', name: 'Golden fish', w: 2, min: 8000, max: 10000, xp: 40 },
];
export function rollFish(rnd) {
  const total = FISH.reduce((n, f) => n + f.w, 0);
  let r = rnd() * total;
  for (const f of FISH) { r -= f.w; if (r < 0) return { id: f.id, name: f.name, xp: f.xp, value: Math.round((f.min + rnd() * (f.max - f.min)) / 50) * 50 }; }
  const f = FISH[0];
  return { id: f.id, name: f.name, xp: f.xp, value: f.min };
}
export const biteIn = (rnd) => Math.round(BITE_MIN_MS + rnd() * (BITE_MAX_MS - BITE_MIN_MS));

// What happens when the player reels in. `since` = ms since the cast, `biteAt` = when the fish bites.
export function reel(since, biteAt) {
  if (since < biteAt) return 'early';                                  // pulled before any bite: the line is wasted
  if (since <= biteAt + BITE_WINDOW_MS + LATENCY_MS) return 'catch';
  return 'late';                                                        // the fish got away
}

// ----- dancing: score the taps against the beats. beats are at start + DANCE_LEAD + k * BEAT_MS (ms since the start).
export function danceScore(taps) {
  const used = new Set();
  let hits = 0;
  for (const t of taps) {
    let best = -1, bd = Infinity;
    for (let k = 0; k < DANCE_BEATS; k++) {
      if (used.has(k)) continue;
      const d = Math.abs(t - (DANCE_LEAD_MS + k * BEAT_MS));
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0 && bd <= TAP_TOLERANCE_MS) { used.add(best); hits++; }
  }
  return hits;
}
export const danceDoneAt = () => DANCE_LEAD_MS + DANCE_BEATS * BEAT_MS + 600;

// ----- football: dir 0 left, 1 middle, 2 right. Returns { goal, keeper, wide }.
export function kick(dir, rnd) {
  const keeper = Math.floor(rnd() * 3);
  const wide = rnd() < MISS_CHANCE;
  return { keeper, wide, goal: !wide && keeper !== dir };
}
export const isDir = (d) => Number.isInteger(d) && d >= 0 && d <= 2;

// ----- earnings cap: cash from recreation per rolling hour.
export function capRoom(state, now) {
  const s = state && now - state.at < CAP_WINDOW_MS ? state : { at: now, n: 0 };
  return { state: s, room: Math.max(0, EARN_CAP - s.n) };
}
export function addEarn(state, n, now) {
  const s = state && now - state.at < CAP_WINDOW_MS ? state : { at: now, n: 0 };
  return { at: s.at, n: s.n + n };
}

// ----- spots: five spread-out places per city. The same every time for the same layout.
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export function spotsFor(layout, cityId) {
  const rnd = mulberry(hash('rec:' + cityId));
  let pts = [];
  for (const gap of [90, 60, 35, 15, 0]) { pts = spreadPoints(layout, SPOT_IDS.length, rnd, gap); if (pts.length >= SPOT_IDS.length) break; }
  return pts.slice(0, SPOT_IDS.length).map((p, i) => ({ kind: SPOT_IDS[i], x: p.x + 3, z: p.z + 3 }));
}
export const near = (spot, p, r = REACH) => Math.hypot(p.x - spot.x, p.z - spot.z) <= r;
