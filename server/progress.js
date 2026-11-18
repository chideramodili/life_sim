// Adulthood: player levels, daily and weekly missions, and achievements. Rules only (no network, no database), like bank.js and home.js.
// The state lives inside the player's bank JSON (bank.prog), so it is saved with everything else and needs no new database column.
// Money moved through the account raises the bank's limits (see bank.js); the level raises them a little more.

// ---------- Levels ----------
export const MAX_LEVEL = 100;
export const FLOW_XP = 5000;                                   // earned naira per XP
export const xpAt = (lvl) => Math.round(120 * Math.pow(Math.max(0, lvl - 1), 1.7));   // total XP needed to reach a level
export function levelOf(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpAt(l + 1)) l++;
  return l;
}
export const TITLES = [
  [1, 'New Resident'], [6, 'Settled Resident'], [11, 'Established Citizen'],
  [21, 'Successful Citizen'], [31, 'City Celebrity'], [41, 'Elite Resident'], [61, 'City Legend'],
];
export const titleOf = (lvl) => { let t = TITLES[0][1]; for (const [from, name] of TITLES) if (lvl >= from) t = name; return t; };
export const levelReward = (lvl) => 1000 * lvl;                // cash for reaching a level

// ---------- What each level unlocks (the server checks these when you buy) ----------
export const UNLOCKS = [
  [5, 'New clothing collection'], [10, 'Classic and Premium vehicles'], [15, 'Exclusive properties'],
  [20, 'Special character accessories'], [30, 'Luxury and supercar vehicles'],
];
export const needClothes = (c) => (c.slot === 'acc' ? (c.tier >= 2 ? 20 : 1) : (c.tier >= 2 ? 5 : 1));
export const needVehicle = (tier) => ({ Everyday: 1, Classic: 10, Premium: 10, Luxury: 30, Supercar: 30 })[tier] || 1;
export const NEED_EXCLUSIVE_LOT = 15;

// ---------- Time keys (Lagos time, UTC+1) ----------
const LAGOS = 3600 * 1000;
export const dayKey = (now) => new Date(now + LAGOS).toISOString().slice(0, 10);
export function weekKey(now) {   // the Monday that starts this week
  const d = new Date(now + LAGOS);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
}
export const msToTomorrow = (now) => 86400000 - ((now + LAGOS) % 86400000);

