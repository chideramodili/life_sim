// Adulthood: the list of every side panel. Only one is open at a time on a phone.
// When you add a new panel, add its id here and nowhere else.
export const PANEL_IDS = [
  'sheet', 'journal', 'map', 'chatPanel', 'lookPanel', 'billsPanel', 'skillsPanel', 'jobsPanel', 'peoplePanel', 'carsPanel', 'phonePanel', 'bankPanel', 'storePanel', 'decoPanel', 'boutiquePanel', 'wardrobePanel', 'friendsPanel', 'trainPanel', 'finesPanel', 'cityPanel', 'bizPanel', 'interviewPanel', 'gamePanel', 'radioPanel', 'laptopPanel',
];

// Close every panel except the one named (if any).
export function hideOtherPanels(except = null) {
  for (const id of PANEL_IDS) {
    if (id === except) continue;
    const e = document.getElementById(id);
    if (e) e.hidden = true;
  }
}
