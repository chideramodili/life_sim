// Adulthood: the bank. Savings, interest, credit score, small loans, and debt.
// This file holds rules only (no network, no database), like world.js and skills.js, so it is easy to test and to tune.
// Every function that changes money returns { ok, why, cash, entries } where "cash" is the change to the player's wallet
// and "entries" are the lines for the transaction record. The caller applies the cash and writes the record.
// All amounts are whole naira. All times are game minutes spent ONLINE (a game day is two real hours).

export const DAY = 1440;

// ---------- Settings (placeholders to tune after watching testers) ----------
export const BANK = {
  minTx: 100,                  // smallest deposit or withdrawal
  maxTx: 1000000,              // largest single deposit or withdrawal
  ratePerDay: 0.005,           // 0.5% a game day, paid only on savings above what you owe
  interestCap: 400000,         // interest is only paid on the first 400,000 (so savings cannot snowball)
  hardCap: 2000000,            // nobody can hold more than this
  savingsCreditAt: 20000,      // holding this much earns a small credit-score nudge each interest day...
  savingsCreditMax: 650,       // ...but only up to this score
};

// Account tiers come from how long the account has been open (online time). New accounts are small on purpose.
export const ACCOUNT_TIERS = [
  { id: 'new',     label: 'New',     fromDays: 0,  maxBalance: 100000,  maxLoan: 0 },
  { id: 'member',  label: 'Member',  fromDays: 3,  maxBalance: 500000,  maxLoan: 100000 },
  { id: 'trusted', label: 'Trusted', fromDays: 10, maxBalance: 2000000, maxLoan: 500000 },
];

// Credit score: 300 to 850.
export const CREDIT = {
  min: 300, max: 850, start: 560,
  billOnTime: 2,       // pay a bill before it goes overdue
  billOverdue: -5,     // a bill goes overdue
  instOnTime: 5,       // loan installment paid on time
  payoff: 10,          // loan fully repaid with no missed payments (and held at least 2 game days)
  payoffLate: 3,       // loan fully repaid but you missed one
  missed: -25,         // a missed installment
  defaulted: -80,      // loan written off to debt
  debtCleared: 5,      // you paid off a defaulted debt
};
// Score bands. A loan needs at least "Fair". "maxLoan" and "feeRate" belong to the band.
export const CREDIT_TIERS = [
  { id: 'poor',      label: 'Poor',       from: 300, maxLoan: 0,      feeRate: 0 },
  { id: 'fair',      label: 'Fair',       from: 500, maxLoan: 30000,  feeRate: 0.12 },
  { id: 'good',      label: 'Good',       from: 600, maxLoan: 100000, feeRate: 0.09 },
  { id: 'verygood',  label: 'Very good',  from: 700, maxLoan: 250000, feeRate: 0.07 },
  { id: 'excellent', label: 'Excellent',  from: 780, maxLoan: 500000, feeRate: 0.05 },
];

export const LOAN = {
  amounts: [20000, 50000, 100000, 250000, 500000],
  installments: 4,             // paid in 4 parts
  periodMin: 2 * DAY,          // one installment every 2 game days
  graceMin: DAY,               // 1 game day to find the money before it counts as missed
  lateFeeRate: 0.05,           // 5% of the installment is added to what you owe when you miss one
  maxMissed: 2,                // the second missed installment is a default
  payoffAgeMin: 2 * DAY,       // a loan must have run this long before paying it off early earns the credit bonus
  gapMin: DAY,                 // wait one game day between loans
  garnishRate: 0.4,            // after a default, 40% of each shift's pay goes to the debt
  protectCash: 2000,           // a default never takes the last 2,000 from your wallet (so nobody is stuck with nothing)
  minScore: 500,
};

export const clampScore = (n) => Math.max(CREDIT.min, Math.min(CREDIT.max, Math.round(n)));
export const accountTier = (bank) => {
  const days = bank.ageMin / DAY;
  let t = ACCOUNT_TIERS[0];
  for (const x of ACCOUNT_TIERS) if (days >= x.fromDays) t = x;
  return t;
};
export const creditTier = (score) => {
  let t = CREDIT_TIERS[0];
  for (const x of CREDIT_TIERS) if (score >= x.from) t = x;
  return t;
};

