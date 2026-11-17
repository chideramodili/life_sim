// Adulthood: leaderboards. Rules only: given every player's numbers, work out the top 10 of each board and where one player stands.
import { levelNow } from './progress.js';

export const BOARDS = [
  { id: 'level', title: 'Highest level', icon: '⭐', val: (r) => r.xp, show: (r) => `Level ${r.lvl}` },
  { id: 'rich', title: 'Richest', icon: '💰', val: (r) => r.wealth, show: (r) => '₦' + Math.round(r.wealth).toLocaleString('en-NG') },
  { id: 'deliv', title: 'Top couriers', icon: '🚚', val: (r) => r.deliv, show: (r) => `${r.deliv} deliveries` },
  { id: 'taxi', title: 'Top taxi drivers', icon: '🚕', val: (r) => r.fares, show: (r) => `${r.fares} fares` },
  { id: 'chests', title: 'Treasure hunters', icon: '🧰', val: (r) => r.chests, show: (r) => `${r.chests} chests` },
];
// rows: [{ id, name, cash, bank }] where bank is a parsed bank object (bank.bal, bank.prog).
export function rowOf(u) {
  const pr = (u.bank && u.bank.prog) || null;
  const st = (pr && pr.st) || {};
  return { id: u.id, name: u.name, xp: pr ? pr.xp : 0, lvl: pr ? levelNow(pr) : 1, wealth: (u.cash || 0) + ((u.bank && u.bank.bal) || 0), deliv: st.deliv || 0, fares: st.fares || 0, chests: st.chests || 0 };
}
export function buildBoards(users, meId, top = 10) {
  const rows = users.map(rowOf);
  return BOARDS.map((b) => {
    const sorted = rows.filter((r) => b.val(r) > 0).sort((x, y) => b.val(y) - b.val(x) || x.name.localeCompare(y.name));
    const myIdx = sorted.findIndex((r) => r.id === meId);
    return { id: b.id, title: b.title, icon: b.icon, total: sorted.length, top: sorted.slice(0, top).map((r, i) => ({ rank: i + 1, name: r.name, text: b.show(r), me: r.id === meId })), me: myIdx >= 0 ? { rank: myIdx + 1, text: b.show(sorted[myIdx]) } : null };
  });
}
