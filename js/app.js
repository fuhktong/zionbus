import { DEMO_MODE, SCHOOL_DOMAIN, TRIP_ID, DEFAULT_BUS } from './config.js';

const store = DEMO_MODE ? await import('./store-demo.js') : await import('./store-firebase.js');

const $ = (sel) => document.querySelector(sel);
const LETTERS = 'ABCDEF';
const FORCED_DEMO = new URLSearchParams(location.search).has('demo');

const state = {
  user: null,
  admin: false,
  super: false,
  // Home
  trips: [],
  admins: [],
  // Trip
  trip: null,
  tripLoaded: false,
  buses: [],
  busesLoaded: false,
  seats: {},
  busId: null,
  busPicked: false,
  selected: null,
  busy: false,
};
let unsubscribers = [];

// ---- Helpers ----

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(isoDate, style = 'long') {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, style === 'long'
    ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric' });
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}

// Keeps ?demo on links when demo mode was turned on from the address bar.
function homeUrl() {
  return FORCED_DEMO ? './?demo' : './';
}
function tripUrl(id) {
  return `./?trip=${encodeURIComponent(id)}${FORCED_DEMO ? '&demo' : ''}`;
}

function makeTripId(name) {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 40) || 'trip';
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseSeatKey(key) {
  const i = key.lastIndexOf('_');
  return { busId: key.slice(0, i), seat: key.slice(i + 1) };
}

function seatOrder(seat) {
  const [, row, letter] = seat.match(/^(\d+)(\D+)$/) || [, 0, seat];
  return { row: Number(row), letter };
}

function busIndex(busId) {
  const i = state.buses.findIndex((b) => b.id === busId);
  return i === -1 ? Infinity : i;
}

// Sorts by bus, then "2A" before "10A".
function compareSeatKeys(a, b) {
  const sa = parseSeatKey(a);
  const sb = parseSeatKey(b);
  const oa = seatOrder(sa.seat);
  const ob = seatOrder(sb.seat);
  return busIndex(sa.busId) - busIndex(sb.busId) || oa.row - ob.row || oa.letter.localeCompare(ob.letter);
}

function busName(busId) {
  return state.buses.find((b) => b.id === busId)?.name || 'Removed bus';
}

function seatLabel(key) {
  const { busId, seat } = parseSeatKey(key);
  return state.buses.length > 1 ? `${busName(busId)} · ${seat}` : `Seat ${seat}`;
}

function busSize(bus) {
  return bus.rows * Math.min(bus.seatsPerRow, LETTERS.length);
}

function takenOnBus(busId) {
  return Object.values(state.seats).filter((s) => s.busId === busId).length;
}

function mySeatKey() {
  return Object.keys(state.seats).find((key) => state.seats[key].studentEmail === state.user?.email);
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

async function run(action) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    await action();
  } catch (err) {
    console.error(err);
    toast(err.code === 'permission-denied'
      ? 'You don’t have permission to do that.'
      : err.message || 'Something went wrong. Please try again.');
  } finally {
    state.busy = false;
    render();
  }
}

// ---- Auth ----

function showLogin(error = '') {
  $('#login').hidden = false;
  $('#home').hidden = true;
  $('#trip-view').hidden = true;
  $('#user-box').hidden = true;
  $('#action-bar').hidden = true;
  $('#demo-login').hidden = !DEMO_MODE;
  $('#google-login').hidden = DEMO_MODE;
  $('#login-error').textContent = error;
}

store.onAuth(async (user) => {
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];
  Object.assign(state, {
    user: null, admin: false, super: false, trips: [], admins: [],
    trip: null, tripLoaded: false, buses: [], busesLoaded: false, seats: {}, busId: null, busPicked: false, selected: null,
  });

  if (!user) return showLogin();
  if (!user.email.endsWith(`@${SCHOOL_DOMAIN}`)) {
    await store.signOut();
    return showLogin(`Please sign in with your @${SCHOOL_DOMAIN} school account.`);
  }

  state.user = user;
  const role = await store.getRole(user);
  state.admin = role.admin;
  state.super = role.super;

  $('#login').hidden = true;
  $('#user-box').hidden = false;
  $('#user-email').textContent = user.email;

  if (TRIP_ID) startTripView();
  else startHome();
});