// ---------- State ----------
export function defaultBank() {
  return {
    open: false,
    bal: 0,            // savings
    ageMin: 0,         // online minutes since the account was opened
    sinceInterest: 0,  // online minutes since interest was last paid
    accr: 0,           // interest earned but not yet paid (paid once a game day)
    score: CREDIT.start,
    loan: null,
    debt: 0,           // what you still owe after a default
    paidLoans: 0,
    defaults: 0,
    lastLoanEnd: -1e9, // account age when the last loan ended
  };
}

const int = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d);
const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

function parseLoan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const principal = int(raw.principal, 1, 5e6, 0);
  const total = int(raw.total, 1, 1e7, 0);
  if (!principal || !total) return null;
  const n = int(raw.n, 1, 12, LOAN.installments);
  return {
    principal,
    total,
    owed: int(raw.owed, 0, 2e7, total),
    n,
    done: int(raw.done, 0, n, 0),
    dueIn: num(raw.dueIn, -30 * DAY, 30 * DAY, LOAN.periodMin),
    late: Boolean(raw.late),
    graceLeft: num(raw.graceLeft, 0, LOAN.graceMin, 0),
    missed: int(raw.missed, 0, LOAN.maxMissed, 0),
    age: num(raw.age, 0, 1e9, 0),
  };
}

// Read a saved bank safely. Anything missing or broken gets the starting value.
export function parseBank(json) {
  const d = defaultBank();
  let raw = null;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  d.open = raw.open === true;
  d.bal = int(raw.bal, 0, BANK.hardCap * 2, 0);
  d.ageMin = num(raw.ageMin, 0, 1e9, 0);
  d.sinceInterest = num(raw.sinceInterest, 0, DAY, 0);
  d.accr = num(raw.accr, 0, 1e7, 0);
  d.score = clampScore(Number.isFinite(raw.score) ? raw.score : CREDIT.start);
  d.loan = d.open ? parseLoan(raw.loan) : null;
  d.debt = int(raw.debt, 0, 2e7, 0);
  d.paidLoans = int(raw.paidLoans, 0, 1e6, 0);
  d.defaults = int(raw.defaults, 0, 1e6, 0);
  d.lastLoanEnd = num(raw.lastLoanEnd, -1e9, 1e9, -1e9);
  return d;
}

// ---------- Small helpers ----------
const entry = (kind, bal, cash, note) => ({ kind, bal, cash, note });
const fail = (why) => ({ ok: false, why, cash: 0, entries: [] });
const done = (cash, entries, msg) => ({ ok: true, why: '', cash, entries, msg });

// Change the credit score. Returns the change that really happened.
export function addScore(bank, n) {
  const before = bank.score;
  bank.score = clampScore(bank.score + n);
  return bank.score - before;
}

// What one installment is right now. The last one is whatever is left, so late fees are never forgotten.
export const installmentOf = (loan) => (loan.done >= loan.n - 1 ? loan.owed : Math.min(loan.owed, Math.ceil(loan.total / loan.n)));

// Money you owe the bank in total (loan plus defaulted debt).
export const owedTotal = (bank) => (bank.loan ? bank.loan.owed : 0) + bank.debt;

// ---------- Accounts ----------
export function openAccount(bank) {
  if (bank.open) return fail('You already have an account.');
  bank.open = true;
  bank.ageMin = 0;
  bank.sinceInterest = 0;
  bank.accr = 0;
  return done(0, [entry('open', 0, 0, 'Account opened')], 'Account opened. Welcome to the bank!');
}

function amountOk(amount) {
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) return 'Enter a whole number of naira.';
  if (amount < BANK.minTx) return `The smallest amount is ₦${BANK.minTx.toLocaleString('en-US')}.`;
  if (amount > BANK.maxTx) return `The most in one go is ₦${BANK.maxTx.toLocaleString('en-US')}.`;
  return '';
}

export function deposit(bank, cash, amount) {
  if (!bank.open) return fail('Open an account first.');
  const bad = amountOk(amount);
  if (bad) return fail(bad);
  if (cash < amount) return fail('You do not have that much cash.');
  const tier = accountTier(bank);
  const room = tier.maxBalance - bank.bal;
  if (amount > room) {
    return fail(room > 0
      ? `A ${tier.label} account holds at most ₦${tier.maxBalance.toLocaleString('en-US')}. You can add ₦${room.toLocaleString('en-US')} more.`
      : `A ${tier.label} account is full (₦${tier.maxBalance.toLocaleString('en-US')} limit). Keep using it and the limit grows.`);
  }
  bank.bal += amount;
  return done(-amount, [entry('deposit', amount, -amount, 'Deposit')], `Deposited ₦${amount.toLocaleString('en-US')}.`);
}