// ---------- Missions ----------
// ev: the kind of thing that counts. "place" counts different places only.
export const MISSIONS = [
  { id: 'd_shift', scope: 'd', text: 'Complete 2 work shifts', ev: 'shift', goal: 2, cash: 3000, xp: 30 },
  { id: 'd_earn', scope: 'd', text: 'Earn ₦15,000', ev: 'earn', goal: 15000, cash: 2500, xp: 25 },
  { id: 'd_places', scope: 'd', text: 'Visit 3 different places', ev: 'place', goal: 3, cash: 1500, xp: 20 },
  { id: 'd_buy', scope: 'd', text: 'Buy something at the Boutique', ev: 'buy', goal: 1, cash: 2000, xp: 20 },
  { id: 'd_chat', scope: 'd', text: 'Message your friends 3 times', ev: 'chat', goal: 3, cash: 1000, xp: 15 },
  { id: 'd_knock', scope: 'd', text: 'Knock on a friend\'s door', ev: 'knock', goal: 1, cash: 2000, xp: 25 },
  { id: 'd_save', scope: 'd', text: 'Save ₦5,000 at the bank', ev: 'save', goal: 5000, cash: 1500, xp: 20 },
  { id: 'd_care', scope: 'd', text: 'Look after yourself 3 times (eat, wash, rest)', ev: 'act', goal: 3, cash: 1000, xp: 15 },
  { id: 'd_trip', scope: 'd', text: 'Take a trip across town', ev: 'trip', goal: 1, cash: 1500, xp: 15 },
  { id: 'd_drive', scope: 'd', text: 'Drive for 10 minutes', ev: 'drive', goal: 10, cash: 3000, xp: 30 },
  { id: 'd_manage', scope: 'd', text: 'Do 2 management tasks in your business', ev: 'manage', goal: 2, cash: 5000, xp: 30 },
  { id: 'd_taxi', scope: 'd', text: 'Complete 2 taxi fares', ev: 'fare', goal: 2, cash: 5000, xp: 30 },
  { id: 'd_deliver', scope: 'd', text: 'Complete a delivery', ev: 'delivery', goal: 1, cash: 4000, xp: 30 },
  { id: 'd_talk', scope: 'd', text: 'Chat with 2 different friends', ev: 'talk', goal: 2, cash: 2500, xp: 25 },
  { id: 'w_shift', scope: 'w', text: 'Complete 10 work shifts this week', ev: 'shift', goal: 10, cash: 15000, xp: 150 },
  { id: 'w_earn', scope: 'w', text: 'Earn ₦150,000 this week', ev: 'earn', goal: 150000, cash: 20000, xp: 200 },
  { id: 'w_places', scope: 'w', text: 'Visit 10 different places this week', ev: 'place', goal: 10, cash: 8000, xp: 100 },
  { id: 'w_chat', scope: 'w', text: 'Send 20 messages to friends', ev: 'chat', goal: 20, cash: 5000, xp: 80 },
  { id: 'w_buy', scope: 'w', text: 'Make 3 purchases at the Boutique', ev: 'buy', goal: 3, cash: 10000, xp: 100 },
  { id: 'w_save', scope: 'w', text: 'Save ₦50,000 at the bank', ev: 'save', goal: 50000, cash: 8000, xp: 100 },
  { id: 'w_act', scope: 'w', text: 'Look after yourself 15 times', ev: 'act', goal: 15, cash: 6000, xp: 80 },
  { id: 'w_drive', scope: 'w', text: 'Road Warrior: drive for 60 minutes', ev: 'drive', goal: 60, cash: 20000, xp: 150 },
  { id: 'w_friends', scope: 'w', text: 'Social Champion: make 3 new friends', ev: 'friend', goal: 3, cash: 15000, xp: 150 },
  { id: 'w_party', scope: 'w', text: 'Party time: join or host 2 parties', ev: 'party', goal: 2, cash: 20000, xp: 150 },
  { id: 'w_manage', scope: 'w', text: 'Hands-on owner: do 12 management tasks', ev: 'manage', goal: 12, cash: 30000, xp: 200 },
  { id: 'w_taxi', scope: 'w', text: 'Taxi hustle: complete 10 fares', ev: 'fare', goal: 10, cash: 30000, xp: 220 },
  { id: 'w_deliver', scope: 'w', text: 'Entrepreneur: complete 8 deliveries', ev: 'delivery', goal: 8, cash: 25000, xp: 200 },
  { id: 'w_talk', scope: 'w', text: 'Chat with 5 different friends', ev: 'talk', goal: 5, cash: 10000, xp: 100 },
];
const MISSION = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
const DAILY_N = 3, WEEKLY_N = 5;
const DISTINCT = new Set(['place', 'talk']);   // these count different places / different people
export const WEEK_BONUS = { cash: 50000, xp: 300, tok: 5 };   // for finishing all five weekly challenges
const TOK = { d: 1, w: 3 };                    // special tokens per mission

