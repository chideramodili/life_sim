// Adulthood: game server. Accounts, rooms, needs, story, chat, work, player themes, the shared clock,
// opening hours, city events, rent and bills, a personal Home, and serving the built game.
// The server owns the truth (accounts, money, positions, trips) and saves it to a database.
// Browsers only send requests.
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChapter, createEngine, parseState } from './story.js';
import { cleanText, allow } from './moderation.js';
import { createTraffic } from './traffic.js';
import { trafficLevel } from './world.js';
import { phaseAt, stateOf, junctionAt, axisOfHeading } from './signals.js';
import { VEH, newDrive, stepSpeed, moveDrive, POLICE, newChase, chaseTick, lineOfSight } from './driving.js';
import { OFFENCES, STEAL, ARREST_JAIL_SEC, PATROL_EVERY_MS, PATROL_CHANCE, cleanFines, newFine, fineView, totalDue, overdueTotal, payFine, payOldestFirst, stealOutcome, wantedByPolice } from './police.js';
import { getCity, CITY, DOOR_REACH, routeBetween, pointOnRoute } from './city.js';
import { speedFor, slide, findPath, roomBlockedFn, roomSolids } from './movement.js';
import { MOVE_FEE, CITIES, CITY_IDS, DEFAULT_CITY, isCity, parseCity, TICKETS, TICKET_IDS, ticketQuote, distanceBetween, HIGHWAY, neighbour, gateAt, arrivalFrom } from './cities.js';
import { MAX_LOTS, SELL_LAND, BIZ_MAX_LEVEL, UPGRADE_COST, STOCK_CAP, KINDS, KIND_IDS, isKind, priceOf, validName, isOpen as bizOpenNow, newBiz, step as bizStep, buyStock, payStaff, hire as bizHire, STAFF_WAGE, STAFF_MAX, STAFF_BOOST, HIRE_FEE } from './business.js';
import { PHONES, PHONE_IDS, parsePhones, serializePhones, buyPhone, usePhone, hasCamera } from './phones.js';
import { newChess, chessMove, chessStatus, legalMoves, newTwentyOne, twentyOneAct, handValue, newWordRace, wordGuess, GAME_KINDS, WORD_ROUNDS } from './games.js';
import { MAX_FRIENDS, MAX_REQUESTS_OUT, DM_KEEP, DM_SHOW, PHONE_RE, NAME_RE, newPhone, phoneText, checkTransfer, transferLimits } from './friends.js';
import {
  DAY_MIN, REAL_MS_PER_DAY, timeText, gameMinutesFor,
  isOpen, hoursText, minutesUntilClose,
  BILLS, BILL_IDS, parseBills, billStatus, tickBills, quote, applyPayment, consequences,
  EVENTS, EVENT_IDS, pickEvent, effectiveTravel,
} from './world.js';
import {
  SKILLS, SKILL_IDS, xpForLevel, MAX_LEVEL, parseSkills, levelOf, progressOf, studyRule, STUDY, PRACTICE, STUDY_MODES,
  JOBS, jobById, qualifies, JOB_MIN_REP, shiftMs, perkOf, INTERVIEW, needsInterview, startInterview, gradeInterview, STRESS, SICK, clampStress, burnoutNext, sickChance,
} from './skills.js';
import {
  VEHICLES, VEHICLE_IDS, parseVehicles, travelFor, NPCS, NPC_IDS, QUESTS, parseNet, relOf, relLabel, REL_MAX,
  peopleIn, present, topicVisible, pickTip, overheard,
  REP, repTier, clampRep, payBonus, relBonus,
} from './social.js';
import {
  LOAN, CREDIT, parseBank, bankInfo, tickBank, openAccount, deposit, withdraw, takeLoan, payInstallment, payoffLoan, payDebt,
  garnish, addScore,
} from './bank.js';
import {
  parseWardrobe, wardrobeInfo, fashionCatalog, publicLook, charmBonus, compliment, COMPLIMENT_COOLDOWN_MS, outfitOf, scentOf,
  buyClothes, sellClothes, wear, takeOff, buyPerfume, sellPerfume, spritz, tickScent,
} from './fashion.js';
import { parseHome, homeInfo, effectsOf, buyItem, sellItem, placeItem, putAway, paint, setLights } from './home.js';

// ---------- Settings ----------
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*'; // set this to your real site before launch
const DB_FILE = process.env.DB_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'game.db');
const AUTH_LIMIT = Number(process.env.AUTH_LIMIT) || 10;          // wrong passwords or codes per IP per 15 minutes
const SIGNUP_LIMIT = Number(process.env.SIGNUP_LIMIT) || AUTH_LIMIT * 2; // new accounts per IP per 15 minutes
const SESSION_DAYS = 30;
const SAVE_EVERY_MS = 10000;
const NEEDS_TICK_MS = Number(process.env.NEEDS_TICK_MS) || 5000;   // how often needs are updated
const NEEDS_SPEED = Number(process.env.NEEDS_SPEED) || 1;          // 2 = needs drop twice as fast, 0.5 = half as fast
const ADMIN_KEY = process.env.ADMIN_KEY || '';                      // set this to read chat reports. Empty means the report list is off
const WORK_COOLDOWN_MS = process.env.WORK_COOLDOWN_MS !== undefined ? Number(process.env.WORK_COOLDOWN_MS) : 5 * 60 * 1000;
const WORK_ENERGY = 10;        // energy a shift costs
const WORK_MIN_ENERGY = 20;    // too tired to work below this
// The shared world clock. 1 game day = 1 real hour. CLOCK_SPEED=6 makes a game day 10 real minutes (good for demos).
const CLOCK_SPEED = Number(process.env.CLOCK_SPEED) || 1;
const START_CLOCK_MIN = 7 * 60;           // a brand new world starts on Day 1 (Monday) at 07:00
const IGNORE_HOURS = process.env.IGNORE_HOURS === '1'; // 1 = every venue is always open (for testing)
// City events: first one after EVENT_FIRST_MS, then one every 15 to 35 real minutes. Set EVENT_EVERY_MS to make them frequent.
const EVENT_EVERY_MS = Number(process.env.EVENT_EVERY_MS) || 0;
const EVENT_FIRST_MS = EVENT_EVERY_MS || 10 * 60 * 1000;
const CLOSE_GRACE_MS = Number(process.env.CLOSE_GRACE_MS || 25000); // after closing, you have this long to walk out before you are put outside
// INTERVIEW_SEED makes the questions repeatable, for tests only.
const INTERVIEW_RAND = process.env.INTERVIEW_SEED ? (() => { let s = Number(process.env.INTERVIEW_SEED) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })() : Math.random;
const INTERVIEWS_ON = process.env.INTERVIEWS !== '0'; // skilled jobs hold an interview first (INTERVIEWS=0 turns them off for the old tests)
const WARN_BEFORE_CLOSE_MS = 30000;      // "closes soon" appears 30 real seconds before closing time
const SICK_RISK = process.env.SICK_RISK_PER_MIN !== undefined ? Number(process.env.SICK_RISK_PER_MIN) : SICK.riskPerMin; // 1 = always catch a cold (testing)
const STUDY_COOLDOWN_MS = process.env.STUDY_COOLDOWN_MS !== undefined ? Number(process.env.STUDY_COOLDOWN_MS) : 3000;
const NPC_COOLDOWN_MS = process.env.NPC_COOLDOWN_MS !== undefined ? Number(process.env.NPC_COOLDOWN_MS) : 5 * 60 * 1000; // wait between repeat chats with the same person
const TIP_COOLDOWN_MS = process.env.TIP_COOLDOWN_MS !== undefined ? Number(process.env.TIP_COOLDOWN_MS) : 60 * 1000;
const CLOCK_TICK_MS = 1000;               // clock, bills, and events are checked once a second
const ACTION_COOLDOWN_MS = process.env.ACTION_COOLDOWN_MS !== undefined ? Number(process.env.ACTION_COOLDOWN_MS) : 1000;

const BOUNDS = 10;             // every room runs from -10 to 10 on x and z
const SPEED = 3;               // units per second
const TICK_MS = 50;            // 20 server ticks per second
const START_CASH = 5000;
const START_FOOD = 70;
const START_ROOM = 'plaza';
// New accounts begin in their own empty Home, so they learn it is theirs and can furnish it. (The tests set NEW_ACCOUNT_ROOM=plaza.)
const NEW_ACCOUNT_ROOM = process.env.NEW_ACCOUNT_ROOM || 'home';
const COLORS = ['#ff6b4a', '#ffc857', '#2ec4b6', '#3a86ff', '#ff4d8d', '#3ddc97'];

// Each room is a venue with its own player cap. Add more venues here.
// hours: null = always open. Times are game hours (a game day is one real hour). Past midnight: close is smaller than open.
// "solo" rooms (your Home) are private: every player gets their own copy.
const ROOMS = {
  plaza:  { name: 'Plaza',  color: '#4a3668', accent: '#ffc857', cap: 20, hours: null },
  gym:    { name: 'Gym',    color: '#2f5d62', accent: '#ff6b4a', cap: 12, hours: { open: 5, close: 23 } },
  market: { name: 'Market', color: '#6b4a2f', accent: '#3ddc97', cap: 20, hours: { open: 6, close: 20 } },
  jobs:   { name: 'Jobs Center', color: '#3b4a6b', accent: '#3a86ff', cap: 15, hours: { open: 7, close: 21 } },
  shop:   { name: 'Shop',        color: '#6b3b4f', accent: '#ff4d8d', cap: 15, hours: { open: 7, close: 22 } },
  library:  { name: 'Library',   color: '#3d4f3a', accent: '#f4d35e', cap: 15, hours: { open: 8, close: 20 } },
  pharmacy: { name: 'Pharmacy',  color: '#2d5a63', accent: '#8be0b0', cap: 10, hours: { open: 8, close: 21 } },
  garage: { name: 'Kanis Motors',  color: '#454552', accent: '#ff9f1c', cap: 10, hours: { open: 8, close: 19 } },
  club:   { name: 'Night Club',  color: '#2a1050', accent: '#c77dff', cap: 20, hours: { open: 20, close: 5 } },
  bank:   { name: 'Bank',        color: '#27493f', accent: '#f4d35e', cap: 10, hours: { open: 8, close: 18 } },
  boutique: { name: 'Boutique',  color: '#4a2f55', accent: '#ff7eb6', cap: 12, hours: { open: 10, close: 20 } },
  homestore: { name: 'Home Store', color: '#5a4a2f', accent: '#ff9f1c', cap: 12, hours: { open: 9, close: 19 } },
  biz:    { name: 'Business', color: '#4a3f33', accent: '#3ddc97', cap: 12, hours: null, hidden: true },
  friendhome: { name: "Friend's Home", color: '#5b4636', accent: '#8be0b0', cap: 99, hours: null, solo: true, hidden: true },
  police: { name: 'Police Station', color: '#34476b', accent: '#5aa0ff', cap: 25, hours: null },
  hospital: { name: 'Hospital',  color: '#3f6275', accent: '#ff5c5c', cap: 20, hours: null },
  airport: { name: 'Airport', color: '#3d4a5c', accent: '#7ad7ff', cap: 25, hours: null },
  terminal: { name: 'Central Terminal', color: '#5a5040', accent: '#ffc857', cap: 25, hours: null },
  home:   { name: 'Home',        color: '#5b4636', accent: '#8be0b0', cap: 1,  hours: null, solo: true },
  // The outdoor hub. Every building has a door on this street. It is long and thin (see boundsOf).
  street: { name: 'Main Street', color: '#3b3b40', accent: '#ffc857', cap: 40, hours: null, outdoor: true },
};
const HOME = 'home';

// How far a player can walk in each room. Interiors are 20x20. The city is big (see city.js) and has solid buildings.
// Every city is its own map with its own buildings, walls and traffic (see cities.js). Lagos is the first one.
const CITY_CTX = {};
for (const id of CITY_IDS) {
  const g = getCity(CITIES[id].seed);
  CITY_CTX[id] = { id, def: CITIES[id], layout: g.city, walls: g.walls, traffic: createTraffic(g.city, g.walls.blocked, { brake: process.env.TRAFFIC_NO_BRAKE !== '1' }) };
}
const LAGOS = CITY_CTX[DEFAULT_CITY];
const ctxOf = (p) => CITY_CTX[p.city] || LAGOS;
const CITY_LAYOUT = LAGOS.layout; // houses and homes are in Lagos for now
const boundsOf = (id) => (id === 'street' ? { bx: CITY.bx, bz: CITY.bz } : { bx: BOUNDS, bz: BOUNDS });
const CITY_SPEED = 1.7;          // outdoors you walk briskly, because the city is big
const INSIDE_EXIT = { x: 0, z: 9.5 }; // the door out of every building, on its south wall
// Plots: every player has a house on a plot in a residential area. (With more players than plots, two players share the same spot. Homes are still private.)
const homeCtx = (p) => CITY_CTX[p.homeCity] || LAGOS; // the city your house is in
const plotOf = (p) => { const pl = homeCtx(p).layout.plots; return pl[p.plot % pl.length]; };
// Where is the door for this building, for this player? Your own house is on your own plot.
const doorFor = (p, id) => (id === HOME ? (p.city === p.homeCity ? plotOf(p).door : null) : ctxOf(p).layout.doors[id] || null);
const isVenueDoor = (id) => id === HOME || Object.hasOwn(CITY_LAYOUT.doors, id);

// Travel options: price in naira and trip time in seconds (placeholders).
const TRAVEL = {
  walk: { cost: 0,    seconds: 8 },
  bus:  { cost: 200,  seconds: 4 },
  taxi: { cost: 1500, seconds: 1 },
};

// The six needs. 100 is full. Toilet drops faster than the others.
const NEEDS = ['food', 'energy', 'fun', 'social', 'clean', 'toilet'];
const NEED_LABELS = { food: 'Food', energy: 'Energy', fun: 'Fun', social: 'Social', clean: 'Clean', toilet: 'Toilet' };
// Points lost per MINUTE while online (100 is full). Time to empty from full: food 100 min, energy 143,
// fun 80, social 125, clean 143, toilet 62. Change these numbers to tune the pace.
const DECAY_PER_MIN = { food: 1.0, energy: 0.7, fun: 1.25, social: 0.8, clean: 0.7, toilet: 1.6 };

// One action fixes one need. Prices and gains are placeholders to tune.
const ACTIONS = {
  eat:    { need: 'food',   label: 'Eat',    cost: 500, gain: 30 },
  // You sleep in your own bed. (SLEEP_ANYWHERE=1 is only for the tests.)
  sleep:  { need: 'energy', label: 'Sleep',  cost: 0,   gain: 40, ...(process.env.SLEEP_ANYWHERE ? {} : { onlyRoom: 'home' }) },
  play:   { need: 'fun',    label: 'Play',   cost: 200, gain: 30 },
  chat:   { need: 'social', label: 'Chat',   cost: 0,   gain: 25, needsCompany: true },
  shower: { need: 'clean',  label: 'Shower', cost: 0,   gain: 40 },
  toilet: { need: 'toilet', label: 'Go',     cost: 0,   gain: 60 },
  // Only works in one room. The game shows this button instead of Play while you are there.
  dance:  { need: 'fun',    label: 'Dance',  cost: 1000, gain: 50, onlyRoom: 'club' },
};
const GUEST_SLEEP_GAIN = 55;  // sleeping over at a friend's house (better than a bench, worse than your own bed)
const HOME_SLEEP_GAIN = 70;   // sleeping in your own bed (power on)
const NO_POWER_SLEEP_GAIN = 25;
const NO_POWER_SHOWER_GAIN = 15;