export function withdraw(bank, amount) {
  if (!bank.open) return fail('Open an account first.');
  const bad = amountOk(amount);
  if (bad) return fail(bad);
  if (bank.bal < amount) return fail('You do not have that much in savings.');
  bank.bal -= amount;
  return done(amount, [entry('withdraw', -amount, amount, 'Withdrawal')], `Withdrew ₦${amount.toLocaleString('en-US')}.`);
}

// ---------- Loans ----------
// What this player may borrow right now. { ok, why, options: [{ amount, fee, total, installment }] }
export function loanOffers(bank) {
  const none = (why) => ({ ok: false, why, options: [] });
  if (!bank.open) return none('Open an account first.');
  if (bank.debt > 0) return none('Clear your old debt first.');
  if (bank.loan) return none('You already have a loan.');
  const at = accountTier(bank);
  if (!at.maxLoan) {
    const left = Math.ceil((ACCOUNT_TIERS[1].fromDays * DAY - bank.ageMin) / DAY);
    return none(`New accounts cannot borrow yet. Try again in about ${Math.max(1, left)} game day${left === 1 ? '' : 's'}.`);
  }
  const ct = creditTier(bank.score);
  if (bank.score < LOAN.minScore || !ct.maxLoan) return none('Your credit score is too low to borrow. Pay bills on time to rebuild it.');
  if (bank.ageMin - bank.lastLoanEnd < LOAN.gapMin) return none('The bank wants a day between loans. Try again soon.');
  const cap = Math.min(ct.maxLoan, at.maxLoan);
  const options = LOAN.amounts.filter((a) => a <= cap).map((a) => quoteLoan(bank, a));
  return options.length ? { ok: true, why: '', options } : none('No loan is available for you right now.');
}

export function quoteLoan(bank, amount) {
  const ct = creditTier(bank.score);
  const fee = Math.round(amount * ct.feeRate);
  const total = amount + fee;
  return { amount, fee, total, installment: Math.ceil(total / LOAN.installments), rate: ct.feeRate };
}

// The amount must be one of the bank's own amounts and be on today's offer list. Nothing else is accepted.
export function takeLoan(bank, amount) {
  const offers = loanOffers(bank);
  if (!offers.ok) return fail(offers.why);
  const o = offers.options.find((x) => x.amount === amount);
  if (!o) return fail('That loan is not available to you.');
  bank.loan = {
    principal: o.amount, total: o.total, owed: o.total, n: LOAN.installments, done: 0,
    dueIn: LOAN.periodMin, late: false, graceLeft: 0, missed: 0, age: 0,
  };
  return done(o.amount, [entry('loan', 0, o.amount, `Loan ₦${o.amount.toLocaleString('en-US')} (fee ₦${o.fee.toLocaleString('en-US')})`)],
    `Loan approved: ₦${o.amount.toLocaleString('en-US')}. You will repay ₦${o.total.toLocaleString('en-US')} in ${LOAN.installments} parts.`);
}

function finishLoan(bank, goodBonus) {
  const gain = addScore(bank, goodBonus);
  bank.loan = null;
  bank.paidLoans++;
  bank.lastLoanEnd = bank.ageMin;
  return gain;
}

// Pay the next installment from your wallet. Paying close to the due date (or late) earns the on-time credit bonus.
export function payInstallment(bank, cash) {
  const loan = bank.loan;
  if (!loan) return fail('You have no loan.');
  const amt = installmentOf(loan);
  if (cash < amt) return fail(`You need ₦${amt.toLocaleString('en-US')} in cash.`);
  const early = loan.dueIn > DAY; // paying long before it is due earns nothing extra (stops credit farming)
  loan.owed -= amt;
  loan.done++;
  loan.dueIn = LOAN.periodMin;
  loan.late = false;
  loan.graceLeft = 0;
  let msg = `Paid ₦${amt.toLocaleString('en-US')}.`;
  if (loan.owed <= 0) {
    const bonus = loan.missed === 0 && loan.age >= LOAN.payoffAgeMin ? CREDIT.payoff : loan.missed > 0 ? CREDIT.payoffLate : 0;
    const g = finishLoan(bank, bonus + (early ? 0 : CREDIT.instOnTime));
    msg = `Loan fully repaid!${g > 0 ? ` Credit score +${g}.` : ''}`;
  } else if (!early) {
    const g = addScore(bank, CREDIT.instOnTime);
    if (g) msg += ` Credit score +${g}.`;
  }
  return done(-amt, [entry('loan_pay', 0, -amt, 'Loan installment')], msg);
}