// A small stable shuffle so everybody gets their own set, which stays the same all day (all week).
function pick(ids, n, seed) {
  const a = [...ids];
  let s = (seed >>> 0) || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------- Achievements ----------
// val(prog, ctx) is how far along you are; ctx = { cash, bal, vehicles, friends, lots }
export const ACHIEVEMENTS = [
  { id: 'a_shift1', name: 'First Shift', text: 'Finish your first work shift.', goal: 1, val: (P) => P.st.shifts || 0, cash: 2000, xp: 20 },
  { id: 'a_shift50', name: 'Hard Worker', text: 'Finish 50 work shifts.', goal: 50, val: (P) => P.st.shifts || 0, cash: 25000, xp: 150 },
  { id: 'a_shift200', name: 'Workaholic', text: 'Finish 200 work shifts.', goal: 200, val: (P) => P.st.shifts || 0, cash: 100000, xp: 500 },
  { id: 'a_earn500k', name: 'Big Earner', text: 'Earn ₦500,000 in total.', goal: 500000, val: (P) => P.st.earned || 0, cash: 20000, xp: 150 },
  { id: 'a_earn10m', name: 'Money Machine', text: 'Earn ₦10,000,000 in total.', goal: 10000000, val: (P) => P.st.earned || 0, cash: 300000, xp: 600 },
  { id: 'a_mil', name: 'First Million', text: 'Hold ₦1,000,000 (wallet plus bank).', goal: 1000000, val: (P, c) => c.cash + c.bal, cash: 25000, xp: 200 },
  { id: 'a_mil10', name: 'Ten Million Club', text: 'Hold ₦10,000,000 (wallet plus bank).', goal: 10000000, val: (P, c) => c.cash + c.bal, cash: 250000, xp: 500 },
  { id: 'a_mil100', name: 'Hundred Million', text: 'Hold ₦100,000,000 (wallet plus bank).', goal: 100000000, val: (P, c) => c.cash + c.bal, cash: 2000000, xp: 1500 },
  { id: 'a_saver', name: 'Saver', text: 'Put ₦1,000,000 into the bank in total.', goal: 1000000, val: (P) => P.st.saved || 0, cash: 30000, xp: 200 },
  { id: 'a_explorer', name: 'Explorer', text: 'Visit 10 different places.', goal: 10, val: (P) => P.pl.length, cash: 10000, xp: 100 },
  { id: 'a_social', name: 'Chatterbox', text: 'Send 100 messages to friends.', goal: 100, val: (P) => P.st.chat || 0, cash: 10000, xp: 100 },
  { id: 'a_friends', name: 'Social Butterfly', text: 'Have 10 friends.', goal: 10, val: (P, c) => c.friends, cash: 20000, xp: 150 },
  { id: 'a_giver', name: 'Generous', text: 'Send ₦100,000 to friends in total.', goal: 100000, val: (P) => P.st.sent || 0, cash: 10000, xp: 100 },
  { id: 'a_fashion', name: 'Fashion Icon', text: 'Make 25 purchases at the Boutique.', goal: 25, val: (P) => P.st.buys || 0, cash: 50000, xp: 250 },
  { id: 'a_wheels', name: 'Car Collector', text: 'Own 3 vehicles.', goal: 3, val: (P, c) => c.vehicles, cash: 50000, xp: 200 },
  { id: 'a_mogul', name: 'Property Mogul', text: 'Own 3 lots of land.', goal: 3, val: (P, c) => c.lots, cash: 100000, xp: 300 },
  { id: 'a_fare1', name: 'First Fare', text: 'Complete your first taxi fare.', goal: 1, val: (P) => P.st.fares || 0, cash: 3000, xp: 30 },
  { id: 'a_fare50', name: 'Taxi Pro', text: 'Complete 50 taxi fares.', goal: 50, val: (P) => P.st.fares || 0, cash: 80000, xp: 300 },
  { id: 'a_fare200', name: 'City Legend', text: 'Complete 200 taxi fares.', goal: 200, val: (P) => P.st.fares || 0, cash: 300000, xp: 800 },
  { id: 'a_party5', name: 'Party Animal', text: 'Join or host 5 parties.', goal: 5, val: (P) => P.st.party || 0, cash: 30000, xp: 150 },
  { id: 'a_host3', name: 'Event Host', text: 'Host 3 parties.', goal: 3, val: (P) => P.st.host || 0, cash: 40000, xp: 200 },
  { id: 'a_upg1', name: 'Gearhead', text: 'Fit your first vehicle upgrade.', goal: 1, val: (P) => P.st.upg || 0, cash: 5000, xp: 40 },
  { id: 'a_upg12', name: 'Master Tuner', text: 'Fit 12 vehicle upgrades.', goal: 12, val: (P) => P.st.upg || 0, cash: 100000, xp: 400 },
  { id: 'a_race1', name: 'On the Grid', text: 'Finish or enter your first race.', goal: 1, val: (P) => P.st.races || 0, cash: 5000, xp: 40 },
  { id: 'a_podium5', name: 'Podium Regular', text: 'Finish in the top three of 5 races.', goal: 5, val: (P) => P.st.podiums || 0, cash: 60000, xp: 300 },
  { id: 'a_racewin5', name: 'Champion', text: 'Win 5 races.', goal: 5, val: (P) => P.st.raceWins || 0, cash: 120000, xp: 600 },
  { id: 'a_love1', name: 'Hopeless Romantic', text: 'Start dating another player.', goal: 1, val: (P) => P.st.loves || 0, cash: 5000, xp: 40 },
  { id: 'a_date10', name: 'Date Night Regular', text: 'Go on 10 date nights.', goal: 10, val: (P) => P.st.dates || 0, cash: 40000, xp: 200 },
  { id: 'a_wed1', name: 'Just Married', text: 'Get married.', goal: 1, val: (P) => P.st.wed || 0, cash: 100000, xp: 500 },
  { id: 'a_mgr1', name: 'Hands-on Owner', text: 'Do your first management task.', goal: 1, val: (P) => P.st.mgmt || 0, cash: 3000, xp: 30 },
  { id: 'a_mgr50', name: 'Business Mogul', text: 'Do 50 management tasks.', goal: 50, val: (P) => P.st.mgmt || 0, cash: 90000, xp: 300 },
  { id: 'a_chest1', name: 'Treasure Hunter', text: 'Open your first treasure chest.', goal: 1, val: (P) => P.st.chests || 0, cash: 5000, xp: 40 },
  { id: 'a_chest25', name: 'Chest Collector', text: 'Open 25 treasure chests.', goal: 25, val: (P) => P.st.chests || 0, cash: 100000, xp: 400 },
  { id: 'a_rally1', name: 'Rally Finisher', text: 'Finish a Driving Rally.', goal: 1, val: (P) => P.st.rallies || 0, cash: 5000, xp: 40 },
  { id: 'a_deliv1', name: 'On the Road', text: 'Complete your first delivery.', goal: 1, val: (P) => P.st.deliv || 0, cash: 3000, xp: 30 },
  { id: 'a_deliv25', name: 'Reliable Courier', text: 'Complete 25 deliveries.', goal: 25, val: (P) => P.st.deliv || 0, cash: 40000, xp: 200 },
  { id: 'a_deliv100', name: 'Professional Driver', text: 'Complete 100 successful deliveries.', goal: 100, val: (P) => P.st.deliv || 0, cash: 200000, xp: 600 },
  { id: 'a_lv10', name: 'Settled In', text: 'Reach level 10.', goal: 10, val: (P) => levelOf(P.xp), cash: 30000, xp: 0 },
  { id: 'a_lv25', name: 'Successful Citizen', text: 'Reach level 25.', goal: 25, val: (P) => levelOf(P.xp), cash: 150000, xp: 0 },
  { id: 'a_lv50', name: 'Elite Resident', text: 'Reach level 50.', goal: 50, val: (P) => levelOf(P.xp), cash: 1000000, xp: 0 },
];

// ---------- State ----------
const STATS = ['shifts', 'earned', 'spent', 'buys', 'sent', 'chat', 'knocks', 'acts', 'trips', 'saved', 'deliv', 'delM', 'fares', 'taxiM', 'rateSum', 'rateN', 'chests', 'rallies', 'mgmt', 'loves', 'dates', 'wed', 'party', 'host', 'upg', 'races', 'raceWins', 'podiums', 'raceWon'];
export const defaultProg = () => ({ xp: 0, tok: 0, wins: 0, lv: 1, st: Object.fromEntries(STATS.map((k) => [k, 0])), pl: [], bd: [], ach: {}, dk: '', d: null, wk: '', w: null });
const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
function parseSet(raw, scope) {
  if (!raw || typeof raw !== 'object') return null;
  const ids = Array.isArray(raw.ids) ? raw.ids.filter((id) => MISSION[id] && MISSION[id].scope === scope).slice(0, 6) : [];
  const pr = {}, done = {}, got = {};
  for (const id of ids) { pr[id] = num(raw.pr && raw.pr[id], 0, 1e12, 0); if (raw.done && raw.done[id]) done[id] = 1; if (raw.got && raw.got[id]) got[id] = 1; }
  const keys = { place: [], talk: [] };
  for (const k of Object.keys(keys)) if (raw.keys && Array.isArray(raw.keys[k])) keys[k] = raw.keys[k].filter((x) => typeof x === 'string').slice(0, 40);
  return { ids, pr, done, got, keys, bonus: raw.bonus ? 1 : 0 };
}
export function parseProg(raw) {
  const d = defaultProg();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  d.xp = num(raw.xp, 0, 1e12, 0);
  d.tok = Math.floor(num(raw.tok, 0, 1e9, 0));
  d.wins = Math.floor(num(raw.wins, 0, 1e6, 0));
  d.lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(num(raw.lv, 1, MAX_LEVEL, 1))));
  for (const k of STATS) d.st[k] = num(raw.st && raw.st[k], 0, 1e13, 0);
  d.pl = Array.isArray(raw.pl) ? raw.pl.filter((x) => typeof x === 'string').slice(0, 80) : [];
  for (const a of ACHIEVEMENTS) if (raw.ach && raw.ach[a.id]) d.ach[a.id] = raw.ach[a.id] === 2 ? 2 : 1;   // 1 unlocked, 2 reward claimed
  d.bd = Array.isArray(raw.bd) ? raw.bd.filter((x) => typeof x === 'string').slice(0, 20) : [];
  d.dk = typeof raw.dk === 'string' ? raw.dk.slice(0, 10) : '';
  d.wk = typeof raw.wk === 'string' ? raw.wk.slice(0, 10) : '';
  d.d = parseSet(raw.d, 'd');
  d.w = parseSet(raw.w, 'w');
  return d;
}
export const levelNow = (prog) => levelOf(prog.xp);

