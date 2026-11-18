// Demo backend: keeps everything in this browser's localStorage so the app can be shown
// without a Firebase project. Same exports as store-firebase.js.
// Each browser tab signs in separately, and tabs sync live, so two tabs can act as two students.

import { SCHOOL_DOMAIN, DEFAULT_BUS, DEMO_SUPER_ADMIN } from './config.js';

const DATA_KEY = 'zionbus-demo-v2';
const USER_KEY = 'zionbus-demo-user';

const SAMPLE_STUDENTS = [
  ['bus1', '1A', 'Ava Martin'], ['bus1', '1B', 'Liam Chen'], ['bus1', '2C', 'Sofia Garcia'],
  ['bus1', '3A', 'Mia Johnson'], ['bus1', '4C', 'Ethan Brown'], ['bus1', '6B', 'Emma Lee'],
  ['bus1', '9A', 'Isabella Lopez'], ['bus2', '1C', 'Noah Kim'], ['bus2', '2A', 'Chloe Davis'],
  ['bus2', '3D', 'Lucas Wilson'], ['bus2', '5B', 'Mason Clark'], ['bus2', '7C', 'Oliver Young'],
];

const listeners = new Set();
let memory = null; // fallback when localStorage is unavailable
let authCallback = null;

const newId = () => Math.random().toString(36).slice(2, 10);

function emailFor(name) {
  return `${name.toLowerCase().replace(/\s+/g, '.')}@${SCHOOL_DOMAIN}`;
}

function nameFromEmail(email) {
  return email.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}

function seed() {
  const in2Weeks = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const seats = {};
  for (const [busId, seat, name] of SAMPLE_STUDENTS) {
    seats[`${busId}_${seat}`] = { busId, seat, studentEmail: emailFor(name), studentName: name, takenAt: 0 };
  }
  return {
    admins: { [DEMO_SUPER_ADMIN]: { super: true }, [`ms.lee@${SCHOOL_DOMAIN}`]: {} },
    trips: {
      'science-museum-demo': {
        trip: { name: 'Science Museum (demo)', date: in2Weeks, isOpen: true },
        buses: {
          bus1: { name: 'Bus 1', ...DEFAULT_BUS, order: 1 },
          bus2: { name: 'Bus 2', rows: 8, seatsPerRow: 4, order: 2 },
        },
        seats,
      },
    },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to memory */ }
  if (!memory) memory = seed();
  return structuredClone(memory);
}

function save(all) {
  memory = all;
  try { localStorage.setItem(DATA_KEY, JSON.stringify(all)); } catch { /* memory only */ }
  notify();
}

function notify() {
  listeners.forEach((fn) => fn());
}

// Another tab changed the data.
window.addEventListener('storage', (e) => {
  if (e.key === DATA_KEY) notify();
});

function watch(pick, cb) {
  const fn = () => cb(pick(load()));
  listeners.add(fn);
  fn();
  return () => listeners.delete(fn);
}

function getTrip(all, tripId) {
  const t = all.trips[tripId];
  if (!t) throw new Error('This trip no longer exists.');
  return t;
}

const toList = (obj) => Object.entries(obj).map(([id, data]) => ({ id, ...data }));

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

// ---- Teachers ----

export async function getRole(user) {
  const entry = load().admins[user.email];
  return { admin: !!entry, super: entry?.super === true };
}

export const watchAdmins = (cb) => watch(
  (all) => Object.entries(all.admins).map(([email, a]) => ({ email, super: a.super === true })), cb);

export async function addAdmin(email, byUser) {
  const all = load();
  if (all.admins[email]) throw new Error(`${email} is already a teacher.`);
  all.admins[email] = { addedBy: byUser.email, addedAt: Date.now() };
  save(all);
}

export async function removeAdmin(email) {
  const all = load();
  if (all.admins[email]?.super) throw new Error('The master admin can’t be removed.');
  delete all.admins[email];
  save(all);
}

// ---- Trips ----

export const watchTrips = (cb) => watch(
  (all) => Object.entries(all.trips).map(([id, t]) => ({ id, ...t.trip })), cb);

export const watchTrip = (tripId, cb) => watch((all) => all.trips[tripId]?.trip ?? null, cb);

export async function createTrip(tripId, data, firstBus) {
  const all = load();
  all.trips[tripId] = { trip: data, buses: { [newId()]: firstBus }, seats: {} };
  save(all);
}

export async function saveTrip(tripId, data) {
  const all = load();
  const t = getTrip(all, tripId);
  t.trip = { ...t.trip, ...data };
  save(all);
}

export async function deleteTrip(tripId) {
  const all = load();
  delete all.trips[tripId];
  save(all);
}

// ---- Buses ----

export const watchBuses = (tripId, cb) => watch((all) => toList(all.trips[tripId]?.buses ?? {}), cb);

export async function saveBus(tripId, busId, data) {
  const all = load();
  const t = getTrip(all, tripId);
  const id = busId || newId();
  t.buses[id] = { ...t.buses[id], ...data };
  save(all);
}

export async function deleteBus(tripId, busId) {
  const all = load();
  const t = getTrip(all, tripId);
  for (const [key, seat] of Object.entries(t.seats)) {
    if (seat.busId === busId) delete t.seats[key];
  }
  delete t.buses[busId];
  save(all);
}

// ---- Seats ----

export const watchSeats = (tripId, cb) => watch((all) => all.trips[tripId]?.seats ?? {}, cb);

export async function claimSeat(tripId, busId, seat, user) {
  const all = load();
  const t = getTrip(all, tripId);
  const seatKey = `${busId}_${seat}`;
  if (!t.trip.isOpen) throw new Error('Seat selection is closed.');
  if (!t.buses[busId]) throw new Error('That bus no longer exists.');
  const taken = t.seats[seatKey];
  if (taken && taken.studentEmail !== user.email) throw new Error('Sorry, that seat was just taken.');
  for (const [key, s] of Object.entries(t.seats)) {
    if (s.studentEmail === user.email) delete t.seats[key];
  }
  t.seats[seatKey] = { busId, seat, studentEmail: user.email, studentName: user.name, takenAt: Date.now() };
  save(all);
}

export async function releaseSeat(tripId, user) {
  const all = load();
  const t = getTrip(all, tripId);
  if (!t.trip.isOpen) throw new Error('Seat selection is closed.');
  for (const [key, s] of Object.entries(t.seats)) {
    if (s.studentEmail === user.email) delete t.seats[key];
  }
  save(all);
}

export async function clearSeat(tripId, seatKey) {
  const all = load();
  delete getTrip(all, tripId).seats[seatKey];
  save(all);
}

export function resetDemo() {
  memory = null;
  try { localStorage.removeItem(DATA_KEY); } catch { /* ignore */ }
  notify();
}