// Pay off everything you owe on the loan at once. The fee is flat, so there is no refund for paying early.
export function payoffLoan(bank, cash) {
  const loan = bank.loan;
  if (!loan) return fail('You have no loan.');
  const amt = loan.owed;
  if (cash < amt) return fail(`You need ₦${amt.toLocaleString('en-US')} in cash.`);
  const bonus = loan.missed === 0 ? (loan.age >= LOAN.payoffAgeMin ? CREDIT.payoff : 0) : CREDIT.payoffLate;
  const g = finishLoan(bank, bonus);
  return done(-amt, [entry('loan_pay', 0, -amt, 'Loan paid off')], `Loan fully repaid!${g > 0 ? ` Credit score +${g}.` : ''}`);
}

// Pay a defaulted debt, as much as you can afford in one go.
export function payDebt(bank, cash) {
  if (bank.debt <= 0) return fail('You have no debt.');
  const amt = Math.min(bank.debt, Math.floor(cash));
  if (amt < 1) return fail('You have no cash to pay with.');
  bank.debt -= amt;
  let msg = `Paid ₦${amt.toLocaleString('en-US')} of your debt.`;
  if (bank.debt === 0) {
    addScore(bank, CREDIT.debtCleared);
    bank.lastLoanEnd = bank.ageMin;
    msg = 'Debt cleared! The bank will talk to you about loans again once your score recovers.';
  }
  return done(-amt, [entry('debt_pay', 0, -amt, 'Debt payment')], msg);
}

// After a default, part of each shift's pay goes to the debt. Returns { take, rest }.
export function garnish(bank, pay) {
  if (bank.debt <= 0 || pay <= 0) return { take: 0, rest: pay };
  const take = Math.min(bank.debt, Math.round(pay * LOAN.garnishRate));
  bank.debt -= take;
  return { take, rest: pay - take };
}

