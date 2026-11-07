// Adulthood: skills, jobs, and wellness rules (stress, burnout, illness).
// Like world.js this holds rules only (no network, no database), so it is easy to test and to tune.

// ---------- Skills ----------
export const SKILLS = {
  coding:   { label: 'Coding' },
  speaking: { label: 'Public speaking' },
  fitness:  { label: 'Fitness' },
  crafting: { label: 'Crafting' },
};
export const SKILL_IDS = Object.keys(SKILLS);
export const MAX_LEVEL = 10;

// Total XP needed to REACH a level: L1 = 100, L2 = 300, L3 = 600, L4 = 1000 ... L10 = 5500.
export const xpForLevel = (level) => 50 * level * (level + 1);
export function levelOf(xp) {
  let level = 0;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}
// Progress inside the current level: { level, into, need } (need = 0 at max level).
export function progressOf(xp) {
  const level = levelOf(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, need: 0 };
  const base = level === 0 ? 0 : xpForLevel(level);
  return { level, into: xp - base, need: xpForLevel(level + 1) - base };
}

export const emptySkills = () => Object.fromEntries(SKILL_IDS.map((id) => [id, 0]));
export function parseSkills(json) {
  let raw = null;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  const out = emptySkills();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const id of SKILL_IDS) {
      if (Number.isFinite(raw[id])) out[id] = Math.max(0, Math.min(Math.floor(raw[id]), xpForLevel(MAX_LEVEL)));
    }
  }
  return out;
}

// Ways to study. "room" is where it must be done. "needs" lists home services it also needs.
export const STUDY = {
  book:   { label: 'Read a book',   room: 'library', cost: 500,  xp: 20, energy: 5,  stress: 1 },
  course: { label: 'Online course', room: 'home',    cost: 2500, xp: 80, energy: 15, stress: 4, needs: ['power', 'data'] },
};
// Practice is different for each skill (coding has none, you learn it from books and courses).
export const PRACTICE = {
  fitness:  { label: 'Train',            room: 'gym',    cost: 300, xp: 25, energy: 8, stress: -3, clean: 10 },
  speaking: { label: 'Open mic',         room: 'plaza',  cost: 0,   xp: 15, energy: 4, stress: 1,  needsCompany: true },
  crafting: { label: 'Craft something',  room: 'market', cost: 800, xp: 25, energy: 6, stress: 0 },
};
export const STUDY_MODES = ['book', 'course', 'practice'];

// The rule for one study mode on one skill, or null if that combination does not exist.
export function studyRule(skill, mode) {
  if (!Object.hasOwn(SKILLS, skill)) return null;
  if (mode === 'book' || mode === 'course') return STUDY[mode];
  if (mode === 'practice') return Object.hasOwn(PRACTICE, skill) ? PRACTICE[skill] : null;
  return null;
}

// ---------- Jobs ----------
// A job is unlocked by a story result (flag) or by a skill level (req). "remote" jobs are done at Home and need power and data.
// Pay is per shift. Placeholders to tune.
export const JOBS = [
  { id: 'shop',       title: 'Shop assistant',          pay: 8000,  room: 'shop',   flag: 'Interview result: offer', skill: 'speaking' },
  { id: 'shop_trial', title: 'Shop assistant (trial)',  pay: 6000,  room: 'shop',   flag: 'Interview result: trial week', skill: 'speaking' },
  { id: 'rider',      title: 'Delivery rider',          pay: 14000, room: 'market', flag: 'Took the delivery job', skill: 'fitness' },
  { id: 'seller',     title: 'Craft seller',            pay: 16000, room: 'market', req: { skill: 'crafting', level: 2 } },
  { id: 'trainer',    title: 'Gym trainer',             pay: 18000, room: 'gym',    req: { skill: 'fitness', level: 3 }, ref: 'Referral: Coach Femi' },
  { id: 'mc',         title: 'Club MC',                 pay: 25000, room: 'club',   req: { skill: 'speaking', level: 4 }, ref: 'Referral: DJ Tunde' },
  { id: 'dev_jr',     title: 'Junior web developer',    pay: 30000, room: 'home',   remote: true, req: { skill: 'coding', level: 3 } },
  { id: 'dev_sr',     title: 'Senior web developer',    pay: 60000, room: 'home',   remote: true, req: { skill: 'coding', level: 7 } },
  // Starter jobs: nothing needed to apply, so every new player has real choices. They pay less than the skilled jobs.
  { id: 'cleaner',    title: 'Cleaner',                 pay: 5000,  room: 'plaza',   part: true, skill: 'crafting' },
  { id: 'cashier',    title: 'Cashier',                 pay: 6500,  room: 'market',  part: true, skill: 'speaking' },
  { id: 'guard',      title: 'Security guard',          pay: 7000,  room: 'bank',    skill: 'fitness' },
  { id: 'waiter',     title: 'Waiter',                  pay: 6000,  room: 'club', hours: { open: 20, close: 5 }, part: true, skill: 'speaking' },
  { id: 'attendant',  title: 'Pharmacy attendant',      pay: 7500,  room: 'pharmacy', part: true, skill: 'speaking' },
  { id: 'mechanic_h', title: 'Mechanic helper',         pay: 9000,  room: 'garage',  skill: 'crafting' },
  { id: 'gym_desk',   title: 'Gym front desk',          pay: 7000,  room: 'gym',     part: true, skill: 'fitness' },
  { id: 'shelver',    title: 'Library shelver',         pay: 5500,  room: 'library', part: true },
  // Hidden jobs: they only appear on the board after someone refers you (see social.js).
  { id: 'stall',      title: 'Market stall helper',     pay: 20000, room: 'market',   flag: 'Referral: Mama Nkechi', hidden: true, skill: 'speaking' },
  { id: 'clinic',     title: 'Clinic aide',             pay: 22000, room: 'pharmacy', flag: 'Referral: Dr. Amaka', hidden: true },
  { id: 'tutor',      title: 'Library tutor',           pay: 26000, room: 'library',  flag: 'Referral: Mrs. Adaobi', hidden: true, skill: 'speaking' },
  { id: 'runner',     title: 'Night runner',            pay: 40000, room: 'plaza',    flag: 'Underground: Big Ade', hidden: true, underground: true, skill: 'fitness', rep: -1, hours: { open: 20, close: 5 }, stress: 15 },
];
// You can hold one main job and one part-time job (job.part). Each has its own shift cooldown.
// A shift now takes real time: you stay at work, doing it, until it is over.
export const SHIFT = { mainMs: 20000, partMs: 10000 };
// Skilled workers get through a shift faster: 4% shorter for each level in the job's skill, at most 40% shorter.
export const SHIFT_CUT_PER_LEVEL = 0.04, SHIFT_CUT_MAX = 0.4;
export const shiftMs = (job, level = 0) => Math.round((job.part ? SHIFT.partMs : SHIFT.mainMs) * (1 - Math.min(SHIFT_CUT_MAX, Math.max(0, level) * SHIFT_CUT_PER_LEVEL)));