function startHome() {
  $('#home').hidden = false;
  $('#trip-view').hidden = true;
  $('#action-bar').hidden = true;
  $('#new-trip').hidden = !state.admin;
  $('#teachers').hidden = !state.super;

  unsubscribers.push(store.watchTrips((trips) => {
    state.trips = trips;
    render();
  }));
  if (state.super) {
    unsubscribers.push(store.watchAdmins((admins) => {
      state.admins = admins;
      render();
    }));
  }
}

function startTripView() {
  $('#home').hidden = true;
  $('#trip-view').hidden = false;
  $('#admin').hidden = !state.admin;

  unsubscribers.push(store.watchTrip(TRIP_ID, (trip) => {
    state.trip = trip;
    state.tripLoaded = true;
    render();
  }));
  unsubscribers.push(store.watchBuses(TRIP_ID, (buses) => {
    state.busesLoaded = true;
    state.buses = buses.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
    render();
  }));
  unsubscribers.push(store.watchSeats(TRIP_ID, (seats) => {
    state.seats = seats;
    if (state.selected && seats[state.selected]) {
      if (seats[state.selected].studentEmail !== state.user.email) {
        toast(`${seatLabel(state.selected)} was just taken.`);
      }
      state.selected = null;
    }
    render();
  }));
}

$('#demo-login').addEventListener('submit', (e) => {
  e.preventDefault();
  store.signIn($('#demo-email').value);
});

$('#google-login').addEventListener('click', async () => {
  try {
    await store.signIn();
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') $('#login-error').textContent = err.message;
  }
});

$('#sign-out').addEventListener('click', () => store.signOut());

// ---- Rendering ----

function render() {
  if (!state.user) return;
  if (TRIP_ID) renderTrip();
  else renderHome();
}

// Home

function tripCard(trip) {
  return `<li><a class="trip-card" href="${escapeHtml(tripUrl(trip.id))}">
      <span class="trip-card-text">
        <span class="trip-name">${escapeHtml(trip.name)}</span>
        <span class="muted">${trip.date ? escapeHtml(formatDate(trip.date, 'short')) : 'No date set'}</span>
      </span>
      <span class="badge ${trip.isOpen ? 'open' : 'closed'}">${trip.isOpen ? 'Open' : 'Closed'}</span>
    </a></li>`;
}

function renderHome() {
  const today = todayIso();
  const upcoming = state.trips.filter((t) => !t.date || t.date >= today)
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.name.localeCompare(b.name));
  const past = state.trips.filter((t) => t.date && t.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  $('#trip-list').innerHTML = upcoming.length
    ? upcoming.map(tripCard).join('')
    : `<li class="muted empty">No upcoming field trips.${state.admin ? ' Create one below.' : ''}</li>`;
  $('#past-heading').hidden = !past.length;
  $('#past-list').innerHTML = past.map(tripCard).join('');

  if (state.super) renderTeachers();
}

function renderTeachers() {
  const admins = [...state.admins].sort((a, b) => b.super - a.super || a.email.localeCompare(b.email));
  $('#teacher-list').innerHTML = admins.map((a) => `
    <li>
      <span class="teacher-email">${escapeHtml(a.email)}</span>
      ${a.super
        ? '<span class="badge">Master admin</span>'
        : `<button type="button" class="link-button danger" data-remove-teacher="${escapeHtml(a.email)}"
            ${state.busy ? 'disabled' : ''}>Remove</button>`}
    </li>`).join('');
}

// Trip

function renderTrip() {
  const { trip } = state;
  if (!state.tripLoaded) return;

  if (!trip) {
    document.title = 'Trip not found — ZionBus';
    $('#trip-title').textContent = 'Trip not found';
    $('#trip-date').textContent = '';
    $('#trip-status').textContent = 'This link may be wrong, or the trip was deleted.';
    $('#trip-status').className = 'status';
    $('#trip-body').hidden = true;
    $('#admin').hidden = true;
    $('#action-bar').hidden = true;
    return;
  }

  document.title = `${trip.name} — ZionBus`;
  $('#trip-body').hidden = false;
  $('#admin').hidden = !state.admin;
  $('#trip-title').textContent = trip.name;
  $('#trip-date').textContent = formatDate(trip.date);
  $('#trip-status').textContent = trip.isOpen ? 'Seat selection is open' : 'Seat selection is closed';
  $('#trip-status').className = `status ${trip.isOpen ? 'open' : 'closed'}`;

  pickBus();
  renderBusTabs();
  renderSeatMap();
  renderActionBar();
  renderAdmin();
}

