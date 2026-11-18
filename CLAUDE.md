# ZionBus — Field Trip Bus Seat Picker

## What this is

A simple web app for school field trips that lets students choose their seat on the bus,
similar to picking a seat when booking an airline flight.

- Students sign in with their **school email** (Google Workspace account).
- They see a **seat map** of the bus: available seats, taken seats, and their own seat.
- They click an open seat to claim it. Each student gets **one seat per trip**.
- A student can change their seat until the trip's seat selection closes.
- Seats taken by other students appear taken right away, with no page refresh needed.

## Users and roles

- **Student**: signs in, picks or changes one seat for a trip they're on.
- **Teacher/Admin**: sets up a trip (name, date, bus layout), opens and closes seat
  selection, views and exports the seating chart, and can clear a student's seat.

## Architecture

- **Frontend**: static site (HTML/CSS/JavaScript) hosted on **GitHub Pages**.
- **Backend/database**: **Firebase** (free Spark plan)
  - **Firebase Authentication** with Google sign-in, restricted to the school's email domain.
  - **Cloud Firestore** stores trips, bus layouts, and seat assignments, and pushes
    real-time updates to the seat map.
- GitHub Pages only serves static files. It can't store data or share it between users,
  so all shared state lives in Firestore.

## Data model (Firestore)

```
admins/{email}                         // teachers. The master admin has super: true (set by hand
  super?, addedBy, addedAt             // in the console); the master admin adds/removes the rest in the app

trips/{tripId}                         // tripId = slug + random suffix, e.g. "zoo-visit-x7k2"
  name, date, isOpen (bool), createdBy, createdAt

trips/{tripId}/buses/{busId}
  name, rows, seatsPerRow, order

trips/{tripId}/seats/{busId_seat}      // e.g. "aB3xY9_5C"; one doc per taken seat
  busId, seat, studentEmail, studentName, takenAt

trips/{tripId}/students/{email}        // one doc per student = one seat per student per trip
  seatKey
```

## Key rules

- **No double-booking**: claiming a seat uses a Firestore **transaction** that checks
  the seat is free and releases the student's previous seat in the same step.
- **Security rules**, enforced server-side in `firestore.rules`:
  - Only signed-in users whose email ends in the school domain can read or write.
  - A student can only write a seat doc with their own email, and only while `isOpen` is true.
  - Only admins (listed in an `admins` collection) can create or edit trips and buses or
    override seats.
  - Only the master admin (`super: true`) can add or remove admins, and no one can grant
    `super` from the app.
- Never trust the client. The security rules are what actually protect the data.

## Project conventions

- Keep it simple: plain HTML/CSS/JS with ES modules, no build step unless it becomes
  necessary. The Firebase JS SDK loads from its CDN.
- Mobile-first: most students will use their phones.
- The Firebase web config (apiKey etc.) is meant to be public and is safe to commit.
  Security comes from the Auth and Firestore rules.
- Store only the minimum student data: school email, display name, and seat.

## Current status

- **Draft** being built to present to a manager. Live at https://fuhktong.github.io/zionbus/
  (GitHub Pages) with Firebase project `zionbus-a56e3`.
- Home page lists trips; teachers create trips there. Each trip has one or more buses; a new
  bus defaults to 10 rows × 4 (aisle in the middle), editable per bus in Teacher tools → Buses.
- School: Google Workspace, email domain **`@zispp.org`**.
- **Demo mode**: while `firebaseConfig.apiKey` in `js/config.js` is empty, or when the URL has
  `?demo`, the app uses
  `js/store-demo.js` (browser localStorage) instead of Firebase. Both stores export the same
  functions, and `js/app.js` never talks to Firebase directly.
- Run locally with `python3 -m http.server` (ES modules don't load from `file://`).

## Open questions

- Real bus layout: seats per bus, rows, and whether there are back-row bench seats.
- Should students see who is sitting in taken seats? Right now only teachers see names.
- Should each trip use a pre-loaded roster of students?