export const EYE_IDS = ['brown', 'hazel', 'green', 'blue', 'grey', 'amber'];
export const HAIR_IDS = ['brown', 'black', 'chestnut', 'auburn', 'ginger', 'blonde', 'grey', 'white'];
export const SKIN_COUNT = 12;   // 0 is the model's own tone, then lighter to darker tints
const cleanLook = (v, cur) => {
  const o = v && typeof v === 'object' ? v : {};
  return {
    body: o.body === 'woman' || o.body === 'man' ? o.body : cur.body,
    eyes: EYE_IDS.includes(o.eyes) ? o.eyes : cur.eyes,
    skin: Number.isInteger(o.skin) && o.skin >= 0 && o.skin < SKIN_COUNT ? o.skin : cur.skin,
    hair: HAIR_IDS.includes(o.hair) ? o.hair : cur.hair,
  };
};
// A player's look. Only these values are accepted, so nobody can store anything else.
const THEME_PRESETS = ['sunset', 'fresh', 'night'];
const THEME_ACCENTS = ['coral', 'orange', 'gold', 'mint', 'teal', 'sky', 'pink', 'lavender'];
const THEME_SIZES = ['normal', 'large'];
function cleanTheme(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
  return {
    preset: THEME_PRESETS.includes(t.preset) ? t.preset : 'sunset',
    accent: THEME_ACCENTS.includes(t.accent) ? t.accent : null,
    size: THEME_SIZES.includes(t.size) ? t.size : 'normal',
  };
}
function parseTheme(json) {
  try {
    return json ? cleanTheme(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}

// The story. Chapter 1 lives in chapter1.json. Mistakes in that file are reported when the server starts.
const story = createEngine(loadChapter(Object.keys(ROOMS)));
const STORY_TICK_MS = Number(process.env.STORY_TICK_MS) || 1000;

// Your job is the one you took at the Jobs Center. Story jobs (from Chapter 1) and skill jobs are listed in skills.js.
// Players saved before the Jobs Center board existed keep the job their story result gave them.
const jobOf = (p) => jobById(p.jobId);
// Two job slots: one main job and one part-time job. Each has its own shift cooldown and shift count.
const SLOTS = {
  main: { id: 'jobId', last: 'lastWork', shifts: 'shiftsOnJob', taken: 'jobTakenAt' },
  part: { id: 'job2Id', last: 'lastWork2', shifts: 'shiftsOnJob2', taken: 'jobTakenAt2' },
};
const slotJob = (p, slot) => jobById(p[SLOTS[slot].id]);
const eventMult = () => (world.event && world.event.payMult) || 1;
// What one shift of this job pays this player right now (event, reputation, and skill perks all included).
const payFor = (p, job) => Math.round(job.pay * eventMult() * payBonus(p.rep) * perkOf(job, p.skills).payMult);
// How long a shift takes. SHIFT_SCALE=0 makes shifts instant (used by the old tests).
const SHIFT_SCALE = process.env.SHIFT_SCALE !== undefined ? Number(process.env.SHIFT_SCALE) : 1;
// While you are on a shift you stay where you are: these requests are refused until it is over or you cancel it.
const SHIFT_LOCKED = new Set(['moveTo', 'act', 'study', 'applyJob', 'quitJob', 'buyMedicine', 'buyVehicle', 'travel', 'enter', 'goOutside', 'drive', 'driveInput', 'visit', 'train', 'steal']);

// ---------- Database ----------
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash  TEXT NOT NULL,
    cash       INTEGER NOT NULL,
    food       INTEGER NOT NULL,
    room       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mutes (
    user_id  INTEGER NOT NULL,
    muted_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, muted_id)
  );
  CREATE TABLE IF NOT EXISTS reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id   INTEGER NOT NULL,
    reported_id   INTEGER NOT NULL,
    reported_name TEXT NOT NULL,
    messages      TEXT NOT NULL,
    room          TEXT,
    created_at    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS world (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  -- Land and player businesses. One row per owned lot (lot ids are per city).
  CREATE TABLE IF NOT EXISTS lots (
    city  TEXT NOT NULL,
    lot   INTEGER NOT NULL,
    owner INTEGER NOT NULL,
    kind  TEXT,
    name  TEXT,
    level INTEGER NOT NULL DEFAULT 1,
    stock INTEGER NOT NULL DEFAULT 0,
    till  INTEGER NOT NULL DEFAULT 0,
    frac  REAL NOT NULL DEFAULT 0,
    built INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (city, lot)
  );
  -- Every bank movement is written here. bal = change to savings, cash = change to wallet.
  CREATE TABLE IF NOT EXISTS ledger (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    kind       TEXT NOT NULL,
    bal        INTEGER NOT NULL,
    cash       INTEGER NOT NULL,
    bal_after  INTEGER NOT NULL,
    cash_after INTEGER NOT NULL,
    note       TEXT,
    game_min   INTEGER NOT NULL,
    at         INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ledger_user ON ledger (user_id, id);
  -- Friends. A request makes two rows: (sender, target, 'out') and (target, sender, 'in'). Accepting makes both 'friend'.
  CREATE TABLE IF NOT EXISTS friendships (
    a      INTEGER NOT NULL,
    b      INTEGER NOT NULL,
    status TEXT NOT NULL,
    at     INTEGER NOT NULL,
    PRIMARY KEY (a, b)
  );
  -- Private messages between friends.
  CREATE TABLE IF NOT EXISTS dms (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL,
    to_id   INTEGER NOT NULL,
    body    TEXT NOT NULL,
    kind    TEXT NOT NULL DEFAULT 'text',
    at      INTEGER NOT NULL,
    read    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS dms_pair ON dms (from_id, to_id, id);
  CREATE INDEX IF NOT EXISTS dms_to ON dms (to_id, read);
  -- Money sent between friends, kept so daily limits and disputes can be checked.
  CREATE TABLE IF NOT EXISTS transfers (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL,
    to_id   INTEGER NOT NULL,
    amount  INTEGER NOT NULL,
    at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS transfers_from ON transfers (from_id, at);
`);

// Upgrade older databases in place: add the new columns if they are missing.
const existingColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
for (const [n, d] of [['staff', 'INTEGER NOT NULL DEFAULT 0'], ['owed', 'REAL NOT NULL DEFAULT 0']]) {
  if (!db.prepare('PRAGMA table_info(lots)').all().some((c) => c.name === n)) db.exec(`ALTER TABLE lots ADD COLUMN ${n} ${d}`);
}
const addColumn = (name, ddl) => {
  if (!existingColumns.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${ddl}`);
};
for (const n of ['energy', 'fun', 'social', 'clean', 'toilet']) addColumn(n, 'INTEGER NOT NULL DEFAULT 70');
addColumn('recovery_hash', 'TEXT');
addColumn('story', 'TEXT');
addColumn('last_work', 'INTEGER NOT NULL DEFAULT 0');
addColumn('theme', 'TEXT');
addColumn('bills', 'TEXT');
addColumn('skills', 'TEXT');
addColumn('vehicles', 'TEXT');
addColumn('net', 'TEXT');
addColumn('rep', 'REAL NOT NULL DEFAULT 0');
addColumn('job_id', 'TEXT');
addColumn('job2_id', 'TEXT');
addColumn('handsets', 'TEXT');
addColumn('city', 'TEXT');
addColumn('home_city', 'TEXT');
addColumn('last_work2', 'INTEGER NOT NULL DEFAULT 0');
addColumn('stress', 'REAL NOT NULL DEFAULT 0');
addColumn('sick', 'INTEGER NOT NULL DEFAULT 0');
addColumn('burnout', 'INTEGER NOT NULL DEFAULT 0');
addColumn('bank', 'TEXT');
addColumn('home', 'TEXT');
addColumn('wardrobe', 'TEXT');
addColumn('body', "TEXT NOT NULL DEFAULT 'man'");
addColumn('eyes', "TEXT NOT NULL DEFAULT 'brown'");
addColumn('skin', 'INTEGER NOT NULL DEFAULT 0');
addColumn('hair', "TEXT NOT NULL DEFAULT 'brown'");
addColumn('phone', 'TEXT');
addColumn('start_min', 'INTEGER NOT NULL DEFAULT 0');
addColumn('fines', 'TEXT');
addColumn('jail_until', 'INTEGER NOT NULL DEFAULT 0');
addColumn('plot', 'INTEGER');

db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());

// Every query uses placeholders (?), so user input can never change the query itself.
const q = {
  lotsAll: db.prepare('SELECT l.*, u.username AS ownerName FROM lots l JOIN users u ON u.id = l.owner'),
  lotSet: db.prepare('INSERT OR REPLACE INTO lots (city, lot, owner, kind, name, level, stock, till, frac, built, staff, owed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  lotDel: db.prepare('DELETE FROM lots WHERE city = ? AND lot = ?'),
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  setBody: db.prepare('UPDATE users SET body = ? WHERE id = ?'),
  setEyes: db.prepare('UPDATE users SET eyes = ? WHERE id = ?'),
  setLook: db.prepare('UPDATE users SET body = ?, eyes = ?, skin = ?, hair = ? WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (username, pass_hash, recovery_hash, cash, food, room, created_at, last_seen, phone, start_min) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  saveUser: db.prepare('UPDATE users SET cash = ?, food = ?, energy = ?, fun = ?, social = ?, clean = ?, toilet = ?, room = ?, story = ?, last_work = ?, bills = ?, skills = ?, job_id = ?, job2_id = ?, last_work2 = ?, handsets = ?, city = ?, home_city = ?, stress = ?, sick = ?, burnout = ?, vehicles = ?, net = ?, rep = ?, bank = ?, home = ?, wardrobe = ?, fines = ?, jail_until = ?, last_seen = ? WHERE id = ?'),
  addLedger: db.prepare('INSERT INTO ledger (user_id, kind, bal, cash, bal_after, cash_after, note, game_min, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  pruneLedger: db.prepare('DELETE FROM ledger WHERE user_id = ? AND id NOT IN (SELECT id FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 300)'),
  ledgerOf: db.prepare('SELECT id, kind, bal, cash, bal_after, cash_after, note, game_min, at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?'),
  setCredentials: db.prepare('UPDATE users SET pass_hash = ?, recovery_hash = ? WHERE id = ?'),
  setRecovery: db.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?'),
  setTheme: db.prepare('UPDATE users SET theme = ? WHERE id = ?'),
  getWorld: db.prepare('SELECT v FROM world WHERE k = ?'),
  setWorld: db.prepare('INSERT INTO world (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
  deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  mutedIds: db.prepare('SELECT muted_id FROM mutes WHERE user_id = ?'),
  mutedNames: db.prepare('SELECT u.username FROM mutes m JOIN users u ON u.id = m.muted_id WHERE m.user_id = ? ORDER BY u.username'),
  muteCount: db.prepare('SELECT COUNT(*) AS c FROM mutes WHERE user_id = ?'),
  addMute: db.prepare('INSERT OR IGNORE INTO mutes (user_id, muted_id) VALUES (?, ?)'),
  delMute: db.prepare('DELETE FROM mutes WHERE user_id = ? AND muted_id = ?'),
  insertReport: db.prepare('INSERT INTO reports (reporter_id, reported_id, reported_name, messages, room, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  reportsBy: db.prepare('SELECT COUNT(*) AS c FROM reports WHERE reporter_id = ? AND created_at > ?'),
  dupReport: db.prepare('SELECT 1 AS x FROM reports WHERE reporter_id = ? AND reported_id = ? AND created_at > ?'),
  allReports: db.prepare('SELECT r.id, ru.username AS reporter, r.reported_name AS reported, r.messages, r.room, r.created_at FROM reports r JOIN users ru ON ru.id = r.reporter_id ORDER BY r.id DESC LIMIT 50'),
  nextPlot: db.prepare('SELECT COALESCE(MAX(plot) + 1, 0) AS n FROM users'),
  setHomeCity: db.prepare('UPDATE users SET home_city = ? WHERE id = ?'),
  setPlot: db.prepare('UPDATE users SET plot = ? WHERE id = ?'),
  userByPhone: db.prepare('SELECT * FROM users WHERE phone = ?'),
  setPhone: db.prepare('UPDATE users SET phone = ? WHERE id = ?'),
  friendRows: db.prepare('SELECT f.b AS id, f.status AS status, u.username AS name, u.plot AS plot, u.home_city AS homeCity FROM friendships f JOIN users u ON u.id = f.b WHERE f.a = ? ORDER BY u.username'),
  friendRel: db.prepare('SELECT status FROM friendships WHERE a = ? AND b = ?'),
  friendCount: db.prepare("SELECT COUNT(*) AS c FROM friendships WHERE a = ? AND status = 'friend'"),
  outCount: db.prepare("SELECT COUNT(*) AS c FROM friendships WHERE a = ? AND status = 'out'"),
  setFriend: db.prepare('INSERT OR REPLACE INTO friendships (a, b, status, at) VALUES (?, ?, ?, ?)'),
  delFriend: db.prepare('DELETE FROM friendships WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)'),
  isMuted: db.prepare('SELECT 1 AS x FROM mutes WHERE user_id = ? AND muted_id = ?'),
  insertDm: db.prepare('INSERT INTO dms (from_id, to_id, body, kind, at) VALUES (?, ?, ?, ?, ?)'),
  dmThread: db.prepare('SELECT id, from_id, body, kind, at FROM dms WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT ?'),
  dmRead: db.prepare('UPDATE dms SET read = 1 WHERE to_id = ? AND from_id = ? AND read = 0'),
  dmUnread: db.prepare('SELECT from_id AS id, COUNT(*) AS c FROM dms WHERE to_id = ? AND read = 0 GROUP BY from_id'),
  dmPrune: db.prepare('DELETE FROM dms WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND id NOT IN (SELECT id FROM dms WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT ?)'),
  sentSince: db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM transfers WHERE from_id = ? AND at > ?'),
  insertTransfer: db.prepare('INSERT INTO transfers (from_id, to_id, amount, at) VALUES (?, ?, ?, ?)'),
  creditCash: db.prepare('UPDATE users SET cash = cash + ? WHERE id = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
  sessionByHash: db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
};

// ---------- The shared world: clock and city events ----------
// The clock only moves while the server runs, and its time is saved, so a restart never skips ahead.
const world = {
  gameMin: Number(q.getWorld.get('game_min')?.v),
  event: null,            // { id, ...EVENTS[id], endsAt }
  lastEventId: null,
  nextEventAt: Date.now() + EVENT_FIRST_MS,
  lastTick: Date.now(),
};
if (!Number.isFinite(world.gameMin) || world.gameMin < 0) world.gameMin = START_CLOCK_MIN;
const saveWorld = () => q.setWorld.run('game_min', String(Math.floor(world.gameMin * 100) / 100));
const minuteOfDay = () => ((Math.floor(world.gameMin) % DAY_MIN) + DAY_MIN) % DAY_MIN;
const msPerGameMin = () => REAL_MS_PER_DAY / DAY_MIN / CLOCK_SPEED;

// Is this venue open right now? (Home and the Plaza never close.)
const venueOpen = (roomId) => IGNORE_HOURS || isOpen(ROOMS[roomId].hours, minuteOfDay());
const closedText = (roomId) => `${ROOMS[roomId].name} is closed. Open ${hoursText(ROOMS[roomId].hours)}.`;

// ---------- Passwords and sessions ----------
const scrypt = (pw, salt) =>
  new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, (err, key) => (err ? reject(err) : resolve(key))));

// Passwords are never stored. We store a salted, slow hash of each one.
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}
async function checkPassword(pw, stored) {
  const [saltHex, keyHex] = stored.split(':');
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'));
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}
const DUMMY_HASH = await hashPassword('not-a-real-password'); // keeps unknown-user logins as slow as real ones

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// A recovery code lets a player reset a forgotten password without email.
// It is shown once, then stored only as a hash. No 0, O, 1, I, or L, to avoid mix-ups.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newRecoveryCode() {
  let s = '';
  for (let i = 0; i < 16; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s.match(/.{4}/g).join('-');
}
const normalizeCode = (c) => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '');

function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex'); // 64 characters
  q.insertSession.run(sha256(token), userId, Date.now() + SESSION_DAYS * 86400000);
  return token; // only the hash of the token is stored
}
function userFromToken(token) {
  if (typeof token !== 'string' || token.length !== 64) return null;
  const row = q.sessionByHash.get(sha256(token), Date.now());
  return row ? q.userById.get(row.user_id) : null;
}

// Limit on sign-up attempts and WRONG passwords or codes, per IP address.
// Good logins do not count, and tries made while blocked do not extend the wait.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
function recent(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, list);
  return list;
}
// kind 'fail' counts wrong passwords and codes. kind 'signup' counts new-account attempts separately.
const isBlocked = (ip, kind = 'fail') => recent(`${kind}:${ip}`).length >= (kind === 'signup' ? SIGNUP_LIMIT : AUTH_LIMIT);
const recordAttempt = (ip, kind = 'fail') => recent(`${kind}:${ip}`).push(Date.now());
setInterval(() => attempts.clear(), 60 * 60 * 1000).unref();

// ---------- Web API (for the login screen and for Postman) ----------
const USER_RE = /^[A-Za-z0-9_]{3,16}$/;
const app = express();
// Behind a hosting service's proxy, set TRUST_PROXY=1 so the login limit sees each player's real address.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(express.json({ limit: '2kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Access-Control-Allow-Origin', CLIENT_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '');

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/signup', async (req, res) => {
  try {
    if (isBlocked(req.ip, 'signup')) return res.status(429).json({ error: 'Too many attempts. Try again in about 15 minutes.' });
    recordAttempt(req.ip, 'signup');
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || !USER_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3 to 16 letters, numbers, or underscores.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 100) {
      return res.status(400).json({ error: 'Password must be 8 to 100 characters.' });
    }
    if (q.userByName.get(username)) return res.status(409).json({ error: 'That username is taken.' });
    const hash = await hashPassword(password);
    const recoveryCode = newRecoveryCode();
    const recoveryHash = await hashPassword(normalizeCode(recoveryCode));
    const now = Date.now();
    let id;
    try {
      id = Number(q.insertUser.run(username, hash, recoveryHash, START_CASH, START_FOOD, NEW_ACCOUNT_ROOM, now, now, freshPhone(), Math.floor(world.gameMin / DAY_MIN) * DAY_MIN).lastInsertRowid);
    } catch {
      return res.status(409).json({ error: 'That username is taken.' });
    }
    { const l = cleanLook(req.body, { body: req.body.body === 'woman' ? 'woman' : 'man', eyes: 'brown', skin: 0, hair: 'brown' }); q.setLook.run(l.body, l.eyes, l.skin, l.hair, id); }
    res.status(201).json({ token: newSession(id), username, recoveryCode });
  } catch (err) {
    console.error('signup failed', err);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    if (isBlocked(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in about 15 minutes.' });
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 100) {
      return res.status(400).json({ error: 'Enter a username and password.' });
    }
    const user = q.userByName.get(username);
    const ok = await checkPassword(password, user ? user.pass_hash : DUMMY_HASH);
    // One message for both cases, so nobody can use it to find out which usernames exist.
    if (!user || !ok) {
      recordAttempt(req.ip);
      return res.status(401).json({ error: 'Wrong username or password.' });
    }
    res.json({ token: newSession(user.id), username: user.username });
  } catch (err) {
    console.error('login failed', err);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

app.get('/api/me', (req, res) => {
  const user = userFromToken(bearer(req));
  if (!user) return res.status(401).json({ error: 'Not logged in.' });
  const live = byUser.get(user.id);
  const src = live || user;
  const needs = {};
  for (const n of NEEDS) needs[n] = Math.round(src[n]);
  res.json({
    username: user.username,
    cash: src.cash,
    food: src.food,
    needs,
    room: live ? (live.trip ? live.trip.to : live.room) : user.room,
    online: Boolean(live),
  });
});

// Forgot your password? Send your username, your recovery code, and a new password.
// Success changes the password, logs the account out everywhere, and gives a NEW recovery code.
app.post('/api/reset', async (req, res) => {
  try {
    if (isBlocked(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in about 15 minutes.' });
    const { username, recoveryCode, newPassword } = req.body || {};
    if (typeof username !== 'string' || typeof recoveryCode !== 'string' || recoveryCode.length > 40) {
      return res.status(400).json({ error: 'Fill in every field.' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 100) {
      return res.status(400).json({ error: 'Password must be 8 to 100 characters.' });
    }
    const user = q.userByName.get(username);
    const stored = user && user.recovery_hash ? user.recovery_hash : DUMMY_HASH;
    const match = await checkPassword(normalizeCode(recoveryCode), stored);
    // One message for every failure, so nobody can use it to find out which usernames exist.
    if (!user || !user.recovery_hash || !match) {
      recordAttempt(req.ip);
      return res.status(401).json({ error: 'Wrong username or recovery code.' });
    }
    const newCode = newRecoveryCode();
    const passHash = await hashPassword(newPassword);
    const recHash = await hashPassword(normalizeCode(newCode));
    q.setCredentials.run(passHash, recHash, user.id);
    q.deleteUserSessions.run(user.id);
    dropLive(user.id);
    res.json({ recoveryCode: newCode });
  } catch (err) {
    console.error('reset failed', err);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

// For accounts without a recovery code (or to replace a lost one): needs login plus the password.
app.post('/api/recovery-code', async (req, res) => {
  try {
    const user = userFromToken(bearer(req));
    if (!user) return res.status(401).json({ error: 'Not logged in.' });
    if (isBlocked(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in about 15 minutes.' });
    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length > 100 || !(await checkPassword(password, user.pass_hash))) {
      recordAttempt(req.ip);
      return res.status(401).json({ error: 'Wrong password.' });
    }
    const code = newRecoveryCode();
    q.setRecovery.run(await hashPassword(normalizeCode(code)), user.id);
    res.json({ recoveryCode: code });
  } catch (err) {
    console.error('recovery code failed', err);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

// Chat reports for you, the owner. Off unless ADMIN_KEY is set. Send it in an "x-admin-key" header.
function adminOk(req, res) {
  if (!ADMIN_KEY) {
    res.status(404).json({ error: 'Not found.' });
    return false;
  }
  if (isBlocked(req.ip)) {
    res.status(429).json({ error: 'Too many attempts. Try again in about 15 minutes.' });
    return false;
  }
  const given = crypto.createHash('sha256').update(String(req.headers['x-admin-key'] || '')).digest();
  const real = crypto.createHash('sha256').update(ADMIN_KEY).digest();
  if (!crypto.timingSafeEqual(given, real)) {
    recordAttempt(req.ip);
    res.status(401).json({ error: 'Wrong admin key.' });
    return false;
  }
  return true;
}
app.get('/api/admin/reports', (req, res) => {
  if (!adminOk(req, res)) return;
  res.json(q.allReports.all().map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })));
});

// Owner testing tools (also need ADMIN_KEY). Start a city event now: POST {"id":"flash_sale"} (or "none" to end it).
app.post('/api/admin/event', (req, res) => {
  if (!adminOk(req, res)) return;
  const id = req.body && req.body.id;
  if (id === 'none') {
    endEvent();
    return res.json({ ok: true });
  }
  if (typeof id !== 'string' || !Object.hasOwn(EVENTS, id)) return res.status(400).json({ error: `id must be one of: ${EVENT_IDS.join(', ')}, none` });
  startEvent(id);
  res.json({ ok: true });
});
// The bank record for one player (for you, the owner): GET /api/admin/ledger?user=NAME&limit=100.
app.get('/api/admin/ledger', (req, res) => {
  if (!adminOk(req, res)) return;
  const u = q.userByName.get(String(req.query.user || ''));
  if (!u) return res.status(404).json({ error: 'No such player.' });
  const limit = Math.max(1, Math.min(300, Math.floor(Number(req.query.limit) || 100)));
  res.json({
    user: u.username,
    bank: parseBank(u.bank),
    ledger: q.ledgerOf.all(u.id, limit).map((r) => ({ ...r, at: new Date(r.at).toISOString() })),
  });
});
// Jump the world clock to a time of day: POST {"hour": 22}. Handy for seeing night and closing times.
app.post('/api/admin/clock', (req, res) => {
  if (!adminOk(req, res)) return;
  const hour = Number(req.body && req.body.hour);
  if (!Number.isFinite(hour) || hour < 0 || hour >= 24) return res.status(400).json({ error: 'hour must be 0 to 23.' });
  const day = Math.floor(world.gameMin / DAY_MIN);
  world.gameMin = day * DAY_MIN + Math.floor(hour) * 60;
  saveWorld();
  res.json({ ok: true, time: timeText(minuteOfDay()) });
});

app.post('/api/logout', (req, res) => {
  const token = bearer(req);
  if (typeof token === 'string' && token.length === 64) q.deleteSession.run(sha256(token));
  res.sendStatus(204);
});

// ---------- The built game ----------
// After "npm run build" in the client folder, this server also serves the game page,
// so the whole game runs from one address. During development this is skipped.
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist');
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST, {
    maxAge: '1h',
    setHeaders: (res, file) => { if (/(^|[\\/])(sw\.js|manifest\.webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache'); },
  }));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
  console.log('Serving the built game from client/dist');
}

// ---------- Game server ----------
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: CLIENT_ORIGIN } });

const players = new Map();  // socket id -> player
const byUser = new Map();   // user id -> player (one live session per account)

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
// Safe lookup: rejects names like "constructor" that exist on every object.
const has = (obj, key) => typeof key === 'string' && Object.hasOwn(obj, key);

// Players in a room, plus players already on their way there (they hold a spot).
function occupancy(roomId, city = DEFAULT_CITY) {
  let n = 0;
  for (const p of players.values()) {
    if ((p.room === roomId && p.city === city) || (p.trip && p.trip.to === roomId && (p.trip.city || p.city) === city)) n++;
  }
  return n;
}

// The live "space" a player is in. Everyone in the Plaza shares one. Every player's Home is their own private copy.
// Every city has its own copy of every place, so people in different cities never meet. Lagos keeps the plain room names.
const spaceKey = (roomId, userId, city = DEFAULT_CITY) => (ROOMS[roomId] && ROOMS[roomId].solo ? `${roomId}:${userId}` : city === DEFAULT_CITY ? roomId : `${roomId}@${city}`);
const spaceOf = (p) => (p.room === 'friendhome' ? `home:${p.visiting}` : p.room === 'biz' ? `biz:${p.city}:${p.bizLot}` : p.room ? spaceKey(p.room, p.userId, p.city) : null);

function roomInfo(id, p = null) {
  const r = ROOMS[id];
  const b = boundsOf(id);
  const info = { id, name: r.name, color: r.color, accent: r.accent, bounds: b.bx, bx: b.bx, bz: b.bz, solo: Boolean(r.solo) };
  const ctx = p ? ctxOf(p) : LAGOS;
  if (r.outdoor) {
    // The layout is the same for everyone in a city. The only thing that is yours is your own plot (in Lagos).
    info.city = ctx.layout;
    info.cityId = ctx.id;
    info.cityName = ctx.def.name;
    info.theme = ctx.def.theme;
    if (ctx.id !== DEFAULT_CITY) info.name = ctx.def.name;
    info.parked = ctx.traffic.parked;
    info.bays = ctx.traffic.bays;
    info.names = Object.fromEntries(Object.keys(ctx.layout.doors).map((k) => [k, ROOMS[k].name]));
    info.accents = Object.fromEntries(Object.keys(ctx.layout.doors).map((k) => [k, ROOMS[k].accent]));
    info.myPlot = p && ctx.id === p.homeCity ? plotOf(p).id : -1;
  } else if (id === 'biz') {
    info.exit = INSIDE_EXIT;
    const rec = p ? LOTS[p.city].get(p.bizLot) : null;
    if (rec && rec.biz) { info.name = rec.biz.name; info.bizKind = rec.biz.kind; info.bizLot = p.bizLot; info.bizLevel = rec.biz.level; info.bizStaff = rec.biz.staff || 0; info.accent = { cafe: '#ff9f1c', minimart: '#4cc9a0', salon: '#ff7eb6', gym: '#7ad7ff' }[rec.biz.kind] || r.accent; info.owner = rec.ownerName; }
  } else if (id === 'friendhome') {
    info.exit = INSIDE_EXIT;
    if (p && p.visiting) { const h = byUser.get(p.visiting); info.hostName = h ? h.name : 'a friend'; }
  } else if (isVenueDoor(id)) { info.exit = INSIDE_EXIT; if (id === 'airport') { info.cityId = ctx.id; info.cityName = ctx.def.name; } if (id === 'terminal') { info.stations = ctx.layout.stations; info.cityId = ctx.id; info.cityName = ctx.def.name; } }
  return info;
}

// Public data that every player in a space may see.
function snapshot(key) {
  return [...players.values()]
    .filter((p) => spaceOf(p) === key)
    .map((p) => {
      const look = publicLook(p.wardrobe);
      const o = look ? { id: p.id, name: p.name, x: p.x, z: p.z, color: p.color, look } : { id: p.id, name: p.name, x: p.x, z: p.z, color: p.color };
      if (p.riding) { o.ride = p.riding; o.ry = p.ry || 0; }
      if (p.shift) o.work = 1;
      if (p.sit) o.sit = 1;
      if (p.anim && p.anim.until > Date.now()) o.an = p.anim.k;
      if (p.body === 'woman') o.b = 1;
      if (p.eyes && p.eyes !== 'brown') o.e = p.eyes;
      if (p.skin) o.s = p.skin;
      if (p.hair && p.hair !== 'brown') o.h = p.hair;
      return o;
    });
}

const notice = (p, text) => p.socket.emit('notice', text);
const sendStory = (p) => p.socket.emit('story', story.view(p));
const sendMutes = (p) => p.socket.emit('mutes', q.mutedNames.all(p.userId).map((r) => r.username));
// What the browser needs to draw the clock. It counts on its own between updates.
const clockInfo = () => ({ gameMin: world.gameMin, msPerMin: msPerGameMin() });
const eventInfo = () => (world.event
  ? { id: world.event.id, title: world.event.title, text: world.event.text, secondsLeft: Math.max(0, Math.ceil((world.event.endsAt - Date.now()) / 1000)) }
  : null);
function billsInfo(p) {
  return {
    list: BILL_IDS.map((id) => {
      const qt = quote(p.bills, id);
      return {
        id, label: BILLS[id].label, who: BILLS[id].who, status: qt.status, left: Math.round(p.bills[id]),
        amount: qt.amount, fee: qt.fee, total: qt.total, canPay: qt.canPay,
        note: qt.status === 'due' ? BILLS[id].due : qt.status === 'overdue' ? BILLS[id].bad : '',
      };
    }),
    cons: consequences(p.bills),
    msPerMin: msPerGameMin(),
  };
}
const sendBills = (p) => p.socket.emit('bills', billsInfo(p));

// What this player can travel by right now (walk, bus, taxi, plus anything they own), with any city event applied.
const travelOf = (p) => effectiveTravel(travelFor(TRAVEL, p.vehicles), world.event);
const allFlags = (p) => [...p.story.flags, ...p.net.flags];

// ----- Quests: the game tells every active quest when something happens -----
function questEvent(p, kind, data = {}) {
  for (const [id, q] of Object.entries(p.net.quests)) {
    if (q.done || q.ready) continue;
    const step = QUESTS[id].steps[q.step];
    if (!step || step.kind !== kind) continue;
    if (kind === 'visit' && step.room !== data.room) continue;
    if (kind === 'talk' && step.npc !== data.npc) continue;
    if (kind === 'practice' && step.skill !== data.skill) continue;
    q.prog++;
    if (q.prog < (step.n || 1)) continue;
    q.prog = 0;
    q.step++;
    if (q.step >= QUESTS[id].steps.length) {
      q.ready = true;
      notice(p, `Quest ready: report back to ${NPCS[QUESTS[id].giver].name}.`);
    } else {
      notice(p, `Quest step done: ${QUESTS[id].title}. Next: ${QUESTS[id].steps[q.step].text}.`);
    }
  }
}
function questsInfo(p) {
  return Object.entries(p.net.quests).filter(([, q]) => !q.done).map(([id, q]) => {
    const def = QUESTS[id];
    const step = def.steps[q.step];
    const count = step && step.n > 1 ? ` (${q.prog}/${step.n})` : '';
    return { id, title: def.title, ready: q.ready, text: q.ready ? `Report back to ${NPCS[def.giver].name}` : `${step.text}${count}` };
  });
}

// ----- People -----
function peopleInfo(p) {
  const here = p.room ? peopleIn(p.room, minuteOfDay()) : [];
  return {
    here: here.map((id) => ({ id, name: NPCS[id].name, role: NPCS[id].role, rel: Math.round(relOf(p.net, id)), relLabel: relLabel(relOf(p.net, id)) })),
    quests: questsInfo(p),
  };
}
const sendPeople = (p) => p.socket.emit('people', peopleInfo(p));
function dialogFor(p, npcId, line) {
  const npc = NPCS[npcId];
  const now = Date.now();
  const topics = npc.topics.filter((t) => topicVisible(p.net, npcId, t)).map((t) => {
    let why = '';
    if (t.minRep !== undefined && p.rep < t.minRep) why = 'They do not trust you yet';
    else if (t.cost && p.cash < t.cost) why = `Costs ₦${t.cost.toLocaleString('en-US')}`;
    else if ((p.npcCd[`${npcId}:${t.id}`] || 0) > now) why = 'Come back a little later';
    return { id: t.id, label: t.label, why };
  });
  return { id: npcId, name: npc.name, role: npc.role, rel: Math.round(relOf(p.net, npcId)), relLabel: relLabel(relOf(p.net, npcId)), line, topics };
}
function addRel(p, npcId, n) {
  n = n > 0 ? Math.max(1, n + relBonus(p.rep) + charmBonus(p.wardrobe)) : n; // a good name (and a very expensive outfit or scent) makes friends faster, a shady one slower
  const before = relLabel(relOf(p.net, npcId));
  p.net.rel[npcId] = Math.min(REL_MAX, relOf(p.net, npcId) + n);
  const after = relLabel(relOf(p.net, npcId));
  if (after !== before) notice(p, `You and ${NPCS[npcId].name} are now: ${after}.`);
}
// Change reputation. Only the server calls this, for things it has checked itself.
function addRep(p, n, why) {
  const before = repTier(p.rep).label;
  p.rep = clampRep(p.rep + n);
  const after = repTier(p.rep).label;
  if (after !== before) notice(p, `Your reputation is now: ${after}.`);
  else if (why) notice(p, `${n > 0 ? 'Reputation up' : 'Reputation down'}: ${why}.`);
}
// Add skill XP and announce a level-up. Returns the new level.
function addXp(p, skill, n) {
  const before = levelOf(p.skills[skill]);
  p.skills[skill] = Math.min(xpForMax, p.skills[skill] + n);
  const after = levelOf(p.skills[skill]);
  if (after > before) notice(p, `${SKILLS[skill].label} is now level ${after}!`);
  return after;
}

// ----- Skills and jobs -----
// Why can this player NOT do this kind of study right now? Empty text means they can.
function whyNotStudy(p, skill, mode) {
  const rule = studyRule(skill, mode);
  if (!rule) return 'Not available for this skill';
  if (p.sick) return 'You are sick';
  if (p.burnout) return 'You are burned out. Rest first.';
  if (p.skills[skill] >= xpForMax) return 'Maxed out';
  if (p.room !== rule.room) return `Go to the ${ROOMS[rule.room].name}`;
  if (!venueOpen(rule.room)) return `${ROOMS[rule.room].name} is closed`;
  const cons = consequences(p.bills);
  if (rule.needs && rule.needs.includes('power') && cons.noPower) return 'No power at home';
  if (rule.needs && rule.needs.includes('data') && cons.noData) return 'Out of data';
  if (rule.needsCompany && !hasCompany(p)) return 'Needs another player here';
  if (p.cash < rule.cost) return `Costs ₦${rule.cost.toLocaleString('en-US')}`;
  if (p.energy < rule.energy) return 'Too tired';
  return '';
}
const xpForMax = xpForLevel(MAX_LEVEL);
function skillsInfo(p) {
  return SKILL_IDS.map((id) => {
    const pr = progressOf(p.skills[id]);
    const modes = {};
    for (const m of STUDY_MODES) {
      const rule = studyRule(id, m);
      modes[m] = rule ? { label: rule.label, cost: rule.cost, xp: rule.xp, where: ROOMS[rule.room].name, why: whyNotStudy(p, id, m) } : null;
    }
    return { id, label: SKILLS[id].label, level: pr.level, into: pr.into, need: pr.need, modes };
  });
}
const sendSkills = (p) => p.socket.emit('skills', skillsInfo(p));
function phonesInfo(p) {
  return {
    here: p.room === 'shop' && venueOpen('shop'),
    active: p.handsets.active,
    list: PHONE_IDS.map((id) => ({ id, label: PHONES[id].label, cost: PHONES[id].cost, camera: PHONES[id].camera, color: PHONES[id].color, text: PHONES[id].text, owned: p.handsets.owned.includes(id) })),
  };
}
const sendPhones = (p) => p.socket.emit('phones', phonesInfo(p));
function jobSummary(p, slot, now) {
  const j = slotJob(p, slot);
  if (!j) return null;
  const perk = perkOf(j, p.skills);
  return { title: j.title, pay: payFor(p, j), perk: perk.text, part: Boolean(j.part), room: j.room, open: venueOpen(j.room), hours: hoursText(ROOMS[j.room].hours), cooldownLeft: Math.max(0, Math.ceil((p[SLOTS[slot].last] + WORK_COOLDOWN_MS - now) / 1000)) };
}
function jobsInfo(p) {
  const mult = (world.event && world.event.payMult) || 1;
  return {
    here: p.room === 'jobs' && venueOpen('jobs'),
    current: p.jobId,
    current2: p.job2Id,
    list: JOBS.filter((j) => !j.hidden || qualifies(j, allFlags(p), p.skills, p.rep).ok || (j.hidden && allFlags(p).includes(j.flag))).map((j) => {
      const q = qualifies(j, allFlags(p), p.skills, p.rep);
      return {
        id: j.id, title: j.title, part: Boolean(j.part), perk: perkOf(j, p.skills).text, pay: payFor(p, j), where: j.remote ? 'Home (remote)' : ROOMS[j.room].name,
        req: j.req ? `${SKILLS[j.req.skill].label} ${j.req.level}${j.ref && allFlags(p).includes(j.ref) ? ' (referral)' : ''}` : j.hidden ? 'Referral' : j.flag ? 'Story' : 'None',
        qualified: q.ok, why: q.why,
      };
    }),
  };
}
function vehiclesInfo(p) {
  return {
    here: p.room === 'garage' && venueOpen('garage'),
    list: VEHICLE_IDS.map((id) => ({ id, label: VEHICLES[id].label, cost: VEHICLES[id].cost, text: VEHICLES[id].text, owned: p.vehicles.includes(id) })),
  };
}
const sendVehicles = (p) => p.socket.emit('vehicles', vehiclesInfo(p));

// ----- Bank: every movement of money goes through bankCommit, so there is always a record -----
// Saves the player and writes the transaction lines in ONE database step. Either both happen or neither.
function bankCommit(p, entries) {
  if (!entries.length) return;
  try {
    db.exec('BEGIN');
    save(p);
    // The "after" numbers are worked out backwards from where the player is now, so every line is exact.
    let bal = p.bank.bal;
    let cash = p.cash;
    const rows = [];
    for (let i = entries.length - 1; i >= 0; i--) {
      rows[i] = { e: entries[i], bal, cash };
      bal -= entries[i].bal;
      cash -= entries[i].cash;
    }
    const now = Date.now();
    for (const r of rows) q.addLedger.run(p.userId, r.e.kind, r.e.bal, r.e.cash, r.bal, r.cash, String(r.e.note || '').slice(0, 120), Math.floor(world.gameMin), now);
    q.pruneLedger.run(p.userId, p.userId);
    db.exec('COMMIT');
  } catch (err) {
    console.error('bank commit failed', err);
    try { db.exec('ROLLBACK'); } catch { /* nothing to roll back */ }
  }
  p.ledgerSig = null; // the record changed, so send it again
}
const ledgerView = (p) => q.ledgerOf.all(p.userId, 12).map((r) => ({ id: r.id, kind: r.kind, bal: r.bal, cash: r.cash, balAfter: r.bal_after, note: r.note, day: Math.floor(r.game_min / DAY_MIN) + 1 }));
// Sends the bank screen data, but only when it changed (the clock ticks once a second, the data rarely does).
function sendBank(p, force = false) {
  const info = bankInfo(p.bank, p.room === 'bank' && venueOpen('bank'));
  const sig = JSON.stringify(info);
  if (!force && sig === p.bankSig && p.ledgerSig !== null) return;
  p.bankSig = sig;
  if (p.ledgerSig === null || p.ledgerSig === undefined) {
    p.ledgerCache = ledgerView(p);
    p.ledgerSig = 'ok';
  }
  p.socket.emit('bank', { ...info, ledger: p.ledgerCache || [] });
}
// ----- Clothes and perfume -----
function sendWardrobe(p, force = false) {
  const where = p.room === 'boutique' && venueOpen('boutique') ? 'boutique' : p.room === HOME ? 'home' : null;
  const info = wardrobeInfo(p.wardrobe, where);
  const sig = JSON.stringify(info);
  if (!force && sig === p.wardrobeSig) return;
  p.wardrobeSig = sig;
  p.socket.emit('wardrobe', info);
}
// ----- Friends, private messages, phone numbers, sending money -----
function freshPhone() {
  for (let i = 0; i < 50; i++) {
    const n = newPhone();
    if (!q.userByPhone.get(n)) return n;
  }
  return newPhone();
}
const liveUser = (id) => byUser.get(id) || null;
const isFriend = (a, b) => (q.friendRel.get(a, b) || {}).status === 'friend';
const markFriendsDirty = (id) => { const t = liveUser(id); if (t) t.friendsDirty = true; };
// The friends screen. The database part is cached and refreshed when something changes (or every 15 seconds); who is online and who is nearby is live.
function sendFriends(p, force = false) {
  const now = Date.now();
  if (p.friendsDirty || !p.friendRowsCache || now - p.friendsAt > 15000) {
    p.friendRowsCache = q.friendRows.all(p.userId);
    p.unreadCache = new Map(q.dmUnread.all(p.userId).map((r) => [r.id, r.c]));
    p.friendsDirty = false;
    p.friendsAt = now;
  }
  const rows = p.friendRowsCache;
  const related = new Set(rows.map((r) => r.id));
  const here = [];
  for (const o of players.values()) {
    if (o === p || spaceOf(o) !== spaceOf(p) || related.has(o.userId) || p.muted.has(o.userId)) continue;
    here.push(o.name);
  }
  let unread = 0;
  const friends = rows.filter((r) => r.status === 'friend').map((r) => {
    const u = p.unreadCache.get(r.id) || 0;
    unread += u;
    return { name: r.name, online: byUser.has(r.id), unread: u };
  });
  const info = {
    phone: phoneText(p.phone),
    limits: transferLimits(p.bank.ageMin),
    friends,
    incoming: rows.filter((r) => r.status === 'in').map((r) => r.name),
    outgoing: rows.filter((r) => r.status === 'out').map((r) => r.name),
    here: here.sort().slice(0, 30),
    unread,
    max: MAX_FRIENDS,
  };
  const sig = JSON.stringify(info);
  if (!force && sig === p.friendsSig) return;
  p.friendsSig = sig;
  p.socket.emit('friends', info);
  // Where your friends live, so their houses get name signs on the street.
  const nPlots = ctxOf(p).layout.plots.length;
  const homes = rows.filter((r) => r.status === 'friend' && Number.isInteger(r.plot) && parseCity(r.homeCity) === p.city).map((r) => ({ name: r.name, plot: r.plot % nPlots, online: byUser.has(r.id) }));
  p.socket.emit('friendHomes', homes);
}
const socialGate = (p) => {
  if (p.trip) return 'Wait until you arrive.';
  if (!allow(p.socialTimes, 12, 10000)) return 'Slow down a little.';
  return '';
};
// Find a player by the username or phone number someone typed. Returns the database row or null.
function findPlayer(req) {
  if (!req || typeof req !== 'object') return null;
  if (typeof req.phone === 'string') {
    const n = req.phone.replace(/[\s-]/g, '');
    return PHONE_RE.test(n) ? q.userByPhone.get(n) || null : null;
  }
  if (typeof req.name === 'string' && NAME_RE.test(req.name)) return q.userByName.get(req.name) || null;
  return null;
}
// Store one private message and deliver it to whoever is online.
function deliverDm(from, toId, toName, body, kind = 'text') {
  const at = Date.now();
  q.insertDm.run(from.userId, toId, body, kind, at);
  q.dmPrune.run(from.userId, toId, toId, from.userId, from.userId, toId, toId, from.userId, DM_KEEP);
  from.socket.emit('dm', { with: toName, mine: true, text: body, kind, at });
  const t = liveUser(toId);
  if (t) {
    t.friendsDirty = true;
    t.socket.emit('dm', { with: from.name, mine: false, text: body, kind, at });
  }
  from.friendsDirty = true;
}

// Buying and selling need the Boutique. Wearing, taking off and perfume work at Home or in the Boutique. Every request is rate limited.
function fashionGate(p, atBoutique) {
  if (p.trip) return 'Wait until you arrive.';
  if (!atBoutique && p.room !== HOME && p.room !== 'boutique') return 'Change your clothes at home or in the Boutique.';
  if (atBoutique) {
    if (p.room !== 'boutique') return 'Clothes and perfume are sold at the Boutique.';
    if (!venueOpen('boutique')) return closedText('boutique');
  }
  if (!allow(p.fashionTimes, 20, 5000)) return 'Slow down a little.';
  return '';
}
function fashionApply(p, res) {
  if (!res.ok) {
    notice(p, res.why);
    return false;
  }
  p.cash += res.cash;
  if (res.cash) save(p); // money changed, so save at once
  if (res.msg) notice(p, res.msg);
  sendWardrobe(p, true);
  return true;
}

// ----- Home and furniture -----
// Sends your furniture and paint to you, but only when it changed. Where you are decides which buttons work.
function sendHome(p, force = false) {
  const where = p.room === HOME ? 'home' : p.room === 'homestore' && venueOpen('homestore') ? 'store' : null;
  const info = homeInfo(p.home, where);
  const sig = JSON.stringify([info.items, info.wall, info.floor, info.lights, where, info.effects]);
  if (!force && sig === p.homeSig) return;
  p.homeSig = sig;
  p.socket.emit('home', info);
  for (const v of visitorsOf(p)) v.socket.emit('visitHome', homeInfo(p.home, null)); // the host redecorated
}
// Home requests start here: you must be in the right place, it must be open, and requests are rate limited.
function homeGate(p, room) {
  if (p.trip) return 'Wait until you arrive.';
  if (p.room !== room) return room === HOME ? 'Do that at your Home.' : 'Furniture is bought and sold at the Home Store.';
  if (!venueOpen(room)) return closedText(room);
  if (!allow(p.homeTimes, 25, 5000)) return 'Slow down a little.';
  return '';
}
// Apply a furniture result: move the cash, save right away, tell the player.
function homeApply(p, res) {
  if (!res.ok) {
    notice(p, res.why);
    return false;
  }
  p.cash += res.cash;
  if (res.cash) save(p); // money changed, so save at once (placing and moving are saved with the regular save)
  if (res.msg) notice(p, res.msg);
  sendHome(p, true);
  return true;
}

// Every bank request starts here: must be at the Bank, it must be open, and requests are rate limited.
function bankGate(p) {
  if (p.trip) return 'Wait until you arrive.';
  if (p.room !== 'bank') return 'Go to the Bank first.';
  if (!venueOpen('bank')) return closedText('bank');
  if (!allow(p.bankTimes, 6, 5000)) return 'Slow down a little.';
  return '';
}
// Apply the result of a bank rule: move the wallet cash, write the record, tell the player.
function bankApply(p, res) {
  if (!res.ok) {
    notice(p, res.why);
    return false;
  }
  p.cash += res.cash;
  bankCommit(p, res.entries);
  if (res.msg) notice(p, res.msg);
  sendBank(p, true);
  return true;
}
const sendJobs = (p) => p.socket.emit('jobs', jobsInfo(p));
const wellnessOf = (p) => ({ stress: Math.round(p.stress), sick: p.sick, burnout: p.burnout });

// City events: one at a time, for everyone. Rules for each one live in world.js.
function startEvent(id) {
  const def = EVENTS[id];
  world.event = { id, ...def, endsAt: Date.now() + def.seconds * 1000 };
  world.lastEventId = id;
  io.emit('event', eventInfo());
  for (const p of players.values()) {
    p.socket.emit('travel', travelOf(p));
    notice(p, `${def.title}! ${def.text}`);
  }
}
function endEvent() {
  if (!world.event) return;
  const title = world.event.title;
  world.event = null;
  world.nextEventAt = Date.now() + (EVENT_EVERY_MS || (15 + Math.random() * 20) * 60 * 1000);
  io.emit('event', null);
  for (const p of players.values()) {
    p.socket.emit('travel', travelOf(p));
    notice(p, `${title} is over.`);
  }
}

const needsOf = (p) => Object.fromEntries(NEEDS.map((n) => [n, Math.round(p[n])]));
const round1 = (v) => Math.round(v * 10) / 10;

// The last chat messages, kept so a report can quote what the server really saw (never what the reporter claims).
const chatLog = [];

// Is anyone else in the same room? (Chatting needs company.)
const hasCompany = (p) => [...players.values()].some((o) => o !== p && spaceOf(o) === spaceOf(p));

// Mood comes from the average of all needs.
function mood(p) {
  const score = Math.round(NEEDS.reduce((sum, n) => sum + p[n], 0) / NEEDS.length);
  return { score, label: score >= 70 ? 'Happy' : score >= 45 ? 'Okay' : 'Down' };
}

// Log a player out of the game server right now (used for a second login, or after a password reset).
function dropLive(userId) {
  const live = byUser.get(userId);
  if (!live) return;
  save(live);
  byUser.delete(userId);
  players.delete(live.id);
  live.socket.emit('kicked');
  live.socket.disconnect(true);
}

// ---------- Saving ----------
function save(p) {
  let room = p.trip ? p.trip.to : p.room; // a traveller is saved at their destination
  if (room === 'friendhome') room = 'street'; // a visitor wakes up outside next time
  q.saveUser.run(p.cash, round1(p.food), round1(p.energy), round1(p.fun), round1(p.social), round1(p.clean), round1(p.toilet), room, JSON.stringify(p.story), p.lastWork, JSON.stringify(p.bills), JSON.stringify(p.skills), p.jobId, p.job2Id, p.lastWork2 || 0, serializePhones(p.handsets), p.city, p.homeCity, round1(p.stress), p.sick ? 1 : 0, p.burnout ? 1 : 0, JSON.stringify(p.vehicles), JSON.stringify(p.net), round1(p.rep), JSON.stringify(p.bank), JSON.stringify(p.home), JSON.stringify(p.wardrobe), JSON.stringify(p.fines), p.jailUntil || 0, Date.now(), p.userId);
}
function saveAll() {
  try {
    db.exec('BEGIN');
    saveWorld();
    for (const p of players.values()) save(p);
    for (const city of CITY_IDS) for (const id of LOTS[city].keys()) saveLot(city, id);
    db.exec('COMMIT');
  } catch (err) {
    console.error('save failed', err);
    try { db.exec('ROLLBACK'); } catch { /* nothing to roll back */ }
  }
}
setInterval(saveAll, SAVE_EVERY_MS);

function shutdown() {
  saveAll();
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Put a player into a room straight away (no trip). Used when a venue closes or the landlord locks the door.
// This can push a room slightly over its cap for a moment, which is better than leaving someone stranded.
function moveNow(p, roomId, x = roomId === 'street' ? CITY.spawn.x : 0, z = roomId === 'street' ? CITY.spawn.z : 0, city = p.city) {
  const old = spaceOf(p);
  if (old) p.socket.leave(old);
  p.room = roomId;
  const prevCity = p.city;
  p.city = isCity(city) ? city : DEFAULT_CITY;
  if (roomId === HOME) p.city = p.homeCity; // your home is in the city you live in
  if (p.city !== prevCity) { p.friendsSig = ''; sendFriends(p, true); } // friends' houses differ in each city
  p.trip = null;
  p.x = p.tx = x;
  p.z = p.tz = z;
  p.warnedClose = false;
  p.socket.join(spaceOf(p));
  p.socket.emit('room', roomInfo(roomId, p));
  if (roomId === 'street') sendLots(p);
  questEvent(p, 'visit', { room: roomId });
}

// ----- Rides: bus, taxi or your own vehicle along the city roads (only from the street) -----
const TRAIN_FARE = 400;
const PATROL_MS = Number(process.env.PATROL_MS) || PATROL_EVERY_MS;
const RIDE_SPEED = { bus: 13, taxi: 19, car: 21, bike: 7 }; // metres per second
const RIDE_WAIT = { bus: 6, taxi: 3, car: 0, bike: 0 }; // seconds waiting for it to come
function startRide(p, method, mode, toId) {
  const door = doorFor(p, toId);
  if (!door) return false;
  const route = routeBetween(ctxOf(p).layout, { x: p.x, z: p.z }, door);
  const slow = method === 'bike' ? 1 : (world.event && world.event.travelTime) || 1;
  const rush = method === 'bus' || method === 'taxi' ? (world.event && world.event.travelTime ? 1.5 : 1) : 1;
  const rideSec = Math.max(4, route.total / RIDE_SPEED[method] * slow);
  const now = Date.now();
  const waitEnd = now + RIDE_WAIT[method] * rush * 1000;
  p.tx = p.x; p.tz = p.z;
  p.trip = { to: 'street', label: ROOMS[toId].name, start: now, end: waitEnd + rideSec * 1000, ride: { k: method, route, door: { x: door.x, z: door.z }, waitEnd, rideEnd: waitEnd + rideSec * 1000 } };
  return true;
}
function stepRide(p, now) {
  const r = p.trip.ride;
  if (now >= r.rideEnd) return finishRide(p, 'Arrived at ' + p.trip.label + '.');
  if (now < r.waitEnd) return;
  const s = ((now - r.waitEnd) / (r.rideEnd - r.waitEnd)) * r.route.total;
  const pt = pointOnRoute(r.route.points, s);
  p.x = p.tx = pt.x; p.z = p.tz = pt.z; p.ry = pt.ry; p.riding = r.k;
}
function finishRide(p, text) {
  const r = p.trip.ride;
  p.trip = null; p.riding = null;
  p.x = p.tx = r.door.x; p.z = p.tz = r.door.z;
  notice(p, text);
}

const RECOVER_MS = Number(process.env.RECOVER_MS) || 3200;
function arrive(p) {
  const to = p.trip.to;
  const label = p.trip.label || ROOMS[to].name;
  const at = p.trip.at;
  const tripCity = p.trip.city, drv = p.trip.drive, byAmbulance = Boolean(p.trip.ambulance);
  moveNow(p, to, at ? at.x : undefined, at ? at.z : undefined, tripCity || p.city);
  // After a car hit you wake up in the first hospital bed for a few seconds, then stand up.
  if (byAmbulance && to === 'hospital') {
    p.x = p.tx = -8; p.z = p.tz = -5.9;
    p.anim = { k: 9, until: Date.now() + RECOVER_MS };
    p.frozenUntil = Date.now() + RECOVER_MS;
  }
  if (drv) beginDrive(p, drv.kind, drv.ry); // you drove in along the highway: you are still at the wheel
  // Things can change while someone is travelling.
  if (to === HOME && consequences(p.bills).locked) {
    moveNow(p, START_ROOM);
    return notice(p, 'Your landlord locked you out while you travelled. Pay your rent in Bills.');
  }
  if (!venueOpen(to)) {
    moveNow(p, START_ROOM);
    return notice(p, `${ROOMS[to].name} closed while you travelled. You are at the Plaza.`);
  }
  notice(p, `Arrived at ${label}.`);
}

// ----- Visiting a friend's house -----
const KNOCK_WAIT_MS = 30000;
const MAX_VISITORS = 6;
const visitorsOf = (host) => [...players.values()].filter((v) => v.room === 'friendhome' && v.visiting === host.userId);
function enterFriendHome(v, host) {
  const old = spaceOf(v);
  if (old) v.socket.leave(old);
  v.room = 'friendhome';
  v.visiting = host.userId;
  v.trip = null;
  v.x = v.tx = 0; v.z = v.tz = 8;
  v.socket.join(spaceOf(v));
  v.socket.emit('room', roomInfo('friendhome', v));
  v.socket.emit('visitHome', homeInfo(host.home, null));
  notice(v, `${host.name} let you in.`);
}
// Send a visitor back out onto the street in front of the host's door.
function showOut(v, text) {
  const host = byUser.get(v.visiting);
  const hp = host ? plotOf(host) : CITY_LAYOUT.plots[0];
  moveNow(v, 'street', hp.door.x, hp.door.z, host ? host.homeCity : DEFAULT_CITY);
  v.visiting = null;
  if (text) notice(v, text);
}

// ----- Police: fines, theft, jail -----
const jailLeft = (p) => Math.max(0, Math.ceil(((p.jailUntil || 0) - Date.now()) / 1000));
function sendFines(p, force = false) {
  const gm = world.gameMin;
  const view = {
    list: p.fines.map((f) => fineView(f, gm)),
    total: totalDue(p.fines, gm),
    overdue: overdueTotal(p.fines, gm),
    wanted: wantedByPolice(p.fines, gm),
    atStation: p.room === 'police',
  };
  const sig = JSON.stringify(view);
  if (!force && sig === p.finesSig) return;
  p.finesSig = sig;
  p.socket.emit('fines', view);
}
function lockUp(p, secs, text) {
  p.jailUntil = Date.now() + secs * 1000;
  moveNow(p, 'police', 0, 0);
  notice(p, text);
  sendFines(p, true);
  save(p);
}
const stealRand = () => (process.env.STEAL_CATCH === '1' ? 0 : process.env.STEAL_CATCH === '0' ? 0.99 : Math.random());

// ----- Driving and the police chase -----
const drivingBusy = (p) => Boolean(p.drive);
function startChase(p, offence, text) {
  const now = Date.now();
  if (!p.wanted) {
    p.wanted = newChase(now, [offence]);
    notice(p, text || 'The police are after you! Lose them, or pull over and take the fine.');
  } else if (!p.wanted.offences.has(offence)) {
    p.wanted.offences.add(offence);
    notice(p, text || 'More trouble with the police!');
  }
}
// Turn what you did into fines and a spell in the cells.
function settleOffences(p, why) {
  const w = p.wanted;
  const kinds = w ? [...w.offences] : [];
  if (w && now_() - w.since > 8000 && !w.offences.has('evading') && w.cops.length) kinds.push('evading');
  let jail = 0, total = 0, rep = 0;
  for (const k of kinds) {
    const f = newFine(p.fines, k, world.gameMin);
    if (f) total += f.base;
    jail = Math.max(jail, OFFENCES[k].jailSec);
    rep += OFFENCES[k].rep;
  }
  if (rep) addRep(p, rep, 'the police caught you');
  p.wanted = null;
  p.drive = null;
  p.riding = null;
  return { jail, total };
}
const now_ = () => Date.now();
function arrestPlayer(p) {
  const { jail, total } = settleOffences(p);
  lockUp(p, jail || 60, `Arrested! Fines: ₦${total.toLocaleString('en-NG')}. You are held at the Police Station.`);
}
// ----- Land and businesses -----
// LOTS[city] is a Map of lot id -> { owner, ownerName, biz } for lots somebody owns. Empty lots are not in it.
const LOTS = {};
for (const id of CITY_IDS) LOTS[id] = new Map();
for (const r of q.lotsAll.all()) {
  if (!LOTS[r.city]) continue;
  LOTS[r.city].set(r.lot, { owner: r.owner, ownerName: r.ownerName, biz: r.kind && isKind(r.kind) ? { kind: r.kind, name: r.name || KINDS[r.kind].label, level: r.level, stock: r.stock, till: r.till, frac: r.frac, built: r.built, staff: r.staff || 0, owed: r.owed || 0 } : null });
}
let lotsDirty = false;
const saveLot = (city, id) => {
  const rec = LOTS[city].get(id);
  if (!rec) q.lotDel.run(city, id);
  else { const b = rec.biz; q.lotSet.run(city, id, rec.owner, b ? b.kind : null, b ? b.name : null, b ? b.level : 1, b ? b.stock : 0, b ? Math.round(b.till) : 0, b ? b.frac : 0, b ? b.built : 0, b ? b.staff || 0 : 0, b ? b.owed || 0 : 0); }
};
const lotViews = (city) => CITY_CTX[city].layout.lots.map((l) => {
  const rec = LOTS[city].get(l.id);
  return { id: l.id, owner: rec ? rec.ownerName : null, kind: rec && rec.biz ? rec.biz.kind : null, name: rec && rec.biz ? rec.biz.name : null, level: rec && rec.biz ? rec.biz.level : 0, soldOut: Boolean(rec && rec.biz && rec.biz.stock <= 0) };
});
const sendLots = (p) => p.socket.emit('lots', { city: p.city, list: lotViews(p.city) });
const broadcastLots = (city) => { const key = spaceKey('street', 0, city); if (io.sockets.adapter.rooms.has(key)) io.to(key).emit('lots', { city, list: lotViews(city) }); };
const lotNear = (p, id, outdoorsOnly = false) => {
  if (!Number.isInteger(id) || p.trip || p.drive || jailLeft(p)) { if (Number.isInteger(id)) notice(p, 'Not right now.'); return null; }
  const l = ctxOf(p).layout.lots[id];
  if (!l) return null;
  if (p.room === 'biz') return !outdoorsOnly && p.bizLot === id ? l : null; // inside the business: the counter is right here
  if (p.room !== 'street') { notice(p, 'Go out onto the street first.'); return null; }
  if (Math.hypot(p.x - l.door.x, p.z - l.door.z) > 5) { notice(p, 'Walk up to the lot first.'); return null; }
  return l;
};
function bizInfo(p, id) {
  const l = ctxOf(p).layout.lots[id];
  if (!l) return null;
  const rec = LOTS[p.city].get(id);
  const mine = Boolean(rec && rec.owner === p.userId);
  const info = { id, price: l.price, sell: Math.round(l.price * SELL_LAND), owner: rec ? rec.ownerName : null, mine, owned: LOTS_OWNED(p), max: MAX_LOTS, kinds: [] };
  if (mine && !rec.biz) info.kinds = KIND_IDS.map((k) => ({ id: k, label: KINDS[k].label, build: KINDS[k].build, item: KINDS[k].item, price: KINDS[k].price }));
  if (rec && rec.biz) {
    const b = rec.biz;
    info.biz = { kind: b.kind, label: KINDS[b.kind].label, name: b.name, level: b.level, item: KINDS[b.kind].item, price: priceOf(b.kind, b.level), open: bizOpenNow(b.kind, minuteOfDay()), hours: KINDS[b.kind].hours, soldOut: b.stock <= 0, staff: b.staff || 0 };
    if (mine) Object.assign(info.biz, { stock: b.stock, cap: STOCK_CAP(b.level), till: Math.round(b.till), cost: KINDS[b.kind].cost, upgrade: b.level < BIZ_MAX_LEVEL ? UPGRADE_COST[b.level + 1] : null, staffMax: STAFF_MAX(b.level), wage: STAFF_WAGE, hireFee: HIRE_FEE, boost: Math.round(STAFF_BOOST * 100), owed: Math.round(b.owed || 0) });
  }
  return info;
}
const LOTS_OWNED = (p) => { let n = 0; for (const rec of LOTS[p.city].values()) if (rec.owner === p.userId) n++; for (const c of CITY_IDS) if (c !== p.city) for (const rec of LOTS[c].values()) if (rec.owner === p.userId) n++; return n; };
// Staff figures are drawn from the room info, so people standing inside get a fresh copy when the team changes.
const refreshInside = (p, id) => { for (const o of players.values()) if (o.room === 'biz' && o.city === p.city && o.bizLot === id) o.socket.emit('room', roomInfo('biz', o)); };
const sendBiz = (p, id) => { const i = bizInfo(p, id); if (i) p.socket.emit('biz', i); };
// Townspeople buy while a business is open and has stock. Runs every few seconds, whether or not anyone is online.
let lastBizTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastBizTick) / 1000;
  lastBizTick = now;
  const mod = minuteOfDay();
  for (const city of CITY_IDS) {
    let changed = false;
    for (const [id, rec] of LOTS[city]) {
      if (!rec.biz) continue;
      const open = bizOpenNow(rec.biz.kind, mod);
      const sold = bizStep(rec.biz, dt, open);
      if (rec.biz.staff) {
        lotsDirty = true;
        if (payStaff(rec.biz, dt, open)) { const ow = [...players.values()].find((o) => o.userId === rec.owner); if (ow) notice(ow, `${rec.biz.name} could not pay its wages and a staff member quit.`); }
      }
      if (sold > 0) { lotsDirty = true; if (rec.biz.stock <= 0) changed = true; }
    }
    if (changed) broadcastLots(city);
  }
}, 5000).unref();
setInterval(() => {
  if (!lotsDirty) return;
  lotsDirty = false;
  for (const city of CITY_IDS) for (const id of LOTS[city].keys()) saveLot(city, id);
}, 30000).unref();

// ----- Between cities -----
function ticketsInfo(p) {
  return {
    here: p.room === 'terminal' || p.room === 'airport',
    place: p.room,
    city: p.city,
    cityName: CITIES[p.city].name,
    home: { city: p.homeCity, name: CITIES[p.homeCity].name, fee: MOVE_FEE, here: p.homeCity === p.city },
    list: CITY_IDS.filter((id) => id !== p.city).map((id) => ({
      to: id, name: CITIES[id].name,
      options: TICKET_IDS.filter((m) => TICKETS[m].venue === p.room).map((m) => { const t = ticketQuote(m, p.city, id); return { method: m, label: TICKETS[m].label, text: TICKETS[m].text, cost: t.cost, secs: t.secs }; }),
    })),
  };
}
const sendTickets = (p) => p.socket.emit('tickets', ticketsInfo(p));
// Leave the city by car through the gate at the end of the boulevard. The next city is a minute's drive away.
function takeHighway(p, side, now) {
  const dest = neighbour(p.city, side);
  if (!dest) {
    if (now - (p.gateNote || 0) > 4000) { p.gateNote = now; notice(p, 'The road ends here. There is no city this way.'); }
    return;
  }
  if (p.drive.kind !== 'car') {
    if (now - (p.gateNote || 0) > 4000) { p.gateNote = now; notice(p, 'Bicycles cannot use the highway. Take a car.'); }
    return;
  }
  if (p.cash < HIGHWAY.fuel) {
    if (now - (p.gateNote || 0) > 4000) { p.gateNote = now; notice(p, `The highway needs ₦${HIGHWAY.fuel.toLocaleString('en-US')} of fuel.`); }
    return;
  }
  const from = side === 'east' ? 'west' : 'east';
  const arr = arrivalFrom(side, CITY.bx);
  p.cash -= HIGHWAY.fuel;
  stopDriving(p);
  p.socket.leave(spaceOf(p));
  p.room = null;
  p.trip = { to: 'street', city: dest, label: `${CITIES[dest].name} (by road)`, at: { x: arr.x, z: arr.z }, drive: { kind: 'car', ry: arr.ry }, start: now, end: now + HIGHWAY.secs * 1000 };
  notice(p, `On the highway to ${CITIES[dest].name}. Fuel ₦${HIGHWAY.fuel.toLocaleString('en-US')}.`);
}

// Get behind the wheel at the player's position, facing ry.
function beginDrive(p, kind, ry) {
  p.drive = newDrive(kind, p.x, p.z, ry);
  p.driveIn = { steer: 0, thr: 0 };
  p.tx = p.x; p.tz = p.z;
  p.riding = kind; p.ry = ry;
}
function stopDriving(p) {
  p.drive = null;
  p.riding = null;
  p.driveIn = { steer: 0, thr: 0 };
  p.tx = p.x; p.tz = p.z;
}

// A car hit this player. Slow bumps only shake you; a real hit means an ambulance, a hospital bill and a rough day.
function hurtByCar(p, speed) {
  const now = Date.now();
  if (p.hitUntil && now < p.hitUntil) return;
  p.hitUntil = now + 10000;
  if (speed < LAGOS.traffic.HIT_MIN) return notice(p, 'A car bumped into you. Watch where you walk!');
  const fee = Math.min(p.cash, Math.round(1500 + speed * 900));
  p.cash -= fee;
  p.energy = Math.max(5, p.energy - 25);
  p.stress = clampStress(p.stress + 20);
  q.addLedger.run(p.userId, 'hospital', 0, -fee, p.bank.bal, p.cash, 'Hospital bill', Math.floor(world.gameMin), now);
  p.ledgerSig = null;
  p.socket.leave(spaceOf(p));
  p.room = null;
  p.trip = { to: 'hospital', label: 'Hospital', ambulance: true, start: now, end: now + 8000 };
  save(p);
  notice(p, `A car hit you! An ambulance is taking you to the hospital. Bill: ₦${fee.toLocaleString('en-NG')}.`);
}

// Only logged-in players may connect. The token comes from the login screen.
io.use((socket, next) => {
  const user = userFromToken(socket.handshake.auth && socket.handshake.auth.token);
  if (!user) return next(new Error('auth'));
  socket.data.user = user;
  next();
});


// Pay out a finished shift. Everything is decided here: pay, stress, energy, reputation, burnout.
function finishShift(p) {
  const sh = p.shift;
  p.shift = null;
  if (!sh) return;
  const S = SLOTS[sh.slot];
  const job = jobById(sh.jobId);
  if (!job || p[S.id] !== job.id) return;
  const now = Date.now();
  const perk = perkOf(job, p.skills);
  const mult = eventMult();
  const pay = payFor(p, job);
  const energyCost = Math.max(1, WORK_ENERGY - perk.energyCut);
  p.stress = clampStress(p.stress + Math.max(1, (job.stress || STRESS.work) - perk.stressCut));
  p[S.shifts]++;
  if (job.rep) addRep(p, job.rep);
  questEvent(p, 'shifts');
  if (!p.burnout && burnoutNext(p.stress, false)) {
    p.burnout = true;
    notice(p, 'You are burned out! You cannot work or study until your stress comes down.');
  }
  p[S.last] = now;
  // After a loan default part of your pay goes to the debt until it is cleared.
  const gar = garnish(p.bank, pay);
  p.cash += gar.rest;
  p.energy = Math.max(0, p.energy - energyCost);
  notice(p, `Shift done. +₦${gar.rest.toLocaleString('en-US')}${mult > 1 ? ` (${world.event.title} x${mult}!)` : ''}${perk.payMult > 1 ? ` (skill bonus +${Math.round((perk.payMult - 1) * 100)}%)` : ''}. Energy −${energyCost}.${gar.take ? ` ₦${gar.take.toLocaleString('en-US')} went to your bank debt.` : ''}`);
  if (gar.take) {
    bankCommit(p, [{ kind: 'garnish', bal: 0, cash: 0, note: `₦${gar.take} of shift pay paid toward debt` }]);
    sendBank(p);
  }
}
function cancelShift(p, text) {
  if (!p.shift) return;
  p.shift = null;
  if (text) notice(p, text);
}

// ---------- Walking to a place on foot: you step out of the building, walk along the street, and go in (or Skip) ----------
const AUTO_TIMEOUT_MS = 180000;
const inBuilding = (p) => Boolean(p.room && p.room !== 'street' && (isVenueDoor(p.room) || p.room === 'biz' || p.room === 'friendhome'));
function startAuto(p, to) { p.auto = { to, stage: p.room === 'street' ? 'walk' : 'exit', since: Date.now(), d0: 0, repath: 0 }; p.sit = false; }
function stopAuto(p, text) { p.auto = null; if (text) notice(p, text); }
// Out of whatever building you are in, onto the street in front of its door.
function exitBuilding(p) {
  if (p.room === 'biz') { const l = ctxOf(p).layout.lots[p.bizLot]; return moveNow(p, 'street', l ? l.door.x : CITY.spawn.x, l ? l.door.z : CITY.spawn.z); }
  if (p.room === 'friendhome') return showOut(p);
  const d = doorFor(p, p.room);
  if (d) moveNow(p, 'street', d.x, d.z);
}
// Go through the door of the place you were walking to. Returns true if you are in.
function enterAuto(p, id) {
  const dest = ROOMS[id];
  if (id === HOME && p.city !== p.homeCity) { stopAuto(p, `Your home is in ${CITIES[p.homeCity].name}.`); return false; }
  if (id === HOME && consequences(p.bills).locked) { stopAuto(p, 'Your landlord changed the lock. Pay your rent in Bills to get back in.'); return false; }
  if (!venueOpen(id)) { stopAuto(p, closedText(id)); return false; }
  if (!dest.solo && occupancy(id, p.city) >= dest.cap) { stopAuto(p, `${dest.name} is full right now.`); return false; }
  p.auto = null;
  moveNow(p, id, 0, 8);
  return true;
}
function autoStep(p, now) {
  const a = p.auto;
  if (!a) return;
  if (p.trip || p.drive || p.shift || jailLeft(p) || now - a.since > AUTO_TIMEOUT_MS) return stopAuto(p, p.shift ? 'Finish your shift first.' : a.stage && now - a.since > AUTO_TIMEOUT_MS ? 'You gave up walking.' : null);
  if (a.stage === 'exit') {
    if (!inBuilding(p)) { a.stage = 'walk'; return; }
    p.tx = INSIDE_EXIT.x; p.tz = 8.5; p.path = null; p.run = false;
    if (Math.hypot(p.x - INSIDE_EXIT.x, p.z - 8.5) <= DOOR_REACH - 0.6) { exitBuilding(p); a.stage = 'walk'; }
    return;
  }
  if (p.room !== 'street') return stopAuto(p);
  const door = doorFor(p, a.to);
  if (!door) return stopAuto(p);
  const dist = Math.hypot(p.x - door.x, p.z - door.z);
  if (!a.d0) a.d0 = Math.max(dist, 1);
  if (dist <= DOOR_REACH - 0.8) { enterAuto(p, a.to); return; }
  if (!p.path || now > a.repath) {
    // (re)plan the way: around buildings, trees and lamp posts
    a.repath = now + 4000;
    const b = boundsOf('street');
    p.tx = door.x; p.tz = door.z; p.run = false;
    const path = findPath((x, z) => ctxOf(p).walls.blocked(x, z), { x: p.x, z: p.z }, { x: p.tx, z: p.tz }, { bx: b.bx, bz: b.bz, cell: 1 });
    if (path && path.length) { p.path = path; p.pathKey = `${p.tx},${p.tz}`; }
  }
}
setInterval(() => { const now = Date.now(); for (const p of players.values()) if (p.auto) autoStep(p, now); }, 200);

// ---------- Minigames: chess, 21 and Word Race between two players standing in the same place ----------
const games = new Map();          // id -> { id, kind, ps: [playerA, playerB], st, last, over, ... }
let gameSeq = 1;
const GAME_REWARD = { fun: 20, social: 15 };
const GAME_INVITE_MS = 60000;
const gameOf = (p) => (p.gameId ? games.get(p.gameId) : null);
const sqName = (i) => 'abcdefgh'[i & 7] + (8 - (i >> 3));
function gameView(g, who) {
  const base = { id: g.id, kind: g.kind, you: who, names: g.ps.map((x) => x.name), over: g.over, winner: g.winner, why: g.why || '' };
  if (g.kind === 'chess') {
    const turnIdx = g.st.turn === 'w' ? 0 : 1;
    const legal = {};
    if (!g.over && turnIdx === who) for (const m of legalMoves(g.st)) (legal[m.from] = legal[m.from] || []).push(m.to);
    return { ...base, b: g.st.b.join(''), turn: turnIdx, status: g.status, last: g.last || null, legal };
  }
  if (g.kind === 'twentyone') {
    const mine = g.st.hands[who], theirs = g.st.hands[1 - who];
    return { ...base, turn: g.st.turn, mine, mineValue: handValue(mine), theirCount: theirs.length, theirs: g.over ? theirs : null, theirValue: g.over ? handValue(theirs) : null, stood: g.st.stood };
  }
  return { ...base, round: g.st.round, rounds: WORD_ROUNDS, word: g.over ? null : g.st.shown[g.st.round], score: g.st.score, lastGuess: g.lastGuess || null };
}
function pushGame(g) { g.ps.forEach((p, i) => p.socket.emit('game', gameView(g, i))); }
function endGame(g, winner, why) {
  if (g.over && g.closed) return;
  g.over = true; g.winner = winner; g.why = why || g.why || '';
  g.closed = true;
  pushGame(g);
  for (const p of g.ps) {
    p.gameId = null;
    if (why !== 'left') {
      p.fun = Math.min(100, p.fun + GAME_REWARD.fun);
      p.social = Math.min(100, p.social + GAME_REWARD.social);
    }
  }
  const msg = winner === -1 ? 'It was a draw.' : null;
  g.ps.forEach((p, i) => { try { notice(p, msg || (winner === i ? 'You won!' : 'You lost.') + (why === 'left' ? ' Your opponent left.' : '')); } catch { /* player gone */ } });
  setTimeout(() => games.delete(g.id), 30000);
}
function newGameSession(kind, a, b) {
  const g = { id: gameSeq++, kind, ps: [a, b], space: spaceOf(a), over: false, winner: null, why: '', closed: false };
  if (kind === 'chess') { g.st = newChess(); g.status = 'playing'; }
  else if (kind === 'twentyone') g.st = newTwentyOne();
  else g.st = newWordRace();
  games.set(g.id, g);
  a.gameId = g.id; b.gameId = g.id;
  pushGame(g);
  return g;
}

io.on('connection', (socket) => {
  const user = socket.data.user;

  // One live session per account, so money can never be duplicated across tabs.
  dropLive(user.id);

  // Load the saved state fresh from the database.
  const saved = q.userById.get(user.id);
  let room = has(ROOMS, saved.room) ? saved.room : START_ROOM;
  const bills = parseBills(saved.bills);
  // Saved in a venue that is closed now, or in a home that is locked? Start at the Plaza instead.
  if (!venueOpen(room) || room === 'biz' || (room === HOME && consequences(bills).locked)) room = START_ROOM;
  if ((saved.jail_until || 0) > Date.now()) room = 'police'; // still serving time
  const myHomeCity = parseCity(saved.home_city);
  const homeCity = room === HOME || room === 'friendhome' ? myHomeCity : parseCity(saved.city);
  if (!ROOMS[room].solo && occupancy(room, homeCity) >= ROOMS[room].cap) room = START_ROOM;
  if (!ROOMS[room].solo && occupancy(room, homeCity) >= ROOMS[room].cap) {
    socket.emit('full');
    socket.disconnect(true);
    return;
  }

  const p = {
    id: socket.id,
    userId: user.id,
    socket,
    name: user.username,
    room,
    city: homeCity,
    homeCity: myHomeCity,
    trip: null,
    x: room === 'street' ? CITY.spawn.x : 0, z: room === 'street' ? CITY.spawn.z : 0, tx: room === 'street' ? CITY.spawn.x : 0, tz: room === 'street' ? CITY.spawn.z : 0,
    color: COLORS[user.id % COLORS.length],
    cash: saved.cash,
    food: saved.food,
    energy: saved.energy,
    fun: saved.fun,
    social: saved.social,
    clean: saved.clean,
    toilet: saved.toilet,
    lastMove: 0,
    lastAct: {},
    story: parseState(saved.story),
    bills,
    billState: Object.fromEntries(BILL_IDS.map((id) => [id, billStatus(bills[id])])),
    payTimes: [],
    skills: parseSkills(saved.skills),
    vehicles: parseVehicles(saved.vehicles),
    net: parseNet(saved.net),
    npcCd: {},
    tipCd: {},
    rep: Number.isFinite(saved.rep) ? clampRep(saved.rep) : 0,
    repCd: {},
    bank: parseBank(saved.bank),
    bankTimes: [],
    crCd: {},
    home: parseHome(saved.home),
    homeTimes: [],
    wardrobe: parseWardrobe(saved.wardrobe),
    body: saved.body === 'woman' ? 'woman' : 'man',
    eyes: EYE_IDS.includes(saved.eyes) ? saved.eyes : 'brown',
    skin: Number.isInteger(saved.skin) && saved.skin >= 0 && saved.skin < SKIN_COUNT ? saved.skin : 0,
    hair: HAIR_IDS.includes(saved.hair) ? saved.hair : 'brown',
    fines: cleanFines(saved.fines),
    jailUntil: saved.jail_until || 0,
    lastSteal: 0,
    visiting: null,
    drive: null,
    driveIn: { steer: 0, thr: 0 },
    driveAt: 0,
    wanted: null,
    inJunction: null,
    knocks: new Map(),
    lastKnock: 0,
    lastPatrol: Date.now(),
    finesSig: null,
    fashionTimes: [],
    socialTimes: [],
    dmTimes: [],
    friendsDirty: true,
    friendsAt: 0,
    friendsSig: null,
    friendRowsCache: null,
    unreadCache: new Map(),
    phone: null,
    jobTakenAt: 0,
    shiftsOnJob: 0,
    jobId: null,
    job2Id: null,
    handsets: parsePhones(saved.handsets),
    lastWork2: saved.last_work2 || 0,
    shiftsOnJob2: 0,
    jobTakenAt2: 0,
    shift: null,
    stress: Number.isFinite(saved.stress) ? saved.stress : 0,
    sick: Boolean(saved.sick),
    burnout: Boolean(saved.burnout),
    sickMin: 0,
    lastStudy: 0,
    lastJobChange: 0,
    warnedClose: false,
    lastWork: saved.last_work || 0,
    lastReport: 0,
    chatTimes: [],
    themeTimes: [],
    theme: parseTheme(saved.theme),
    muted: new Set(q.mutedIds.all(user.id).map((r) => r.muted_id)),
  };
  // An old save with a story job but no chosen job keeps the story job.
  p.jobId = jobById(saved.job_id) ? saved.job_id : (JOBS.find((j) => j.flag && !j.part && p.story.flags.includes(j.flag)) || {}).id || null;
  p.job2Id = jobById(saved.job2_id) && jobById(saved.job2_id).part ? saved.job2_id : null;
  // An older save may have a part-time job in the main slot: move it to the part-time slot.
  if (p.jobId && jobById(p.jobId).part) { if (!p.job2Id) p.job2Id = p.jobId; p.jobId = null; }
  // Everyone gets an in-game phone number (older accounts get theirs the first time they log in).
  if (!user.phone) {
    user.phone = freshPhone();
    q.setPhone.run(user.phone, user.id);
  }
  p.phone = user.phone;
  // Everyone gets a house plot the first time they log in. The numbers are handed out in order of joining.
  if (saved.plot === null || saved.plot === undefined) {
    saved.plot = q.nextPlot.get().n;
    q.setPlot.run(saved.plot, user.id);
  }
  p.plot = saved.plot;
  players.set(socket.id, p);
  // On a shift you cannot walk off, enter a door, travel, study, drive and so on.
  socket.use((packet, next) => {
    if (p.shift && SHIFT_LOCKED.has(packet[0])) return notice(p, 'You are on a shift. Finish it, or cancel it first.');
    next();
  });
  byUser.set(user.id, p);
  socket.join(spaceKey(room, user.id, p.city));
  socket.emit('welcome', {
    startDay: Math.floor((Number(saved.start_min) || 0) / DAY_MIN),
    id: socket.id,
    username: user.username,
    travel: travelOf(p),
    needs: NEEDS.map((id) => ({ id, label: NEED_LABELS[id] })),
    actions: ACTIONS,
  });
  socket.emit('room', roomInfo(room, p));
  if (room === 'street') sendLots(p);
  sendStory(p);
  sendMutes(p);
  socket.emit('theme', p.theme);
  socket.emit('clock', clockInfo());
  socket.emit('event', eventInfo());
  sendBills(p);
  sendSkills(p);
  sendPeople(p);
  sendBank(p, true);
  sendHome(p, true);
  sendWardrobe(p, true);
  sendFines(p, true);
  sendFriends(p, true);
  socket.emit('fashion', fashionCatalog());
  sendVehicles(p);

  // Request: walk to a point. The server validates and clamps it.
  socket.on('setBody', (v) => {
    if (v !== 'man' && v !== 'woman') return;
    p.body = v;
    q.setBody.run(v, p.userId);
  });
  // The character editor saves the whole look at once. Every value is checked against the lists above.
  socket.on('setLook', (v) => {
    const l = cleanLook(v, p);
    p.body = l.body; p.eyes = l.eyes; p.skin = l.skin; p.hair = l.hair;
    q.setLook.run(l.body, l.eyes, l.skin, l.hair, p.userId);
  });
  // Eye colour: only the listed colours are accepted.
  socket.on('setEyes', (v) => {
    if (typeof v !== 'string' || !EYE_IDS.includes(v)) return;
    p.eyes = v;
    q.setEyes.run(v, p.userId);
  });
  // Sit down where you stand (or stand up again). Walking anywhere stands you up.
  socket.on('sit', () => {
    if (p.sit) { p.sit = false; return; }
    if (p.trip || p.drive || p.shift || p.riding || jailLeft(p) || !p.room) return notice(p, 'You cannot sit down right now.');
    p.sit = true;
    p.tx = p.x; p.tz = p.z;
  });
  socket.on('moveTo', (t) => {
    if (p.trip || p.drive) return;
    if (p.frozenUntil && Date.now() < p.frozenUntil) return; // still in the hospital bed
    if (p.sit && t && Number.isFinite(t.x) && Number.isFinite(t.z) && Math.hypot(t.x - p.x, t.z - p.z) > 0.3) p.sit = false;
    const now = Date.now();
    if (now - p.lastMove < 50) return; // ignore floods
    p.lastMove = now;
    if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.z)) return;
    if (p.auto) p.auto = null; // you took over
    const b = boundsOf(p.room);
    p.tx = clamp(t.x, -b.bx, b.bx);
    p.tz = clamp(t.z, -b.bz, b.bz);
    p.run = t.r === 1 || t.r === true;
    p.path = null;
    if (p.anim && Math.hypot(p.tx - p.x, p.tz - p.z) > 0.3) p.anim = null;
    // A tap (not a held joystick or key) finds its way around buildings, trees and furniture.
    if (!(t.d === 1 || t.d === true) && Math.hypot(p.tx - p.x, p.tz - p.z) > 1.2) {
      const street = p.room === 'street';
      const blocked = street ? (x, z) => ctxOf(p).walls.blocked(x, z) : roomBlockedFn(p.room);
      const path = findPath(blocked, { x: p.x, z: p.z }, { x: p.tx, z: p.tz }, street ? { bx: b.bx, bz: b.bz, cell: 1 } : { bx: b.bx, bz: b.bz, cell: 0.5 });
      if (path && path.length) { p.path = path; p.pathKey = `${p.tx},${p.tz}`; }
    }
  });

  // Request: do an action that fixes a need (eat, sleep, play, chat, shower, toilet).
  // The server checks the money, the company, and the cooldown. The browser never decides.
  socket.on('act', (type) => {
    if (!has(ACTIONS, type)) return;
    if (p.trip) return notice(p, 'Wait until you arrive.');
    const now = Date.now();
    if (now - (p.lastAct[type] || 0) < ACTION_COOLDOWN_MS) return notice(p, 'Slow down a little.');
    const a = ACTIONS[type];
    const guestSleep = type === 'sleep' && p.room === 'friendhome'; // a friend let you in: you may sleep over
    if (a.onlyRoom && p.room !== a.onlyRoom && !guestSleep) return notice(p, `${a.label} only works at the ${ROOMS[a.onlyRoom].name}.`);
    if (a.needsCompany && !hasCompany(p)) return notice(p, 'Nobody here to chat with.');
    if (p.cash < a.cost) return notice(p, `Not enough cash. ${a.label} costs ₦${a.cost}.`);
    // The place changes how well an action works: your own bed beats a bench, and no power means a bad night.
    let gain = a.gain;
    let extra = '';
    if (guestSleep) { gain = GUEST_SLEEP_GAIN; extra = ' A friend\'s spare bed.'; }
    const power = !consequences(p.bills).noPower;
    if (p.room === HOME && type === 'sleep') {
      gain = power ? HOME_SLEEP_GAIN : NO_POWER_SLEEP_GAIN;
      extra = power ? ' Your own bed!' : ' No power, no fan. Poor sleep.';
    }
    if (p.room === HOME && power) {
      const fx = effectsOf(p.home);
      if (type === 'sleep' && fx.sleep) gain += fx.sleep;
      if (type === 'eat' && fx.eat) gain += fx.eat;
      if (type === 'play' && fx.fun) gain += fx.fun;
    }
    if (p.room === HOME && type === 'shower' && !power) {
      gain = NO_POWER_SHOWER_GAIN;
      extra = ' Cold water only.';
    }
    const ev = world.event;
    if (ev && ev.funMult && type === 'play' && p.room === ev.funRoom) {
      gain = Math.min(100, Math.round(gain * ev.funMult));
      extra = ` ${ev.title} bonus!`;
    }
    p.lastAct[type] = now;
    p.cash -= a.cost;
    p[a.need] = Math.min(100, p[a.need] + gain);
    const calm = type === 'sleep' && p.room === HOME && power ? STRESS.sleepHome : STRESS.actions[type];
    if (calm !== undefined) p.stress = clampStress(p.stress + calm);
    notice(p, `${a.label}: ${NEED_LABELS[a.need]} +${gain}.${extra}`);
    if (type === 'dance') questEvent(p, 'dance');
  });

  // Request: save the player's look. Only known values are kept.
  socket.on('setTheme', (req) => {
    if (!allow(p.themeTimes, 10, 10000)) return;
    const t = cleanTheme(req);
    if (!t) return;
    p.theme = t;
    q.setTheme.run(JSON.stringify(t), p.userId);
  });

  // Request: send a chat message to everyone in the room. Rules live in moderation.js.
  socket.on('chat', (text) => {
    if (p.trip) return notice(p, 'Wait until you arrive.');
    if (p.room === HOME) return notice(p, 'You are home alone. Go somewhere public to chat.');
    if (consequences(p.bills).noData) return notice(p, 'You are out of data. Renew it in Bills to chat.');
    if (!allow(p.chatTimes, 5, 10000)) return notice(p, 'You are sending messages too fast.');
    const r = cleanText(text);
    if (r.error) return notice(p, r.error);
    // The filter masked something rude. That is checked here, by the server, never reported by another player.
    const stars = (x) => (String(x).match(/\*/g) || []).length;
    if (stars(r.text) > stars(text) && Date.now() - (p.repCd.toxic || 0) > REP.toxicCooldownMs) {
      p.repCd.toxic = Date.now();
      addRep(p, REP.toxic, 'watch your language');
    }
    chatLog.push({ userId: p.userId, name: p.name, text: r.text, t: Date.now() });
    if (chatLog.length > 300) chatLog.shift();
    const msg = { sid: p.id, name: p.name, text: r.text };
    // Players who muted this sender never receive it.
    for (const o of players.values()) {
      if (spaceOf(o) === spaceOf(p) && !o.muted.has(p.userId)) o.socket.emit('chat', msg);
    }
    // Someone nearby may overhear a keyword and answer, privately, with a tip.
    const now = Date.now();
    for (const npcId of peopleIn(p.room, minuteOfDay())) {
      if (!overheard(npcId, r.text) || now - (p.tipCd[npcId] || 0) < TIP_COOLDOWN_MS) continue;
      const tip = pickTip(p.net, npcId);
      if (!tip) continue;
      p.tipCd[npcId] = now;
      const key = `tip:${npcId}:${tip.i}`;
      let text = tip.text;
      if (tip.cash && !p.net.seen[key]) {
        p.net.seen[key] = true;
        p.cash += tip.cash;
        text += ` (+₦${tip.cash.toLocaleString('en-US')})`;
      }
      addRel(p, npcId, 1);
      p.socket.emit('chat', { sid: `npc:${npcId}`, name: NPCS[npcId].name, text });
    }
  });

  // Request: report a player. The server saves their last few messages itself, so a report cannot fake what was said.
  socket.on('report', (req) => {
    if (!req || typeof req.sid !== 'string') return;
    const target = players.get(req.sid);
    if (!target || target === p) return notice(p, 'You cannot report that player.');
    const now = Date.now();
    if (now - p.lastReport < 10000) return notice(p, 'Please wait a few seconds before another report.');
    if (q.reportsBy.get(p.userId, now - 86400000).c >= 20) return notice(p, 'You have reached the daily report limit.');
    if (q.dupReport.get(p.userId, target.userId, now - 60000)) return notice(p, 'You already reported this player.');
    const lines = chatLog.filter((m) => m.userId === target.userId && now - m.t < 600000).slice(-3).map((m) => m.text);
    q.insertReport.run(p.userId, target.userId, target.name, JSON.stringify(lines), p.room, now);
    p.lastReport = now;
    notice(p, 'Report sent. Thank you.');
  });

  // Requests: mute or unmute a player. Mutes are saved with your account.
  socket.on('mute', (req) => {
    if (!req || typeof req.sid !== 'string') return;
    const target = players.get(req.sid);
    if (!target || target === p) return;
    if (q.muteCount.get(p.userId).c >= 200) return notice(p, 'Your mute list is full.');
    q.addMute.run(p.userId, target.userId);
    p.muted.add(target.userId);
    sendMutes(p);
    notice(p, `Muted ${target.name}.`);
  });
  socket.on('unmute', (name) => {
    if (typeof name !== 'string') return;
    const u = q.userByName.get(name);
    if (!u) return;
    q.delMute.run(p.userId, u.id);
    p.muted.delete(u.id);
    sendMutes(p);
    notice(p, `Unmuted ${u.username}.`);
  });

  // Request: start a shift at your job's location. You stay put and work until it is over (or you cancel). Pay is given at the end.
  // req.slot ('main' or 'part') says which job; when it is left out we pick the job whose workplace you are standing in.
  socket.on('work', (req) => {
    if (p.shift) return notice(p, 'You are already on a shift.');
    if (p.trip) return notice(p, 'Wait until you arrive.');
    let slot = req && typeof req === 'object' && (req.slot === 'part' || req.slot === 'main') ? req.slot : null;
    if (!slot) {
      const m = slotJob(p, 'main'), pt = slotJob(p, 'part');
      slot = m && m.room === p.room ? 'main' : pt && pt.room === p.room ? 'part' : 'main';
    }
    const S = SLOTS[slot];
    const job = slotJob(p, slot);
    if (!job) return notice(p, slot === 'part' ? 'You do not have a part-time job. Visit the Jobs Center to take one.' : 'You do not have a job. Visit the Jobs Center to take one.');
    if (p.sick) return notice(p, 'You are sick and cannot work. Rest, or buy medicine at the Pharmacy.');
    if (p.burnout) return notice(p, 'You are burned out. Rest, relax, and sleep before working again.');
    if (p.room !== job.room) return notice(p, `Your shifts are at the ${ROOMS[job.room].name}.`);
    if (!venueOpen(job.room)) return notice(p, closedText(job.room));
    const now = Date.now();
    const waitMs = p[S.last] + WORK_COOLDOWN_MS - now;
    if (waitMs > 0) return notice(p, `Next shift in ${Math.ceil(waitMs / 1000)} seconds.`);
    if (p.energy < WORK_MIN_ENERGY) return notice(p, 'Too tired to work. Get some sleep first.');
    if (job.hours && !IGNORE_HOURS && !isOpen(job.hours, minuteOfDay())) return notice(p, `This job only runs ${hoursText(job.hours)}.`);
    if (job.remote) {
      const cons = consequences(p.bills);
      if (cons.noPower) return notice(p, 'No power at home, so you cannot work. Pay your electricity.');
      if (cons.noData) return notice(p, 'You are out of data, so you cannot work online. Renew it in Bills.');
    }
    const ms = Math.round(shiftMs(job, perkOf(job, p.skills).level) * SHIFT_SCALE);
    p.shift = { slot, jobId: job.id, room: job.room, start: now, end: now + ms };
    p.tx = p.x; p.tz = p.z; // stand still
    if (ms <= 0) return finishShift(p);
    notice(p, `Shift started: ${job.title}. About ${Math.ceil(ms / 1000)} seconds. You cannot leave until it is done.`);
  });
  socket.on('cancelShift', () => {
    if (p.shift) cancelShift(p, 'You left your shift early. No pay.');
  });

  // Request: study or practice a skill. The server checks the place, the cost, your energy, and your health.
  socket.on('study', (req) => {
    if (!req || !has(SKILLS, req.skill) || !STUDY_MODES.includes(req.mode)) return;
    if (p.trip) return notice(p, 'Wait until you arrive.');
    const now = Date.now();
    if (now - p.lastStudy < STUDY_COOLDOWN_MS) return notice(p, 'Slow down a little.');
    const why = whyNotStudy(p, req.skill, req.mode);
    if (why) return notice(p, why);
    const rule = studyRule(req.skill, req.mode);
    p.lastStudy = now;
    // Training at the gym shows: dumbbell curls, push-ups or crunches for a few seconds.
    if (p.room === 'gym' && req.skill === 'fitness') p.anim = { k: Number(process.env.GYM_ANIM) || 1 + Math.floor(Math.random() * 3), until: now + Number(process.env.GYM_ANIM_MS || 5000) };
    p.cash -= rule.cost;
    p.energy = Math.max(0, p.energy - rule.energy);
    if (rule.clean) p.clean = Math.max(0, p.clean - rule.clean);
    p.stress = clampStress(p.stress + rule.stress);
    const before = levelOf(p.skills[req.skill]);
    // A study desk in your Home makes online courses worth more.
    const xp = req.mode === 'course' ? Math.round(rule.xp * (1 + effectsOf(p.home).course)) : rule.xp;
    const after = addXp(p, req.skill, xp);
    if (after === before) notice(p, `${rule.label}: ${SKILLS[req.skill].label} +${xp} XP.`);
    questEvent(p, 'study');
    if (req.mode === 'practice') questEvent(p, 'practice', { skill: req.skill });
    if (!p.burnout && burnoutNext(p.stress, false)) {
      p.burnout = true;
      notice(p, 'You are burned out! Rest before you work or study again.');
    }
    sendSkills(p);
    if (after > before) sendJobs(p);
  });

  // Requests: take a job at the Jobs Center, or quit the one you have.
  socket.on('applyJob', (id) => {
    const job = jobById(id);
    if (!job) return;
    if (p.trip) return notice(p, 'Wait until you arrive.');
    if (p.room !== 'jobs') return notice(p, 'Go to the Jobs Center to apply.');
    if (!venueOpen('jobs')) return notice(p, closedText('jobs'));
    const S = SLOTS[job.part ? 'part' : 'main'];
    if (p[S.id] === job.id) return notice(p, 'That is already your job.');
    const now = Date.now();
    if (now - p.lastJobChange < 5000) return notice(p, 'Slow down a little.');
    const q = qualifies(job, allFlags(p), p.skills, p.rep);
    if (!q.ok) return notice(p, `You do not qualify yet. ${q.why}.`);
    if (INTERVIEWS_ON && needsInterview(job)) {
      const wait = (p.interviewCool && p.interviewCool[job.id] || 0) + INTERVIEW.retryMs - now;
      if (wait > 0) return notice(p, `They will interview you again in ${Math.ceil(wait / 1000)} seconds.`);
      const iv = startInterview(INTERVIEW_RAND);
      p.interview = { jobId: job.id, right: iv.right, until: now + INTERVIEW.expireMs };
      p.lastJobChange = now;
      return socket.emit('interview', { jobId: job.id, title: job.title, qs: iv.view });
    }
    takeJob(p, job);
  });
  function takeJob(p, job) {
    const S = SLOTS[job.part ? 'part' : 'main'];
    p.lastJobChange = Date.now();
    p[S.id] = job.id;
    p[S.taken] = Date.now();
    p[S.shifts] = 0;
    notice(p, `You are now a ${job.title}${job.part ? ' (part-time)' : ''}. Shifts are at ${job.remote ? 'Home' : ROOMS[job.room].name}.`);
    sendJobs(p);
  }
  socket.on('interviewAnswer', (req) => {
    const iv = p.interview;
    if (!iv || !req || typeof req !== 'object') return;
    p.interview = null;
    const job = jobById(iv.jobId);
    if (!job || Date.now() > iv.until) return notice(p, 'The interviewer has left. Apply again.');
    if (p.room !== 'jobs' || p.trip) return notice(p, 'You left the Jobs Center before the interview ended.');
    const q = qualifies(job, allFlags(p), p.skills, p.rep);
    if (!q.ok) return notice(p, `You do not qualify any more. ${q.why}.`);
    const skill = job.req.skill, bonus = levelOf((p.skills && p.skills[skill]) || 0) >= (job.req.level || 0) + 2;
    const res = gradeInterview(iv.right, req.answers, bonus);
    if (!res) return;
    if (!p.interviewCool) p.interviewCool = {};
    if (res.passed) {
      notice(p, `Interview passed${bonus ? ' (your skills impressed them)' : ''}!`);
      takeJob(p, job);
    } else {
      p.interviewCool[job.id] = Date.now();
      notice(p, `Not this time: ${res.correct} of ${iv.right.length} good answers. You can try again in a minute.`);
    }
    socket.emit('interviewDone', { passed: res.passed });
  });
  socket.on('quitJob', (slotName) => {
    const slot = slotName === 'part' ? 'part' : 'main';
    const S = SLOTS[slot];
    if (!p[S.id]) return;
    // Walking out on a job you never even worked a shift at is ghosting. It costs you your name.
    const ghosted = p[S.shifts] === 0 && Date.now() - p[S.taken] < REP.ghostMs && p[S.taken] > 0;
    p[S.id] = null;
    notice(p, slot === 'part' ? 'You quit your part-time job.' : 'You quit your job.');
    if (ghosted) addRep(p, REP.ghost, 'you ghosted a job');
    sendJobs(p);
  });

  // Request: buy medicine at the Pharmacy to cure a cold at once.
  socket.on('buyMedicine', () => {
    if (p.trip) return notice(p, 'Wait until you arrive.');
    if (p.room !== 'pharmacy') return notice(p, 'Medicine is sold at the Pharmacy.');
    if (!venueOpen('pharmacy')) return notice(p, closedText('pharmacy'));
    if (!p.sick) return notice(p, 'You are not sick.');
    if (p.cash < SICK.medicineCost) return notice(p, `Medicine costs ₦${SICK.medicineCost.toLocaleString('en-US')}.`);
    p.cash -= SICK.medicineCost;
    p.sick = false;
    p.sickMin = 0;
    notice(p, 'You took the medicine and feel much better.');
  });

  // Request: buy a vehicle at the Kanis Motors. The price comes from the server's table, never from the browser.
  socket.on('buyVehicle', (id) => {
    if (typeof id !== 'string' || !Object.hasOwn(VEHICLES, id)) return;
    if (p.trip) return notice(p, 'Wait until you arrive.');
    if (p.room !== 'garage') return notice(p, 'Vehicles are sold at the Kanis Motors.');
    if (!venueOpen('garage')) return notice(p, closedText('garage'));
    if (p.vehicles.includes(id)) return notice(p, 'You already own that.');
    const v = VEHICLES[id];
    if (p.cash < v.cost) return notice(p, `${v.label} costs ₦${v.cost.toLocaleString('en-US')}.`);
    p.cash -= v.cost;
    p.vehicles.push(id);
    notice(p, `You bought a ${v.label.toLowerCase()}! It is now on your Map.`);
    socket.emit('travel', travelOf(p));
    sendVehicles(p);
  });

  // Phones: the Shop sells better ones. Prices and ownership are decided here.
  socket.on('phonesOpen', () => sendPhones(p));
  // ----- Land and businesses -----
  socket.on('bizOpen', (id) => {
    if (!lotNear(p, id)) return;
    sendBiz(p, id);
  });
  // Walk into a business. Owners can always go in; customers only while it is open.
  socket.on('bizEnter', (id) => {
    const l = lotNear(p, id, true);
    if (!l) return;
    const rec = LOTS[p.city].get(id);
    if (!rec || !rec.biz) return notice(p, 'Nothing is built here yet.');
    if (rec.owner !== p.userId && !bizOpenNow(rec.biz.kind, minuteOfDay())) return notice(p, `${rec.biz.name} is closed.`);
    let n = 0;
    for (const o of players.values()) if (o.room === 'biz' && o.city === p.city && o.bizLot === id) n++;
    if (n >= ROOMS.biz.cap) return notice(p, `${rec.biz.name} is full right now.`);
    p.bizLot = id;
    moveNow(p, 'biz', 0, 8);
  });
  socket.on('lotBuy', (id) => {
    const l = lotNear(p, id, true);
    if (!l) return;
    if (LOTS[p.city].has(id)) return notice(p, 'That lot is already sold.');
    if (LOTS_OWNED(p) >= MAX_LOTS) return notice(p, `You can own at most ${MAX_LOTS} lots.`);
    if (p.cash < l.price) return notice(p, `That lot costs ₦${l.price.toLocaleString('en-US')}.`);
    p.cash -= l.price;
    LOTS[p.city].set(id, { owner: p.userId, ownerName: p.name, biz: null });
    saveLot(p.city, id);
    notice(p, `You bought the lot for ₦${l.price.toLocaleString('en-US')}. Now build something on it.`);
    broadcastLots(p.city);
    sendBiz(p, id);
  });
  socket.on('lotSell', (id) => {
    const l = lotNear(p, id, true);
    if (!l) return;
    const rec = LOTS[p.city].get(id);
    if (!rec || rec.owner !== p.userId) return notice(p, 'That is not your lot.');
    const back = Math.round(l.price * SELL_LAND) + (rec.biz ? Math.round(rec.biz.till) : 0);
    p.cash += back;
    LOTS[p.city].delete(id);
    saveLot(p.city, id);
    for (const o of [...players.values()]) if (o.room === 'biz' && o.city === p.city && o.bizLot === id) { moveNow(o, 'street', l.door.x, l.door.z, p.city); notice(o, 'The business was sold. You were shown out.'); }
    notice(p, `You sold the lot${rec.biz ? ' and its business' : ''} for ₦${back.toLocaleString('en-US')}.`);
    broadcastLots(p.city);
    sendBiz(p, id);
  });
  socket.on('bizBuild', (req) => {
    if (!req || typeof req !== 'object' || !isKind(req.kind) || !validName(req.name)) return notice(p, 'Pick a kind of business and a name (3 to 20 letters or numbers).');
    const l = lotNear(p, req.id, true);
    if (!l) return;
    const rec = LOTS[p.city].get(req.id);
    if (!rec || rec.owner !== p.userId) return notice(p, 'That is not your lot.');
    if (rec.biz) return notice(p, 'There is already a business here.');
    const K = KINDS[req.kind];
    if (p.cash < K.build) return notice(p, `A ${K.label} costs ₦${K.build.toLocaleString('en-US')} to build.`);
    p.cash -= K.build;
    rec.biz = newBiz(req.kind, req.name, Date.now());
    saveLot(p.city, req.id);
    notice(p, `${rec.biz.name} is built. Order some stock so you can open.`);
    broadcastLots(p.city);
    sendBiz(p, req.id);
  });
  const myBiz = (id) => {
    const l = lotNear(p, id);
    if (!l) return null;
    const rec = LOTS[p.city].get(id);
    if (!rec || rec.owner !== p.userId || !rec.biz) { notice(p, 'You do not own a business here.'); return null; }
    return rec;
  };
  socket.on('bizStock', (req) => {
    if (!req || typeof req !== 'object') return;
    const rec = myBiz(req.id);
    if (!rec) return;
    const r = buyStock(rec.biz, Number(req.n), p.cash);
    if (!r.ok) return notice(p, r.why);
    p.cash -= r.cost;
    rec.biz.stock += r.n;
    saveLot(p.city, req.id);
    notice(p, `Ordered ${r.n} for ₦${r.cost.toLocaleString('en-US')}.`);
    broadcastLots(p.city);
    sendBiz(p, req.id);
  });
  socket.on('bizCollect', (id) => {
    const rec = myBiz(id);
    if (!rec) return;
    const t = Math.round(rec.biz.till);
    if (t <= 0) return notice(p, 'The till is empty.');
    p.cash += t;
    rec.biz.till = 0;
    saveLot(p.city, id);
    notice(p, `You collected ₦${t.toLocaleString('en-US')} from the till.`);
    sendBiz(p, id);
  });
  socket.on('bizHire', (id) => {
    const rec = myBiz(id);
    if (!rec) return;
    const r = bizHire(rec.biz, p.cash);
    if (!r.ok) return notice(p, r.why);
    p.cash -= r.cost;
    rec.biz.staff = (rec.biz.staff || 0) + 1;
    lotsDirty = true;
    notice(p, `You hired a new team member (${rec.biz.staff}). They cost ₦${STAFF_WAGE.toLocaleString('en-US')} an hour, paid from the till.`);
    saveLot(p.city, id);
    refreshInside(p, id);
    sendBiz(p, id);
  });
  socket.on('bizFire', (id) => {
    const rec = myBiz(id);
    if (!rec) return;
    if (!rec.biz.staff) return notice(p, 'You have no staff to let go.');
    rec.biz.staff -= 1;
    if (!rec.biz.staff) rec.biz.owed = 0;
    notice(p, `You let one team member go (${rec.biz.staff} left).`);
    saveLot(p.city, id);
    refreshInside(p, id);
    sendBiz(p, id);
  });
  socket.on('bizUpgrade', (id) => {
    const rec = myBiz(id);
    if (!rec) return;
    if (rec.biz.level >= BIZ_MAX_LEVEL) return notice(p, 'It is already at the top level.');
    const cost = UPGRADE_COST[rec.biz.level + 1];
    if (p.cash < cost) return notice(p, `The upgrade costs ₦${cost.toLocaleString('en-US')}.`);
    p.cash -= cost;
    rec.biz.level += 1;
    saveLot(p.city, id);
    notice(p, `${rec.biz.name} is now level ${rec.biz.level}.`);
    broadcastLots(p.city);
    sendBiz(p, id);
  });
  // A customer buys one thing. The money goes into the owner's till.
  socket.on('bizBuy', (id) => {
    const l = lotNear(p, id);
    if (!l) return;
    const rec = LOTS[p.city].get(id);
    if (!rec || !rec.biz) return notice(p, 'There is nothing to buy here.');
    if (rec.owner === p.userId) return notice(p, 'It is your own shop. Collect from the till instead.');
    const b = rec.biz;
    if (!bizOpenNow(b.kind, minuteOfDay())) return notice(p, `${b.name} is closed.`);
    if (b.stock <= 0) return notice(p, `${b.name} has sold out.`);
    const price = priceOf(b.kind, b.level);
    if (p.cash < price) return notice(p, `That costs ₦${price.toLocaleString('en-US')}.`);
    const now = Date.now();
    if (now - (p.lastBizBuy || 0) < 1000) return;
    p.lastBizBuy = now;
    p.cash -= price;
    b.stock -= 1;
    b.till += price;
    for (const [need, v] of Object.entries(KINDS[b.kind].fx)) p[need] = Math.max(0, Math.min(100, p[need] + v));
    lotsDirty = true;
    notice(p, `You bought a ${KINDS[b.kind].item.toLowerCase()} at ${b.name} for ₦${price.toLocaleString('en-US')}.`);
    if (b.stock <= 0) broadcastLots(p.city);
    sendBiz(p, id);
  });

  socket.on('phoneBuy', (id) => {
    if (typeof id !== 'string') return;
    if (p.trip) return notice(p, 'Wait until you arrive.');
    if (p.room !== 'shop') return notice(p, 'Phones are sold at the Shop.');
    if (!venueOpen('shop')) return notice(p, closedText('shop'));
    const r = buyPhone(p.handsets, p.cash, id);
    if (!r.ok) return notice(p, r.why);
    p.cash -= r.cost;
    p.handsets = r.state;
    notice(p, `You bought a ${PHONES[id].label}. It is now your phone.`);
    sendPhones(p);
  });
  socket.on('phoneUse', (id) => {
    if (typeof id !== 'string') return;
    const r = usePhone(p.handsets, id);
    if (!r.ok) return notice(p, r.why);
    p.handsets = r.state;
    notice(p, `You are now using your ${PHONES[id].label}.`);
    sendPhones(p);
  });

  // Requests for clothes and perfume. Prices and ownership are decided here, never in the browser.
  socket.on('shopBuy', (req) => {
    const why = fashionGate(p, true);
    if (why) return notice(p, why);
    if (!req || typeof req !== 'object') return;
    if (req.kind === 'clothes') fashionApply(p, buyClothes(p.wardrobe, p.cash, req.id));
    else if (req.kind === 'perfume') fashionApply(p, buyPerfume(p.wardrobe, p.cash, req.id));
  });
  socket.on('shopSell', (req) => {
    const why = fashionGate(p, true);
    if (why) return notice(p, why);
    if (!req || typeof req !== 'object') return;
    if (req.kind === 'clothes') fashionApply(p, sellClothes(p.wardrobe, req.id));
    else if (req.kind === 'perfume') fashionApply(p, sellPerfume(p.wardrobe, req.uid));
  });
  socket.on('wear', (id) => {
    const why = fashionGate(p, false);
    if (why) return notice(p, why);
    fashionApply(p, wear(p.wardrobe, id));
  });
  socket.on('takeOff', (slot) => {
    const why = fashionGate(p, false);
    if (why) return notice(p, why);
    fashionApply(p, takeOff(p.wardrobe, slot));
  });
  socket.on('spritz', (uid) => {
    const why = fashionGate(p, false);
    if (why) return notice(p, why);
    fashionApply(p, spritz(p.wardrobe, uid));
  });

  // ----- Friends and messages -----
  socket.on('friendsOpen', () => sendFriends(p, true));
  socket.on('friendAdd', (req) => {
    const why = socialGate(p);
    if (why) return notice(p, why);
    const t = findPlayer(req);
    if (!t) return notice(p, 'No player found. Check the username or phone number.');
    if (t.id === p.userId) return notice(p, 'That is you.');
    const rel = (q.friendRel.get(p.userId, t.id) || {}).status;
    if (rel === 'friend') return notice(p, `You are already friends with ${t.username}.`);
    if (rel === 'out') return notice(p, `You already sent ${t.username} a request.`);
    if (q.isMuted.get(t.id, p.userId) || q.isMuted.get(p.userId, t.id)) return notice(p, 'You cannot add that player.');
    if (q.friendCount.get(p.userId).c >= MAX_FRIENDS) return notice(p, 'Your friends list is full.');
    const now = Date.now();
    if (rel === 'in') {
      // They already asked you, so adding them back makes you friends.
      db.exec('BEGIN');
      q.setFriend.run(p.userId, t.id, 'friend', now);
      q.setFriend.run(t.id, p.userId, 'friend', now);
      db.exec('COMMIT');
      markFriendsDirty(t.id);
      p.friendsDirty = true;
      const o = liveUser(t.id);
      if (o) notice(o, `${p.name} accepted your friend request.`);
      return notice(p, `You and ${t.username} are now friends.`);
    }
    if (q.outCount.get(p.userId).c >= MAX_REQUESTS_OUT) return notice(p, 'You have too many requests waiting. Wait for answers first.');
    db.exec('BEGIN');
    q.setFriend.run(p.userId, t.id, 'out', now);
    q.setFriend.run(t.id, p.userId, 'in', now);
    db.exec('COMMIT');
    p.friendsDirty = true;
    markFriendsDirty(t.id);
    const o = liveUser(t.id);
    if (o) notice(o, `${p.name} sent you a friend request. Open Friends to answer.`);
    notice(p, `Friend request sent to ${t.username}.`);
  });
  socket.on('friendRespond', (req) => {
    const why = socialGate(p);
    if (why) return notice(p, why);
    if (!req || typeof req.name !== 'string' || typeof req.accept !== 'boolean') return;
    const t = findPlayer({ name: req.name });
    if (!t || (q.friendRel.get(p.userId, t.id) || {}).status !== 'in') return;
    db.exec('BEGIN');
    if (req.accept) {
      const now = Date.now();
      q.setFriend.run(p.userId, t.id, 'friend', now);
      q.setFriend.run(t.id, p.userId, 'friend', now);
    } else {
      q.delFriend.run(p.userId, t.id, t.id, p.userId);
    }
    db.exec('COMMIT');
    p.friendsDirty = true;
    markFriendsDirty(t.id);
    if (req.accept) {
      const o = liveUser(t.id);
      if (o) notice(o, `${p.name} accepted your friend request.`);
      notice(p, `You and ${t.username} are now friends.`);
    }
  });
  // Remove a friend, cancel a request you sent, or block someone (blocking also mutes them).
  socket.on('friendRemove', (req) => {
    const why = socialGate(p);
    if (why) return notice(p, why);
    if (!req || typeof req.name !== 'string') return;
    const t = findPlayer({ name: req.name });
    if (!t || !q.friendRel.get(p.userId, t.id)) return;
    q.delFriend.run(p.userId, t.id, t.id, p.userId);
    if (req.block === true && q.muteCount.get(p.userId).c < 200) {
      q.addMute.run(p.userId, t.id);
      p.muted.add(t.id);
      sendMutes(p);
    }
    p.friendsDirty = true;
    markFriendsDirty(t.id);
    notice(p, req.block === true ? `Blocked ${t.username}.` : `Removed ${t.username}.`);
  });
  socket.on('dmOpen', (req) => {
    if (!req || typeof req.with !== 'string') return;
    const t = findPlayer({ name: req.with });
    if (!t || !isFriend(p.userId, t.id)) return;
    if (!allow(p.dmTimes, 30, 10000)) return;
    q.dmRead.run(p.userId, t.id);
    p.friendsDirty = true;
    const rows = q.dmThread.all(p.userId, t.id, t.id, p.userId, DM_SHOW).reverse();
    socket.emit('dmThread', { with: t.username, messages: rows.map((r) => ({ mine: r.from_id === p.userId, text: r.body, kind: r.kind, at: r.at })) });
  });
  socket.on('dmSend', (req) => {
    if (p.trip) return notice(p, 'Wait until you arrive.');
    if (!req || typeof req.to !== 'string' || typeof req.text !== 'string') return;
    if (!allow(p.dmTimes, 8, 10000)) return notice(p, 'You are sending messages too fast.');
    if (consequences(p.bills).noData) return notice(p, 'You are out of data. Renew it in Bills to send messages.');
    const t = findPlayer({ name: req.to });
    if (!t || !isFriend(p.userId, t.id)) return notice(p, 'You can only message friends.');
    if (q.isMuted.get(t.id, p.userId)) return notice(p, 'Message not delivered.');
    const r = cleanText(req.text);
    if (r.error) return notice(p, r.error);
    deliverDm(p, t.id, t.username, r.text, 'text');
  });
  // Share your in-game phone number with a friend. It is sent as a message they can see and keep.
  socket.on('sharePhone', (req) => {
    const why = socialGate(p);
    if (why) return notice(p, why);
    if (!req || typeof req.to !== 'string') return;
    const t = findPlayer({ name: req.to });
    if (!t || !isFriend(p.userId, t.id)) return notice(p, 'You can only share your number with friends.');
    if (q.isMuted.get(t.id, p.userId)) return notice(p, 'Message not delivered.');
    deliverDm(p, t.id, t.username, `My phone number is ${phoneText(p.phone)}`, 'phone');
    notice(p, `Sent your number to ${t.username}.`);
  });
  // Send money to a friend. Limits depend on the age of your account. The server moves the cash and writes the records in one step.
  socket.on('sendMoney', (req) => {
    const why = socialGate(p);
    if (why) return notice(p, why);
    if (!req || typeof req.to !== 'string' || !Number.isInteger(req.amount)) return notice(p, 'Choose a friend and an amount.');
    const t = findPlayer({ name: req.to });
    if (!t || t.id === p.userId || !isFriend(p.userId, t.id)) return notice(p, 'You can only send money to friends.');
    const sent = q.sentSince.get(p.userId, Date.now() - 24 * 3600 * 1000).s;
    const chk = checkTransfer({ amount: req.amount, cash: p.cash, ageMin: p.bank.ageMin, sentToday: sent });
    if (!chk.ok) return notice(p, chk.why);
    const amt = req.amount;
    const o = liveUser(t.id);
    try {
      db.exec('BEGIN');
      p.cash -= amt;
      save(p);
      let theirCash;
      let theirBal;
      if (o) {
        o.cash += amt;
        save(o);
        theirCash = o.cash;
        theirBal = o.bank.bal;
      } else {
        q.creditCash.run(amt, t.id);
        const row = q.userById.get(t.id);
        theirCash = row.cash;
        theirBal = parseBank(row.bank).bal;
      }
      const at = Date.now();
      q.insertTransfer.run(p.userId, t.id, amt, at);
      const gm = Math.floor(world.gameMin);
      q.addLedger.run(p.userId, 'sent', 0, -amt, p.bank.bal, p.cash, `To ${t.username}`.slice(0, 120), gm, at);
      q.addLedger.run(t.id, 'received', 0, amt, theirBal, theirCash, `From ${p.name}`.slice(0, 120), gm, at);
      db.exec('COMMIT');
    } catch (err) {
      console.error('transfer failed', err);
      try { db.exec('ROLLBACK'); } catch { /* nothing to roll back */ }
      p.cash += amt; // the database step failed, so give the money back in memory too
      if (o && o.cash >= amt) o.cash -= amt;
      return notice(p, 'The transfer failed. Nothing was sent.');
    }
    p.ledgerSig = null;
    if (o) o.ledgerSig = null;
    notice(p, `You sent ₦${amt.toLocaleString('en-NG')} to ${t.username}.`);
    if (o) notice(o, `${p.name} sent you ₦${amt.toLocaleString('en-NG')}.`);
    deliverDm(p, t.id, t.username, `Sent ₦${amt.toLocaleString('en-NG')}`, 'money');
  });

  // Requests for furniture. Prices, limits, and where things may go are decided here, never in the browser.
  socket.on('homeBuy', (id) => {
    const why = homeGate(p, 'homestore');
    if (why) return notice(p, why);
    homeApply(p, buyItem(p.home, p.cash, id));
  });
  socket.on('homeSell', (uid) => {
    const why = homeGate(p, 'homestore');
    if (why) return notice(p, why);
    homeApply(p, sellItem(p.home, uid));
  });
  socket.on('homePlace', (req) => {
    const why = homeGate(p, HOME);
    if (why) return notice(p, why);
    if (!req || typeof req !== 'object') return;
    homeApply(p, placeItem(p.home, req));
  });
  socket.on('homeAway', (uid) => {
    const why = homeGate(p, HOME);
    if (why) return notice(p, why);
    homeApply(p, putAway(p.home, uid));
  });
  // The map screen draws the city from this: roads, buildings, parks and where each door is. It is the same data the
  // street already uses, so asking for it gives nothing away. Cached per city and rate limited.
  socket.on('cityPlan', () => {
    const now = Date.now();
    if (now - (p.planAt || 0) < 1000) return;
    p.planAt = now;
    const ctx = ctxOf(p);
    if (!ctx.planJson) {
      const c = ctx.layout;
      ctx.planJson = {
        bx: c.bx, bz: c.bz, roadsEW: c.roadsEW, roadsNS: c.roadsNS, parks: c.parks, tracks: c.tracks, doors: c.doors,
        buildings: c.buildings.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d, k: b.k })),
      };
    }
    const own = p.city === p.homeCity ? plotOf(p).door : null;
    socket.emit('cityPlan', { city: p.city, plan: ctx.planJson, home: own ? { x: own.x, z: own.z } : null });
  });
  socket.on('homeLights', (on) => {
    const why = homeGate(p, HOME);
    if (why) return notice(p, why);
    homeApply(p, setLights(p.home, on));
  });
  socket.on('homePaint', (req) => {
    const why = homeGate(p, HOME);
    if (why) return notice(p, why);
    homeApply(p, paint(p.home, p.cash, req));
  });

  // Requests at the Bank. The browser sends only WHAT it wants (and an amount for deposits and withdrawals).
  // Prices, fees, limits, and who may borrow are decided here, never in the browser.
  const bankAmount = (v) => (typeof v === 'number' ? v : NaN);
  socket.on('bankOpen', () => {
    const why = bankGate(p);
    if (why) return notice(p, why);
    bankApply(p, openAccount(p.bank));
  });
  socket.on('bankDeposit', (amount) => {
    const why = bankGate(p);
    if (why) return notice(p, why);
    bankApply(p, deposit(p.bank, p.cash, bankAmount(amount)));
  });
  socket.on('bankWithdraw', (amount) => {
    const why = bankGate(p);
    if (why) return notice(p, why);
    bankApply(p, withdraw(p.bank, bankAmount(amount)));
  });
  socket.on('loanTake', (amount) => {
    const why = bankGate(p);
    if (why) return notice(p, why);
    bankApply(p, takeLoan(p.bank, bankAmount(amount)));
  });
  socket.on('loanPay', (kind) => {
    const why = bankGate(p);
    if (why) return notice(p, why);
    if (kind !== 'installment' && kind !== 'payoff') return;
    const before = p.bank.loan ? { age: p.bank.loan.age, missed: p.bank.loan.missed } : null;
    const ok = bankApply(p, kind === 'payoff' ? payoffLoan(p.bank, p.cash) : payInstallment(p.bank, p.cash));
    // A loan repaid properly (it ran at least two game days and no payment was missed) earns a little reputation.
    if (ok && before && !p.bank.loan && before.missed === 0 && before.age >= LOAN.payoffAgeMin) addRep(p, 2, 'you repaid your loan');
  });
  socket.on('debtPay', () => {
    const why = bankGate(p);
    if (why) return notice(p, why);
    bankApply(p, payDebt(p.bank, p.cash));
  });

  // Requests: talk to someone in the room, then pick what to say. Everything is checked here.
  socket.on('npcTalk', (id) => {
    if (typeof id !== 'string' || !Object.hasOwn(NPCS, id)) return;
    if (p.trip || !p.room) return;
    if (NPCS[id].room !== p.room || !present(id, minuteOfDay())) return notice(p, 'They are not here right now.');
    const greets = NPCS[id].greet;
    questEvent(p, 'talk', { npc: id });
    const dlg = dialogFor(p, id, greets[Math.floor(Math.random() * greets.length)]);
    // A nice scent or a very good outfit can earn a compliment. One chance per person every 12 minutes (saved, so logging out does not reset it).
    const now = Date.now();
    const w = p.wardrobe;
    if ((scentOf(w) || outfitOf(w).bestTier >= 2) && (w.comp[id] || 0) <= now) {
      w.comp[id] = now + COMPLIMENT_COOLDOWN_MS;
      const cp = compliment(w);
      if (cp) {
        dlg.compliment = cp.text;
        if (cp.rel) addRel(p, id, cp.rel);
        if (cp.social) p.social = Math.min(100, p.social + cp.social);
        dlg.rel = Math.round(relOf(p.net, id));
        dlg.relLabel = relLabel(relOf(p.net, id));
      }
    }
    socket.emit('npcDialog', dlg);
    sendPeople(p);
  });
  socket.on('npcChoose', (req) => {
    if (!req || typeof req.npc !== 'string' || typeof req.topic !== 'string' || !Object.hasOwn(NPCS, req.npc)) return;
    if (p.trip || !p.room) return;
    const npc = NPCS[req.npc];
    if (npc.room !== p.room || !present(req.npc, minuteOfDay())) return notice(p, 'They are not here right now.');
    const t = npc.topics.find((x) => x.id === req.topic);
    if (!t || !topicVisible(p.net, req.npc, t)) return;
    if (t.minRep !== undefined && p.rep < t.minRep) return notice(p, 'They do not trust you enough yet. Mend your reputation first.');
    if (t.quest && p.rep < REP.questStartMin) return notice(p, 'Nobody gives quests to someone with a name like yours.');
    const key = `${req.npc}:${t.id}`;
    if ((p.npcCd[key] || 0) > Date.now()) return notice(p, 'Come back a little later.');
    if (t.cost && p.cash < t.cost) return notice(p, `That costs ₦${t.cost.toLocaleString('en-US')}.`);
    let line = t.say;
    if (t.cost) p.cash -= t.cost;
    if (t.rep) addRep(p, t.rep, 'a kind gesture');
    if (t.swipe) {
      // Petty theft: cartoonish and risky. Caught means a fine and a worse reputation.
      if (Math.random() < REP.swipeChance) {
        const fine = Math.min(p.cash, REP.swipeFine);
        p.cash -= fine;
        addRel(p, req.npc, -15);
        addRep(p, REP.swipeCaught, 'you were caught stealing');
        line = `"THIEF!" She catches your wrist. You pay a ₦${fine.toLocaleString('en-US')} fine and she does not trust you now.`;
      } else {
        p.food = Math.min(100, p.food + 20);
        addRep(p, REP.swipeClean, 'a sticky-fingered mango');
        line = 'You slip a mango into your bag. Nobody noticed this time. (Food +20)';
      }
    }
    if (t.rel) addRel(p, req.npc, t.rel);
    if (t.stress) p.stress = clampStress(p.stress + t.stress);
    if (t.xp) {
      addXp(p, t.xp.skill, t.xp.n);
      line += ` (+${t.xp.n} ${SKILLS[t.xp.skill].label} XP)`;
      sendSkills(p);
    }
    if (t.flag && !p.net.flags.includes(t.flag)) {
      p.net.flags.push(t.flag);
      notice(p, 'Referral earned! Check the Jobs board at the Jobs Center.');
      sendJobs(p);
    }
    if (t.quest) {
      p.net.quests[t.quest] = { step: 0, prog: 0, ready: false, done: false };
      notice(p, `New quest: ${QUESTS[t.quest].title}.`);
    }
    if (t.claim) {
      const q = p.net.quests[t.claim];
      const rw = QUESTS[t.claim].reward;
      q.done = true;
      addRep(p, REP.quest, 'you finished a quest');
      p.cash += rw.cash;
      for (const [npcId, n] of Object.entries(rw.rel)) addRel(p, npcId, n);
      line += ` (+₦${rw.cash.toLocaleString('en-US')})`;
      notice(p, `Quest complete: ${QUESTS[t.claim].title}. +₦${rw.cash.toLocaleString('en-US')}.`);
    }
    if (t.once) p.net.seen[key] = true;
    if (t.cooldown) p.npcCd[key] = Date.now() + NPC_COOLDOWN_MS;
    socket.emit('npcDialog', dialogFor(p, req.npc, line));
    sendPeople(p);
  });

  // Request: pay a bill. The server checks the timing, the cash, and the price. The price is never sent by the browser.
  socket.on('payBill', (id) => {
    if (!has(BILLS, id)) return;
    if (!allow(p.payTimes, 6, 5000)) return notice(p, 'Slow down a little.');
    const qt = quote(p.bills, id);
    const wasOnTime = qt.status !== 'overdue';
    if (!qt.canPay) return notice(p, `${BILLS[id].label} is not due yet. You can pay it when it is 3 days away.`);
    if (p.cash < qt.total) return notice(p, `Not enough cash. ${BILLS[id].label} costs ₦${qt.total.toLocaleString('en-US')}.`);
    p.cash -= qt.total;
    applyPayment(p.bills, id);
    p.billState[id] = billStatus(p.bills[id]);
    notice(p, `${BILLS[id].ok} (−₦${qt.total.toLocaleString('en-US')})`);
    // Paying on time also builds your credit score (at most once every 5 minutes).
    if (wasOnTime && Date.now() - (p.crCd.bill || 0) > 5 * 60 * 1000) {
      p.crCd.bill = Date.now();
      addScore(p.bank, CREDIT.billOnTime);
    }
    if (wasOnTime && Date.now() - (p.repCd.bill || 0) > REP.billCooldownMs) {
      p.repCd.bill = Date.now();
      addRep(p, REP.onTimeBill, 'you paid on time');
    }
    sendBills(p);
  });

  // Requests from the story screens: pick a choice, or press Continue.
  // The story engine checks that the request matches what is on the player's screen.
  socket.on('storyChoose', (req) => {
    if (!req || typeof req.id !== 'string') return;
    if (story.choose(p, req.id, req.idx)) sendStory(p);
  });
  socket.on('storyAck', (id) => {
    if (typeof id !== 'string') return;
    if (story.ack(p, id)) sendStory(p);
  });

  // Request: travel to another room. The server checks everything.
  socket.on('travel', (req) => {
    if (!req || !has(ROOMS, req.to) || ROOMS[req.to].hidden || !has(travelOf(p), req.method)) return;
    if (p.trip) return notice(p, 'You are already on the way.');
    if (p.drive) return notice(p, 'Park first.');
    if (jailLeft(p)) return notice(p, `You are being held for ${jailLeft(p)} more seconds.`);
    if (req.to === p.room) return notice(p, 'You are already here.');
    const dest = ROOMS[req.to];
    const mode = travelOf(p)[req.method];
    if (req.to === HOME && consequences(p.bills).locked) return notice(p, 'Your landlord changed the lock. Pay your rent in Bills to get back in.');
    if (req.to === HOME && p.city !== p.homeCity) return notice(p, `Your home is in ${CITIES[p.homeCity].name}. Take a coach or a flight from the Central Terminal.`);
    if (!venueOpen(req.to)) return notice(p, closedText(req.to));
    if (!dest.solo && occupancy(req.to, p.city) >= dest.cap) return notice(p, `${dest.name} is full right now.`);
    if (p.cash < mode.cost) return notice(p, 'Not enough cash for that trip.');
    if (req.method === 'walk' && isVenueDoor(req.to) && doorFor(p, req.to) && (p.room === 'street' || inBuilding(p))) {
      p.cash -= mode.cost;
      startAuto(p, req.to);
      return notice(p, `Walking to ${dest.name}. You can Skip the walk.`);
    }
    if (p.room === 'street' && req.method !== 'walk' && has(RIDE_SPEED, req.method) && isVenueDoor(req.to) && doorFor(p, req.to)) {
      p.cash -= mode.cost;
      startRide(p, req.method, mode, req.to);
      return notice(p, req.method === 'bus' ? `Waiting for the bus to ${dest.name}.` : req.method === 'taxi' ? 'Your taxi is coming.' : `Heading to ${dest.name}.`);
    }
    p.cash -= mode.cost;
    socket.leave(spaceOf(p));
    p.room = null;
    const start = Date.now();
    p.trip = { to: req.to, kind: req.method, start, end: start + mode.seconds * 1000 };
    notice(p, `On the way to ${dest.name}.`);
  });

  // Walk through a door. Out of a building you step onto the street in front of its door. From the street you go in.
  // The server checks where you are standing, so the browser cannot teleport you.
  socket.on('enter', (id) => {
    if (p.trip || p.drive || p.room !== 'street' || typeof id !== 'string' || !isVenueDoor(id)) return;
    if (jailLeft(p)) return;
    if (id === HOME && p.city !== p.homeCity) return notice(p, `Your home is in ${CITIES[p.homeCity].name}.`);
    const d = doorFor(p, id);
    if (!d || Math.hypot(p.x - d.x, p.z - d.z) > DOOR_REACH) return notice(p, 'Walk up to the door first.');
    const dest = ROOMS[id];
    if (id === HOME && consequences(p.bills).locked) return notice(p, 'Your landlord changed the lock. Pay your rent in Bills to get back in.');
    if (!venueOpen(id)) return notice(p, closedText(id));
    if (!dest.solo && occupancy(id, p.city) >= dest.cap) return notice(p, `${dest.name} is full right now.`);
    moveNow(p, id, 0, 8);
  });
  socket.on('goOutside', () => {
    if (p.room === 'biz' && !p.trip) {
      if (Math.hypot(p.x - INSIDE_EXIT.x, p.z - 8.5) > DOOR_REACH) return notice(p, 'Walk up to the door first.');
      const l = ctxOf(p).layout.lots[p.bizLot];
      return moveNow(p, 'street', l ? l.door.x : CITY.spawn.x, l ? l.door.z : CITY.spawn.z);
    }
    if (p.room === 'friendhome' && !p.trip) {
      if (Math.hypot(p.x - INSIDE_EXIT.x, p.z - 8.5) > DOOR_REACH) return notice(p, 'Walk up to the door first.');
      return showOut(p);
    }
    if (p.trip || !p.room || !isVenueDoor(p.room)) return;
    if (jailLeft(p)) return notice(p, `You are being held for ${jailLeft(p)} more seconds.`);
    if (Math.hypot(p.x - INSIDE_EXIT.x, p.z - 8.5) > DOOR_REACH) return notice(p, 'Walk up to the door first.');
    const d = doorFor(p, p.room);
    if (!d) return;
    moveNow(p, 'street', d.x, d.z);
  });

  // Get into your car (or bike) and drive it yourself, or park it.
  socket.on('drive', (req) => {
    if (!req || typeof req !== 'object' || typeof req.on !== 'boolean') return;
    if (p.trip || p.room !== 'street' || jailLeft(p)) return;
    if (!req.on) {
      if (!p.drive) return;
      if (Math.abs(p.drive.v) > 3) return notice(p, 'Slow down before you park.');
      stopDriving(p);
      return notice(p, 'You got out.');
    }
    if (p.drive) return;
    const kind = p.vehicles.includes('car') && req.kind !== 'bike' ? 'car' : p.vehicles.includes('bike') ? 'bike' : null;
    if (!kind) return notice(p, 'You need a car or a bicycle. Buy one at Kanis Motors.');
    const ry = Math.hypot(p.tx - p.x, p.tz - p.z) > 1 ? Math.atan2(p.tx - p.x, p.tz - p.z) : (p.face || 0);
    beginDrive(p, kind, ry);
    notice(p, kind === 'car' ? 'You are in your car. Arrow keys or the stick to drive.' : 'You are on your bicycle.');
  });
  socket.on('driveInput', (inp) => {
    if (!p.drive || !inp || typeof inp !== 'object') return;
    const now = Date.now();
    if (now - p.driveAt < 30) return;
    p.driveAt = now;
    if (!Number.isFinite(inp.steer) || !Number.isFinite(inp.thr)) return;
    p.driveIn = { steer: Math.max(-1, Math.min(1, inp.steer)), thr: Math.max(-1, Math.min(1, inp.thr)) };
  });

  // Knock on a friend's door. They must be your friend, online and at home, and they choose whether to let you in.
  socket.on('visit', (name) => {
    if (typeof name !== 'string' || !NAME_RE.test(name)) return;
    if (p.trip || p.drive || p.room !== 'street' || jailLeft(p)) return;
    const now = Date.now();
    if (now - p.lastKnock < 8000) return notice(p, 'Give them a moment before knocking again.');
    const row = q.friendRows.all(p.userId).find((r) => r.name === name && r.status === 'friend');
    if (!row || !Number.isInteger(row.plot)) return notice(p, 'You can only visit friends.');
    if (parseCity(row.homeCity) !== p.city) return notice(p, `${name} lives in ${CITIES[parseCity(row.homeCity)].name}.`);
    const plot = ctxOf(p).layout.plots[row.plot % ctxOf(p).layout.plots.length];
    if (Math.hypot(p.x - plot.door.x, p.z - plot.door.z) > DOOR_REACH) return notice(p, 'Walk up to their door first.');
    p.lastKnock = now;
    const host = byUser.get(row.id);
    if (!host || host.room !== HOME || host.trip) return notice(p, `${name} is not home.`);
    if (host.muted.has(p.userId) || !isFriend(host.userId, p.userId)) return notice(p, `No answer from ${name}.`);
    if (consequences(host.bills).locked) return notice(p, `No answer from ${name}.`);
    if (visitorsOf(host).length >= MAX_VISITORS) return notice(p, `${name}'s place is full.`);
    if (visitorsOf(host).some((v) => v === p)) return;
    host.knocks.set(p.userId, now + KNOCK_WAIT_MS);
    host.socket.emit('knock', { name: p.name });
    notice(p, `You knocked on ${name}'s door.`);
  });
  socket.on('knockReply', (req) => {
    if (!req || typeof req !== 'object' || typeof req.name !== 'string' || typeof req.ok !== 'boolean') return;
    if (p.room !== HOME || p.trip) return;
    const v = [...players.values()].find((o) => o.name === req.name);
    if (!v || !p.knocks.has(v.userId)) return;
    const until = p.knocks.get(v.userId);
    p.knocks.delete(v.userId);
    if (Date.now() > until) return notice(p, `${req.name} gave up waiting.`);
    if (!req.ok) return notice(v, `${p.name} is not letting anyone in right now.`);
    const plot = plotOf(p);
    if (v.trip || v.room !== 'street' || v.city !== p.homeCity || jailLeft(v) || Math.hypot(v.x - plot.door.x, v.z - plot.door.z) > DOOR_REACH + 1) return notice(p, `${req.name} walked away.`);
    if (visitorsOf(p).length >= MAX_VISITORS) return notice(p, 'Your place is full.');
    enterFriendHome(v, p);
    notice(p, `${v.name} came in.`);
  });

  // The Express train: fast travel between the Central Terminal and the platforms around the city.
  socket.on('train', (to) => {
    if (typeof to !== 'string' || p.trip || p.drive || jailLeft(p)) return;
    const dst = ctxOf(p).layout.stations.find((s) => s.id === to);
    if (!dst) return;
    let from = null;
    if (p.room === 'terminal') from = ctxOf(p).layout.stations.find((s) => s.id === 'terminal');
    else if (p.room === 'street') from = ctxOf(p).layout.stations.find((s) => Math.hypot(p.x - s.x, p.z - s.z) <= DOOR_REACH + 1);
    if (!from) return notice(p, 'Go to a train platform or the Central Terminal first.');
    if (from.id === dst.id && p.room === 'street') return notice(p, 'You are already at that station.');
    if (p.cash < TRAIN_FARE) return notice(p, 'Not enough cash for a ticket.');
    p.cash -= TRAIN_FARE;
    socket.leave(spaceOf(p));
    p.room = null;
    const start = Date.now();
    const secs = Math.max(12, Math.hypot(from.x - dst.x, from.z - dst.z) / 40 + 8); // includes a few seconds at the platform and braking in
    p.trip = { to: 'street', label: dst.name, at: { x: dst.x, z: dst.z }, train: true, kind: 'train', start, end: start + secs * 1000 };
    notice(p, `Express to ${dst.name}. Ticket ₦${TRAIN_FARE}.`);
  });

  // Coach and flights between cities, bought at the Central Terminal.
  socket.on('ticketsOpen', () => sendTickets(p));
  // Move your home to the city you are standing in. Your furniture and outfits come with you.
  socket.on('relocate', () => {
    if (p.trip || p.drive || jailLeft(p)) return;
    if (p.room !== 'terminal' && p.room !== 'airport') return notice(p, 'Arrange a move at the Central Terminal or the Airport of the city you want to live in.');
    if (p.homeCity === p.city) return notice(p, `You already live in ${CITIES[p.city].name}.`);
    if (consequences(p.bills).locked) return notice(p, 'Pay your overdue rent before you move.');
    if (p.cash < MOVE_FEE) return notice(p, `Moving your home costs ₦${MOVE_FEE.toLocaleString('en-US')}.`);
    p.cash -= MOVE_FEE;
    p.homeCity = p.city;
    q.setHomeCity.run(p.homeCity, p.userId);
    p.friendsSig = '';
    p.friendsDirty = true;
    sendFriends(p, true);
    for (const f of players.values()) if (f !== p && isFriend(f.userId, p.userId)) { f.friendsSig = ''; f.friendsDirty = true; sendFriends(f, true); }
    sendTickets(p);
    notice(p, `You now live in ${CITIES[p.city].name}. Your things were moved for ₦${MOVE_FEE.toLocaleString('en-US')}.`);
  });
  socket.on('intercity', (req) => {
    if (!req || typeof req !== 'object' || !has(TICKETS, req.method) || !isCity(req.to)) return;
    if (p.trip || p.drive || jailLeft(p)) return;
    if (p.room !== TICKETS[req.method].venue) return notice(p, req.method === 'flight' ? 'Flights are sold at the Airport.' : 'Coach tickets are sold at the Central Terminal.');
    const t = ticketQuote(req.method, p.city, req.to);
    if (!t) return notice(p, 'You are already in that city.');
    if (p.cash < t.cost) return notice(p, `A ${TICKETS[req.method].label.toLowerCase()} to ${CITIES[req.to].name} costs ₦${t.cost.toLocaleString('en-US')}.`);
    const lay = CITY_CTX[req.to].layout;
    const station = req.method === 'flight' ? { x: lay.doors.airport.x, z: lay.doors.airport.z } : lay.stations.find((st) => st.id === 'terminal');
    p.cash -= t.cost;
    socket.leave(spaceOf(p));
    p.room = null;
    const start = Date.now();
    const label = `${CITIES[req.to].name} (${TICKETS[req.method].label.toLowerCase()})`;
    // A flight lands inside the arrival Airport terminal; a coach drops you at the station on the street.
    if (req.method === 'flight') p.trip = { to: 'airport', city: req.to, kind: req.method, label, at: { x: 0, z: 8 }, start, end: start + t.secs * 1000 };
    else p.trip = { to: 'street', city: req.to, kind: req.method, label, at: { x: station.x, z: station.y !== undefined ? station.y : station.z }, start, end: start + t.secs * 1000 };
    notice(p, `${TICKETS[req.method].label} to ${CITIES[req.to].name}. Ticket ₦${t.cost.toLocaleString('en-US')}.`);
  });

  // Steal from a Market stall. Risky: if you are caught you get a fine, a worse name, and a spell in the cells.
  socket.on('steal', () => {
    if (p.trip) return notice(p, 'Wait until you arrive.');
    if (p.room !== 'market') return notice(p, 'There is nothing to steal here.');
    const now = Date.now();
    if (now - p.lastSteal < STEAL.cooldownMs) return notice(p, 'Not so fast. People are watching you.');
    p.lastSteal = now;
    const r = stealOutcome(stealRand, p.rep);
    if (!r.caught) {
      p.cash += r.loot;
      q.addLedger.run(p.userId, 'theft', 0, r.loot, p.bank.bal, p.cash, 'Stolen cash', Math.floor(world.gameMin), now);
      p.ledgerSig = null;
      return notice(p, `You grabbed ₦${r.loot.toLocaleString('en-NG')} and slipped away.`);
    }
    const f = newFine(p.fines, 'theft', world.gameMin);
    addRep(p, OFFENCES.theft.rep, 'you were caught stealing');
    const fineText = f ? ` Fine: ₦${f.base.toLocaleString('en-NG')}.` : ' (Your record is already full.)';
    lockUp(p, OFFENCES.theft.jailSec, `Caught stealing! Police took you to the station.${fineText}`);
  });
  // At the station counter: pay one fine or all you can.
  socket.on('payFine', (id) => {
    if (p.trip || p.room !== 'police') return notice(p, 'Fines are paid at the Police Station.');
    const gm = world.gameMin;
    let paid = 0;
    if (id === 'all') {
      if (!p.fines.length) return notice(p, 'You have no fines.');
      paid = payOldestFirst(p.fines, p.cash, gm);
      if (!paid) return notice(p, 'Not enough cash for even one fine.');
      notice(p, `Paid ₦${paid.toLocaleString('en-NG')} in fines.`);
    } else if (Number.isInteger(id)) {
      const r = payFine(p.fines, id, p.cash, gm);
      notice(p, r.msg);
      if (!r.ok) return;
      paid = r.paid;
    } else return;
    p.cash -= paid;
    q.addLedger.run(p.userId, 'fine', 0, -paid, p.bank.bal, p.cash, 'Police fine', Math.floor(gm), Date.now());
    p.ledgerSig = null;
    sendFines(p, true);
    save(p);
  });

  socket.on('skipRide', () => {
    if (p.auto) {
      const a = p.auto;
      if (p.shift || p.trip || p.drive || jailLeft(p)) return;
      if (a.stage === 'exit' && inBuilding(p)) exitBuilding(p);
      const door = p.room === 'street' ? doorFor(p, a.to) : null;
      if (!door) return stopAuto(p);
      moveNow(p, 'street', door.x, door.z);
      enterAuto(p, a.to);
      return;
    }
    if (!p.trip || !p.trip.ride) return;
    finishRide(p, 'Arrived at ' + p.trip.label + '.');
  });

  // ----- Minigames -----
  socket.on('gameInvite', (req) => {
    if (!req || typeof req.name !== 'string' || !has(GAME_KINDS, req.kind) || req.name.length > 30) return;
    if (p.trip || p.drive || !p.room) return;
    if (gameOf(p)) return notice(p, 'You are already in a game.');
    const now = Date.now();
    if (now - (p.lastInvite || 0) < 3000) return notice(p, 'Slow down a little.');
    const t = [...players.values()].find((o) => o.name.toLowerCase() === req.name.toLowerCase());
    if (!t || t === p) return notice(p, 'That player is not here.');
    if (spaceOf(t) !== spaceOf(p) || t.trip) return notice(p, 'You can only play with someone in the same place.');
    if (q.isMuted.get(t.userId, p.userId) || q.isMuted.get(p.userId, t.userId)) return notice(p, 'You cannot play with that player.');
    if (gameOf(t)) return notice(p, `${t.name} is already in a game.`);
    p.lastInvite = now;
    if (!t.gameInvites) t.gameInvites = new Map();
    t.gameInvites.set(p.userId, { kind: req.kind, at: now, from: p });
    t.socket.emit('gameInvite', { from: p.name, kind: req.kind });
    notice(p, `Invite sent to ${t.name}: ${GAME_KINDS[req.kind].label}.`);
  });
  socket.on('gameReply', (req) => {
    if (!req || typeof req.name !== 'string' || typeof req.ok !== 'boolean') return;
    const inv = p.gameInvites && [...p.gameInvites.values()].find((x) => x.from.name.toLowerCase() === req.name.toLowerCase());
    if (!inv) return;
    p.gameInvites.delete(inv.from.userId);
    if (Date.now() - inv.at > GAME_INVITE_MS) return notice(p, 'That invite has expired.');
    if (!req.ok) return notice(inv.from, `${p.name} said not now.`);
    const a = inv.from;
    if (!players.has(a.id) || gameOf(a) || gameOf(p)) return notice(p, 'That game is no longer possible.');
    if (spaceOf(a) !== spaceOf(p)) return notice(p, 'You are not in the same place any more.');
    newGameSession(inv.kind, a, p);
  });
  socket.on('gameMove', (req) => {
    const g = gameOf(p);
    if (!g || g.over || !req || typeof req !== 'object') return;
    const who = g.ps.indexOf(p);
    if (g.kind === 'chess') {
      if ((g.st.turn === 'w' ? 0 : 1) !== who) return notice(p, 'Not your turn.');
      const r = chessMove(g.st, { from: req.from, to: req.to, promo: req.promo });
      if (r.error) return notice(p, r.error);
      g.st = r.st; g.last = [r.move.from, r.move.to]; g.status = chessStatus(g.st);
      if (g.status === 'checkmate') return endGame(g, who, 'checkmate');
      if (g.status === 'stalemate' || g.status === 'draw') return endGame(g, -1, g.status);
      return pushGame(g);
    }
    if (g.kind === 'twentyone') {
      const r = twentyOneAct(g.st, who, req.action);
      if (r.error) return notice(p, r.error);
      if (g.st.over) return endGame(g, g.st.winner, g.st.winner === -1 ? 'tie' : 'total');
      return pushGame(g);
    }
    const r = wordGuess(g.st, who, req.guess);
    if (r.error) return notice(p, r.error);
    g.lastGuess = r.ok ? { by: who, word: req.guess.trim().toLowerCase() } : null;
    if (!r.ok) return notice(p, 'Not that one.');
    if (g.st.over) return endGame(g, g.st.winner, 'words');
    pushGame(g);
  });
  socket.on('gameLeave', () => {
    const g = gameOf(p);
    if (!g || g.over) return;
    endGame(g, 1 - g.ps.indexOf(p), 'left');
  });

  socket.on('disconnect', () => {
    if (players.get(socket.id) !== p) return;
    { const g = gameOf(p); if (g && !g.over) endGame(g, 1 - g.ps.indexOf(p), 'left'); } // this player was already replaced by a newer login
    save(p);
    players.delete(socket.id);
    if (byUser.get(user.id) === p) byUser.delete(user.id);
  });
});

// Game loop: finish trips, move players, then broadcast the state.
setInterval(() => {
  const now = Date.now();
  const dt = TICK_MS / 1000;
  // Traffic: cars watch for people, brake, and sometimes (when someone steps out) hit them.
  const ph = phaseAt(now);
  for (const p of players.values()) {
    if (!p.drive) continue;
    if (p.room !== 'street' || p.trip) { stopDriving(p); continue; }
    const cx = ctxOf(p);
    const carBlocked = (x, z) => cx.walls.blocked(x, z) || cx.traffic.blocked(x, z, 0.1) || Math.abs(x) > CITY.bx - 1 || Math.abs(z) > CITY.bz - 1;
    const d = p.drive;
    stepSpeed(d, p.driveIn, dt);
    const hit = moveDrive(d, dt, carBlocked);
    p.x = p.tx = d.x; p.z = p.tz = d.z; p.riding = d.kind; p.ry = d.ry;
    if (hit >= 14) {
      // a serious crash: ambulance, and the police hear about what you did
      stopDriving(p);
      if (p.wanted) settleOffences(p);
      hurtByCar(p, hit);
      continue;
    }
    if (hit > 5 && now - (p.crashNote || 0) > 3000) { p.crashNote = now; notice(p, 'You crashed into something!'); }
    // running people over
    for (const o of players.values()) {
      if (o === p || o.room !== 'street' || o.city !== p.city || o.trip || o.drive) continue;
      if (Math.abs(d.v) > 2.5 && Math.hypot(o.x - d.x, o.z - d.z) < VEH[d.kind].len + 0.6) {
        hurtByCar(o, Math.abs(d.v));
        startChase(p, 'hitrun', 'You hit someone and drove off! The police are after you!');
      }
    }
    // red lights
    const cell = junctionAt(cx.layout, d.x, d.z);
    const key = cell ? `${cell.i},${cell.j}` : null;
    if (key && key !== p.inJunction && Math.abs(d.v) > 2 && stateOf(axisOfHeading(d.ry), ph) === 'red') startChase(p, 'redlight', 'You ran a red light! The police are after you!');
    p.inJunction = key;
    // The highway: drive out of the gate at the end of the boulevard to reach the next city.
    const gate = gateAt(d.x, d.z, CITY.bx);
    if (gate && (gate === 'east' ? Math.sin(d.ry) > 0.3 : Math.sin(d.ry) < -0.3) && !p.wanted) takeHighway(p, gate, now);
  }
  // Shifts: pay out when the time is up, drop them if the player was pulled away (hospital, police, sickness).
  for (const p of players.values()) {
    if (!p.shift) continue;
    if (p.trip || p.room !== p.shift.room || p.sick || p.burnout || jailLeft(p)) cancelShift(p, 'Your shift was interrupted. No pay.');
    else if (now >= p.shift.end) finishShift(p);
  }
  const walkers = {}, drivers = {}, copsOut = {};
  for (const id of CITY_IDS) { walkers[id] = []; drivers[id] = []; copsOut[id] = []; }
  for (const p of players.values()) {
    if (p.room !== 'street' || p.trip) continue;
    if (p.drive) drivers[p.city].push({ x: p.x, z: p.z });
    else walkers[p.city].push({ id: p.id, x: p.x, z: p.z, p });
  }
  // The police.
  for (const p of players.values()) {
    const w = p.wanted;
    if (!w) continue;
    if (p.room !== 'street' || p.trip) { p.wanted = null; continue; } // you slipped into a building
    const me = { x: p.x, z: p.z, speed: p.drive ? Math.abs(p.drive.v) : 0, onFoot: !p.drive };
    const cx = ctxOf(p);
    const res = chaseTick(cx.layout, w, me, TICK_MS, now, (c) => lineOfSight(c, me, cx.walls.blocked), Math.random);
    if (res === 'arrest') { arrestPlayer(p); continue; }
    if (res === 'lost') { p.wanted = null; notice(p, 'You lost the police. Stay out of trouble!'); continue; }
    for (const c of w.cops) copsOut[p.city].push([Math.round(c.x * 10) / 10, Math.round(c.z * 10) / 10, Math.round(c.ry * 100) / 100]);
  }
  // Each city has its own traffic, and it only runs while someone is on that city's street.
  for (const id of CITY_IDS) {
    if (!walkers[id].length && !drivers[id].length) continue;
    for (const h of CITY_CTX[id].traffic.step(dt, walkers[id], ph, drivers[id])) {
      const w = walkers[id].find((x) => x.id === h.id);
      if (w) hurtByCar(w.p, h.speed);
    }
  }
  for (const p of players.values()) {
    if (p.trip) {
      if (p.trip.ride) stepRide(p, now);
      else if (now >= p.trip.end) arrive(p);
      continue;
    }
    // Where to head: the next point on the path from a tap, or the target itself (a held joystick or key).
    let gx = p.tx, gz = p.tz;
    if (p.path && p.pathKey === `${p.tx},${p.tz}` && p.path.length) {
      while (p.path.length > 1 && Math.hypot(p.path[0].x - p.x, p.path[0].z - p.z) < 0.35) p.path.shift();
      gx = p.path[0].x; gz = p.path[0].z;
    } else p.path = null;
    const dx = gx - p.x;
    const dz = gz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) {
      if (d > 0.3) p.face = Math.atan2(dx, dz); // remembered so a car starts pointing the way you were walking
      const street = p.room === 'street';
      const speed = speedFor(street, p.run) * (p.energy < 20 ? 0.6 : 1); // very tired players walk slower
      const step = Math.min(d, speed * dt);
      if (street) {
        const cx = ctxOf(p);
        // Buildings, trees, lamp posts and bus stops are solid: slide along them instead of walking through.
        const m = slide((x, z) => cx.walls.blocked(x, z), p.x, p.z, (dx / d) * step, (dz / d) * step);
        // Cars are solid too: you cannot walk into one (unless you are already inside it, so you can get out).
        if (!cx.traffic.blocked(m.x, m.z) || cx.traffic.blocked(p.x, p.z)) { p.x = m.x; p.z = m.z; }
      } else if (roomSolids(p.room).length) {
        const m = slide(roomBlockedFn(p.room), p.x, p.z, (dx / d) * step, (dz / d) * step);
        p.x = m.x; p.z = m.z;
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
      }
    }
  }
  for (const cityId of CITY_IDS) {
    for (const id of Object.keys(ROOMS)) {
      if (ROOMS[id].solo || id === 'biz') continue;
      const key = spaceKey(id, 0, cityId);
      if (!io.sockets.adapter.rooms.has(key)) continue; // nobody there
      io.to(key).emit('state', id === 'street' ? { room: id, players: snapshot(key), cars: CITY_CTX[cityId].traffic.view(), cops: copsOut[cityId], ph: Math.round(ph * 10) / 10, lvl: Math.round(trafficLevel(minuteOfDay()) * 100) / 100 } : { room: id, players: snapshot(key) });
    }
  }
  { // inside player businesses: one space per business
    const seen = new Set();
    for (const p of players.values()) if (p.room === 'biz' && !seen.has(spaceOf(p))) { seen.add(spaceOf(p)); io.to(spaceOf(p)).emit('state', { room: 'biz', players: snapshot(spaceOf(p)) }); }
  }
  const mod = minuteOfDay();
  const publicRoomsBy = {};
  for (const cityId of CITY_IDS) {
    publicRoomsBy[cityId] = Object.keys(ROOMS).filter((id) => !ROOMS[id].solo && id !== 'biz').map((id) => {
      const open = venueOpen(id);
      return {
        id, name: ROOMS[id].name, count: occupancy(id, cityId), cap: ROOMS[id].cap,
        open, hours: hoursText(ROOMS[id].hours),
        closesIn: open && ROOMS[id].hours ? Math.round(minutesUntilClose(ROOMS[id].hours, mod)) : null,
      };
    });
  }
  // Private data goes only to its owner.
  for (const p of players.values()) {
    if (p.room && ROOMS[p.room].solo) p.socket.emit('state', { room: p.room, players: snapshot(spaceOf(p)) });
    const locked = consequences(p.bills).locked;
    const rooms = [...publicRoomsBy[p.city], { id: HOME, name: ROOMS[HOME].name, solo: true, open: !locked, locked, hours: locked ? 'Rent overdue' : 'Your place' }];
    p.socket.emit('me', {
      needs: needsOf(p),
      city: { id: p.city, name: CITIES[p.city].name },
      homeCity: { id: p.homeCity, name: CITIES[p.homeCity].name },
      handset: { id: p.handsets.active, label: PHONES[p.handsets.active].label, camera: hasCamera(p.handsets) },
      job: jobSummary(p, 'main', now),
      job2: jobSummary(p, 'part', now),
      shift: p.shift ? { slot: p.shift.slot, left: Math.max(0, Math.ceil((p.shift.end - now) / 1000)), total: Math.max(1, Math.round((p.shift.end - p.shift.start) / 1000)) } : null,
      mood: mood(p),
      wellness: wellnessOf(p),
      rep: { score: Math.round(p.rep), tier: repTier(p.rep).label },
      cash: p.cash,
      online: players.size,
      room: p.room,
      jail: jailLeft(p),
      owns: p.vehicles,
      drive: p.drive ? { kind: p.drive.kind, kmh: Math.round(Math.abs(p.drive.v) * 3.6) } : null,
      wanted: p.wanted ? { cops: p.wanted.cops.length, secs: Math.round((now - p.wanted.since) / 1000) } : null,
      rooms,
      walk: p.auto ? { to: ROOMS[p.auto.to].name, toId: p.auto.to, stage: p.auto.stage, progress: p.auto.d0 ? Math.max(0, Math.min(1, 1 - Math.hypot(p.x - (doorFor(p, p.auto.to) || p).x, p.z - (doorFor(p, p.auto.to) || p).z) / p.auto.d0)) : 0 } : null,
      trip: p.trip
        ? {
            to: p.trip.label || ROOMS[p.trip.to].name,
            ambulance: !!p.trip.ambulance, train: !!p.trip.train, kind: p.trip.kind || null,
            progress: Math.min(1, (now - p.trip.start) / (p.trip.end - p.trip.start)),
            secs: Math.round((p.trip.end - p.trip.start) / 1000),
            ride: p.trip.ride ? { k: p.trip.ride.k, phase: now < p.trip.ride.waitEnd ? 'wait' : 'ride', waitLeft: Math.max(0, Math.ceil((p.trip.ride.waitEnd - now) / 1000)) } : null,
          }
        : null,
    });
  }
}, TICK_MS);