// ---------- Time passing (online time only) ----------
// Interest, loan due dates, direct debit, late payments, and default. Returns { cash, events } where each event is
// { msg, entries } (msg may be empty). The caller applies "cash", shows the messages, and records the entries.
export function tickBank(bank, dtMin, cash = 0, rate = BANK.ratePerDay) {
  const out = { cash: 0, events: [] };
  if (!bank.open || dtMin <= 0) return out;
  bank.ageMin += dtMin;

  // Interest. Only savings above what you owe earn it, so a loan can never be parked to earn interest.
  const eligible = Math.max(0, Math.min(bank.bal, BANK.interestCap) - owedTotal(bank));
  bank.accr += (eligible * rate * dtMin) / DAY;
  bank.sinceInterest += dtMin;
  if (bank.sinceInterest >= DAY) {
    bank.sinceInterest -= DAY;
    const pay = Math.floor(bank.accr);
    bank.accr -= pay;
    if (pay > 0) {
      bank.bal += pay;
      if (bank.bal >= BANK.savingsCreditAt && bank.score < BANK.savingsCreditMax) addScore(bank, 1);
      out.events.push({ msg: `Interest paid: +₦${pay.toLocaleString('en-US')} in savings.`, entries: [entry('interest', pay, 0, 'Interest')] });
    }
  }

  const loan = bank.loan;
  if (!loan) return out;
  loan.age += dtMin;
  loan.dueIn -= dtMin;
  if (loan.dueIn > 0) return out;

  const amt = installmentOf(loan);
  // Direct debit from savings (never from your wallet).
  if (bank.bal >= amt) {
    bank.bal -= amt;
    loan.owed -= amt;
    loan.done++;
    loan.dueIn = LOAN.periodMin;
    const wasLate = loan.late;
    loan.late = false;
    loan.graceLeft = 0;
    const entries = [entry('auto_debit', -amt, 0, 'Loan installment (direct debit)')];
    let msg = `The bank took the loan installment of ₦${amt.toLocaleString('en-US')} from your savings.`;
    if (loan.owed <= 0) {
      const bonus = loan.missed === 0 && loan.age >= LOAN.payoffAgeMin ? CREDIT.payoff : loan.missed > 0 ? CREDIT.payoffLate : 0;
      finishLoan(bank, bonus + (wasLate ? 0 : CREDIT.instOnTime));
      msg = `${msg} Loan fully repaid!`;
    } else if (!wasLate) addScore(bank, CREDIT.instOnTime);
    out.events.push({ msg, entries });
    return out;
  }

  if (!loan.late) {
    loan.late = true;
    loan.graceLeft = LOAN.graceMin;
    out.events.push({ msg: `Loan payment of ₦${amt.toLocaleString('en-US')} is due. Put money in savings or pay at the Bank within one game day.`, entries: [] });
    return out;
  }
  loan.graceLeft -= dtMin;
  if (loan.graceLeft > 0) return out;

  // Missed.
  loan.missed++;
  addScore(bank, CREDIT.missed);
  const fee = Math.round(amt * LOAN.lateFeeRate);
  loan.owed += fee;
  loan.late = false;
  loan.graceLeft = 0;
  loan.dueIn = LOAN.periodMin;
  if (loan.missed < LOAN.maxMissed) {
    out.events.push({ msg: `You missed a loan payment. A late fee of ₦${fee.toLocaleString('en-US')} was added and your credit score dropped.`, entries: [entry('late_fee', 0, 0, `Late fee ₦${fee.toLocaleString('en-US')} (added to the loan)`)] });
    return out;
  }

  // Default: the bank takes your savings, then wallet cash above the protected amount. What is left becomes debt.
  let owed = loan.owed;
  const fromSavings = Math.min(bank.bal, owed);
  bank.bal -= fromSavings;
  owed -= fromSavings;
  const fromWallet = Math.min(Math.max(0, Math.floor(cash) - LOAN.protectCash), owed);
  owed -= fromWallet;
  bank.debt += owed;
  bank.loan = null;
  bank.defaults++;
  bank.lastLoanEnd = bank.ageMin;
  addScore(bank, CREDIT.defaulted);
  out.cash -= fromWallet;
  const entries = [];
  if (fromSavings) entries.push(entry('seized', -fromSavings, 0, 'Loan default: taken from savings'));
  if (fromWallet) entries.push(entry('seized', 0, -fromWallet, 'Loan default: taken from wallet'));
  if (!entries.length) entries.push(entry('default', 0, 0, 'Loan default'));
  out.events.push({
    msg: `You defaulted on your loan. The bank took ₦${(fromSavings + fromWallet).toLocaleString('en-US')}${owed ? ` and you still owe ₦${owed.toLocaleString('en-US')}. 40% of your shift pay goes to it until it is cleared` : ''}.`,
    entries, defaulted: true,
  });
  return out;
}

// ---------- What the screen shows ----------
export function bankInfo(bank, here) {
  const at = accountTier(bank);
  const ct = creditTier(bank.score);
  const nextTier = ACCOUNT_TIERS[ACCOUNT_TIERS.indexOf(at) + 1] || null;
  const loan = bank.loan
    ? {
        principal: bank.loan.principal, total: bank.loan.total, owed: Math.round(bank.loan.owed),
        installment: installmentOf(bank.loan), left: bank.loan.n - bank.loan.done, of: bank.loan.n,
        dueIn: Math.round(bank.loan.dueIn), late: bank.loan.late, missed: bank.loan.missed,
        graceLeft: Math.round(bank.loan.graceLeft),
      }
    : null;
  return {
    here,
    open: bank.open,
    bal: bank.bal,
    score: bank.score,
    scoreLabel: ct.label,
    tier: at.label,
    maxBalance: at.maxBalance,
    nextTier: nextTier ? { label: nextTier.label, inDays: Math.max(0, Math.ceil(nextTier.fromDays - bank.ageMin / DAY)) } : null,
    interestIn: bank.open ? Math.max(0, Math.round(DAY - bank.sinceInterest)) : 0,
    ratePerDay: BANK.ratePerDay,
    interestCap: BANK.interestCap,
    loan,
    debt: bank.debt,
    offers: here ? loanOffers(bank) : { ok: false, why: 'Go to the Bank to borrow.', options: [] },
    limits: { min: BANK.minTx, max: BANK.maxTx },
    garnish: LOAN.garnishRate,
  };
}