// Shows the student's own bus first, unless they've picked a tab.
function pickBus() {
  const mine = mySeatKey();
  const myBus = mine && state.seats[mine].busId;
  const exists = (id) => state.buses.some((b) => b.id === id);
  if (!state.busPicked && exists(myBus)) state.busId = myBus;
  if (!exists(state.busId)) state.busId = state.buses[0]?.id ?? null;
}

function renderBusTabs() {
  const tabs = $('#bus-tabs');
  tabs.hidden = state.buses.length < 2;
  const myBus = state.seats[mySeatKey()]?.busId;
  tabs.innerHTML = state.buses.map((bus) => {
    const free = Math.max(0, busSize(bus) - takenOnBus(bus.id));
    const active = bus.id === state.busId;
    return `<button type="button" role="tab" class="bus-tab ${active ? 'active' : ''}"
        aria-selected="${active}" data-bus-tab="${escapeHtml(bus.id)}">
        <span class="bus-tab-name">${escapeHtml(bus.name)}${bus.id === myBus ? ' ★' : ''}</span>
        <span class="bus-tab-count">${free} open</span>
      </button>`;
  }).join('');
}

function renderSeatMap() {
  const { trip, seats, admin, selected } = state;
  const bus = state.buses.find((b) => b.id === state.busId);
  $('#bus-name').textContent = state.buses.length > 1 && bus ? bus.name : '';

  if (!bus) {
    $('#seat-map').innerHTML = `<p class="muted empty">${admin
      ? 'This trip has no buses yet. Add one in Teacher tools → Buses.'
      : 'Buses haven’t been set up for this trip yet.'}</p>`;
    return;
  }

  const perRow = Math.min(bus.seatsPerRow, LETTERS.length);
  const leftCount = Math.ceil(perRow / 2);
  const mine = mySeatKey();
  let html = '';

  for (let row = 1; row <= bus.rows; row++) {
    html += `<div class="seat-row"><span class="row-num">${row}</span>`;
    for (let i = 0; i < perRow; i++) {
      if (i === leftCount) html += '<span class="aisle"></span>';
      const seat = `${row}${LETTERS[i]}`;
      const key = `${bus.id}_${seat}`;
      const taken = seats[key];
      let cls = 'available';
      let label = `Seat ${seat}, available`;
      if (key === mine) {
        cls = 'mine';
        label = `Seat ${seat}, your seat`;
      } else if (taken) {
        cls = 'taken';
        label = admin ? `Seat ${seat}, ${taken.studentName}` : `Seat ${seat}, taken`;
      } else if (key === selected) {
        cls = 'selected';
        label = `Seat ${seat}, selected`;
      }
      const disabled = !trip.isOpen || state.busy || (taken && key !== mine);
      html += `<button type="button" class="seat ${cls}" data-seat="${escapeHtml(key)}" title="${escapeHtml(label)}"
        aria-label="${escapeHtml(label)}" ${disabled ? 'disabled' : ''}>${LETTERS[i]}</button>`;
    }
    html += '</div>';
  }
  $('#seat-map').innerHTML = html;
}

function renderActionBar() {
  const { trip, selected } = state;
  const mine = mySeatKey();
  const bar = $('#action-bar');
  const buttons = $('#action-buttons');
  bar.hidden = false;

  if (selected) {
    $('#action-text').innerHTML = mine
      ? `Move from <strong>${escapeHtml(seatLabel(mine))}</strong> to <strong>${escapeHtml(seatLabel(selected))}</strong>?`
      : `<strong>${escapeHtml(seatLabel(selected))}</strong> selected`;
    buttons.innerHTML = `
      <button type="button" data-action="cancel">Cancel</button>
      <button type="button" class="primary" data-action="confirm" ${state.busy ? 'disabled' : ''}>Confirm seat</button>`;
  } else if (mine) {
    $('#action-text').innerHTML = `Your seat: <strong>${escapeHtml(seatLabel(mine))}</strong>`;
    buttons.innerHTML = trip.isOpen
      ? `<button type="button" data-action="release" ${state.busy ? 'disabled' : ''}>Give up seat</button>`
      : '';
  } else if (!state.buses.length) {
    bar.hidden = true;
  } else {
    $('#action-text').textContent = trip.isOpen
      ? 'Tap an open seat to choose it.'
      : 'Seat selection is closed. Ask your teacher if you need a seat.';
    buttons.innerHTML = '';
  }
}

