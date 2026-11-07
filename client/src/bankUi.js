// Adulthood: the Bank screen. Savings, interest, credit score, loans, debt, and the record of every movement.
// The server owns the truth (and decides every price, fee, and limit). This file only shows it and sends requests.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const naira = (n) => `₦${fmt(n)}`;
const DAY_MIN = 1440;

const KIND = {
  open: 'Account opened', deposit: 'Deposit', withdraw: 'Withdrawal', interest: 'Interest', loan: 'Loan paid out',
  loan_pay: 'Loan payment', auto_debit: 'Direct debit', late_fee: 'Late fee', seized: 'Taken by the bank', default: 'Loan default',
  debt_pay: 'Debt payment', garnish: 'Pay toward debt', sent: 'Money sent', received: 'Money received', hospital: 'Hospital', fine: 'Police fine', theft: 'Stolen cash',
};

export function initBank(socket) {
  let info = null;
  let msPerMin = 2500;   // real ms per game minute (from the clock)
  let offersSig = '';
  let ledgerSig = '';

  // "1.5 game days (about 1h 30m real)" from game minutes.
  function span(mins) {
    const m = Math.max(0, mins);
    const days = m / DAY_MIN;
    const real = Math.max(1, Math.round((m * msPerMin) / 60000));
    const realText = real >= 60 ? `${Math.floor(real / 60)}h ${String(real % 60).padStart(2, '0')}m` : `${real}m`;
    const dayText = days >= 1 ? `${Math.round(days * 10) / 10} game days` : `${Math.max(1, Math.round(m / 60))} game hours`;
    return `${dayText} (about ${realText} real time)`;
  }

  function paint() {
    if (!info) return;
    const i = info;
    // HUD row
    $('savings').textContent = i.open ? naira(i.bal) : 'No account';

    $('bankSavings').textContent = i.open ? naira(i.bal) : 'No account yet';
    $('bankTier').textContent = i.open ? `${i.tier} account (holds up to ${naira(i.maxBalance)})` : 'Open a free account to save and borrow.';
    $('bankScore').textContent = `${i.score} (${i.scoreLabel})`;
    $('bankScoreFill').style.width = `${Math.round(((i.score - 300) / 550) * 100)}%`;
    $('bankHere').hidden = i.here;
    $('bankOpenBtn').hidden = i.open;
    $('bankOpenBtn').disabled = !i.here;
    $('bankMoney').hidden = !i.open;
    for (const b of $('bankMoney').querySelectorAll('button')) b.disabled = !i.here;
    $('bankInterest').hidden = !i.open;
    $('bankInterest').textContent = i.open
      ? `Interest: ${(i.ratePerDay * 100).toFixed(1)}% a game day on savings above what you owe, for the first ${naira(i.interestCap)}. Next payout in ${span(i.interestIn)}.`
      : '';
    $('bankNext').hidden = !(i.open && i.nextTier);
    if (i.nextTier) $('bankNext').textContent = i.nextTier.inDays > 0 ? `Keep your account open ${i.nextTier.inDays} more game day${i.nextTier.inDays === 1 ? '' : 's'} to become ${i.nextTier.label} (bigger limit, bigger loans).` : '';

    // Loan
    const L = i.loan;
    $('loanBox').hidden = !i.open;
    $('loanActive').hidden = !L;
    $('loanOffers').hidden = Boolean(L) || !i.open;
    if (L) {
      $('loanOwed').textContent = `You owe ${naira(L.owed)}`;
      $('loanLeft').textContent = `${L.left} of ${L.of} payments left. Next payment ${naira(L.installment)}.`;
      $('loanDue').textContent = L.late
        ? `Payment is due now! Pay at the Bank or put ${naira(L.installment)} in savings within ${span(L.graceLeft)}.`
        : `Next payment due in ${span(L.dueIn)}. The bank takes it from your savings if there is enough.`;
      $('loanDue').style.color = L.late ? 'var(--bad)' : '';
      $('loanMissed').hidden = !L.missed;
      $('loanMissed').textContent = L.missed ? `You have missed ${L.missed} payment${L.missed === 1 ? '' : 's'}. Missing another is a default.` : '';
      $('loanInstBtn').textContent = `Pay ${naira(L.installment)}`;
      $('loanPayoffBtn').textContent = `Pay off ${naira(L.owed)}`;
      for (const b of [$('loanInstBtn'), $('loanPayoffBtn')]) b.disabled = !i.here;
    } else if (i.open) {
      const sig = JSON.stringify([i.offers, i.here]);
      if (sig !== offersSig) {
        offersSig = sig;
        const box = $('loanOffersList');
        box.replaceChildren();
        if (!i.offers.ok) box.append(el('div', 'fine', i.offers.why));
        for (const o of i.offers.options) {
          const row = el('div', 'loanOffer');
          const info2 = el('div');
          info2.append(
            el('div', 'skillName', naira(o.amount)),
            el('div', 'billWho', `Fee ${naira(o.fee)} (${Math.round(o.rate * 100)}%). Repay ${naira(o.total)} in 4 parts of ${naira(o.installment)}.`),
          );
          const b = el('button', 'mini hot', 'Borrow');
          b.disabled = !i.here;
          b.addEventListener('click', () => socket.emit('loanTake', o.amount));
          row.append(info2, b);
          box.append(row);
        }
      }
    }

    // Debt
    $('debtBox').hidden = !(i.debt > 0);
    if (i.debt > 0) {
      $('debtText').textContent = `You still owe ${naira(i.debt)} from a loan you defaulted on. ${Math.round(i.garnish * 100)}% of every shift's pay goes to it. You cannot borrow until it is cleared.`;
      $('debtBtn').disabled = !i.here;
    }

    // Record
    const sig = JSON.stringify(i.ledger);
    if (sig !== ledgerSig) {
      ledgerSig = sig;
      const box = $('ledgerList');
      box.replaceChildren();
      if (!i.ledger.length) box.append(el('div', 'fine', 'Nothing yet.'));
      for (const l of i.ledger) {
        const row = el('div', 'ledgerRow');
        const amt = l.bal !== 0 ? l.bal : l.cash;
        const sign = amt > 0 ? '+' : amt < 0 ? '−' : '';
        const where = l.bal !== 0 ? 'savings' : l.cash !== 0 ? 'cash' : '';
        row.append(el('span', 'ledgerKind', `Day ${l.day}  ${KIND[l.kind] || l.kind}`), el('span', 'ledgerAmt', amt ? `${sign}${naira(Math.abs(amt))} ${where}` : ''));
        row.title = l.note || '';
        box.append(row);
      }
    }
  }

  socket.on('bank', (b) => {
    info = b;
    paint();
  });
  socket.on('clock', (c) => {
    if (c && Number.isFinite(c.msPerMin)) msPerMin = c.msPerMin;
  });

  // ----- Requests -----
  const amount = () => {
    const raw = $('bankAmount').value.replace(/[^0-9]/g, '');
    return raw ? Number(raw) : 0;
  };
  $('bankOpenBtn').addEventListener('click', () => socket.emit('bankOpen'));
  $('bankDepositBtn').addEventListener('click', () => socket.emit('bankDeposit', amount()));
  $('bankWithdrawBtn').addEventListener('click', () => socket.emit('bankWithdraw', amount()));
  $('loanInstBtn').addEventListener('click', () => socket.emit('loanPay', 'installment'));
  $('loanPayoffBtn').addEventListener('click', () => socket.emit('loanPay', 'payoff'));
  $('debtBtn').addEventListener('click', () => socket.emit('debtPay'));
  for (const b of document.querySelectorAll('#bankQuick button')) {
    b.addEventListener('click', () => {
      $('bankAmount').value = b.dataset.amt;
    });
  }

  // ----- Opening and closing -----
  function toggle() {
    const open = $('bankPanel').hidden;
    hideOtherPanels();
    $('bankPanel').hidden = !open;
    if (open) {
      offersSig = '';
      ledgerSig = '';
      paint();
    }
  }
  $('bankBtn').addEventListener('click', toggle);
  $('bankViewBtn').addEventListener('click', toggle);
  $('bankClose').addEventListener('click', () => ($('bankPanel').hidden = true));

  // The Bank button only shows while you are at the Bank. (The Bills panel has a link that opens it for looking from anywhere.)
  socket.on('me', (m) => {
    const atBank = m.room === 'bank';
    $('bankBtn').hidden = !atBank;
  });

  return {
    reset() {
      info = null;
      offersSig = '';
      ledgerSig = '';
      $('bankPanel').hidden = true;
      $('bankBtn').hidden = true;
      $('savings').textContent = '-';
      $('bankAmount').value = '';
    },
  };
}