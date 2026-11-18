// Demo backend: keeps everything in this browser's localStorage so the app can be shown
// without a Firebase project. Same exports as store-firebase.js.
// Each browser tab signs in separately, and tabs sync live, so two tabs can act as two students.

import { SCHOOL_DOMAIN, DEFAULT_TRIP, DEMO_ADMINS } from './config.js';

const DATA_KEY = 'zionbus-demo-data';
const USER_KEY = 'zionbus-demo-user';

const SAMPLE_STUDENTS = [
  ['1A', 'Ava Martin'], ['1B', 'Liam Chen'], ['2C', 'Sofia Garcia'], ['2D', 'Noah Kim'],
  ['3A', 'Mia Johnson'], ['4C', 'Ethan Brown'], ['4D', 'Chloe Davis'], ['6A', 'Lucas Wilson'],
  ['6B', 'Emma Lee'], ['7D', 'Mason Clark'], ['9A', 'Isabella Lopez'], ['10C', 'Oliver Young'],
];

const listeners = new Set();
let memory = null; // fallback when localStorage is unavailable
let authCallback = null;

function emailFor(name) {
  return `${name.toLowerCase().replace(/\s+/g, '.')}@${SCHOOL_DOMAIN}`;
}

function nameFromEmail(email) {
  return email.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}

function seed() {
  const seats = {};
  for (const [seatId, name] of SAMPLE_STUDENTS) {
    seats[seatId] = { studentEmail: emailFor(name), studentName: name, takenAt: 0 };
  }
  return { trip: { ...DEFAULT_TRIP, name: 'Field Trip (demo)' }, seats };
}

function load() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to memory */ }
  return memory || {};
}

function save(all) {
  memory = all;
  try { localStorage.setItem(DATA_KEY, JSON.stringify(all)); } catch { /* memory only */ }
  notify();
}

function tripData(all, tripId) {
  if (!all[tripId]) all[tripId] = seed();
  return all[tripId];
}

function notify() {
  listeners.forEach((fn) => fn());
}

// Another tab changed the data.
window.addEventListener('storage', (e) => {
  if (e.key === DATA_KEY) notify();
});

function watch(tripId, pick, cb) {
  const fn = () => cb(pick(tripData(load(), tripId)));
  listeners.add(fn);
  fn();
  return () => listeners.delete(fn);
}

// ---- Auth ----

function currentUser() {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY)); } catch { return null; }
}

export function onAuth(cb) {
  authCallback = cb;
  cb(currentUser());
}

export async function signIn(email) {
  email = (email || '').trim().toLowerCase();
  const user = { email, name: nameFromEmail(email) };
  try { sessionStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* per-page only */ }
  authCallback?.(user);
}

export async function signOut() {
  try { sessionStorage.removeItem(USER_KEY); } catch { /* ignore */ }
  authCallback?.(null);
}

export async function isAdmin(user) {
  return DEMO_ADMINS.includes(user.email);
}

// ---- Data ----

export const watchTrip = (tripId, cb) => watch(tripId, (t) => t.trip, cb);
export const watchSeats = (tripId, cb) => watch(tripId, (t) => t.seats, cb);

export async function claimSeat(tripId, seatId, user) {
  const all = load();
  const t = tripData(all, tripId);
  if (!t.trip.isOpen) throw new Error('Seat selection is closed.');
  const taken = t.seats[seatId];
  if (taken && taken.studentEmail !== user.email) throw new Error('Sorry, that seat was just taken.');
  for (const [id, seat] of Object.entries(t.seats)) {
    if (seat.studentEmail === user.email) delete t.seats[id];
  }
  t.seats[seatId] = { studentEmail: user.email, studentName: user.name, takenAt: Date.now() };
  save(all);
}

export async function releaseSeat(tripId, user) {
  const all = load();
  const t = tripData(all, tripId);
  if (!t.trip.isOpen) throw new Error('Seat selection is closed.');
  for (const [id, seat] of Object.entries(t.seats)) {
    if (seat.studentEmail === user.email) delete t.seats[id];
  }
  save(all);
}

export async function clearSeat(tripId, seatId) {
  const all = load();
  delete tripData(all, tripId).seats[seatId];
  save(all);
}

export async function saveTrip(tripId, data) {
  const all = load();
  const t = tripData(all, tripId);
  t.trip = { ...t.trip, ...data };
  save(all);
}

export function resetDemo() {
  memory = null;
  try { localStorage.removeItem(DATA_KEY); } catch { /* ignore */ }
  notify();
}
