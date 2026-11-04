// Adulthood: the cities and how they connect. Rules only (no network, no database).
// Every city is its own map: its own roads, buildings, traffic and police. Players in different cities never see each other.
// Lagos, Abuja and Enugu lie in a line. You can drive your own car from one city to the next one along the highway,
// or take the coach or a flight from the Central Terminal to any city.
export const CITIES = {
  lagos: {
    id: 'lagos', name: 'Lagos', seed: 20260, order: 0,
    theme: { grass: '#4f7a3a', tints: ['#ffffff', '#f3e3d0', '#dfe9f2', '#f2d9d0', '#e6f0dc', '#e9e2f4'],
      look: { pave: '#a8a39a', road: '#3a3a3f', roof: '#8a3f30', parks: ['#4f8a3c', '#5f9a48', '#6aa44f'], hscale: {}, landmarks: ['lagoon'] } },
  },
  abuja: {
    id: 'abuja', name: 'Abuja', seed: 41001, order: 1,
    theme: { grass: '#5d8f45', tints: ['#ffffff', '#f4efe6', '#e8eef2', '#eeeeee', '#f6f1dc', '#e3ece4'],
      look: { pave: '#ddd8cc', road: '#2c2f36', roof: '#ece6d6', parks: ['#3f9a47', '#56b050', '#69bb5a'], hscale: { tower: 0.7, office: 0.75, apt: 0.85 }, landmarks: ['rock', 'domes'], lots: { max: 20, gap: 12 } } },
  },
  enugu: {
    id: 'enugu', name: 'Enugu', seed: 77013, order: 2,
    theme: { grass: '#7d8a3c', tints: ['#f0d9c0', '#e8c9a8', '#d9e4d0', '#f2e0cc', '#cfdde8', '#e9d4c4'],
      look: { pave: '#b88a68', road: '#4a3f3b', roof: '#a23c20', parks: ['#6a9a3a', '#86a944', '#9ab04c'], hscale: { tower: 0.5, office: 0.6, apt: 0.8 }, landmarks: ['hills', 'headframe'], lots: { max: 24, gap: 12 } } },
  },
};
export const CITY_IDS = Object.keys(CITIES);
export const DEFAULT_CITY = 'lagos';
export const isCity = (id) => typeof id === 'string' && Object.hasOwn(CITIES, id);
export const parseCity = (id) => (isCity(id) ? id : DEFAULT_CITY);

// Intercity tickets. Distance is how many cities apart (1 or 2). Prices and times are placeholders to tune.
export const TICKETS = {
  coach:  { label: 'Coach',  venue: 'terminal', cost: (d) => 6000 * d,          secs: (d) => 40 * d, text: 'Cheap and slow.' },
  flight: { label: 'Flight', venue: 'airport', cost: (d) => 35000 + 10000 * d, secs: () => 12,       text: 'Fast, and it costs more.' },
};
export const MOVE_FEE = Number(process.env.MOVE_FEE) || 25000; // moving your home to another city
export const TICKET_IDS = Object.keys(TICKETS);
export const distanceBetween = (a, b) => (isCity(a) && isCity(b) ? Math.abs(CITIES[a].order - CITIES[b].order) : 0);
export function ticketQuote(method, from, to) {
  if (!Object.hasOwn(TICKETS, method)) return null;
  const d = distanceBetween(from, to);
  if (!d) return null;
  return { method, from, to, cost: TICKETS[method].cost(d), secs: TICKETS[method].secs(d) };
}

// The highway. Each city has a gate at each end of its main boulevard. Driving out of the east gate takes you to the
// next city along (and you arrive at its west gate), and the other way round. The cities at the ends have only one gate.
export const HIGHWAY = { secs: Number(process.env.HIGHWAY_SECS) || 60, fuel: 3000, gateDepth: 6 };
export function neighbour(cityId, side) {
  if (!isCity(cityId)) return null;
  const want = CITIES[cityId].order + (side === 'east' ? 1 : -1);
  return CITY_IDS.find((id) => CITIES[id].order === want) || null;
}
// Which gate (if any) is this position in? bx is the city half-width. Returns 'east', 'west' or null.
export function gateAt(x, z, bx) {
  if (Math.abs(z) > 7) return null;
  if (x >= bx - HIGHWAY.gateDepth) return 'east';
  if (x <= -(bx - HIGHWAY.gateDepth)) return 'west';
  return null;
}
// Where you appear when you come out of a gate: just inside the opposite end, facing inwards.
export function arrivalFrom(side, bx) {
  return side === 'east' ? { x: -(bx - HIGHWAY.gateDepth - 4), z: 3, ry: Math.PI / 2 } : { x: bx - HIGHWAY.gateDepth - 4, z: -3, ry: -Math.PI / 2 };
}
