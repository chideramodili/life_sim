// Chat rules: clean up the text, block links and phone numbers, mask blocked words,
// and limit how fast one player can send. This is a starting point, not a complete filter.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MAX_CHAT_LENGTH = 120;

function loadWords(file = path.join(here, 'blocklist.json')) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (Array.isArray(data.words) ? data.words : []).map((w) => String(w).trim().toLowerCase()).filter(Boolean);
  } catch (err) {
    console.warn(`Could not read blocklist.json (${err.message}). Chat will run without a word filter.`);
    return [];
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORDS = loadWords();
const WORD_RE = WORDS.length ? new RegExp(`\\b(${WORDS.map(escapeRe).join('|')})\\b`, 'gi') : null;
const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ng|co|me|app|xyz|link|ly|gl)\b)/i;
const NUMBER_RE = /(?:\d[\s.\-]?){9,}/; // 9 or more digits in a row: phone and account numbers

// Returns { text } when the message is fine, or { error } with a short message for the player.
export function cleanText(raw) {
  if (typeof raw !== 'string') return { error: 'Type a message first.' };
  const t = raw
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '') // hidden control characters
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return { error: 'Type a message first.' };
  if (t.length > MAX_CHAT_LENGTH) return { error: `Keep it under ${MAX_CHAT_LENGTH} characters.` };
  if (LINK_RE.test(t)) return { error: 'Links are not allowed in chat.' };
  if (NUMBER_RE.test(t)) return { error: 'Do not share phone numbers or account numbers.' };
  return { text: WORD_RE ? t.replace(WORD_RE, (m) => '*'.repeat(m.length)) : t };
}

// Allow at most `max` events per `windowMs`. `times` is that player's own list of timestamps.
export function allow(times, max, windowMs, now = Date.now()) {
  while (times.length && now - times[0] > windowMs) times.shift();
  if (times.length >= max) return false;
  times.push(now);
  return true;
}