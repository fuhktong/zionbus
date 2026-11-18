// Firebase backend: Google sign-in + Cloud Firestore. Same exports as store-demo.js.
// The rules in firestore.rules enforce everything checked here, so a modified client can't cheat.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, collection, getDoc, setDoc, onSnapshot, runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, SCHOOL_DOMAIN } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const tripRef = (tripId) => doc(db, 'trips', tripId);
const seatRef = (tripId, seatId) => doc(db, 'trips', tripId, 'seats', seatId);
const studentRef = (tripId, email) => doc(db, 'trips', tripId, 'students', email);

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

export async function isAdmin(user) {
  try {
    return (await getDoc(doc(db, 'admins', user.email))).exists();
  } catch {
    return false;
  }
}

// ---- Data ----

export function watchTrip(tripId, cb) {
  return onSnapshot(tripRef(tripId), (snap) => cb(snap.exists() ? snap.data() : null),
    (err) => console.error('watchTrip', err));
}

export function watchSeats(tripId, cb) {
  return onSnapshot(collection(db, 'trips', tripId, 'seats'), (snap) => {
    const seats = {};
    snap.forEach((d) => { seats[d.id] = d.data(); });
    cb(seats);
  }, (err) => console.error('watchSeats', err));
}

// Claims a seat and frees the student's previous seat in one transaction,
// so two students can never end up in the same seat.
export async function claimSeat(tripId, seatId, user) {
  await runTransaction(db, async (tx) => {
    const trip = await tx.get(tripRef(tripId));
    const me = await tx.get(studentRef(tripId, user.email));
    const seat = await tx.get(seatRef(tripId, seatId));
    if (!trip.data()?.isOpen) throw new Error('Seat selection is closed.');
    if (seat.exists()) {
      if (seat.data().studentEmail === user.email) return;
      throw new Error('Sorry, that seat was just taken.');
    }
    const oldSeatId = me.exists() ? me.data().seatId : null;
    if (oldSeatId) tx.delete(seatRef(tripId, oldSeatId));
    tx.set(seatRef(tripId, seatId), {
      studentEmail: user.email, studentName: user.name, takenAt: Date.now(),
    });
    tx.set(studentRef(tripId, user.email), { seatId });
  });
}

export async function releaseSeat(tripId, user) {
  await runTransaction(db, async (tx) => {
    const me = await tx.get(studentRef(tripId, user.email));
    if (!me.exists()) return;
    tx.delete(seatRef(tripId, me.data().seatId));
    tx.delete(studentRef(tripId, user.email));
  });
}

export async function clearSeat(tripId, seatId) {
  await runTransaction(db, async (tx) => {
    const seat = await tx.get(seatRef(tripId, seatId));
    if (!seat.exists()) return;
    tx.delete(seatRef(tripId, seatId));
    tx.delete(studentRef(tripId, seat.data().studentEmail));
  });
}

export async function saveTrip(tripId, data) {
  await setDoc(tripRef(tripId), data, { merge: true });
}

export function resetDemo() {}
