// Adulthood: browser client.
// It draws what the server says and sends requests. It never decides the truth.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { io } from 'socket.io-client';
import { initStory } from './storyUi.js';
import { initChat } from './chatUi.js';
import { initLook } from './settingsUi.js';
import { initWorld } from './worldUi.js';
import { initLife } from './lifeUi.js';
import { initSocial } from './socialUi.js';
import { loadModel, whenModelReady, attachModel, animateModel, applyLook } from './model.js';
import { decodeLook2 } from './person2.js';
import { openCreator } from './creator.js';
import { loadNpc } from './npc.js';
import { initRadio } from './radio.js';
import { initLaptops } from './laptopUi.js';
import { initPhones } from './phoneUi.js';
import { initHud } from './hudUi.js';
import { createMapUi, iconOf } from './mapUi.js';
import { initIntercity } from './intercityUi.js';
import { initBiz } from './bizUi.js';
import { initInterview } from './interviewUi.js';
import { initGames } from './gamesUi.js';
import { createCabin, makeWorldBus } from './cabin.js';
import { initBank } from './bankUi.js';
import { initHome } from './homeUi.js';
import { initFashion } from './fashionUi.js';
import { makeVehicle, loadCar, carReady, carClone, spinWheels } from './vehicles.js';
import { dressAvatar } from './outfit.js';
import { initPhoto } from './photo.js';
import { createCity } from './street.js';
import { createInterior } from './interior.js';
import { initFriends } from './friendsUi.js';
import { initCrime } from './crimeUi.js';
import { initVisit } from './visitUi.js';
import { initControls } from './controls.js';
import { createFurniture } from './furniture.js';
import { hideOtherPanels } from './panels.js';
import { BRAND, renderLogo } from './brand.js';

// Where the game server lives. While developing it is port 3001 on the same computer.
// In the built game the server also serves the page, so it is the same address.
const SERVER = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? `http://${location.hostname}:3001` : location.origin);

// The login token is kept per browser tab, so you can log in as a different player in each tab
// while testing. To keep players logged in after closing the tab, switch this to localStorage.
const TOKEN_KEY = 'lifesim-token';
let token = sessionStorage.getItem(TOKEN_KEY);

const socket = io(SERVER, { autoConnect: false, auth: (cb) => cb({ token }) });
const storyUi = initStory(socket);
const chatUi = initChat(socket);
const world = initWorld(socket);
const life = initLife(socket);
const social = initSocial(socket);
const phonesUi = initPhones(socket);
const radioUi = initRadio();
const laptopsUi = initLaptops(socket);
const intercityUi = initIntercity(socket);
const bizUi = initBiz(socket);
initInterview(socket);
const gamesUi = initGames(socket, { names: () => [...avatars.entries()].filter(([id]) => id !== myId).map(([, a]) => a.group.userData.name || a.name).filter(Boolean), myName: () => '' });
const bank = initBank(socket);

const $ = (id) => document.getElementById(id);
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// ---------- Scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // easier on weak phones
renderer.setSize(window.innerWidth, window.innerHeight);
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const furniture = createFurniture(scene);
const interior = createInterior(scene);
let fashionCat = null;
const fashionUi = initFashion(socket, { onCatalog: (c) => { fashionCat = c; for (const a of avatars.values()) a.group.userData.lookKey = null; } });
const friendsUi = initFriends(socket);
initCrime(socket);
initVisit(socket);
let ownHome = null, visitData = null, friendHomes = [];
const homeUi = initHome(socket, { onData: (h) => { ownHome = h; if (currentRoom !== 'friendhome') furniture.set(h); }, onSelect: (uid) => furniture.select(uid) });
let lastLight = -1;
let baseBg = new THREE.Color('#2b1b3d'); // the style's background. The day/night tint is applied on top of it.
scene.background = baseBg.clone();

// The Look panel: the player's style, accent color, and text size. The 3D background follows the style.
const look = initLook(socket, (colors) => {
  baseBg = new THREE.Color(colors.bg);
  lastLight = -1; // repaint the sky with the new style
});
const hudUi = initHud(socket, look);
document.title = BRAND.name;
renderLogo($('logoAuth'));

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 700);
camera.position.set(0, 16, 16);

// Drag to rotate, scroll or pinch to zoom. Panning is off so the room stays centered.
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enablePan = false;
controls.enableDamping = true;
controls.minDistance = 8;
controls.maxDistance = 50;
controls.minPolarAngle = 0.3;
controls.maxPolarAngle = 1.35; // keeps the camera above the floor
controls.update();

const hemi = new THREE.HemisphereLight(0xffffff, 0x444466, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(5, 10, 5);
scene.add(sun);

// Day and night. The server's clock decides how bright the world is. A home with no power stays dark.
const NIGHT_BG = new THREE.Color('#070a24');
const NIGHT_SUN = new THREE.Color('#8fa8ff');
const DAY_SUN = new THREE.Color('#ffffff');
function applyDaylight() {
  let d = world.daylight();
  if (currentRoom === 'home' && world.noPower()) d = Math.min(d, furniture.hasLamp() ? 0.3 : 0.05); // lights out (a lamp helps a little)
  else if ((currentRoom === 'home' || currentRoom === 'friendhome') && !furniture.lightsOn()) d = Math.min(d, 0.12); // the light switch is off
  d = Math.round(d * 100) / 100;
  if (d === lastLight) return;
  lastLight = d;
  scene.background = baseBg.clone().lerp(NIGHT_BG, (1 - d) * 0.75);
  hemi.intensity = 0.55 + 1.05 * d;
  sun.intensity = 0.2 + 1.0 * d;
  sun.color.copy(NIGHT_SUN).lerp(DAY_SUN, d);
  if (street) street.setLight(d);
  if (scene.fog) scene.fog.color.copy(scene.background);
}


// ---------- Rooms ----------
let ground = null;
let grid = null;
const decor = new THREE.Group();
scene.add(decor);
let currentRoom = null;

function textSprite(text, color, width, height, fontPx) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, width, height);
  g.fillStyle = color;
  g.font = `bold ${fontPx}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, width / 2, height / 2 + 4);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
}

// Build the ground, four corner pillars, and a name sign for a room.
let snapCam = false;
let street = null; // the Main Street scene while you are on it
let roomInfoNow = null;
function buildRoom(info) {
  setFpv(false);
  roomInfoNow = info;
  snapCam = true;
  $('fpvBtn').hidden = Boolean(info.city);
  if (ground) scene.remove(ground);
  if (grid) scene.remove(grid);
  ground = null;
  grid = null;
  if (street) {
    scene.remove(street.group);
    street.dispose();
    street = null;
  }
  decor.clear();
  doorAnims.length = 0;
  scene.fog = null;
  if (info.city) {
    // The outdoor hub: a long road with a building and a door for every place.
    interior.hide();
    street = createCity(info);
    scene.add(street.group);
    street.setFriendHomes(friendHomes);
    bizUi.setStreet(street, info.cityId || 'lagos');
    scene.fog = new THREE.Fog(scene.background, 150, 380);
    lastLight = -1;
    return;
  }
  // Buildings are real rooms: walls, windows, floors, props, and people (interior.js). Your Home also gets a fence and garden.
  interior.show(info.id === 'friendhome' ? 'home' : info.id === 'biz' ? `biz_${info.bizKind || 'cafe'}` : info.id, info.bizStaff);
  const sign = textSprite(info.id === 'friendhome' ? `${info.hostName || 'A friend'}'s Home`.slice(0, 22) : info.name, info.accent, 512, 128, 72);
  sign.scale.set(5, 1.25, 1);
  sign.position.set(0, 3.1, -9.6);
  if (info.id !== 'home') decor.add(sign);
  if (info.exit) {
    // The way out: a glowing door on the south edge. Walk up to it and tap "Go outside".
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3, 3.2, 0.3), new THREE.MeshStandardMaterial({ color: info.accent, emissive: info.accent, emissiveIntensity: 0.5 }));
    frame.position.set(info.exit.x, 1.6, info.exit.z + 0.3);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 0.34), new THREE.MeshStandardMaterial({ color: '#1d1a24' }));
    inner.position.set(info.exit.x, 1.4, info.exit.z + 0.3);
    const exitSign = textSprite('Exit', '#ffffff', 256, 96, 56);
    exitSign.scale.set(2.4, 0.9, 1);
    exitSign.position.set(info.exit.x, 3.7, info.exit.z + 0.3);
    // The door leaf: hinged on one side, swings into the room when anyone walks up to it.
    const hinge = new THREE.Group();
    hinge.position.set(info.exit.x - 1.2, 0, info.exit.z + 0.1);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 0.1), new THREE.MeshStandardMaterial({ color: '#2a2433', roughness: 0.35, metalness: 0.2 }));
    leaf.position.set(1.2, 1.4, 0);
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.2), new THREE.MeshStandardMaterial({ color: '#d8d8e0', metalness: 0.8, roughness: 0.3 }));
    knob.position.set(2.05, 1.3, 0);
    hinge.add(leaf, knob);
    decor.add(frame, inner, exitSign, hinge);
    doorAnims.push({ hinge, x: info.exit.x, z: info.exit.z - 1, reach: 2.6, sign: 1, open: 0 });
  }
  if (info.id === 'home' || info.id === 'friendhome') {
    // The front gate of the plot (pillars are at x = -1.7 and 1.7, z = 13): two gold leaves that swing inward.
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(s * 1.55, 0, 13);
      const bars = new THREE.Group();
      const gold = new THREE.MeshStandardMaterial({ color: '#c9a227', metalness: 0.6, roughness: 0.4 });
      const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), gold); frameTop.position.set(-s * 0.75, 1.5, 0);
      const frameLow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), gold); frameLow.position.set(-s * 0.75, 0.4, 0);
      bars.add(frameTop, frameLow);
      for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.05), gold); b.position.set(-s * (0.12 + i * 0.25), 0.95, 0); bars.add(b); }
      hinge.add(bars);
      decor.add(hinge);
      doorAnims.push({ hinge, x: 0, z: 13, reach: 3.2, sign: -s, open: 0 });
    }
  }
}
const doorAnims = []; // hinged doors in the current room: { hinge, x, z, reach, sign, open }
function updateDoors(dt) {
  for (const d of doorAnims) {
    let near = false;
    for (const a of avatars.values()) if (Math.hypot(a.group.position.x - d.x, a.group.position.z - d.z) < d.reach) { near = true; break; }
    d.open += ((near ? 1 : 0) - d.open) * (1 - Math.exp(-dt * (near ? 5 : 3)));
    d.hinge.rotation.y = d.sign * d.open * 1.6;
  }
}