const emptySet = (ids) => ({ ids, pr: {}, done: {}, got: {}, keys: { place: [], talk: [] }, bonus: 0 });
// Rewards you did not claim before the reset are paid automatically, so nothing is ever lost.
function settle(set, out, prog, label) {
  if (!set) return;
  let n = 0;
  for (const id of set.ids) if (set.done[id] && !set.got[id]) { set.got[id] = 1; payMission(prog, MISSION[id], out); n++; }
  if (set.ids.length && set.ids.every((id) => set.done[id]) && !set.bonus) { set.bonus = 1; payBonus(prog, out); n++; }
  if (n) out.msgs.push(`Unclaimed ${label} rewards were paid automatically.`);
}
// Start a fresh day / week when the date changes.
function rollover(prog, now, seedName, out) {
  const dk = dayKey(now), wk = weekKey(now);
  const sink = out || { cash: 0, msgs: [] };
  if (prog.dk !== dk || !prog.d) {
    if (prog.d && prog.dk) settle(prog.d, sink, prog, 'daily');
    prog.dk = dk;
    prog.d = emptySet(pick(MISSIONS.filter((m) => m.scope === 'd').map((m) => m.id), DAILY_N, hash(seedName + dk)));
  }
  if (prog.wk !== wk || !prog.w) {
    if (prog.w && prog.wk) settle(prog.w, sink, prog, 'weekly');
    prog.wk = wk;
    prog.w = emptySet(pick(MISSIONS.filter((m) => m.scope === 'w').map((m) => m.id), WEEKLY_N, hash(seedName + wk)));
  }
}
const scaled = (cash, lvl) => Math.round((cash * (1 + 0.04 * (lvl - 1))) / 100) * 100;
function payMission(prog, m, out) {
  const c = scaled(m.cash, levelOf(prog.xp));
  out.cash += c; prog.xp += m.xp; prog.tok += TOK[m.scope];
  out.msgs.push(`Reward claimed: ${m.text}. +₦${c.toLocaleString('en-NG')}, +${m.xp} XP, +${TOK[m.scope]} token${TOK[m.scope] > 1 ? 's' : ''}`);
}
function payBonus(prog, out) {
  out.cash += WEEK_BONUS.cash; prog.xp += WEEK_BONUS.xp; prog.tok += WEEK_BONUS.tok; prog.wins++;
  out.msgs.push(`Weekly bonus: all five challenges done! +₦${WEEK_BONUS.cash.toLocaleString('en-NG')}, +${WEEK_BONUS.xp} XP, +${WEEK_BONUS.tok} tokens, Weekly Champion badge`);
}
function levelUps(prog, out) {
  while (prog.lv < MAX_LEVEL && levelOf(prog.xp) > prog.lv) {
    prog.lv++;
    const c = levelReward(prog.lv);
    out.cash += c;
    const unlocked = UNLOCKS.filter(([l]) => l === prog.lv).map(([, t]) => t);
    out.msgs.push(`LEVEL ${prog.lv}! You are now a ${titleOf(prog.lv)}. +₦${c.toLocaleString('en-NG')}${unlocked.length ? `. Unlocked: ${unlocked.join(', ')}` : ''}`);
  }
}
// Collect a reward. kind: 'm' a mission, 'a' an achievement, 'bonus' the weekly bonus.
export function claim(prog, kind, id, now, seedName) {
  const out = { cash: 0, msgs: [], ok: false };
  rollover(prog, now, seedName, out);
  if (kind === 'm') {
    const set = [prog.d, prog.w].find((x) => x && x.ids.includes(id));
    if (!set || !set.done[id] || set.got[id]) return out;
    set.got[id] = 1; payMission(prog, MISSION[id], out); out.ok = true;
  } else if (kind === 'a') {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a || prog.ach[id] !== 1) return out;
    prog.ach[id] = 2; out.cash += a.cash; prog.xp += a.xp; out.ok = true;
    out.msgs.push(`Reward claimed: ${a.name}. +₦${a.cash.toLocaleString('en-NG')}${a.xp ? `, +${a.xp} XP` : ''}`);
  } else if (kind === 'bonus') {
    const set = prog.w;
    if (!set || set.bonus || !set.ids.length || !set.ids.every((x) => set.done[x])) return out;
    set.bonus = 1; payBonus(prog, out); out.ok = true;
  }
  levelUps(prog, out);
  return out;
}
export function grandfather(prog, wealth) {   // players who were already playing start with some XP
  if (prog.dk || prog.xp > 0) return;
  prog.xp = Math.min(3000, Math.floor(Math.max(0, wealth) / 2000));
  prog.lv = levelOf(prog.xp);
}

