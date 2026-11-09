// Adulthood: vehicles, people (NPCs), relationships, referrals, and side quests.
// Rules and data only (no network, no database), so it is easy to test and to tune.
import { isOpen } from './world.js';

// ---------- Vehicles ----------
// "travel" is what the Map offers once you own it. Walking is free and slow, the bus is cheap, taxis are quick but dear.
// Every vehicle Kanis Motors sells. To add a car later: drop its model in client/public/models/cars/<model>.glb
// and add one row here (and its model name in client/src/vehicles.js CAR_MODELS). Nothing else needs to change.
// kind: 'car' or 'bike' (how it drives). speed: top speed and pickup compared with a normal car.
// cockpit: name of a cockpit (inside) model, only for flashy cars. cost is in naira, based on what such a car costs in real life.
export const VEHICLES = {
  bike:       { kind: 'bike', tier: 'Everyday',  label: 'Bicycle',            cost: 25000,     speed: 1,    travel: { cost: 0,   seconds: 5 }, text: 'Free to ride, faster than walking.' },
  car:        { kind: 'car',  tier: 'Everyday',  label: '1970s Coupe',        cost: 400000,    speed: 1,    model: 'coupe70',    travel: { cost: 150, seconds: 2 }, text: 'A cheap old coupe. Quick, but fuel costs ₦150 a trip.' },
  taxi90:     { kind: 'car',  tier: 'Everyday',  label: '1990s Yellow Cab',   cost: 1200000,   speed: 1,    model: 'taxi90',     travel: { cost: 150, seconds: 2 }, text: 'An old city cab. Tough and cheap to keep.' },
  pickup50:   { kind: 'car',  tier: 'Classic',   label: '1950s Pickup Truck', cost: 3500000,   speed: 0.9,  model: 'pickup50',   travel: { cost: 150, seconds: 2 }, text: 'A restored farm truck with real character.' },
  roadster50: { kind: 'car',  tier: 'Classic',   label: '1950s Roadster',     cost: 6500000,   speed: 1.1,  model: 'roadster50', travel: { cost: 120, seconds: 2 }, text: 'A beautiful old-school open roadster.' },
  taxi:       { kind: 'car',  tier: 'Premium',   label: 'City Taxi',          cost: 9000000,   speed: 1.15, model: 'taxi',       travel: { cost: 120, seconds: 2 }, text: 'A modern cab, comfortable and fast enough.' },
  lowrider:   { kind: 'car',  tier: 'Premium',   label: 'Lowrider',           cost: 14000000,  speed: 1.2,  model: 'lowrider',   travel: { cost: 120, seconds: 2 }, text: 'Slung low, painted loud. Everybody looks.' },
  sports:     { kind: 'car',  tier: 'Luxury',    label: 'Sports Car',         cost: 85000000,  speed: 1.5,  model: 'sports',     cockpit: 'sports_cockpit', travel: { cost: 100, seconds: 1 }, text: 'Fast and flashy, with a full cockpit view.' },
  racer:      { kind: 'car',  tier: 'Supercar',  label: 'Race Car',           cost: 250000000, speed: 1.8,  model: 'racer',      travel: { cost: 100, seconds: 1 }, text: 'Built for speed. The fastest thing on the road.' },
};
export const VEHICLE_IDS = Object.keys(VEHICLES);
export const parseVehicles = (json) => {
  try {
    const list = json ? JSON.parse(json) : [];
    return Array.isArray(list) ? [...new Set(list.filter((id) => typeof id === 'string' && Object.hasOwn(VEHICLES, id)))] : [];
  } catch {
    return [];
  }
};
// The trip types this player can use right now.
export const travelFor = (baseTravel, owned) => {
  const t = { ...baseTravel };
  for (const id of owned) t[VEHICLES[id].kind] = { ...VEHICLES[id].travel };
  return t;
};

// ---------- Relationships ----------
export const REL_MAX = 100;
export const relLabel = (rel) => (rel >= 80 ? 'Close' : rel >= 50 ? 'Friend' : rel >= 20 ? 'Acquaintance' : 'Stranger');