// Story: check what should happen next for each player.
setInterval(() => {
  for (const p of players.values()) {
    if (p.trip) continue;
    if (story.tick(p)) sendStory(p);
  }
}, STORY_TICK_MS);

// Needs slowly drop over time while a player is online.
setInterval(() => {
  for (const p of players.values()) {
    for (const n of NEEDS) p[n] = Math.max(0, p[n] - (DECAY_PER_MIN[n] * NEEDS_SPEED * NEEDS_TICK_MS) / 60000);
  }
  healthTick();
}, NEEDS_TICK_MS);

// Stress, burnout, and illness. Runs with the needs tick, so it follows the same pace (NEEDS_SPEED).
function healthTick() {
  const dtMin = (NEEDS_TICK_MS * NEEDS_SPEED) / 60000; // "minutes" of wellness time in one tick
  for (const p of players.values()) {
    if (p.sick) {
      p.energy = Math.max(0, p.energy - DECAY_PER_MIN.energy * dtMin); // a cold doubles how fast you tire
      p.sickMin += dtMin;
      if (p.sickMin >= SICK.autoRecoverMin) {
        p.sick = false;
        p.sickMin = 0;
        notice(p, 'Your cold has passed.');
      }
    } else if (Math.random() < sickChance(p.clean, p.food, dtMin, SICK_RISK)) {
      p.sick = true;
      p.sickMin = 0;
      notice(p, 'You caught a cold! Rest, or buy medicine at the Pharmacy. You cannot work or study while sick.');
    }
    const overdue = BILL_IDS.filter((id) => p.billState[id] === 'overdue').length;
    const label = mood(p).label;
    const delta = overdue * STRESS.overduePerMin * dtMin
      + (label === 'Down' ? STRESS.lowMoodPerMin * dtMin : 0)
      + (label === 'Happy' ? STRESS.calmPerMin * dtMin : 0)
      + (label === 'Okay' ? STRESS.okayPerMin * dtMin : 0);
    // Plants make a home calmer (only with the power on, and only while you are there).
    const homeCalm = p.room === HOME && !consequences(p.bills).noPower ? effectsOf(p.home).calm * dtMin : 0;
    p.stress = clampStress(p.stress + delta - homeCalm);
    if (p.rep < 0) p.rep = Math.min(0, p.rep + REP.recoverPerMin * dtMin);
    if (!p.burnout && burnoutNext(p.stress, false)) {
      p.burnout = true;
      notice(p, 'You are burned out! Rest, relax, and sleep. You cannot work or study until you recover.');
    } else if (p.burnout && !burnoutNext(p.stress, true)) {
      p.burnout = false;
      notice(p, 'You feel recovered from burnout.');
    }
  }
}