// Something happened: ev is the kind (see MISSIONS), n how much, room the place for "place".
// Returns { cash, msgs: [text...] }: money to give the player and lines to show. Level-ups and finished missions are included.
export function record(prog, ev, n, now, seedName, key) {
  const out = { cash: 0, msgs: [] };
  rollover(prog, now, seedName, out);
  if (ev) {
    const st = prog.st;
    if (ev === 'shift') st.shifts += n;
    else if (ev === 'earn') { st.earned += n; prog.xp += n / FLOW_XP; }
    else if (ev === 'buy') st.buys += n;
    else if (ev === 'spend') st.spent += n;
    else if (ev === 'save') st.saved += n;
    else if (ev === 'send') st.sent += n;
    else if (ev === 'chat') st.chat += n;
    else if (ev === 'knock') st.knocks += n;
    else if (ev === 'act') st.acts += n;
    else if (ev === 'trip') st.trips += n;
    else if (ev === 'delivery') { st.deliv += n; prog.xp += 12 * n; }
    else if (ev === 'fare') { st.fares += n; prog.xp += 10 * n; }
    else if (ev === 'love') { st.loves += n; prog.xp += 30 * n; }
    else if (ev === 'date') { st.dates += n; prog.xp += 15 * n; }
    else if (ev === 'wed') { st.wed += n; prog.xp += 200 * n; }
    else if (ev === 'party') { st.party += n; prog.xp += 15 * n; }
    else if (ev === 'host') { st.host += n; prog.xp += 25 * n; }
    else if (ev === 'upgrade') { st.upg += n; prog.xp += 20 * n; }
    else if (ev === 'race') { st.races += n; prog.xp += 30 * n; }
    else if (ev === 'racexp') prog.xp += n;
    else if (ev === 'podium') { st.podiums += n; prog.xp += 50 * n; }
    else if (ev === 'racewin') { st.raceWins += n; prog.xp += 100 * n; }
    else if (ev === 'racewon') st.raceWon += n;
    else if (ev === 'manage') { st.mgmt += n; prog.xp += 8 * n; }
    else if (ev === 'chest') { st.chests += n; prog.xp += 20 * n; }
    else if (ev === 'rally') { st.rallies += n; prog.xp += 40 * n; }
    else if (ev === 'taxim') st.taxiM += n;
    else if (ev === 'rate') { st.rateSum += n; st.rateN += 1; }
    else if (ev === 'delmoney') st.delM += n;
    if (ev === 'place' && key && !prog.pl.includes(key)) prog.pl.push(key);
    for (const set of [prog.d, prog.w]) {
      for (const id of set.ids) {
        const m = MISSION[id];
        if (!m || m.ev !== ev || set.done[id]) continue;
        if (DISTINCT.has(ev)) {
          if (!key || set.keys[ev].includes(key)) continue;
          set.keys[ev].push(key);
          set.pr[id] = Math.min(m.goal, set.keys[ev].length);
        } else set.pr[id] = Math.min(m.goal, (set.pr[id] || 0) + n);
        if (set.pr[id] >= m.goal) { set.done[id] = 1; out.msgs.push(`Mission complete: ${m.text}. Claim your reward in Activities.`); }
      }
    }
  }
  levelUps(prog, out);
  return out;
}

