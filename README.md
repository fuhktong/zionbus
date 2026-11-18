# ZionBus

Pick your bus seat for school field trips, like choosing a seat on an airline.

## Try the demo (no setup)

The app runs in **demo mode** until Firebase is configured. Data is saved only in your browser.

```sh
cd zionbus
python3 -m http.server 8000
```

Open http://localhost:8000

You can also add `?demo` to the live site's address to try demo mode there.

- Sign in with any `@zispp.org` email, e.g. `ava.student@zispp.org`.
- Sign in as `teacher@zispp.org` (master admin) to create trips, set up buses, open/close seat
  selection, see who sits where, clear a seat, download a CSV, and add or remove teachers.
- `ms.lee@zispp.org` is a regular teacher: everything except managing teachers.
- Open a second browser tab and sign in as a different student to see seats update live.
- **Reset demo** in the yellow banner puts the sample seats back.

(Opening `index.html` directly as a file won't work. It must be served over http.)

## Going live: Firebase setup (~15 minutes, free)

1. Go to https://console.firebase.google.com and create a project (Google Analytics not needed).
2. **Authentication** → Get started → **Google** → Enable.
   Then Settings → **Authorized domains** → add `<your-github-username>.github.io`.
3. **Firestore Database** → Create database (production mode).
   Open the **Rules** tab, paste in `firestore.rules`, and Publish.
4. In Firestore **Data**, create a collection `admins` with one document for yourself, the
   master admin. The **Document ID** is your school email in lowercase, with one field:
   `super` (boolean) = `true`. You add every other teacher from the app's home page.
5. Project settings → **Your apps** → add a Web app (`</>`). Copy the `firebaseConfig`
   values into `js/config.js`. Once `apiKey` is set, demo mode turns off.
6. Sign in, create a trip on the home page, set up its buses, then click
   **Open seat selection**.

The home page lists every trip. Each trip also has its own link to share with students,
like `https://…/zionbus/?trip=zoo-visit-x7k2`.

## Hosting on GitHub Pages

1. Create a GitHub repo and push these files.
2. Repo **Settings → Pages** → Source: *Deploy from a branch* → `main` / root.
3. The site will be at `https://<username>.github.io/<repo>/`.

## Files

| File | Purpose |
|---|---|
| `index.html`, `css/styles.css` | Page and styling |
| `js/app.js` | UI: seat map, action bar, teacher tools |
| `js/config.js` | School domain, default bus layout, Firebase config |
| `js/store-demo.js` | Demo backend (browser storage) |
| `js/store-firebase.js` | Real backend (Google sign-in + Firestore) |
| `firestore.rules` | Server-side security rules. These are what stop cheating and double-booking. |