// The world: advance the clock, count down bills, close venues, and run city events. Once a second.
setInterval(() => {
  const now = Date.now();
  const realMs = Math.min(now - world.lastTick, 5000); // a long pause (laptop asleep) never jumps the world ahead
  world.lastTick = now;
  const dtMin = gameMinutesFor(realMs, CLOCK_SPEED);
  world.gameMin += dtMin;

  // City events.
  if (world.event && now >= world.event.endsAt) endEvent();
  else if (!world.event && now >= world.nextEventAt && players.size > 0) startEvent(pickEvent(Math.random, world.lastEventId));

  const mod = minuteOfDay();
  for (const id of CITY_IDS) CITY_CTX[id].traffic.setLevel(process.env.TRAFFIC_EMPTY === '1' ? 0 : trafficLevel(mod));
  for (const p of players.values()) {
    // Bills only count down while you are online.
    tickBills(p.bills, dtMin);
    for (const id of BILL_IDS) {
      const st = billStatus(p.bills[id]);
      if (st !== p.billState[id]) {
        p.billState[id] = st;
        if (st === 'due') notice(p, BILLS[id].due);
        if (st === 'overdue') {
          notice(p, BILLS[id].bad);
          addScore(p.bank, CREDIT.billOverdue); // an unpaid bill dents your credit score
        }
      }
    }
    // The bank: interest, loan due dates, direct debit, late fees, default.
    if (p.bank.open) {
      const bt = tickBank(p.bank, dtMin, p.cash);
      const lines = [];
      p.cash += bt.cash;
      for (const ev of bt.events) {
        if (ev.msg) notice(p, ev.msg);
        lines.push(...ev.entries);
        if (ev.defaulted) addRep(p, -5, 'you defaulted on a loan');
      }
      bankCommit(p, lines);
    }
    sendBank(p);
    sendHome(p);
    // Perfume fades with time spent online.
    if (tickScent(p.wardrobe, realMs / 60000)) notice(p, 'Your perfume has worn off.');
    sendWardrobe(p);
    sendFriends(p);
    sendFines(p);
    // A visitor is shown out when their host leaves home (or logs off).
    if (p.room === 'friendhome') {
      const host = byUser.get(p.visiting);
      if (!host || host.room !== HOME || host.trip) showOut(p, 'Your host left, so you were shown out.');
    }
    for (const [id, until] of p.knocks) if (now > until) p.knocks.delete(id);
    // Police patrols pick up people with big overdue fines who walk the streets.
    if (!p.trip && p.room === 'street' && wantedByPolice(p.fines, world.gameMin) && now - p.lastPatrol >= PATROL_MS) {
      p.lastPatrol = now;
      const chance = process.env.ARREST_CHANCE !== undefined ? Number(process.env.ARREST_CHANCE) : PATROL_CHANCE;
      if (Math.random() < chance) {
        const paid = payOldestFirst(p.fines, p.cash, world.gameMin);
        if (paid) {
          p.cash -= paid;
          q.addLedger.run(p.userId, 'fine', 0, -paid, p.bank.bal, p.cash, 'Police fine (arrest)', Math.floor(world.gameMin), now);
          p.ledgerSig = null;
        }
        lockUp(p, ARREST_JAIL_SEC, `The police stopped you about your unpaid fines.${paid ? ` They took ₦${paid.toLocaleString('en-NG')} from you.` : ''} You are being held.`);
      }
    }
    const cons = consequences(p.bills);
    if (!p.trip && p.room === HOME && cons.locked) {
      moveNow(p, START_ROOM);
      notice(p, BILLS.rent.bad);
    }
    // A game ends if you walk off, travel, or the other player is gone.
    { const g = gameOf(p); if (g && !g.over && (p.trip || p.drive || spaceOf(p) !== g.space)) endGame(g, 1 - g.ps.indexOf(p), 'left'); }
    // Venues close. Warn first, then walk everyone out to the Plaza.
    if (!p.trip && p.room && ROOMS[p.room].hours && !IGNORE_HOURS) {
      if (!venueOpen(p.room)) {
        const name = ROOMS[p.room].name;
        const d = isVenueDoor(p.room) ? doorFor(p, p.room) : null;
        if (!d) {
          moveNow(p, START_ROOM);
          notice(p, `${name} just closed. You are back at the Plaza.`);
        } else {
          // closing time: you are walked to the door, and out onto the street
          if (p.closeRoom !== p.room) { p.closeRoom = p.room; p.closeAt = Date.now(); notice(p, `${name} is closed. Please head out.`); p.socket && p.socket.emit('closing'); }
          p.sit = false;
          p.tx = INSIDE_EXIT.x; p.tz = 8.5; p.path = null; p.run = false;
          if (Math.hypot(p.x - INSIDE_EXIT.x, p.z - 8.5) <= DOOR_REACH - 0.6 || Date.now() - p.closeAt > CLOSE_GRACE_MS) {
            p.closeRoom = null;
            moveNow(p, 'street', d.x, d.z);
          }
        }
      } else if (!p.warnedClose && minutesUntilClose(ROOMS[p.room].hours, mod) * msPerGameMin() <= WARN_BEFORE_CLOSE_MS) {
        p.warnedClose = true;
        notice(p, `${ROOMS[p.room].name} closes soon.`);
      }
    }
    sendBills(p);
    sendSkills(p);
    sendPeople(p);
    if (p.room === 'jobs') sendJobs(p);
    if (p.room === 'garage') sendVehicles(p);
  }
  io.emit('clock', clockInfo());
}, CLOCK_TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`Game server running on http://localhost:${PORT}`);
});