// Check the achievements. Call it now and then. Returns { cash, msgs } like record().
export function checkAch(prog, ctx) {
  const out = { cash: 0, msgs: [] };
  for (const a of ACHIEVEMENTS) {
    if (prog.ach[a.id] || a.val(prog, ctx) < a.goal) continue;
    prog.ach[a.id] = 1;
    out.msgs.push(`Achievement unlocked: ${a.name}! Claim your reward in Activities.`);
  }
  return out;
}

// What the phone shows.
export function progView(prog, ctx, now, seedName) {
  rollover(prog, now, seedName);
  const lvl = levelOf(prog.xp), base = xpAt(lvl), next = lvl >= MAX_LEVEL ? base : xpAt(lvl + 1);
  const row = (set, id) => { const m = MISSION[id]; return { id, text: m.text, goal: m.goal, pr: Math.min(m.goal, Math.floor(set.pr[id] || 0)), done: Boolean(set.done[id]), got: Boolean(set.got[id]), cash: scaled(m.cash, lvl), xp: m.xp, tok: TOK[m.scope] }; };
  const w = prog.w;
  const bonus = { ready: w.ids.every((id) => w.done[id]) && !w.bonus, got: Boolean(w.bonus), ...WEEK_BONUS };
  const ach = ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, text: a.text, goal: a.goal, pr: Math.min(a.goal, Math.floor(a.val(prog, ctx))), done: prog.ach[a.id] >= 1, got: prog.ach[a.id] === 2, cash: a.cash, xp: a.xp }));
  const daily = prog.d.ids.map((id) => row(prog.d, id)), weekly = w.ids.map((id) => row(w, id));
  const claimable = [...daily, ...weekly].filter((m) => m.done && !m.got).length + ach.filter((a) => a.done && !a.got).length + (bonus.ready ? 1 : 0);
  const badges = [...ach.filter((a) => a.done).map((a) => a.name)];
  if (prog.wins) badges.push(`Weekly Champion x${prog.wins}`);
  badges.push(...prog.bd);
  return {
    lvl, title: titleOf(lvl), xp: Math.floor(prog.xp), into: Math.floor(prog.xp - base), need: next - base, max: lvl >= MAX_LEVEL,
    tok: prog.tok, claimable, badges, bonus, daily, weekly, ach,
    dailyLeftMs: msToTomorrow(now),
    unlocks: UNLOCKS.map(([l, t]) => ({ lvl: l, text: t, got: lvl >= l })),
    career: { deliv: prog.st.deliv, earned: Math.floor(prog.st.delM), fares: prog.st.fares, taxiEarned: Math.floor(prog.st.taxiM), mgmt: prog.st.mgmt, lots: ctx.lots, rating: prog.st.rateN ? Math.round((prog.st.rateSum / prog.st.rateN) * 10) / 10 : 0 },
    stats: { shifts: prog.st.shifts, earned: Math.floor(prog.st.earned), places: prog.pl.length },
  };
}