// ---------- Reputation ----------
// Your name around town, from -100 to 100. Only the server changes it, from things it can check itself
// (quests, tips, donations, paying bills on time, ghosting a job, rude chat, petty theft). Other players can NOT raise or lower it.
export const REP_MIN = -100;
export const REP_MAX = 100;
export const clampRep = (v) => Math.max(REP_MIN, Math.min(REP_MAX, v));
export const REP_TIERS = [
  { id: 'disreputable', label: 'Disreputable', min: -100 },
  { id: 'shady',        label: 'Shady',        min: -40 },
  { id: 'neutral',      label: 'Neutral',      min: -10 },
  { id: 'respected',    label: 'Respected',    min: 20 },
  { id: 'admired',      label: 'Admired',      min: 50 },
];
export const repTier = (rep) => [...REP_TIERS].reverse().find((t) => rep >= t.min) || REP_TIERS[0];
export const REP = {
  referralMin: -10,       // people will not refer someone with a shady name
  questStartMin: -40,
  quest: 3,               // finishing a quest
  onTimeBill: 1,          // paying a bill before it goes overdue (at most once per billCooldownMs)
  billCooldownMs: 10 * 60 * 1000,
  ghost: -2,              // quitting a job within ghostMs of taking it, without working a single shift
  ghostMs: 10 * 60 * 1000,
  toxic: -1,              // chat words the filter had to mask (at most once per toxicCooldownMs)
  toxicCooldownMs: 60 * 1000,
  swipeCaught: -4, swipeClean: -2, swipeFine: 2000, swipeChance: 0.5,
  recoverPerMin: 0.1,     // a bad name slowly heals while you stay online and behave
};
// Pay changes a little with your name.
export const payBonus = (rep) => (rep >= 50 ? 1.1 : rep >= 20 ? 1.05 : 1);
// Friendship gains: a good name helps, a shady one hurts.
export const relBonus = (rep) => (rep >= 20 ? 1 : rep < -10 ? -1 : 0);

// ---------- Quests ----------
// Steps run in order. kind: visit {room} | talk {npc} | shifts {n} | practice {skill, n} | study {n} | dance {n}
// When the last step is done the quest is "ready": go back to the giver and ask to report in.
export const QUESTS = {
  parcel: {
    title: 'Parcel for the pharmacist', giver: 'nkechi',
    steps: [
      { kind: 'visit', room: 'pharmacy', text: 'Take the parcel to the Pharmacy' },
      { kind: 'talk', npc: 'amaka', text: 'Hand the parcel to Dr. Amaka' },
    ],
    reward: { cash: 6000, rel: { nkechi: 10, amaka: 5 } },
  },
  trial: {
    title: 'Coach Femi\'s trial', giver: 'femi',
    steps: [{ kind: 'practice', skill: 'fitness', n: 3, text: 'Train at the Gym 3 times' }],
    reward: { cash: 5000, rel: { femi: 10 } },
  },
  reading: {
    title: 'Reading challenge', giver: 'adaobi',
    steps: [{ kind: 'study', n: 3, text: 'Study 3 times (any skill)' }],
    reward: { cash: 4000, rel: { adaobi: 10 } },
  },
  opening: {
    title: 'Light up the dance floor', giver: 'tunde',
    steps: [{ kind: 'dance', n: 2, text: 'Dance at the Night Club twice' }],
    reward: { cash: 6000, rel: { tunde: 10 } },
  },
  midnight: {
    title: 'Midnight delivery', giver: 'ade',
    steps: [
      { kind: 'visit', room: 'club', text: 'Pick up the package at the Night Club' },
      { kind: 'visit', room: 'market', text: 'Drop it at the Market' },
    ],
    reward: { cash: 15000, rel: { ade: 10 } },
  },
};
export const QUEST_IDS = Object.keys(QUESTS);

