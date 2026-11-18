// Firebase backend: Google sign-in + Cloud Firestore. Same exports as store-demo.js.
// The rules in firestore.rules enforce everything checked here, so a modified client can't cheat.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot,
  runTransaction, writeBatch, query, where,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, SCHOOL_DOMAIN } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const adminRef = (email) => doc(db, 'admins', email);
const tripRef = (tripId) => doc(db, 'trips', tripId);
const busesCol = (tripId) => collection(db, 'trips', tripId, 'buses');
const seatsCol = (tripId) => collection(db, 'trips', tripId, 'seats');
const studentsCol = (tripId) => collection(db, 'trips', tripId, 'students');
const seatRef = (tripId, seatKey) => doc(seatsCol(tripId), seatKey);
const studentRef = (tripId, email) => doc(studentsCol(tripId), email);

const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const logError = (name) => (err) => console.error(name, err);

// ---- Auth ----

export function onAuth(cb) {
  onAuthStateChanged(auth, (u) => {
    cb(u ? { email: u.email.toLowerCase(), name: u.displayName || u.email } : null);
  });
}

export async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: SCHOOL_DOMAIN, prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signOut() {
  await fbSignOut(auth);
}

// ---- Teachers ----

export async function getRole(user) {
  try {
    const snap = await getDoc(adminRef(user.email));
    return { admin: snap.exists(), super: snap.exists() && snap.data().super === true };
  } catch {
    return { admin: false, super: false };
  }
}

export function watchAdmins(cb) {
  return onSnapshot(collection(db, 'admins'),
    (snap) => cb(snap.docs.map((d) => ({ email: d.id, super: d.data().super === true }))),
    logError('watchAdmins'));
}

export async function addAdmin(email, byUser) {
  await setDoc(adminRef(email), { addedBy: byUser.email, addedAt: Date.now() });
}

export async function removeAdmin(email) {
  await deleteDoc(adminRef(email));
}

// ---- Trips ----

export function watchTrips(cb) {
  return onSnapshot(collection(db, 'trips'), (snap) => cb(toList(snap)), logError('watchTrips'));
}

export function watchTrip(tripId, cb) {
  return onSnapshot(tripRef(tripId), (snap) => cb(snap.exists() ? snap.data() : null),
    logError('watchTrip'));
}

export async function createTrip(tripId, data, firstBus) {
  const batch = writeBatch(db);
  batch.set(tripRef(tripId), data);
  batch.set(doc(busesCol(tripId)), firstBus);
  await batch.commit();
}

export async function saveTrip(tripId, data) {
  await setDoc(tripRef(tripId), data, { merge: true });
}

export async function deleteTrip(tripId) {
  const batch = writeBatch(db);
  for (const col of [seatsCol, studentsCol, busesCol]) {
    (await getDocs(col(tripId))).forEach((d) => batch.delete(d.ref));
  }
  batch.delete(tripRef(tripId));
  await batch.commit();
}

// ---- Buses ----

export function watchBuses(tripId, cb) {
  return onSnapshot(busesCol(tripId), (snap) => cb(toList(snap)), logError('watchBuses'));
}

export async function saveBus(tripId, busId, data) {
  if (busId) await setDoc(doc(busesCol(tripId), busId), data, { merge: true });
  else await addDoc(busesCol(tripId), data);
}

// Removes a bus and frees every seat on it.
export async function deleteBus(tripId, busId) {
  const seats = await getDocs(query(seatsCol(tripId), where('busId', '==', busId)));
  const batch = writeBatch(db);
  seats.forEach((d) => {
    batch.delete(d.ref);
    batch.delete(studentRef(tripId, d.data().studentEmail));
  });
  batch.delete(doc(busesCol(tripId), busId));
  await batch.commit();
}

// ---- Seats ----

export function watchSeats(tripId, cb) {
  return onSnapshot(seatsCol(tripId), (snap) => {
    const seats = {};
    snap.forEach((d) => { seats[d.id] = d.data(); });
    cb(seats);
  }, logError('watchSeats'));
}

// Claims a seat and frees the student's previous seat in one transaction,
// so two students can never end up in the same seat.
export async function claimSeat(tripId, busId, seat, user) {
  const seatKey = `${busId}_${seat}`;
  await runTransaction(db, async (tx) => {
    const trip = await tx.get(tripRef(tripId));
    const me = await tx.get(studentRef(tripId, user.email));
    const taken = await tx.get(seatRef(tripId, seatKey));
    if (!trip.data()?.isOpen) throw new Error('Seat selection is closed.');
    if (taken.exists()) {
      if (taken.data().studentEmail === user.email) return;
      throw new Error('Sorry, that seat was just taken.');
    }
    const oldSeatKey = me.exists() ? me.data().seatKey : null;
    if (oldSeatKey) tx.delete(seatRef(tripId, oldSeatKey));
    tx.set(seatRef(tripId, seatKey), {
      busId, seat, studentEmail: user.email, studentName: user.name, takenAt: Date.now(),
    });
    tx.set(studentRef(tripId, user.email), { seatKey });
  });
}

export async function releaseSeat(tripId, user) {
  await runTransaction(db, async (tx) => {
    const me = await tx.get(studentRef(tripId, user.email));
    if (!me.exists()) return;
    if (me.data().seatKey) tx.delete(seatRef(tripId, me.data().seatKey));
    tx.delete(studentRef(tripId, user.email));
  });
}

export async function clearSeat(tripId, seatKey) {
  await runTransaction(db, async (tx) => {
    const seat = await tx.get(seatRef(tripId, seatKey));
    if (!seat.exists()) return;
    tx.delete(seatRef(tripId, seatKey));
    tx.delete(studentRef(tripId, seat.data().studentEmail));
  });
}

export function resetDemo() {}