// ---------- Players ----------
const avatars = new Map(); // id -> { group, target }
const walkInput = initControls({ socket, getMe: () => avatars.get(myId), orbit: controls, camera });
let myId = null;

function makeAvatar(color, isMe, name) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.0, 16), new THREE.MeshStandardMaterial({ color }));
  body.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), new THREE.MeshStandardMaterial({ color: '#f1c9a5' }));
  head.position.y = 1.3;
  group.add(body, head);
  // Arms: they hang at the sides, and swing while the person is on a shift.
  const armMat = new THREE.MeshStandardMaterial({ color: '#f1c9a5' });
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.46, 1.0, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), armMat);
    arm.position.y = -0.3;
    pivot.add(arm);
    group.add(pivot);
    return pivot;
  });
  group.userData.arms = arms;
  group.userData.legacy = [body, head, ...arms];
  const tag = textSprite(name, isMe ? '#ffc857' : '#ffffff', 256, 64, 36);
  tag.scale.set(2.2, 0.55, 1);
  tag.position.y = 2.1;
  group.add(tag);
  if (isMe) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);
  }
  scene.add(group);
  return group;
}

function clearAvatars() {
  for (const a of avatars.values()) scene.remove(a.group);
  avatars.clear();
}

let travelTable = {};
socket.on('welcome', ({ id, username, travel, needs, actions, needLook }) => {
  myId = id;
  if (needLook) setTimeout(firstLook, 400);
  travelTable = travel;
  $('player').textContent = username;
  buildNeeds(needs, actions);
});

// Rush Hour (and other events) change prices and times, so the server sends a fresh table.
socket.on('travel', (t) => {
  travelTable = t;
  lastSig = '';
  renderMap();
});

socket.on('room', (info) => {
  if (cabin.active && !cabinBusy) { wantCabin = null; leaveCabin(); }
  currentRoom = info.id;
  clearAvatars();
  buildRoom(info);
  furniture.show(info.id === 'home' || info.id === 'friendhome');
  if (info.id === 'friendhome') { if (visitData) furniture.set(visitData); }
  else { visitData = null; if (ownHome) furniture.set(ownHome); }
  $('where').textContent = info.cityName && info.id !== 'street' ? `${info.name} · ${info.cityName}` : info.name;
  lastLight = -1;
  refreshActions();
  lastSig = '';
  renderMap();
});

socket.on('visitHome', (h) => { visitData = h; if (currentRoom === 'friendhome') furniture.set(h); });
socket.on('friendHomes', (list) => { friendHomes = Array.isArray(list) ? list : []; if (street) street.setFriendHomes(friendHomes); });

socket.on('state', ({ room, players, cars, lvl, cops, ph }) => {
  if (room !== currentRoom) return;
  if (cars && street) street.setCars(cars);
  if (typeof ph === 'number' && street) street.setSignals(ph);
  syncCops(cops || []);
  if (typeof lvl === 'number' && street) street.setDensity(lvl);
  const seen = new Set();
  for (const p of players) {
    seen.add(p.id);
    let a = avatars.get(p.id);
    if (!a) {
      a = { group: makeAvatar(p.color, p.id === myId, p.name), target: new THREE.Vector3(p.x, 0, p.z) };
      a.group.position.set(p.x, 0, p.z);
      a.last = new THREE.Vector3(p.x, 0, p.z); a.speed = 0; a.heading = 0;
      a.name = p.name;
      avatars.set(p.id, a);
      const grp = a.group; const bd = p.b ? 'woman' : 'man'; const v2 = p.v2 ? decodeLook2(p.v2) : null; whenModelReady(() => attachModel(grp, bd, v2));
    }
    a.target.set(p.x, 0, p.z);
    const v2 = p.v2 ? decodeLook2(p.v2) : null;
    if (p.id === myId && v2) myLook = v2;
    { const bd = p.b ? 'woman' : 'man'; const gm = a.group.userData.model; if (gm && (gm.body !== bd || (v2 && (!gm.p2 || gm.p2.g !== v2.g)) || (!v2 && gm.p2))) attachModel(a.group, bd, v2); }
    applyLook(a.group, v2 ? { v2 } : { eyes: p.e || 'brown', skin: p.s || 0, hair: p.h || 'brown', style: p.y || 'original', face: p.f });
    a.group.userData.baseColor = p.color;
    dressAvatar(a.group, p.look, fashionCat);
    a.working = Boolean(p.work);
    a.group.userData.work = typeof p.work === 'string' ? { style: p.work, face: p.wf != null ? p.wf : null } : null;
    a.sit = Boolean(p.sit);
    a.lying = Boolean(p.lie);
    a.exercise = p.an || 0;
    // Riding: hide the person and show the vehicle they are in.
    if (p.ride) {
      if (a.vehKind !== p.ride || a.vehModel !== (p.rm || null)) {
        if (a.veh) scene.remove(a.veh);
        a.veh = p.rm ? makeVehicle('car', p.rm) : p.id === myId && (p.ride === 'bus' || p.ride === 'taxi' || p.ride === 'car') ? makeWorldBus(1 + (Date.now() % 997), p.ride) : makeVehicle(p.ride);
        a.vehKind = p.ride; a.vehModel = p.rm || null;
        a.veh.position.copy(a.group.position);
        a.veh.rotation.y = p.ry || 0;
        scene.add(a.veh);
      }
      a.ry = p.ry || 0;
      a.group.visible = p.ride === 'bike';   // on a motorbike you see the rider; in a car, bus or taxi you are inside
    } else if (a.veh) {
      scene.remove(a.veh);
      a.veh = null;
      a.vehKind = null; a.vehModel = null;
      a.group.visible = true;
    }
  }
  for (const [id, a] of avatars) {
    if (!seen.has(id)) {
      if (a.veh) scene.remove(a.veh);
      scene.remove(a.group);
      avatars.delete(id);
    }
  }
});