// ---------- People ----------
// hours: when the person is around (game hours, past midnight allowed). Topics are what you can say to them.
//   minRel: relationship needed. cost: naira. once: only one time. cooldown: yes = a wait before again.
//   rel: relationship gained. flag: a referral or secret you earn. quest / claim: start or finish a quest.
// keywords: if you say one in chat while they are nearby, they answer with a tip (see tips).
export const NPCS = {
  nkechi: {
    name: 'Mama Nkechi', role: 'Market trader', room: 'market', hours: { open: 6, close: 20 },
    greet: ['Ah, my dear! Come and buy something.', 'Welcome back! The tomatoes are fresh today.', 'My friend! How is business with you?'],
    keywords: ['market', 'hustle', 'hungry', 'money'],
    tips: [
      { minRel: 0, text: 'Buy early, sell late. That is the whole trade, my dear.' },
      { minRel: 20, text: 'The Pharmacy is quiet in the morning. If you are ever sick, go early.' },
      { minRel: 40, text: 'Psst... I left a little something under the stall for you.', cash: 2000, once: true },
    ],
    topics: [
      { id: 'greet', label: 'Greet her', rel: 4, cooldown: true, say: 'She laughs and pinches your cheek. "You are a good one!"' },
      { id: 'snack', label: 'Buy her a snack (₦500)', cost: 500, rel: 8, cooldown: true, say: 'She beams. "Ah, God bless you!"' },
      { id: 'tip', label: 'Leave her a tip (₦300)', cost: 300, rel: 2, rep: 1, cooldown: true, say: '"You are too kind, my dear."' },
      { id: 'swipe', label: 'Swipe a mango while she is not looking', swipe: true, cooldown: true, say: '' },
      { id: 'parcel', label: 'Ask if she needs help', minRel: 10, quest: 'parcel', say: '"Take this parcel to Dr. Amaka at the Pharmacy. She will be so happy."' },
      { id: 'claim_parcel', label: 'Report back about the parcel', claim: 'parcel', say: '"You delivered it? Take this for your trouble."' },
      { id: 'work', label: 'Ask her about work', minRel: 50, minRep: -10, once: true, flag: 'Referral: Mama Nkechi', say: '"My stall needs hands. Go to the Jobs Center and say I sent you."' },
    ],
  },
  amaka: {
    name: 'Dr. Amaka', role: 'Pharmacist', room: 'pharmacy', hours: { open: 8, close: 21 },
    greet: ['Hello. Are you taking care of yourself?', 'Good to see you. Drink water.'],
    keywords: ['sick', 'health', 'tired', 'cold'],
    tips: [
      { minRel: 0, text: 'Stay clean and eat on time and you will rarely catch a cold.' },
      { minRel: 20, text: 'Stress piles up quietly. Sleep in your own bed to bring it down fast.' },
    ],
    topics: [
      { id: 'greet', label: 'Say hello', rel: 4, cooldown: true, say: '"Lovely to see you."' },
      { id: 'advice', label: 'Ask for health advice', minRel: 15, cooldown: true, stress: -10, say: 'She goes through a few breathing exercises with you. You feel lighter.' },
      { id: 'work', label: 'Ask about work', minRel: 50, minRep: -10, once: true, flag: 'Referral: Dr. Amaka', say: '"I could use a clinic aide. Ask about it at the Jobs Center."' },
    ],
  },
  femi: {
    name: 'Coach Femi', role: 'Gym coach', room: 'gym', hours: { open: 5, close: 23 },
    greet: ['Ready to sweat?', 'No excuses today!', 'Look who is back!'],
    keywords: ['gym', 'fit', 'muscle', 'strong'],
    tips: [
      { minRel: 0, text: 'Consistency beats intensity. Train a little, often.' },
      { minRel: 30, text: 'Big gyms always need good trainers. Get your fitness up and ask me.' },
    ],
    topics: [
      { id: 'greet', label: 'Greet the coach', rel: 4, cooldown: true, say: '"Good energy! Keep it up."' },
      { id: 'tips', label: 'Ask for training tips', minRel: 10, cooldown: true, xp: { skill: 'fitness', n: 15 }, say: 'He fixes your form. You learn something useful.' },
      { id: 'trial', label: 'Ask for a challenge', minRel: 10, quest: 'trial', say: '"Train three times and I will believe you are serious."' },
      { id: 'claim_trial', label: 'Report back on the challenge', claim: 'trial', say: '"Three sessions! You are serious. Here."' },
      { id: 'work', label: 'Ask about training others', minRel: 50, minRep: -10, once: true, flag: 'Referral: Coach Femi', say: '"I will vouch for you. Go and apply as a trainer."' },
    ],
  },
  adaobi: {
    name: 'Mrs. Adaobi', role: 'Librarian', room: 'library', hours: { open: 8, close: 20 },
    greet: ['Shhh. But hello.', 'Welcome. Looking for something to read?'],
    keywords: ['book', 'read', 'learn', 'study'],
    tips: [
      { minRel: 0, text: 'A page a day beats a book a year.' },
      { minRel: 25, text: 'Online courses give far more XP than books, but you need power and data at home.' },
    ],
    topics: [
      { id: 'greet', label: 'Say hello quietly', rel: 4, cooldown: true, say: 'She smiles over her glasses.' },
      { id: 'donate', label: 'Donate to the library fund (₦1,000)', cost: 1000, rel: 3, rep: 2, cooldown: true, say: '"The children thank you. Truly."' },
      { id: 'recommend', label: 'Ask for a book recommendation', minRel: 10, cooldown: true, xp: { skill: 'coding', n: 15 }, say: 'She hands you a worn book on programming. You read a few pages.' },
      { id: 'reading', label: 'Ask for a reading challenge', minRel: 10, quest: 'reading', say: '"Study three times and come back to tell me what you learned."' },
      { id: 'claim_reading', label: 'Report back on the challenge', claim: 'reading', say: '"Wonderful. A small gift for a good student."' },
      { id: 'work', label: 'Ask about tutoring', minRel: 50, minRep: -10, once: true, flag: 'Referral: Mrs. Adaobi', say: '"The students could use a tutor like you. Ask at the Jobs Center."' },
    ],
  },
  tunde: {
    name: 'DJ Tunde', role: 'Club DJ', room: 'club', hours: { open: 20, close: 5 },
    greet: ['Yoooo! What is up?', 'The night is young!'],
    keywords: ['party', 'dance', 'music', 'club', 'vibe'],
    tips: [
      { minRel: 0, text: 'The floor fills up after midnight. Come ready.' },
      { minRel: 30, text: 'Club MCs get paid well. Work on your public speaking.' },
    ],
    topics: [
      { id: 'greet', label: 'Greet the DJ', rel: 4, cooldown: true, say: 'He drops a quick beat just for you.' },
      { id: 'drink', label: 'Buy him a drink (₦1,500)', cost: 1500, rel: 10, cooldown: true, say: '"You are a legend!"' },
      { id: 'tip', label: 'Tip the DJ (₦500)', cost: 500, rel: 2, rep: 1, cooldown: true, say: '"Respect!"' },
      { id: 'opening', label: 'Ask how to help the party', minRel: 10, quest: 'opening', say: '"Get on that floor and show everyone how it is done. Dance twice."' },
      { id: 'claim_opening', label: 'Report back', claim: 'opening', say: '"The floor loved you! Here is something for the energy."' },
      { id: 'work', label: 'Ask about hosting', minRel: 50, minRep: -10, once: true, flag: 'Referral: DJ Tunde', say: '"I will put in a word. Apply for the MC spot."' },
    ],
  },
  ade: {
    name: 'Big Ade', role: 'Fixer', room: 'plaza', hours: { open: 20, close: 5 },
    greet: ['Hmm. I know you.', 'You again. Good.', 'Careful who hears what we talk about.'],
    keywords: ['hustle', 'side', 'extra', 'tip', 'gist'],
    tips: [
      { minRel: 0, text: 'The city pays well for people who keep their mouths shut and their feet moving.' },
      { minRel: 30, text: 'Come see me about night runs. Small packages, honest pay.' },
    ],
    topics: [
      { id: 'greet', label: 'Greet him', rel: 3, cooldown: true, say: '"Mm. Respect."' },
      { id: 'midnight', label: 'Ask about a side hustle', minRel: 30, quest: 'midnight', say: '"Pick up a package at the Night Club and drop it at the Market. Simple."' },
      { id: 'claim_midnight', label: 'Report back', claim: 'midnight', say: '"Clean. Here is your share."' },
      { id: 'work', label: 'Ask for steady night work', minRel: 60, once: true, flag: 'Underground: Big Ade', say: '"I will use you for runs. Check the Jobs Center board. Night only."' },
    ],
  },
};
export const NPC_IDS = Object.keys(NPCS);