// Skill perks. Each level in the skill a job uses adds 5% to its pay and shortens the shift; level 5 takes some of the stress out of a shift;
// level 10 adds another 10% and saves some energy. Jobs with no skill (job.skill or job.req.skill) get none.
export const PERKS = { payPerLevel: 0.05, stressCutAt5: 2, payExtraAt10: 0.10, energyCutAt10: 3 };
export const jobSkill = (job) => (job.req ? job.req.skill : job.skill || null);
export function perkOf(job, skills) {
  const skill = jobSkill(job);
  const level = skill ? levelOf((skills && skills[skill]) || 0) : 0;
  const payMult = 1 + level * PERKS.payPerLevel + (level >= 10 ? PERKS.payExtraAt10 : 0);
  const stressCut = level >= 5 ? PERKS.stressCutAt5 : 0;
  const energyCut = level >= 10 ? PERKS.energyCutAt10 : 0;
  const shiftCut = Math.min(SHIFT_CUT_MAX, level * SHIFT_CUT_PER_LEVEL);
  const text = !skill ? '' : `${SKILLS[skill].label} ${level}: +${Math.round((payMult - 1) * 100)}% pay${shiftCut ? `, shift ${Math.round(shiftCut * 100)}% shorter` : ''}${stressCut ? `, −${stressCut} stress` : ''}${energyCut ? `, −${energyCut} energy` : ''}`;
  return { skill, level, payMult, stressCut, energyCut, shiftCut, text };
}

// Employers will not hire someone whose reputation is below this. The underground job does not care.
export const JOB_MIN_REP = -40;
export const jobById = (id) => (typeof id === 'string' ? JOBS.find((j) => j.id === id) || null : null);

// Can this player take this job? "flags" are the story results plus any referrals. Returns { ok, why }.
// A referral can stand in for a skill requirement (job.ref).
export function qualifies(job, flags, skills, rep = 0) {
  if (!job.underground && rep < JOB_MIN_REP) return { ok: false, why: 'Your reputation is too low. Employers will not hire you' };
  if (job.req) {
    const have = levelOf(skills[job.req.skill] || 0);
    if (have >= job.req.level) return { ok: true, why: '' };
    if (job.ref && flags.includes(job.ref)) return { ok: true, why: '' };
    return { ok: false, why: `Needs ${SKILLS[job.req.skill].label} level ${job.req.level} (you are ${have})` };
  }
  if (job.flag) return flags.includes(job.flag) ? { ok: true, why: '' } : { ok: false, why: job.hidden ? 'Needs a referral' : 'Offered through the story' };
  return { ok: true, why: '' };
}

