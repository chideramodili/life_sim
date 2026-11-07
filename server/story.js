// Story engine: reads a chapter data file and decides what happens next for each player.
// The story is data (chapter1.json). Writers change the file, not this code.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Delays in the data file are in seconds. Set STORY_DELAY_SCALE=0.1 to test ten times faster.
const DELAY_SCALE = Number(process.env.STORY_DELAY_SCALE) || 1;
const NEED_IDS = ['food', 'energy', 'fun', 'social', 'clean', 'toilet'];
const TYPES = ['card', 'message', 'event'];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// ---------- Loading and checking the data file ----------
export function loadChapter(roomIds, file = path.join(here, 'chapter1.json')) {
  let chapter;
  try {
    chapter = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read ${path.basename(file)}: ${err.message}`);
  }
  const problems = [];
  const ids = new Set();
  const objectiveIds = new Set((chapter.objectives || []).map((o) => o.id));
  if (!Array.isArray(chapter.beats) || chapter.beats.length === 0) problems.push('"beats" must be a list with at least one beat.');
  for (const b of chapter.beats || []) {
    const where = `beat "${b.id}"`;
    if (!b.id || typeof b.id !== 'string') problems.push('a beat has no "id".');
    if (ids.has(b.id)) problems.push(`${where} is used twice.`);
    ids.add(b.id);
    if (!TYPES.includes(b.type)) problems.push(`${where} has an unknown type "${b.type}". Use card, message, or event.`);
    if (!b.text) problems.push(`${where} has no "text".`);
    if (b.type !== 'card' && (!Array.isArray(b.choices) || b.choices.length === 0)) problems.push(`${where} needs at least one choice.`);
    const w = b.when || {};
    if (w.visit && !roomIds.includes(w.visit)) problems.push(`${where} waits for a room "${w.visit}" that does not exist.`);
    for (const c of b.choices || []) {
      if (!c.label) problems.push(`${where} has a choice with no "label".`);
      const fx = c.effects || {};
      for (const o of fx.objectives || []) if (!objectiveIds.has(o)) problems.push(`${where} completes an objective "${o}" that is not listed under "objectives".`);
      for (const n of Object.keys(fx.needs || {})) if (!NEED_IDS.includes(n)) problems.push(`${where} changes an unknown need "${n}".`);
    }
  }
  for (const b of chapter.beats || []) {
    const w = b.when || {};
    if (w.after && !ids.has(w.after)) problems.push(`beat "${b.id}" comes after "${w.after}", which does not exist.`);
    for (const a of w.afterAny || []) if (!ids.has(a)) problems.push(`beat "${b.id}" comes after "${a}", which does not exist.`);
  }
  if (problems.length) throw new Error(`${path.basename(file)} has problems:\n- ${problems.join('\n- ')}`);
  return chapter;
}

// ---------- Each player's story progress (saved in the database as JSON) ----------
export const newState = () => ({
  done: [], doneAt: {}, last: {}, flags: [], objectives: {}, score: 0,
  active: null, finished: false, startedAt: Date.now(),
});

export function parseState(json) {
  if (!json) return newState();
  try {
    const s = JSON.parse(json);
    const base = newState();
    return {
      done: Array.isArray(s.done) ? s.done.filter((x) => typeof x === 'string') : base.done,
      doneAt: s.doneAt && typeof s.doneAt === 'object' ? s.doneAt : base.doneAt,
      last: s.last && typeof s.last === 'object' ? s.last : base.last,
      flags: Array.isArray(s.flags) ? s.flags.filter((x) => typeof x === 'string') : base.flags,
      objectives: s.objectives && typeof s.objectives === 'object' ? s.objectives : base.objectives,
      score: Number.isFinite(s.score) ? s.score : 0,
      active: s.active && typeof s.active.id === 'string' ? s.active : null,
      finished: s.finished === true,
      startedAt: Number.isFinite(s.startedAt) ? s.startedAt : base.startedAt,
    };
  } catch {
    return newState();
  }
}

export function createEngine(chapter) {
  const byId = new Map(chapter.beats.map((b) => [b.id, b]));

  // Is this beat allowed to happen right now?
  function ready(st, p, b, now) {
    const w = b.when || {};
    if (w.visit && p.room !== w.visit) return false;
    if (w.requires && !w.requires.every((f) => st.flags.includes(f))) return false;
    if (w.forbids && w.forbids.some((f) => st.flags.includes(f))) return false;
    if (w.scoreMin !== undefined && st.score < w.scoreMin) return false;
    if (w.scoreMax !== undefined && st.score > w.scoreMax) return false;
    let base = st.startedAt;
    if (w.after) {
      if (!st.done.includes(w.after)) return false;
      base = st.doneAt[w.after] || base;
    }
    if (w.afterAny) {
      const hit = w.afterAny.filter((id) => st.done.includes(id));
      if (!hit.length) return false;
      base = Math.max(...hit.map((id) => st.doneAt[id] || 0));
    }
    if (w.delay && now - base < w.delay * 1000 * DELAY_SCALE) return false;
    if (w.cooldown && st.last[b.id] && now - st.last[b.id] < w.cooldown * 1000 * DELAY_SCALE) return false;
    return true;
  }

  // Called about once a second for every player. Returns true if something new started.
  function tick(p, now = Date.now()) {
    const st = p.story;
    if (st.finished || st.active) return false;
    for (const b of chapter.beats) {
      if (st.done.includes(b.id)) continue;
      if (ready(st, p, b, now)) {
        st.active = { id: b.id, stage: 'choose', pick: null };
        st.last[b.id] = now;
        return true;
      }
    }
    return false;
  }

  function applyEffects(p, fx = {}) {
    const st = p.story;
    if (typeof fx.cash === 'number') p.cash = Math.max(0, p.cash + fx.cash);
    for (const [need, delta] of Object.entries(fx.needs || {})) {
      if (NEED_IDS.includes(need) && Number.isFinite(delta)) p[need] = clamp(p[need] + delta, 0, 100);
    }
    for (const f of fx.flags || []) if (!st.flags.includes(f)) st.flags.push(f);
    if (typeof fx.score === 'number') st.score += fx.score;
    for (const o of fx.objectives || []) st.objectives[o] = true;
  }

  // The player picked a choice. Only a valid pick on the active beat counts.
  function choose(p, id, idx) {
    const st = p.story;
    const a = st.active;
    if (!a || a.id !== id || a.stage !== 'choose') return false;
    const b = byId.get(id);
    if (!b || b.type === 'card') return false;
    if (!Number.isInteger(idx) || idx < 0 || idx >= b.choices.length) return false;
    applyEffects(p, b.choices[idx].effects);
    a.stage = 'result';
    a.pick = idx;
    return true;
  }

  // The player pressed Continue (or Start on a card).
  function ack(p, id) {
    const st = p.story;
    const a = st.active;
    if (!a || a.id !== id) return false;
    const b = byId.get(id);
    if (!b) return false;
    if (b.type === 'card') {
      if (a.stage !== 'choose') return false;
      if (b.reward) applyEffects(p, b.reward);
      if (b.finish) st.finished = true;
    } else if (a.stage !== 'result') {
      return false;
    }
    const retry = b.type !== 'card' && b.choices[a.pick] && b.choices[a.pick].retry === true;
    if (!retry) {
      st.done.push(id);
      st.doneAt[id] = Date.now();
    }
    st.active = null;
    return true;
  }

  const chipsFor = (fx = {}) => {
    const chips = [];
    if (typeof fx.cash === 'number' && fx.cash !== 0) chips.push(`${fx.cash > 0 ? '+' : '−'}₦${Math.abs(fx.cash).toLocaleString('en-US')}`);
    for (const [need, delta] of Object.entries(fx.needs || {})) {
      chips.push(`${need.charAt(0).toUpperCase() + need.slice(1)} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`);
    }
    return chips;
  };

  // What the browser needs to draw the story screen.
  function view(p) {
    const st = p.story;
    const out = {
      chapter: {
        title: chapter.title,
        finished: st.finished,
        objectives: chapter.objectives.map((o) => ({ id: o.id, text: o.text, done: Boolean(st.objectives[o.id]) })),
      },
      flags: st.flags,
      active: null,
    };
    if (st.active) {
      const b = byId.get(st.active.id);
      if (b) {
        const a = { id: b.id, type: b.type, who: b.who || null, title: b.title || null, text: b.text, stage: st.active.stage, choices: [] };
        if (b.type === 'card') {
          a.objectives = out.chapter.objectives;
          if (b.reward) a.reward = chipsFor(b.reward);
          if (b.recap) a.recap = st.flags.map((f) => chapter.recap && chapter.recap[f]).filter(Boolean).slice(0, 3);
        } else if (st.active.stage === 'choose') {
          a.choices = b.choices.map((c) => c.label);
        } else {
          const c = b.choices[st.active.pick];
          a.pickLabel = c.label;
          a.result = c.reply || c.result || '';
          a.chips = chipsFor(c.effects && { cash: c.effects.cash, needs: c.effects.needs });
        }
        out.active = a;
      }
    }
    return out;
  }

  return { tick, choose, ack, view };
}