// Referral and secret flags that can be earned (so saved data is checked against a known list).
export const NET_FLAGS = NPC_IDS.flatMap((id) => NPCS[id].topics.filter((t) => t.flag).map((t) => t.flag));

// ---------- Saved state ----------
export const emptyNet = () => ({ rel: {}, quests: {}, flags: [], seen: {}, tipIdx: {} });
export function parseNet(json) {
  let raw = null;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  const out = emptyNet();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (raw.rel && typeof raw.rel === 'object') {
    for (const id of NPC_IDS) if (Number.isFinite(raw.rel[id])) out.rel[id] = Math.max(0, Math.min(REL_MAX, raw.rel[id]));
  }
  if (raw.quests && typeof raw.quests === 'object') {
    for (const id of QUEST_IDS) {
      const q = raw.quests[id];
      if (!q || typeof q !== 'object') continue;
      const steps = QUESTS[id].steps.length;
      out.quests[id] = {
        step: Number.isInteger(q.step) ? Math.max(0, Math.min(steps, q.step)) : 0,
        prog: Number.isInteger(q.prog) ? Math.max(0, Math.min(99, q.prog)) : 0,
        ready: Boolean(q.ready),
        done: Boolean(q.done),
      };
    }
  }
  if (Array.isArray(raw.flags)) out.flags = [...new Set(raw.flags.filter((f) => NET_FLAGS.includes(f)))];
  if (raw.seen && typeof raw.seen === 'object') {
    for (const npc of NPC_IDS) {
      for (const t of NPCS[npc].topics) if (raw.seen[`${npc}:${t.id}`]) out.seen[`${npc}:${t.id}`] = true;
      NPCS[npc].tips.forEach((_, i) => { if (raw.seen[`tip:${npc}:${i}`]) out.seen[`tip:${npc}:${i}`] = true; });
    }
  }
  if (raw.tipIdx && typeof raw.tipIdx === 'object') {
    for (const id of NPC_IDS) if (Number.isInteger(raw.tipIdx[id])) out.tipIdx[id] = Math.max(0, Math.min(99, raw.tipIdx[id]));
  }
  return out;
}

