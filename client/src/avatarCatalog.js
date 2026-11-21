// Adulthood: what a player can pick in the avatar creator (Ara 3D Gen settings). Each item is free or premium.
// `prem: true` means it is meant to be sold for real money / unlocked. In this test page nothing is enforced: when the server side
// is built, the server must check ownership (never trust the browser) before an avatar with a premium item is saved.
const T = (id) => id.replace(/^set_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const mk = (ids, prem = []) => ids.map((id) => ({ id, label: T(id), prem: prem.includes(id) }));

export const ANIMS = [
  ['idle', 'Stand'], ['walk', 'Walk'], ['run', 'Run'], ['sit_idle', 'Sit'], ['sleep', 'Sleep'], ['wave', 'Wave'], ['dance_groove', 'Dance'],
  ['texting', 'Phone'], ['sweep', 'Sweep'], ['drive_car', 'Drive'],
];

export const CAT = {
  hair: mk(['none', 'afro01', 'short01', 'short02', 'short03', 'short04', 'buzz', 'cornrows', 'bob01', 'long01', 'ponytail01', 'box_braids', 'braid01', 'mohawk', 'bob02'], ['box_braids', 'braid01', 'mohawk', 'bob02']),
  facialHair: mk(['none', 'stubble', 'mustache', 'mustache_stubble', 'goatee', 'short_beard', 'full_beard'], ['goatee', 'full_beard']),
  outfit: mk(['none', 'male_casualsuit01', 'male_casualsuit02', 'male_casualsuit03', 'male_casualsuit04', 'male_casualsuit05', 'male_casualsuit06', 'male_worksuit01', 'female_casualsuit01', 'female_casualsuit02', 'female_sportsuit01', 'set_street_tee_jeans', 'male_elegantsuit01', 'female_elegantsuit01', 'set_suit_tie', 'set_pantsuit', 'set_pastel_suit', 'set_thobe', 'set_ankara_gown', 'set_ankara_peplum', 'set_aso_ebi', 'set_cocktail_dress', 'set_wedding_gown'],
    ['male_elegantsuit01', 'female_elegantsuit01', 'set_suit_tie', 'set_pantsuit', 'set_pastel_suit', 'set_thobe', 'set_ankara_gown', 'set_ankara_peplum', 'set_aso_ebi', 'set_cocktail_dress', 'set_wedding_gown']),
  top: mk(['none', 'tank_top', 'singlet', 'oversized_tee', 'camp_shirt', 'tropical_short_shirt', 'silk_blouse', 'lace_top', 'peplum_top', 'tunic', 'long_tunic', 'football_shirt', 'basketball_jersey', 'school_shirt', 'thobe', 'suit_shirt_tie', 'ankara_gown'], ['silk_blouse', 'lace_top', 'peplum_top', 'long_tunic', 'thobe', 'suit_shirt_tie', 'ankara_gown']),
  jacket: mk(['none', 'racing_jacket', 'biker_vest', 'fur_jacket', 'suit_jacket', 'overcoat'], ['fur_jacket', 'suit_jacket', 'overcoat']),
  bottom: mk(['none', 'briefs', 'cargo_shorts', 'resort_shorts', 'cargo_pants', 'trousers', 'baggy_jeans', 'wrapper_long', 'wrapper_knee', 'pencil_skirt_midi', 'pencil_skirt_maxi', 'fitted_mini_skirt', 'suit_trousers'], ['wrapper_long', 'pencil_skirt_maxi', 'suit_trousers']),
  shoes: mk(['none', 'sandals', 'flipflops', 'slides', 'sneakers', 'shoes01', 'shoes02', 'shoes03', 'loafers', 'oxfords', 'heels', 'combat_boots'], ['loafers', 'oxfords', 'heels']),
  hat: mk(['none', 'baseball_cap', 'fedora01', 'fedora_cocked'], ['fedora01', 'fedora_cocked']),
  earrings: mk(['none', 'studs', 'small_hoops', 'big_hoops', 'pearl_drops'], ['big_hoops', 'pearl_drops']),
  accessories: mk(['watch', 'watch_silver', 'watch_gold', 'belt', 'bead_necklace', 'cowrie_necklace', 'wrist_beads', 'bangles', 'gold_ring', 'gold_necklace', 'gold_necklace_long', 'gold_chains', 'cuban_chain', 'pearl_necklace', 'fine_pendant', 'silver_cross', 'gele', 'fila_cap', 'beret', 'sunglasses', 'sunglasses_sleek', 'aviators', 'headphones', 'neck_scarf', 'bead_collar', 'coral_beads'],
    ['watch_gold', 'gold_necklace', 'gold_necklace_long', 'gold_chains', 'cuban_chain', 'pearl_necklace', 'gele', 'aviators', 'sunglasses_sleek', 'coral_beads']),
  tattoos: mk(['armband_l', 'sleeve_r', 'forearm_l', 'chest', 'back', 'face_marks'], ['armband_l', 'sleeve_r', 'forearm_l', 'chest', 'back', 'face_marks']),
  eyes: mk(['darkbrown', 'blackbrown', 'brown', 'brownlight', 'green', 'grey', 'lightblue', 'blue', 'ice']),
  eyebrows: mk(['none', 'eyebrow001', 'eyebrow002', 'eyebrow003', 'eyebrow004', 'eyebrow005', 'eyebrow006']),
};

export const COLOURS = ['#1a1209', '#3b2314', '#6b4423', '#a0703a', '#c9a24a', '#8a8a8a', '#d6d6d6', '#b3261e', '#2f6fdf', '#2e9e5b', '#8a3ffc', '#ff7eb6', '#ffffff', '#111111'];

// Settings every new avatar starts from. Players are 18+ in this game.
export const START = { name: 'Player', ageYears: 25, gender: 0.5, height: 0.5, weight: 0.5, muscle: 0.4, proportions: 0.5, african: 1, asian: 0, caucasian: 0, skin: 'auto', hair: 'short01', eyes: 'darkbrown', outfit: 'male_casualsuit01', shoes: 'sneakers', detail: 'low' };

// Items in a params object that need to be bought.
export function premiumUsed(p) {
  const out = [];
  const chk = (k, id) => { const it = CAT[k] && CAT[k].find((x) => x.id === id); if (it && it.prem) out.push(it.label); };
  for (const k of ['hair', 'facialHair', 'outfit', 'top', 'jacket', 'bottom', 'shoes', 'hat', 'earrings']) chk(k, p[k]);
  for (const id of p.accessories || []) chk('accessories', id);
  for (const id of p.tattoos || []) chk('tattoos', id);
  return out;
}
