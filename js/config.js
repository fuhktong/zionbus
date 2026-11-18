// App settings. Edit these values; no other file needs to change for a new setup.

// Paste the web app config from the Firebase console here (Project settings → Your apps).
// These values are meant to be public. Security comes from firestore.rules.
// While apiKey is empty the app runs in demo mode and saves data only in this browser.
export const firebaseConfig = {
  apiKey: "AIzaSyBJFbvp0v4XzTXEXZZF_bqLbJZa6bgGyvs",
  authDomain: "zionbus-a56e3.firebaseapp.com",
  projectId: "zionbus-a56e3",
  storageBucket: "zionbus-a56e3.firebasestorage.app",
  messagingSenderId: "87430251699",
  appId: "1:87430251699:web:3bb8d5af825ebd1701dcc6",
  measurementId: "G-LXT98DNXXG",
};

const params = new URLSearchParams(location.search);

// Add ?demo to the address to try the app with sample data saved only in this browser.
export const DEMO_MODE = !firebaseConfig.apiKey || params.has("demo");

// Only accounts from this Google Workspace domain can sign in.
export const SCHOOL_DOMAIN = "zispp.org";

// Which trip to show, from a link like ?trip=museum-oct-x7k2. Without it, the app
// shows the list of trips.
export const TRIP_ID = params.get("trip") || null;

// Layout for a new bus. A placeholder (10 rows × 4 = 40 seats) that teachers can change
// per bus in Teacher tools → Buses.
export const DEFAULT_BUS = {
  rows: 10,
  seatsPerRow: 4,
};

// Demo mode only: this email is the master admin. With Firebase, the master admin is the
// admins/{email} doc with super: true (see README.md).
export const DEMO_SUPER_ADMIN = `teacher@${SCHOOL_DOMAIN}`;
