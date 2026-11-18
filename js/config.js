// App settings. Edit these values; no other file needs to change for a new setup.

// Paste the web app config from the Firebase console here (Project settings → Your apps).
// These values are meant to be public. Security comes from firestore.rules.
// While apiKey is empty the app runs in demo mode and saves data only in this browser.
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const DEMO_MODE = !firebaseConfig.apiKey;

// Only accounts from this Google Workspace domain can sign in.
export const SCHOOL_DOMAIN = 'zispp.org';

// Which trip to show. Share a link like ?trip=museum-oct to use a different trip.
export const TRIP_ID = new URLSearchParams(location.search).get('trip') || 'field-trip';

// Starting values for a new trip. The bus layout is a placeholder (10 rows × 4 = 40 seats)
// and can be changed later in Teacher tools → Trip settings.
export const DEFAULT_TRIP = {
  name: 'Field Trip',
  date: '',
  rows: 10,
  seatsPerRow: 4,
  isOpen: true,
};

// Demo mode only: these emails get the teacher view. With Firebase, teachers are
// listed in the Firestore "admins" collection instead (see README.md).
export const DEMO_ADMINS = [`teacher@${SCHOOL_DOMAIN}`];