// ---------- Wellness: stress, burnout, illness ----------
export const STRESS = {
  work: 8,                // a work shift
  overduePerMin: 2,       // per overdue bill, per real minute online
  lowMoodPerMin: 1,       // while mood is Down
  calmPerMin: -0.4,       // while mood is Happy
  okayPerMin: -0.15,      // while mood is Okay (slow recovery)
  burnoutAt: 90,          // reaching this means burnout
  recoverAt: 50,          // burnout ends when stress falls to this
  // Change from an action. Sleeping in your own bed calms you the most.
  actions: { play: -8, dance: -12, chat: -8, shower: -3, sleep: -8 },
  sleepHome: -20,
};
export const SICK = {
  riskPerMin: 0.06,       // chance per real minute online while you neglect yourself
  cleanBelow: 20,         // a very low Clean or Food makes you likely to catch a cold
  foodBelow: 15,
  autoRecoverMin: 20,     // a cold passes by itself after this many real minutes online
  medicineCost: 3000,     // the Pharmacy cures it at once
};

export const clampStress = (v) => Math.max(0, Math.min(100, v));
export const burnoutNext = (stress, wasBurnedOut) => (wasBurnedOut ? stress > STRESS.recoverAt : stress >= STRESS.burnoutAt);

// Chance (0 to 1) of catching a cold during dtMin real minutes, given needs.
export function sickChance(clean, food, dtMin, riskPerMin = SICK.riskPerMin) {
  if (clean >= SICK.cleanBelow && food >= SICK.foodBelow) return 0;
  return 1 - Math.pow(1 - Math.min(1, riskPerMin), dtMin);
}

// ---------- Job interviews ----------
// Skilled jobs (the ones that ask for a skill level) hold a short interview at the Jobs Center: three questions, pass with two right.
// Having more skill than the job asks for counts as one extra right answer. The server picks the questions and keeps the answers.
export const INTERVIEW = { questions: 3, pass: 2, retryMs: Number(process.env.INTERVIEW_RETRY_MS) >= 0 && process.env.INTERVIEW_RETRY_MS !== undefined ? Number(process.env.INTERVIEW_RETRY_MS) : 60000, expireMs: 180000 };
export const needsInterview = (job) => Boolean(job && job.req);
export const INTERVIEW_POOL = [
  { q: 'You are ten minutes late on your first day. What do you do?', a: ['Tell your manager straight away, apologise, and make up the time', 'Slip in and hope nobody noticed', 'Blame the traffic and say nothing else', 'Go home, the day is already ruined'] },
  { q: 'A customer is angry about a mistake that is not yours. What do you do?', a: ['Listen calmly, apologise for the trouble, and fix it or call someone who can', 'Tell them it is not your fault and walk away', 'Argue until they give up', 'Ignore them'] },
  { q: 'You do not know how to do a task your manager gave you. What do you do?', a: ['Ask a colleague or your manager how to do it', 'Do it your own way and say nothing', 'Leave it for the next shift', 'Pretend you finished it'] },
  { q: 'Why should we hire you?', a: ['I work hard, I learn quickly, and my skills fit this job', 'I just need money', 'My cousin said you pay well', 'I do not really know'] },
  { q: 'A colleague keeps taking credit for your work. What is the best first step?', a: ['Talk to them calmly and, if it continues, tell your manager', 'Do the same to them', 'Stop working', 'Shout at them in front of everyone'] },
  { q: 'You find a mistake in your own finished work, after you handed it in. What do you do?', a: ['Report it and fix it quickly', 'Keep quiet, nobody will notice', 'Blame the tools', 'Quit'] },
  { q: 'Where do you see yourself in a few years?', a: ['Growing in this field and taking on more responsibility', 'Not working', 'Your job', 'I have no plan at all'] },
  { q: 'You are given too many tasks to finish by the deadline. What do you do?', a: ['Tell your manager early and agree what comes first', 'Say yes and miss the deadline', 'Do them badly but quickly', 'Hide until the deadline passes'] },
  { q: 'How do you handle feedback that you did something wrong?', a: ['Listen, thank them, and change how I work', 'Take it personally and argue', 'Ignore it', 'Complain about them to others'] },
];
// Pick questions and shuffle their answers. Returns what the player sees and what the server remembers.
export function startInterview(rand = Math.random) {
  const pool = INTERVIEW_POOL.map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const picks = pool.slice(0, INTERVIEW.questions);
  const view = [], right = [];
  for (const qi of picks) {
    const order = [0, 1, 2, 3];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    view.push({ q: INTERVIEW_POOL[qi].q, a: order.map((o) => INTERVIEW_POOL[qi].a[o]) });
    right.push(order.indexOf(0));
  }
  return { view, right };
}
// answers: an array of option numbers. bonus: true if the player's skill beats the job's requirement.
export function gradeInterview(right, answers, bonus = false) {
  if (!Array.isArray(answers) || answers.length !== right.length || !answers.every((n) => Number.isInteger(n) && n >= 0 && n <= 3)) return null;
  const correct = answers.filter((n, i) => n === right[i]).length;
  const score = correct + (bonus ? 1 : 0);
  return { correct, score, passed: score >= INTERVIEW.pass };
}