function renderAdmin() {
  if (!state.admin) return;
  const { trip, seats, buses } = state;
  const total = buses.reduce((sum, b) => sum + busSize(b), 0);
  const keys = Object.keys(seats).sort(compareSeatKeys);

  $('#seat-count').textContent = `${keys.length} of ${total} seats taken`
    + (buses.length > 1 ? ` on ${buses.length} buses` : '');
  $('#toggle-open').textContent = trip.isOpen ? 'Close seat selection' : 'Open seat selection';
  $('#toggle-open').disabled = state.busy;

  $('#roster').innerHTML = keys.length
    ? keys.map((key) => `
        <tr>
          <td>${escapeHtml(busName(seats[key].busId))}</td>
          <td><strong>${escapeHtml(seats[key].seat)}</strong></td>
          <td>${escapeHtml(seats[key].studentName)}</td>
          <td class="muted email-col">${escapeHtml(seats[key].studentEmail)}</td>
          <td><button type="button" class="link-button danger" data-clear="${escapeHtml(key)}">Clear</button></td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="muted">No seats taken yet.</td></tr>';

  if (state.busesLoaded && !buses.length) $('#bus-settings').open = true;
  if (!$('#bus-list').contains(document.activeElement)) renderBusForms();
  if (!$('#trip-form').contains(document.activeElement)) {
    const form = $('#trip-form').elements;
    form.name.value = trip.name;
    form.date.value = trip.date || '';
  }
}

function renderBusForms() {
  $('#bus-list').innerHTML = state.buses.map((bus) => `
    <form class="bus-form grid-form" data-bus="${escapeHtml(bus.id)}">
      <label class="wide">Bus name <input name="name" required maxlength="40" value="${escapeHtml(bus.name)}"></label>
      <label>Rows <input name="rows" type="number" min="1" max="20" required value="${bus.rows}"></label>
      <label>Seats per row <input name="seatsPerRow" type="number" min="2" max="6" required value="${bus.seatsPerRow}"></label>
      <div class="bus-form-actions wide">
        <span class="muted">${takenOnBus(bus.id)} of ${busSize(bus)} seats taken</span>
        <button type="button" class="danger-button" data-remove-bus="${escapeHtml(bus.id)}">Remove</button>
        <button type="submit" class="primary">Save bus</button>
      </div>
    </form>`).join('') || '<p class="muted">No buses yet.</p>';
}

// ---- Events: home ----

$('#new-trip-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target.elements;
  const name = form.name.value.trim();
  if (!name) return;
  const tripId = makeTripId(name);
  run(async () => {
    await store.createTrip(tripId, {
      name, date: form.date.value, isOpen: false, createdBy: state.user.email, createdAt: Date.now(),
    }, { name: 'Bus 1', ...DEFAULT_BUS, order: 1 });
    location.href = tripUrl(tripId);
  });
});

$('#add-teacher-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = e.target.elements.email;
  const email = input.value.trim().toLowerCase();
  if (!email.endsWith(`@${SCHOOL_DOMAIN}`)) return toast(`Teachers need an @${SCHOOL_DOMAIN} email.`);
  if (state.admins.some((a) => a.email === email)) return toast(`${email} is already a teacher.`);
  run(async () => {
    await store.addAdmin(email, state.user);
    input.value = '';
    toast(`${email} added. They’ll see Teacher tools next time they sign in.`);
  });
});

$('#teacher-list').addEventListener('click', (e) => {
  const email = e.target.closest('[data-remove-teacher]')?.dataset.removeTeacher;
  if (email && confirm(`Remove ${email} as a teacher?`)) {
    run(async () => {
      await store.removeAdmin(email);
      toast(`${email} removed.`);
    });
  }
});

// ---- Events: trip ----

$('#bus-tabs').addEventListener('click', (e) => {
  const busId = e.target.closest('[data-bus-tab]')?.dataset.busTab;
  if (!busId) return;
  state.busId = busId;
  state.busPicked = true;
  render();
});

$('#seat-map').addEventListener('click', (e) => {
  const btn = e.target.closest('.seat');
  if (!btn || btn.disabled) return;
  const key = btn.dataset.seat;
  if (key === mySeatKey()) return;
  state.selected = state.selected === key ? null : key;
  render();
});

$('#action-buttons').addEventListener('click', (e) => {
  const action = e.target.closest('button')?.dataset.action;
  if (action === 'cancel') {
    state.selected = null;
    render();
  } else if (action === 'confirm') {
    const key = state.selected;
    const { busId, seat } = parseSeatKey(key);
    run(async () => {
      await store.claimSeat(TRIP_ID, busId, seat, state.user);
      state.selected = null;
      toast(`You’re in ${seatLabel(key)}.`);
    });
  } else if (action === 'release') {
    if (confirm('Give up your seat? Someone else may take it.')) {
      run(() => store.releaseSeat(TRIP_ID, state.user));
    }
  }
});

$('#toggle-open').addEventListener('click', () => {
  run(() => store.saveTrip(TRIP_ID, { isOpen: !state.trip.isOpen }));
});

$('#roster').addEventListener('click', (e) => {
  const key = e.target.closest('[data-clear]')?.dataset.clear;
  if (key && confirm(`Clear ${seatLabel(key)} (${state.seats[key]?.studentName})?`)) {
    run(() => store.clearSeat(TRIP_ID, key));
  }
});

$('#bus-list').addEventListener('submit', (e) => {
  e.preventDefault();
  const formEl = e.target;
  const form = formEl.elements;
  const data = {
    name: form.name.value.trim(),
    rows: Number(form.rows.value),
    seatsPerRow: Number(form.seatsPerRow.value),
  };
  run(async () => {
    await store.saveBus(TRIP_ID, formEl.dataset.bus, data);
    document.activeElement?.blur();
    toast(`${data.name} saved.`);
  });
});

$('#bus-list').addEventListener('click', (e) => {
  const busId = e.target.closest('[data-remove-bus]')?.dataset.removeBus;
  if (!busId) return;
  const taken = takenOnBus(busId);
  const warning = taken ? ` ${taken} student${taken === 1 ? '' : 's'} on it will lose their seat.` : '';
  if (confirm(`Remove ${busName(busId)}?${warning}`)) {
    run(() => store.deleteBus(TRIP_ID, busId));
  }
});

$('#add-bus').addEventListener('click', () => {
  const order = Math.max(0, ...state.buses.map((b) => b.order ?? 0)) + 1;
  run(async () => {
    await store.saveBus(TRIP_ID, null, { name: `Bus ${state.buses.length + 1}`, ...DEFAULT_BUS, order });
    toast('Bus added.');
  });
});

$('#trip-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target.elements;
  run(async () => {
    await store.saveTrip(TRIP_ID, { name: form.name.value.trim(), date: form.date.value });
    document.activeElement?.blur();
    toast('Trip saved.');
  });
});

$('#delete-trip').addEventListener('click', () => {
  const typed = prompt(`This deletes "${state.trip.name}" and all its seats. Type DELETE to confirm.`);
  if (typed?.trim().toUpperCase() !== 'DELETE') return;
  run(async () => {
    await store.deleteTrip(TRIP_ID);
    location.href = homeUrl();
  });
});

$('#export-csv').addEventListener('click', () => {
  const quote = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Bus', 'Seat', 'Student', 'Email']];
  Object.keys(state.seats).sort(compareSeatKeys).forEach((key) => {
    const s = state.seats[key];
    rows.push([busName(s.busId), s.seat, s.studentName, s.studentEmail]);
  });
  const csv = rows.map((r) => r.map(quote).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = `${state.trip.name.replace(/[^\w-]+/g, '_')}_seating.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// ---- Setup ----

$('#home-link').href = homeUrl();
$('#back-link').href = homeUrl();

if (DEMO_MODE) {
  $('#demo-banner').hidden = false;
  $('#reset-demo').addEventListener('click', () => {
    if (confirm('Reset the demo to its starting data?')) store.resetDemo();
  });
}