// ---------- Driving ----------
let meDriving = false, driveCockpit = null;
function updateDrive(m) {
  const on = !!m.drive;
  driveCockpit = on && m.drive.cockpit ? m.drive.cockpit : null;
  if (on !== meDriving) { meDriving = on; walkInput.setDriving(on); if (!on) setSeatView(false); }
  $('seatBtn').hidden = !on;
  const onStreet = currentRoom === 'street' && !m.trip && !m.jail;
  const owns = Array.isArray(m.owns) && m.owns.length > 0;
  $('driveBtn').hidden = on || !onStreet || !owns;
  $('parkBtn').hidden = !on;
  $('speedo').hidden = !on;
  if (on) $('speedo').textContent = `${m.drive.kmh} km/h`;
  const w = m.wanted;
  $('wantedBanner').hidden = !w;
  if (w) $('wantedBanner').textContent = `🚨 WANTED · ${w.cops} police car${w.cops === 1 ? '' : 's'} · escape or hide out of sight`;
}
$('driveBtn').onclick = () => socket.emit('drive', { on: true });
$('parkBtn').onclick = () => socket.emit('drive', { on: false });

loadModel();
loadNpc();
loadCar('police'); loadCar('taxi');
if (location.search.includes('dumpSolids')) window.__interior = interior;
if (location.search.includes('debug')) { window.__socket = socket; window.__three = { scene, camera, controls, renderer }; }