// ---------- Helpers ----------
export const relOf = (net, npc) => net.rel[npc] || 0;
export const present = (npcId, minuteOfDay) => isOpen(NPCS[npcId].hours, minuteOfDay);
// People who are in this room right now.
export const peopleIn = (room, minuteOfDay) => NPC_IDS.filter((id) => NPCS[id].room === room && present(id, minuteOfDay));

// Should this topic be offered right now?
export function topicVisible(net, npcId, t) {
  const rel = relOf(net, npcId);
  if (t.minRel && rel < t.minRel) return false;
  if (t.once && net.seen[`${npcId}:${t.id}`]) return false;
  if (t.quest) {
    const q = net.quests[t.quest];
    if (q) return false; // started or finished
  }
  if (t.claim) {
    const q = net.quests[t.claim];
    if (!q || !q.ready || q.done) return false;
  }
  return true;
}

// The tip a player gets when their chat message mentions one of the person's keywords.
export function pickTip(net, npcId) {
  const npc = NPCS[npcId];
  const rel = relOf(net, npcId);
  const open = npc.tips.map((t, i) => ({ ...t, i })).filter((t) => rel >= t.minRel);
  if (!open.length) return null;
  const idx = (net.tipIdx[npcId] || 0) % open.length;
  net.tipIdx[npcId] = (net.tipIdx[npcId] || 0) + 1;
  return open[idx];
}
export function overheard(npcId, text) {
  const words = String(text).toLowerCase().match(/[a-z']+/g) || [];
  return NPCS[npcId].keywords.some((k) => words.includes(k));
}