// ---------- Police cars ----------
const copCars = [];
function syncCops(list) {
  while (copCars.length < list.length) { const v = makeVehicle('police'); scene.add(v); copCars.push({ v, x: 0, z: 0, ry: 0, fresh: true }); }
  while (copCars.length > list.length) { const c = copCars.pop(); scene.remove(c.v); }
  list.forEach(([x, z, ry], i) => {
    const c = copCars[i];
    c.tx = x; c.tz = z; c.tr = ry;
    if (c.fresh) { c.x = x; c.z = z; c.ry = ry; c.fresh = false; }
  });
}
function updateCops(dt, t) {
  const k = 1 - Math.exp(-dt * 12);
  for (const c of copCars) {
    c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k;
    c.ry += ((((c.tr - c.ry) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * k;
    c.v.position.set(c.x, 0, c.z); c.v.rotation.y = c.ry;
    const L = c.v.userData.lights;
    if (L) { const on = Math.floor(t * 6) % 2 === 0; L[0].visible = on; L[1].visible = !on; }
  }
}

// ---------- Needs strip and needs sheet ----------
const needEls = {}; // need id -> the bars and labels to update
let needsSig = '';

function buildNeeds(defs, acts) {
  const strip = $('needsStrip');
  const body = $('sheetBody');
  strip.replaceChildren();
  body.replaceChildren();
  for (const k of Object.keys(needEls)) delete needEls[k];
  needsSig = '';
  for (const d of defs) {
    // small bar in the strip at the bottom of the screen
    const item = el('div', 'sitem');
    const sBar = el('div', 'sbar');
    const sFill = el('div', 'sfill');
    sBar.append(sFill);
    item.append(el('div', 'slab', d.label), sBar);
    strip.append(item);

    // full row in the sheet, with the button that fixes this need
    const row = el('div', 'nrow');
    const label = el('span', 'nlabel', d.label);
    const bar = el('div', 'nbar');
    const fill = el('div', 'nfill');
    bar.append(fill);
    const pct = el('span', 'npct', '0%');
    const btn = el('button', 'nbtn');
    btn.addEventListener('click', () => {
      if (btn.dataset.act) socket.emit('act', btn.dataset.act);
    });
    row.append(label, bar, pct, btn);
    body.append(row);
    needEls[d.id] = { sFill, fill, pct, label, btn };
  }
  actionDefs = acts;
  refreshActions();
}

// Each need has one button. A room can offer its own action instead (the club has Dance in place of Play).
let actionDefs = {};
function refreshActions() {
  for (const [needId, e] of Object.entries(needEls)) {
    const options = Object.entries(actionDefs).filter(([, a]) => a.need === needId);
    const entry = options.find(([k, a]) => a.onlyRoom && (a.onlyRoom === currentRoom || (k === 'sleep' && currentRoom === 'friendhome'))) || options.find(([, a]) => !a.onlyRoom);
    e.btn.hidden = !entry;
    e.btn.dataset.act = entry ? entry[0] : '';
    e.btn.textContent = entry ? `${entry[1].label}${entry[1].cost ? ' ₦' + fmt(entry[1].cost) : ''}` : '';
  }
}

function setMood(node, mood) {
  node.className = `pill ${mood.label}`;
  node.textContent = mood.label;
}

// Show the jobs, the Work buttons and the shift bar. A Work button only appears at the place where that job's shifts happen.
function workLabel(job) {
  const left = job.cooldownLeft;
  return !job.open
    ? `Closed (open ${job.hours})`
    : left > 0
      ? `Next shift in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
      : `${job.part ? 'Work part-time' : 'Work a shift'} (₦${fmt(job.pay)})`;
}
function updateJob(m) {
  const job = m.job, job2 = m.job2, job3 = m.job3;
  const titles = [job, job2, job3].filter(Boolean).map((j) => j.title);
  $('job').textContent = titles.length === 1 ? (job ? job.title : `${titles[0]} (part-time)`) : titles.length ? titles.join(' + ') : 'None';
  const busy = Boolean(m.shift);
  for (const [id, j, slot] of [['workBtn', job, 'main'], ['workBtn2', job2, 'part'], ['workBtn3', job3, 'extra']]) {
    const here = Boolean(j) && m.room === j.room && !busy && (j.room === 'home' || !j.cityId || !m.city || j.cityId === m.city.id);
    $(id).hidden = !here;
    if (here) {
      $(id).textContent = workLabel(j);
      $(id).onclick = () => socket.emit('work', { slot });
    }
  }
  $('shiftBar').hidden = !busy;
  if (busy) {
    const s = m.shift;
    $('shiftText').textContent = `Working… ${s.left}s left`;
    $('shiftFill').style.width = `${Math.round(((s.total - s.left) / s.total) * 100)}%`;
  }
}
$('shiftCancel').addEventListener('click', () => socket.emit('cancelShift'));

function updateNeeds(m) {
  const sig = JSON.stringify([m.needs, m.mood]);
  if (sig === needsSig) return; // nothing changed, skip the work
  needsSig = sig;
  for (const [id, v] of Object.entries(m.needs)) {
    const e = needEls[id];
    if (!e) continue;
    const low = v < 30;
    const color = low ? 'var(--danger)' : 'var(--hi)';
    e.sFill.style.width = `${v}%`;
    e.sFill.style.background = color;
    e.fill.style.width = `${v}%`;
    e.fill.style.background = color;
    e.pct.textContent = `${v}%`;
    e.label.style.color = low ? 'var(--bad)' : '';
  }
  setMood($('mood'), m.mood);
  setMood($('sheetMood'), m.mood);
}

$('needsStrip').addEventListener('click', () => {
  hideOtherPanels('sheet'); // one panel at a time on small screens
  $('sheet').hidden = !$('sheet').hidden;
});
$('chip').addEventListener('click', () => {
  $('chatPanel').hidden = true;
  $('lookPanel').hidden = true;
});
for (const id of ['chatBtn', 'mapBtn']) {
  $(id).addEventListener('click', () => hideOtherPanels(id === 'chatBtn' ? 'chatPanel' : 'map'));
}
$('sheetClose').addEventListener('click', () => ($('sheet').hidden = true));

// ---------- HUD and map ----------
// On a phone the info panel starts small (time, cash, mood, buttons). "More" shows the rest.
const hudEl = $('hud');
hudEl.classList.toggle('compact', window.matchMedia('(max-width: 600px)').matches);
$('hudMore').addEventListener('click', () => {
  const compact = hudEl.classList.toggle('compact');
  $('hudMore').textContent = compact ? 'More ▾' : 'Less ▴';
});
// Opening a panel on a phone tucks the info panel away, so nothing stacks on top of anything.
for (const id of ['mapBtn', 'chatBtn', 'lookBtn', 'billsBtn', 'skillsBtn', 'jobsBtn', 'peopleBtn', 'carsBtn', 'phoneBtn', 'laptopBtn', 'bankBtn', 'storeBtn', 'decoBtn', 'boutiqueBtn', 'wardrobeBtn', 'friendsBtn']) {
  $(id).addEventListener('click', () => {
    if (window.matchMedia('(max-width: 600px)').matches) {
      hudEl.classList.add('compact');
      $('hudMore').textContent = 'More ▾';
    }
  });
}
let noticeTimer = null;
let traveling = false;
let rooms = [];
const mapUi = createMapUi({
  socket,
  getPos: () => { const a = avatars.get(myId); return a && roomInfoNow && roomInfoNow.city ? { x: a.group.position.x, z: a.group.position.z, yaw: a.group.rotation.y } : null; },
  getRooms: () => rooms,
  getCurrentRoom: () => currentRoom,
  getMethod: () => method,
  onGo: (id, how) => socket.emit('travel', { to: id, method: how || method }),
});
window.addEventListener('adulthood-mapdata', () => { lastSig = ''; renderMap(); });
let method = 'bus';
let lastSig = '';

function notice(text) {
  $('notice').textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($('notice').textContent = 'Tap the ground to walk.'), 3000);
}

function renderMap() {
  if ($('map').hidden) return;
  // "closes in" only matters (and only changes the screen) in the last 30 minutes before closing.
  const sig = JSON.stringify([method, mapUi.state.plan ? 1 : 0, mapUi.state.selected, mapUi.state.home, rooms.map((r) => ({ ...r, closesIn: r.closesIn !== null && r.closesIn !== undefined && r.closesIn <= 30 ? r.closesIn : null })), currentRoom, travelTable]);
  if (sig === lastSig) return;
  lastSig = sig;
  const body = $('mapBody');
  body.replaceChildren();

  const chips = document.createElement('div');
  chips.className = 'chips';
  for (const [id, t] of Object.entries(travelTable)) {
    const b = document.createElement('button');
    b.className = 'chip' + (id === method ? ' on' : '');
    b.textContent = `${cap(id)} · ${t.cost ? '₦' + fmt(t.cost) : 'Free'} · ${t.seconds}s`;
    b.addEventListener('click', () => {
      method = id;
      renderMap();
    });
    chips.appendChild(b);
  }
  body.appendChild(chips);
  body.appendChild(mapUi.planNode(() => { lastSig = ''; renderMap(); }));
  body.appendChild(mapUi.detailNode(() => { lastSig = ''; renderMap(); }));
  body.appendChild(el('div', 'skillName planListHead', 'All places'));

  for (const r of rooms) {
    const line = document.createElement('div');
    line.className = 'dest';
    const label = document.createElement('span');
    label.textContent = `${iconOf(r.id)} ${r.solo ? r.name : `${r.name} · ${r.count}/${r.cap}`}`;
    // Opening hours (or the reason a place is shut) under the name.
    const sub = el('span', 'sub2', r.solo ? r.hours : r.open ? (r.hours === 'Always open' ? 'Always open' : `Open ${r.hours}${r.closesIn !== null && r.closesIn <= 30 ? ` · closes in ${r.closesIn} min` : ''}`) : `Closed · open ${r.hours}`);
    label.appendChild(sub);
    line.appendChild(label);
    if (r.id === currentRoom) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'You are here';
      line.appendChild(tag);
    } else if (!r.open) {
      const tag = el('span', 'tag closed', r.locked ? 'Locked' : 'Closed');
      line.appendChild(tag);
    } else if (!r.solo && r.count >= r.cap) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'Full';
      line.appendChild(tag);
    } else {
      const go = document.createElement('button');
      go.textContent = 'Go';
      go.addEventListener('click', () => socket.emit('travel', { to: r.id, method }));
      line.appendChild(go);
    }
    body.appendChild(line);
  }
}

socket.on('me', (m) => {
  updateDrive(m);
  updateNeeds(m);
  updateJob(m);
  $('cash').textContent = `₦${fmt(m.cash)}`;
  $('online').textContent = m.online;
  rooms = m.rooms;
  if (m.city) mapUi.ask(m.city.id);
  mapUi.follow(m);

  wantCabin = null; wantTrip = null;
  if (m.trip && !m.trip.ambulance) {
    wantTrip = { secs: m.trip.secs || 0, to: m.trip.to };
    if (cabin.active) cabin.setProgress(m.trip.progress);
    if (m.trip.ride) wantCabin = ['bus', 'taxi', 'car'].includes(m.trip.ride.k) && m.trip.ride.phase === 'ride' ? 'worldbus' : null;
    else wantCabin = CABIN_OF[m.trip.kind] || null;
  }
  syncCabin();
  if (m.trip && m.trip.ride) {
    // A ride on the street: stay in the city and watch it happen.
    $('map').hidden = true;
    $('trip').hidden = false;
    const w = m.trip.ride.phase === 'wait';
    $('tripText').textContent = w ? `Waiting for the ${m.trip.ride.k === 'taxi' ? 'taxi' : m.trip.ride.k === 'bus' ? 'bus' : 'ride'}… ${m.trip.ride.waitLeft}s` : `On the way to ${m.trip.to}…`;
    $('tripFill').style.width = `${Math.round(m.trip.progress * 100)}%`;
    $('skipRide').hidden = false;
    $('skipRide').textContent = 'Skip ride';
  } else if (m.walk && !m.trip) {
    // Walking on foot: you stay in the scene and walk there. Skip jumps to the door.
    $('trip').hidden = false;
    $('map').hidden = true;
    $('tripText').textContent = m.walk.stage === 'exit' ? `Heading out, then walking to ${m.walk.to}…` : `Walking to ${m.walk.to}…`;
    $('tripFill').style.width = `${Math.round(m.walk.progress * 100)}%`;
    $('skipRide').hidden = false;
    $('skipRide').textContent = 'Skip walk';
  } else if (m.trip) {
    $('skipRide').hidden = true;
    if (!traveling) {
      traveling = true;
      clearAvatars();
      $('map').hidden = true;
    }
    $('trip').hidden = false;
    $('tripText').textContent = m.trip.ambulance ? `Ambulance to ${m.trip.to}…` : m.trip.train ? `Express train to ${m.trip.to}…` : `Traveling to ${m.trip.to}…`;
    $('tripFill').style.width = `${Math.round(m.trip.progress * 100)}%`;
  } else {
    traveling = false;
    $('trip').hidden = true;
    $('skipRide').hidden = true;
  }
  renderMap();
});

socket.on('notice', notice);
socket.on('closing', () => interior.closeUp());
socket.on('full', () => notice('The room is full. Try again soon.'));

$('mapBtn').addEventListener('click', () => {
  $('map').hidden = !$('map').hidden;
  lastSig = '';
  renderMap();
});
$('mapClose').addEventListener('click', () => ($('map').hidden = true));

// ---------- Login, sign-up, password reset, and log out ----------
const AUTH_PAGES = ['auth', 'signupPage', 'loginPage', 'reset', 'recovery'];
function showPage(id) { for (const p of AUTH_PAGES) $(p).hidden = p !== id; }
// With a message (logged out, password changed...) go straight to the login page; otherwise the two-button start screen.
function showAuth(message = '', good = false) {
  showPage(message ? 'loginPage' : 'auth');
  $('authError').textContent = message;
  $('authError').className = good ? 'err good' : 'err';
  $('pass').value = '';
}

function startSession(t) {
  token = t;
  sessionStorage.setItem(TOKEN_KEY, token);
  for (const p of AUTH_PAGES) $(p).hidden = true;
  socket.connect();
}

function endSession(message) {
  socket.disconnect();
  token = null;
  sessionStorage.removeItem(TOKEN_KEY);
  clearAvatars();
  $('map').hidden = true;
  $('sheet').hidden = true;
  $('trip').hidden = true;
  traveling = false;
  storyUi.reset();
  chatUi.reset();
  world.reset();
  life.reset();
  social.reset();
  phonesUi.reset();
  laptopsUi.reset();
  bank.reset();
  homeUi.reset();
  fashionUi.reset();
  friendsUi.reset();
  showAuth(message);
}

// The recovery code screen. It is shown once, so the player must press the button to go on.
let afterCode = null;
function showRecovery(title, message, code, next) {
  showPage('recovery');
  $('recTitle').textContent = title;
  $('recMsg').textContent = message;
  $('codeText').textContent = code;
  $('copyCode').textContent = 'Copy code';
  afterCode = next;
}
$('copyCode').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('codeText').textContent);
    $('copyCode').textContent = 'Copied';
  } catch {
    $('copyCode').textContent = 'Copy it by hand';
  }
});
$('recContinue').addEventListener('click', () => {
  $('recovery').hidden = true;
  $('codeText').textContent = '';
  const next = afterCode;
  afterCode = null;
  if (next) next();
});

async function callApi(path, body) {
  const res = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// The character is made in the editor: when creating an account, and later from the Look panel.
let myLook = null;   // the new-generation look (set from the snapshot once chosen)
// Editing later: the body (man or woman) is locked, because it was chosen when the account was made.
$('lookEdit').addEventListener('click', () => openCreator({
  title: 'Edit your character', initial: myLook, lockBody: true,
  onSave: (l) => { myLook = l; socket.emit('setLook2', l); },
}));
// A brand-new account makes its character once, right after sign-up; it cannot be skipped.
function firstLook() {
  openCreator({
    title: 'Create your character', initial: myLook, required: true,
    onSave: (l) => { myLook = l; socket.emit('setLook2', l); },
  });
}
async function submitAuth() {
  const username = $('user').value.trim();
  const password = $('pass').value;
  $('authError').textContent = '';
  try {
    const { ok, data } = await callApi('/api/login', { username, password });
    if (!ok) {
      $('authError').className = 'err';
      $('authError').textContent = data.error || 'Something went wrong. Try again.';
      return;
    }
    startSession(data.token);
  } catch {
    $('authError').textContent = 'Cannot reach the server. Is it running?';
  }
}

async function submitSignup() {
  const username = $('suUser').value.trim(), email = $('suEmail').value.trim(), email2 = $('suEmail2').value.trim(), password = $('suPass').value;
  const err = (t) => { $('suError').textContent = t; };
  err('');
  if (!/^\w{3,16}$/.test(username)) return err('Username must be 3 to 16 letters, numbers, or underscores.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err('Enter a valid email address.');
  if (email.toLowerCase() !== email2.toLowerCase()) return err('The two email addresses do not match.');
  if (password.length < 8) return err('Password must be 8 or more characters.');
  try {
    const { ok, data } = await callApi('/api/signup', { username, password, email });
    if (!ok) return err(data.error || 'Something went wrong. Try again.');
    $('suPass').value = '';
    showRecovery(
      'Save your recovery code',
      'If you forget your password, this code is another way back into your account (you can also reset it with your email). Write it down or take a screenshot. It is shown only once.',
      data.recoveryCode,
      () => startSession(data.token)
    );
  } catch { err('Cannot reach the server. Is it running?'); }
}

async function submitReset() {
  $('resetError').textContent = '';
  try {
    const typed = $('rcode').value.trim();
    const { ok, data } = /^\d{6}$/.test(typed)
      ? await callApi('/api/reset-email/confirm', { who: $('ruser').value.trim(), code: typed, newPassword: $('rpass').value })
      : await callApi('/api/reset', { username: $('ruser').value.trim(), recoveryCode: typed, newPassword: $('rpass').value });
    if (!ok) {
      $('resetError').textContent = data.error || 'Something went wrong. Try again.';
      return;
    }
    $('rcode').value = '';
    $('rpass').value = '';
    showRecovery(
      'Password changed',
      'Your old recovery code no longer works. Save this NEW one the same way: write it down or take a screenshot.',
      data.recoveryCode,
      () => showAuth('Password changed. Log in with your new password.', true)
    );
  } catch {
    $('resetError').textContent = 'Cannot reach the server. Is it running?';
  }
}

$('login').addEventListener('click', () => submitAuth());
$('pass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitAuth();
});
$('goSignup').addEventListener('click', () => { $('suError').textContent = ''; showPage('signupPage'); });
$('goLogin').addEventListener('click', () => { $('authError').textContent = ''; showPage('loginPage'); });
$('suBack').addEventListener('click', () => showPage('auth'));
$('loginBack').addEventListener('click', () => showPage('auth'));
$('suGo').addEventListener('click', submitSignup);
$('suPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitSignup(); });
$('forgot').addEventListener('click', () => {
  $('ruser').value = $('user').value;
  $('resetError').textContent = '';
  showPage('reset');
});
$('resetBack').addEventListener('click', () => showAuth());
$('rmail').addEventListener('click', async () => {
  const who = $('ruser').value.trim();
  $('resetError').className = 'err';
  if (!who) { $('resetError').textContent = 'Type your username (or email) above first.'; return; }
  try {
    const { ok, data } = await callApi('/api/reset-email/request', { who });
    $('resetError').className = ok ? 'err good' : 'err';
    $('resetError').textContent = ok ? 'If that account has a confirmed email, a code is on its way. Type it below with your new password.' : (data.error || 'Something went wrong.');
  } catch { $('resetError').textContent = 'Cannot reach the server. Is it running?'; }
});
// Menu: add an email to your account so you can reset a forgotten password by email.
async function mailApi(path, body) {
  const res = await fetch(`${SERVER}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}
async function loadMail() {
  if (!token) return;
  try { const { ok, data } = await mailApi('/api/email'); if (ok) $('mailNow').textContent = data.email || 'none yet'; } catch { /* offline */ }
}
$('mailSend').addEventListener('click', async () => {
  $('mailMsg').textContent = '';
  try {
    const { ok, data } = await mailApi('/api/email/add', { email: $('mailIn').value.trim() });
    $('mailMsg').textContent = ok ? 'Code sent. Type it below.' : (data.error || 'Something went wrong.');
    if (ok) { $('mailCode').hidden = false; $('mailVerify').hidden = false; }
  } catch { $('mailMsg').textContent = 'Cannot reach the server.'; }
});
$('mailVerify').addEventListener('click', async () => {
  try {
    const { ok, data } = await mailApi('/api/email/verify', { code: $('mailCode').value.trim() });
    $('mailMsg').textContent = ok ? 'Email confirmed.' : (data.error || 'Wrong code.');
    if (ok) { $('mailNow').textContent = data.email; $('mailCode').hidden = true; $('mailVerify').hidden = true; $('mailCode').value = ''; }
  } catch { $('mailMsg').textContent = 'Cannot reach the server.'; }
});
socket.on('welcome', () => loadMail());
$('resetGo').addEventListener('click', submitReset);
$('rpass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitReset();
});
$('logout').addEventListener('click', async () => {
  try {
    await fetch(`${SERVER}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    /* the session will expire on its own */
  }
  endSession('You logged out.');
});

socket.on('connect_error', (err) => {
  if (err.message === 'auth') endSession('Please log in again.');
  else notice('Cannot reach the server. Is it running?');
});
socket.on('kicked', () => endSession('This account logged in somewhere else.'));

if (token) socket.connect();
else showAuth();

// ---------- Input: tap the ground to walk (drags rotate the camera instead) ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
let down = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary) {
    down = null; // a second finger means a pinch, not a tap
    return;
  }
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
});

renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || !e.isPrimary) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const held = performance.now() - down.t;
  down = null;
  if (moved > 6 || held > 400 || fpv) return; // that was a drag (and tapping the floor does not walk in first person)
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(floor, hit)) {
    socket.emit('moveTo', { x: hit.x, z: hit.z });
  }
});

// ---------- First-person view (inside buildings only) ----------
// The camera sits at your eyes. Drag to look; the stick and keys still walk (they go where the camera looks).
// It only works inside a room, so you can never see past the walls of the place you are in.
// ---------- Seats on buses, trains and planes ----------
// While a trip is under way you sit in your seat (cabin.js). The screen fades to black on boarding and on arrival.
const cabin = createCabin({ scene, camera });
let cabinBusy = false;
const fadeEl = $('fade');
const fade = (to, ms = 450) => new Promise((res) => { fadeEl.style.transitionDuration = `${ms}ms`; fadeEl.style.opacity = to ? '1' : '0'; setTimeout(res, ms + 30); });
const CABIN_OF = { bus: 'bus', coach: 'bus', train: 'train', flight: 'plane' };
let wantTrip = null;
let wantCabin = null; // what the latest 'me' says we should be sitting in: 'worldbus' | 'bus' | 'train' | 'plane' | null
async function boardCabin(kind, opts) {
  if (cabinBusy || cabin.active) return;
  cabinBusy = true;
  await fade(1);
  setFpv(false);
  if (kind === 'worldbus') { const a = avatars.get(myId); if (a && a.veh && a.veh.userData.cabin) cabin.enterWorld(a.veh); }
  else cabin.enterDetached(kind, 1 + Math.floor(Math.random() * 1000), opts);
  $('fpvBtn').hidden = true;
  $('cabinHint').hidden = false;
  document.body.classList.add('seated');
  await fade(0, 600);
  cabinBusy = false;
}
async function leaveCabin() {
  if (cabinBusy || !cabin.active) return;
  cabinBusy = true;
  await fade(1);
  cabin.leave();
  snapCam = true;
  lastLight = -1;
  $('cabinHint').hidden = true;
  document.body.classList.remove('seated');
  $('fpvBtn').hidden = Boolean(roomInfoNow && roomInfoNow.city);
  const a = avatars.get(myId);
  if (a) a.group.visible = !a.veh || a.vehKind === 'bike';
  await fade(0, 600);
  cabinBusy = false;
}
function syncCabin() {
  if (wantCabin === 'worldbus') {
    const a = avatars.get(myId);
    if (!cabin.active && a && a.veh && a.veh.userData.cabin) boardCabin('worldbus');
  } else if (wantCabin) { if (!cabin.active) boardCabin(wantCabin, wantTrip); }
  else if (cabin.active) leaveCabin();
}

// Driver's seat view: while you drive your own car or bike, look out through the windscreen.
let seatView = false, seatLook = 0, seatDrag = null;
function setSeatView(on) {
  if (on && !meDriving) on = false;
  if (on === seatView) return;
  seatView = on;
  const me = avatars.get(myId);
  controls.enabled = !on;
  camera.fov = on ? 70 : 45; camera.updateProjectionMatrix();
  seatLook = 0;
  document.body.classList.toggle('driverView', on);
  if (!on) { if (me) { me.group.visible = !me.veh || me.vehKind === 'bike'; if (me.veh) me.veh.visible = true; } snapCam = true; dropCockpit(); }
  $('seatBtn').textContent = on ? '🧍 Outside view' : '🚗 Driver view';
  $('seatBtn').classList.toggle('on', on);
}
// Flashy cars have a real cockpit: the outside of the car is hidden and you sit inside the cockpit model.
let cockpitObj = null, cockpitName = null;
function dropCockpit() { if (cockpitObj) { scene.remove(cockpitObj); cockpitObj = null; cockpitName = null; } }
function updateSeatView(dt) {
  const me = avatars.get(myId);
  if (!seatView || !me) return;
  if (!meDriving) { setSeatView(false); return; }
  me.group.visible = false;
  if (me.veh) me.veh.visible = false;
  if (!seatDrag) seatLook *= Math.exp(-dt * 4); // your head drifts back to straight ahead
  const bike = me.vehKind === 'bike';
  let eye = bike ? 1.35 : 1.15, fwd = bike ? 0.1 : 0.15, side = 0;
  const yaw = (me.ry || 0) + seatLook;
  const p = me.group.position;
  if (driveCockpit) {
    if (cockpitName !== driveCockpit) { dropCockpit(); loadCar(driveCockpit).then(() => { if (seatView && driveCockpit && !cockpitObj) { cockpitObj = carClone(driveCockpit); cockpitName = driveCockpit; if (cockpitObj) scene.add(cockpitObj); } }); cockpitName = driveCockpit; }
    if (cockpitObj) { cockpitObj.position.copy(p); cockpitObj.rotation.y = me.ry || 0; eye = 0.95; fwd = -0.02; side = 0.37; }
  }
  const sr = Math.sin(me.ry || 0), cr = Math.cos(me.ry || 0);
  camera.position.set(p.x + sr * fwd + cr * side, eye, p.z + cr * fwd - sr * side);
  controls.target.set(p.x + Math.sin(yaw) * 6, eye - 0.1, p.z + Math.cos(yaw) * 6);
  camera.lookAt(controls.target);
}
$('sitBtn').addEventListener('click', () => socket.emit('sit'));
$('bedBtn').addEventListener('click', () => socket.emit('restBed'));
let sitTick = 0;
function updateSitButton(now) {
  if (now - sitTick < 250) return;
  sitTick = now;
  const a = avatars.get(myId);
  const can = Boolean(a && roomInfoNow && $('trip').hidden && !meDriving && !cabin.active && !a.working);
  $('sitBtn').hidden = !can;
  $('sitBtn').textContent = a && a.sit ? '🧍 Stand up' : '🪑 Sit';
  { const inHosp = roomInfoNow && roomInfoNow.id === 'hospital'; $('bedBtn').hidden = !(can && inHosp && (a.lying || window.__sick)); $('bedBtn').textContent = a && a.lying ? '🧍 Get up' : '🛏 Rest in bed'; if (a && a.lying) $('sitBtn').hidden = true; }
}
$('seatBtn').addEventListener('click', () => setSeatView(!seatView));
renderer.domElement.addEventListener('pointerdown', (e) => { if (seatView && !seatDrag) seatDrag = { x: e.clientX, id: e.pointerId }; });
window.addEventListener('pointermove', (e) => { if (!seatDrag || e.pointerId !== seatDrag.id) return; seatLook = Math.max(-1.3, Math.min(1.3, seatLook - (e.clientX - seatDrag.x) * 0.006)); seatDrag.x = e.clientX; });
const endSeatLook = (e) => { if (seatDrag && e.pointerId === seatDrag.id) seatDrag = null; };
window.addEventListener('pointerup', endSeatLook);
window.addEventListener('pointercancel', endSeatLook);

let fpv = false, fpvYaw = 0, fpvPitch = 0, fpvDrag = null, fpvLast = null, fpvLastLook = 0;
function setFpv(on) {
  if (on && (!roomInfoNow || roomInfoNow.city)) on = false;
  if (on === fpv) return;
  fpv = on;
  const me = avatars.get(myId);
  if (on) {
    const dx = controls.target.x - camera.position.x, dz = controls.target.z - camera.position.z;
    fpvYaw = Math.atan2(dx, dz);
    fpvPitch = 0; fpvLast = null;
    controls.enabled = false;
    camera.fov = 72; camera.updateProjectionMatrix();
  } else {
    controls.enabled = true;
    camera.fov = 45; camera.updateProjectionMatrix();
    if (me) me.group.visible = true;
    snapCam = true; // back to the usual room view
  }
  $('fpvBtn').textContent = on ? '🚶 Exit first person' : '👁 First person';
  $('fpvBtn').classList.toggle('on', on);
}
function updateFpv() {
  const me = avatars.get(myId);
  if (!fpv || !me) return;
  me.group.visible = false;
  const p = me.group.position;
  // Turn to face where you are walking, unless you are looking around with a finger or the mouse.
  const nowMs = performance.now();
  if (fpvLast && nowMs - fpvLast.t > 0 && nowMs - fpvLast.t < 500 && !fpvDrag && nowMs - fpvLastLook > 350) {
    const dt = (nowMs - fpvLast.t) / 1000;
    const mx = p.x - fpvLast.x, mz = p.z - fpvLast.z;
    if (Math.hypot(mx, mz) / dt > 0.6) {
      let diff = Math.atan2(mx, mz) - fpvYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < 1.75) fpvYaw += diff * Math.min(1, dt * 3.5); // walking backwards does not spin you round
    }
  }
  fpvLast = { x: p.x, z: p.z, t: nowMs };
  const cp = Math.cos(fpvPitch);
  const dx = Math.sin(fpvYaw) * cp, dy = Math.sin(fpvPitch), dz = Math.cos(fpvYaw) * cp;
  camera.position.set(p.x, 1.55, p.z);
  controls.target.set(p.x + dx * 5, 1.55 + dy * 5, p.z + dz * 5); // walking controls read this to know which way is forward
  camera.lookAt(controls.target);
}
window.__fpv = () => ({ on: fpv, yaw: fpvYaw, pitch: fpvPitch });
window.__camAngle = () => Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
$('fpvBtn').addEventListener('click', () => setFpv(!fpv));
// Looking around follows the finger that touched the picture, whichever finger that is: the other hand can hold the joystick.
renderer.domElement.addEventListener('pointerdown', (e) => { if ((fpv || cabin.active) && !fpvDrag) fpvDrag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
window.addEventListener('pointermove', (e) => {
  if (!fpvDrag || e.pointerId !== fpvDrag.id) return;
  const ddx = e.clientX - fpvDrag.x, ddy = e.clientY - fpvDrag.y;
  fpvDrag.x = e.clientX; fpvDrag.y = e.clientY;
  if (cabin.active) { cabin.look(ddx, ddy); return; }
  if (!fpv) return;
  fpvLastLook = performance.now();
  fpvYaw -= ddx * 0.006;
  fpvPitch = Math.max(-1.0, Math.min(0.9, fpvPitch - ddy * 0.005));
});
const endLook = (e) => { if (fpvDrag && e.pointerId === fpvDrag.id) { fpvDrag = null; fpvLastLook = performance.now(); } };
window.addEventListener('pointerup', endLook);
window.addEventListener('pointercancel', endLook);

// ---------- Following your character, and the door button ----------
// The street is long, so the camera follows you along it. Rooms stay centered.
// Your home is shown as a cut-away room from a fixed angle. One tap on the rotate button turns it a quarter.
let homeSpin = null;
const inHomeView = () => Boolean(roomInfoNow && !roomInfoNow.city && (roomInfoNow.id === 'home' || roomInfoNow.id === 'friendhome'));
window.addEventListener('adulthood-rotate', () => {
  if (!inHomeView() || homeSpin) return;
  const dx = camera.position.x - controls.target.x, dz = camera.position.z - controls.target.z;
  homeSpin = { a0: Math.atan2(dx, dz), r: Math.hypot(dx, dz), t: 0 };
});
function followMe(dt) {
  const f = 1 - Math.exp(-dt * 8); // same feel at any frame rate
  const me = avatars.get(myId);
  if (!roomInfoNow) return;
  controls.enableRotate = true;   // drag to spin the home freely; the rotate button still turns it a quarter
  if (homeSpin) {
    if (!inHomeView()) homeSpin = null;
    else {
      homeSpin.t = Math.min(1, homeSpin.t + dt / 0.45);
      const e = homeSpin.t * homeSpin.t * (3 - 2 * homeSpin.t);
      const a = homeSpin.a0 + (Math.PI / 2) * e;
      camera.position.x = controls.target.x + Math.sin(a) * homeSpin.r;
      camera.position.z = controls.target.z + Math.cos(a) * homeSpin.r;
      if (homeSpin.t >= 1) homeSpin = null;
    }
  }
  if (snapCam && !roomInfoNow.city) {
    // Phones are tall and narrow, so the camera sits further back to show the whole room.
    const k = window.innerWidth < window.innerHeight ? 1.7 : 1;
    controls.maxDistance = 50;
    controls.target.set(0, 0, 0);
    camera.position.set(0, 16 * k, 16 * k);
    snapCam = false;
  }
  if (!me) return;
  if (snapCam && roomInfoNow.city) {
    const p = me.group.position;
    controls.target.set(p.x, 0, p.z);
    camera.position.set(p.x, 38, p.z + 25);
    controls.maxDistance = 160;
    snapCam = false;
  }
  if (roomInfoNow.city) {
    const dx = me.group.position.x - controls.target.x;
    const dz = me.group.position.z - controls.target.z;
    controls.target.x += dx * f;
    controls.target.z += dz * f;
    camera.position.x += dx * f;
    camera.position.z += dz * f;
  }
}
// ---------- Express train ----------
let stationList = [];
const TRAIN_FARE = 400;
function nearStation() {
  const me = avatars.get(myId);
  if (!me || !roomInfoNow || !roomInfoNow.city) return null;
  return roomInfoNow.city.stations.find((s) => Math.hypot(me.group.position.x - s.x, me.group.position.z - s.z) <= 4.5) || null;
}
function renderTrain() {
  const body = $('trainBody');
  body.replaceChildren();
  const here = nearStation();
  stationList = (roomInfoNow && (roomInfoNow.city ? roomInfoNow.city.stations : roomInfoNow.stations)) || [];
  for (const s of stationList) {
    if (here && here.id === s.id) continue;
    const line = document.createElement('div');
    line.className = 'trainLine';
    const l = document.createElement('span');
    l.textContent = `${s.name} · ₦${TRAIN_FARE}`;
    const b = document.createElement('button');
    b.textContent = 'Board';
    b.addEventListener('click', () => { socket.emit('train', s.id); $('trainPanel').hidden = true; });
    line.append(l, b);
    body.appendChild(line);
  }
}
$('trainBtn').addEventListener('click', () => {
  hideOtherPanels('trainPanel');
  renderTrain();
  $('trainPanel').hidden = !$('trainPanel').hidden;
});
$('trainClose').addEventListener('click', () => { $('trainPanel').hidden = true; });
let trainTick = 0;
function updateTrainButton(now) {
  if (now - trainTick < 200) return;
  trainTick = now;
  const show = $('trip').hidden && roomInfoNow && (roomInfoNow.id === 'terminal' || (roomInfoNow.city && nearStation()));
  $('trainBtn').hidden = !show;
  { const me = avatars.get(myId); bizUi.update(now, me ? me.group.position : null, roomInfoNow, !$('trip').hidden || meDriving); }
  intercityUi.setVisible(Boolean($('trip').hidden && roomInfoNow && (roomInfoNow.id === 'terminal' || roomInfoNow.id === 'airport')));
  if (!show) $('trainPanel').hidden = true;
}
let doorTarget = null; // { kind: 'enter', room, name } or { kind: 'out' }
let doorTick = 0;
function updateDoorButton(now) {
  if (now - doorTick < 150) return;
  doorTick = now;
  const me = avatars.get(myId);
  let want = null;
  if (me && roomInfoNow && $('trip').hidden) {
    const { x, z } = me.group.position;
    if (roomInfoNow.city) {
      // Every place has a door. Your own house is on your own plot.
      const c = roomInfoNow.city;
      const doors = Object.entries(c.doors).map(([room, d]) => ({ room, name: roomInfoNow.names[room], x: d.x, z: d.z }));
      const mine = Number.isInteger(roomInfoNow.myPlot) ? c.plots[roomInfoNow.myPlot] : null;
      if (mine) doors.push({ room: 'home', name: 'Home', x: mine.door.x, z: mine.door.z });
      for (const l of bizUi.built()) { const lot = c.lots && c.lots[l.id]; if (lot) doors.push({ room: 'biz', biz: l.id, name: l.name, x: lot.door.x, z: lot.door.z }); }
      for (const h of friendHomes) { const pl = c.plots[h.plot]; if (pl && h.plot !== roomInfoNow.myPlot) doors.push({ room: null, friend: h.name, name: h.name, x: pl.door.x, z: pl.door.z }); }
      let best = null;
      for (const d of doors) {
        const dist = Math.hypot(x - d.x, z - d.z);
        if (dist <= 3.3 && (!best || dist < best.dist)) best = { d, dist };
      }
      if (best) want = best.d.friend ? { kind: 'visit', room: 'visit:' + best.d.friend, friend: best.d.friend, name: best.d.name } : { kind: 'enter', room: best.d.room, biz: best.d.biz, name: best.d.name };
    } else if (roomInfoNow.exit && Math.hypot(x - roomInfoNow.exit.x, z - 8.5) <= 3.3) {
      want = { kind: 'out' };
    }
  }
  const same = (want && doorTarget && want.kind === doorTarget.kind && want.room === doorTarget.room && want.biz === doorTarget.biz) || (!want && !doorTarget);
  if (same) return;
  doorTarget = want;
  const b = $('doorBtn');
  b.hidden = !want;
  if (want) b.textContent = want.kind === 'enter' ? `Enter ${want.name}` : want.kind === 'visit' ? `Knock on ${want.name}'s door` : 'Go outside';
}
$('skipRide').addEventListener('click', () => socket.emit('skipRide'));
$('doorBtn').addEventListener('click', () => {
  if (!doorTarget) return;
  if (doorTarget.kind === 'enter' && doorTarget.room === 'biz') socket.emit('bizEnter', doorTarget.biz);
  else if (doorTarget.kind === 'enter') socket.emit('enter', doorTarget.room);
  else if (doorTarget.kind === 'visit') socket.emit('visit', doorTarget.friend);
  else socket.emit('goOutside');
});

// ---------- Loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  const k = 1 - Math.exp(-dt * 10); // smooth movement between server updates
  const tnow = performance.now() / 1000;
  for (const a of avatars.values()) {
    const arms = a.group.userData.arms;
    if (arms) {
      // Working: both arms swing up and down in turn and the body bobs a little. Otherwise they settle back to the sides.
      const w = a.working ? 1 : 0;
      arms[0].rotation.x += ((w ? -1.0 + Math.sin(tnow * 7) * 0.9 : 0) - arms[0].rotation.x) * Math.min(1, dt * 14);
      arms[1].rotation.x += ((w ? -1.0 - Math.sin(tnow * 7) * 0.9 : 0) - arms[1].rotation.x) * Math.min(1, dt * 14);
      a.group.children[0].scale.y += ((w ? 1 + Math.sin(tnow * 7) * 0.03 : 1) - a.group.children[0].scale.y) * Math.min(1, dt * 14);
    }
    a.group.position.lerp(a.target, k);
    if (a.last && dt > 0) {
      // How fast and which way this person is moving, for the walk and run animations.
      const mx = a.group.position.x - a.last.x, mz = a.group.position.z - a.last.z;
      const sp = Math.hypot(mx, mz) / dt;
      a.speed += (Math.min(sp, 12) - a.speed) * Math.min(1, dt * 8);
      if (Math.hypot(mx, mz) > 0.002) a.heading = Math.atan2(mx, mz);
      a.last.copy(a.group.position);
      if (street && a.group.visible && !a.sit && !a.veh) {
        // Hand out to the door handle when you are right at a door; the arm drops again as you walk through or away.
        const wantReach = street.doorDistance(a.group.position.x, a.group.position.z) < 1.5 ? 1 : 0;
        a.group.userData.reach = (a.group.userData.reach || 0) + (wantReach - (a.group.userData.reach || 0)) * Math.min(1, dt * 8);
      } else a.group.userData.reach = 0;
      const onBike = a.veh && a.vehKind === 'bike';
      animateModel(a.group, dt, a.speed, onBike ? a.ry : a.heading, a.working && !onBike, tnow, onBike ? 'bike' : a.sit && !a.veh, onBike ? 0 : a.exercise || 0);
    }
    if (a.veh) {
      { const dx = a.group.position.x - a.veh.position.x, dz = a.group.position.z - a.veh.position.z; const dd = Math.hypot(dx, dz); if (dd > 0.001 && dd < 5) spinWheels(a.veh, dd * (dx * Math.sin(a.veh.rotation.y) + dz * Math.cos(a.veh.rotation.y) >= 0 ? 1 : -1)); }
      a.veh.position.copy(a.group.position);
      let d = ((a.ry - a.veh.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI; // shortest turn
      a.veh.rotation.y += d * Math.min(1, dt * 8);
    }
  }
  applyDaylight();
  updateDoors(dt);
  interior.update(dt, world.daylight());
  if (street) { street.setPeople([...avatars.values()].filter((a) => a.group.visible || a.veh).map((a) => (a.veh ? a.veh.position : a.group.position))); street.update(dt); }
  updateCops(dt, performance.now() / 1000);
  walkInput.update();
  if (cabin.active) {
    cabin.update(dt, world.daylight());
    const tp = cabin.tripProgress;
    if (tp !== null && wantTrip) { const ts = cabin.tripSeconds, tl = cabin.tripLength; const txt = ts < 3.2 ? '🚪 Doors closing… the train is about to leave' : ts > tl - 5 ? `🚉 Arriving at ${wantTrip.to}…` : '💺 You are in your seat · drag to look around'; if ($('cabinHint').textContent !== txt) $('cabinHint').textContent = txt; }
  }
  else { if (!seatView) followMe(dt); updateFpv(); updateSeatView(dt); }
  updateDoorButton(performance.now());
  updateSitButton(performance.now());
  gamesUi.update(performance.now());
  updateTrainButton(performance.now());
  if (!fpv && !seatView && !cabin.active) controls.update();
  if (!cabin.active && wantCabin === 'worldbus') syncCabin();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Photos and selfies (taken in your own browser; nothing is uploaded).
initPhoto({
  renderer, scene, camera, controls,
  getMe: () => avatars.get(myId),
  getInfo: () => {
    const clock = $('clock') ? $('clock').textContent : '';
    return `${$('player').textContent} · ${$('where').textContent}${clock ? ` · ${clock}` : ''}`;
  },
});

// ---------- Install as an app (PWA) ----------
// Android and desktop Chrome offer a real install prompt. iPhones have no prompt, so we show how to use "Add to Home Screen".
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
{
  const installed = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  let deferred = null;
  const btn = $('installBtn');
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; if (!installed) btn.hidden = false; });
  window.addEventListener('appinstalled', () => { deferred = null; btn.hidden = true; });
  if (ios && !installed) btn.hidden = false;
  btn.addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch {} deferred = null; btn.hidden = true; }
    else if (ios) alert('To install on iPhone: tap the Share button in Safari, then "Add to Home Screen".');
  });
}
