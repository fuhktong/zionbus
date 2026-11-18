import { DEMO_MODE, SCHOOL_DOMAIN, TRIP_ID, DEFAULT_TRIP } from './config.js';

const store = DEMO_MODE ? await import('./store-demo.js') : await import('./store-firebase.js');

const $ = (sel) => document.querySelector(sel);
const LETTERS = 'ABCDEF';

const state = {
  user: null,
  admin: false,
  trip: null,
  seats: {},
  selected: null,
  busy: false,
};
let unsubscribers = [];

// ---- Helpers ----

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

// Sorts "2A" before "10A".
function compareSeatIds(a, b) {
  const [, rowA, letterA] = a.match(/^(\d+)(\D+)$/) || [, 0, a];
  const [, rowB, letterB] = b.match(/^(\d+)(\D+)$/) || [, 0, b];
  return rowA - rowB || letterA.localeCompare(letterB);
}

function mySeatId() {
  return Object.keys(state.seats).find((id) => state.seats[id].studentEmail === state.user?.email);
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
    toast(err.message || 'Something went wrong. Please try again.');
  } finally {
    state.busy = false;
    render();
  }
}

// ---- Auth ----

function showLogin(error = '') {
  $('#login').hidden = false;
  $('#app').hidden = true;
  $('#user-box').hidden = true;
  $('#action-bar').hidden = true;
  $('#demo-login').hidden = !DEMO_MODE;
  $('#google-login').hidden = DEMO_MODE;
  $('#login-error').textContent = error;
}

store.onAuth(async (user) => {
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];
  Object.assign(state, { user: null, admin: false, trip: null, seats: {}, selected: null });

  if (!user) return showLogin();
  if (!user.email.endsWith(`@${SCHOOL_DOMAIN}`)) {
    await store.signOut();
    return showLogin(`Please sign in with your @${SCHOOL_DOMAIN} school account.`);
  }

  state.user = user;
  state.admin = await store.isAdmin(user);

  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#user-box').hidden = false;
  $('#user-email').textContent = user.email;
  $('#admin').hidden = !state.admin;

  unsubscribers.push(store.watchTrip(TRIP_ID, (trip) => {
    state.trip = trip;
    render();
  }));
  unsubscribers.push(store.watchSeats(TRIP_ID, (seats) => {
    state.seats = seats;
    if (state.selected && seats[state.selected]) {
      if (seats[state.selected].studentEmail !== state.user.email) toast(`Seat ${state.selected} was just taken.`);
      state.selected = null;
    }
    render();
  }));
});

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
  const { trip } = state;

  if (!trip) {
    $('#trip-title').textContent = 'This trip isn’t set up yet';
    $('#trip-date').textContent = '';
    $('#trip-status').textContent = state.admin
      ? 'Fill in Trip settings below to create it.'
      : 'Check back once your teacher opens seat selection.';
    $('#trip-status').className = 'status';
    $('#seat-map').innerHTML = '';
    $('#action-bar').hidden = true;
    renderAdmin();
    return;
  }

  $('#trip-title').textContent = trip.name;
  $('#trip-date').textContent = formatDate(trip.date);
  $('#trip-status').textContent = trip.isOpen ? 'Seat selection is open' : 'Seat selection is closed';
  $('#trip-status').className = `status ${trip.isOpen ? 'open' : 'closed'}`;

  renderSeatMap();
  renderActionBar();
  renderAdmin();
}

function renderSeatMap() {
  const { trip, seats, user, admin, selected } = state;
  const perRow = Math.min(trip.seatsPerRow, LETTERS.length);
  const leftCount = Math.ceil(perRow / 2);
  const mine = mySeatId();
  let html = '';

  for (let row = 1; row <= trip.rows; row++) {
    html += `<div class="seat-row"><span class="row-num">${row}</span>`;
    for (let i = 0; i < perRow; i++) {
      if (i === leftCount) html += '<span class="aisle"></span>';
      const id = `${row}${LETTERS[i]}`;
      const seat = seats[id];
      let cls = 'available';
      let label = `Seat ${id}, available`;
      if (id === mine) {
        cls = 'mine';
        label = `Seat ${id}, your seat`;
      } else if (seat) {
        cls = 'taken';
        label = admin ? `Seat ${id}, ${seat.studentName}` : `Seat ${id}, taken`;
      } else if (id === selected) {
        cls = 'selected';
        label = `Seat ${id}, selected`;
      }
      const disabled = !trip.isOpen || state.busy || (seat && id !== mine);
      html += `<button type="button" class="seat ${cls}" data-seat="${id}" title="${escapeHtml(label)}"
        aria-label="${escapeHtml(label)}" ${disabled ? 'disabled' : ''}>${LETTERS[i]}</button>`;
    }
    html += '</div>';
  }
  $('#seat-map').innerHTML = html;
}

function renderActionBar() {
  const { trip, selected } = state;
  const mine = mySeatId();
  const bar = $('#action-bar');
  const buttons = $('#action-buttons');
  bar.hidden = false;

  if (selected) {
    $('#action-text').innerHTML = mine
      ? `Move from <strong>${mine}</strong> to <strong>${selected}</strong>?`
      : `Seat <strong>${selected}</strong> selected`;
    buttons.innerHTML = `
      <button type="button" data-action="cancel">Cancel</button>
      <button type="button" class="primary" data-action="confirm" ${state.busy ? 'disabled' : ''}>Confirm seat</button>`;
  } else if (mine) {
    $('#action-text').innerHTML = `Your seat: <strong>${mine}</strong>`;
    buttons.innerHTML = trip.isOpen
      ? `<button type="button" data-action="release" ${state.busy ? 'disabled' : ''}>Give up seat</button>`
      : '';
  } else {
    $('#action-text').textContent = trip.isOpen
      ? 'Tap an open seat to choose it.'
      : 'Seat selection is closed. Ask your teacher if you need a seat.';
    buttons.innerHTML = '';
  }
}

function renderAdmin() {
  if (!state.admin) return;
  const { trip, seats } = state;
  const total = trip ? trip.rows * Math.min(trip.seatsPerRow, LETTERS.length) : 0;
  const ids = Object.keys(seats).sort(compareSeatIds);

  $('#seat-count').textContent = trip ? `${ids.length} of ${total} seats taken` : '';
  $('#toggle-open').hidden = !trip;
  $('#export-csv').hidden = !trip;
  $('#toggle-open').textContent = trip?.isOpen ? 'Close seat selection' : 'Open seat selection';

  $('#roster').innerHTML = ids.length
    ? ids.map((id) => `
        <tr>
          <td><strong>${id}</strong></td>
          <td>${escapeHtml(seats[id].studentName)}</td>
          <td class="muted email-col">${escapeHtml(seats[id].studentEmail)}</td>
          <td><button type="button" class="link-button danger" data-clear="${id}">Clear</button></td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="muted">No seats taken yet.</td></tr>';

  if (!trip) $('#trip-settings').open = true;
  if (!$('#trip-form').contains(document.activeElement)) fillTripForm();
}

function fillTripForm() {
  const form = $('#trip-form').elements;
  const trip = state.trip || DEFAULT_TRIP;
  form.name.value = trip.name;
  form.date.value = trip.date || '';
  form.rows.value = trip.rows;
  form.seatsPerRow.value = trip.seatsPerRow;
}

// ---- Events ----

$('#seat-map').addEventListener('click', (e) => {
  const btn = e.target.closest('.seat');
  if (!btn || btn.disabled) return;
  const id = btn.dataset.seat;
  if (id === mySeatId()) return;
  state.selected = state.selected === id ? null : id;
  render();
});

$('#action-buttons').addEventListener('click', (e) => {
  const action = e.target.closest('button')?.dataset.action;
  if (action === 'cancel') {
    state.selected = null;
    render();
  } else if (action === 'confirm') {
    const seatId = state.selected;
    run(async () => {
      await store.claimSeat(TRIP_ID, seatId, state.user);
      state.selected = null;
      toast(`You're in seat ${seatId}.`);
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
  const id = e.target.closest('[data-clear]')?.dataset.clear;
  if (id && confirm(`Clear seat ${id} (${state.seats[id]?.studentName})?`)) {
    run(() => store.clearSeat(TRIP_ID, id));
  }
});

$('#trip-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target.elements;
  const data = {
    name: form.name.value.trim(),
    date: form.date.value,
    rows: Number(form.rows.value),
    seatsPerRow: Number(form.seatsPerRow.value),
  };
  if (!state.trip) data.isOpen = true;
  run(async () => {
    await store.saveTrip(TRIP_ID, data);
    document.activeElement?.blur();
    toast('Trip saved.');
  });
});

$('#export-csv').addEventListener('click', () => {
  const quote = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Seat', 'Student', 'Email']];
  Object.keys(state.seats).sort(compareSeatIds).forEach((id) => {
    rows.push([id, state.seats[id].studentName, state.seats[id].studentEmail]);
  });
  const csv = rows.map((r) => r.map(quote).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = `${state.trip.name.replace(/[^\w-]+/g, '_')}_seating.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

if (DEMO_MODE) {
  $('#demo-banner').hidden = false;
  $('#reset-demo').addEventListener('click', () => {
    if (confirm('Reset the demo to its starting seats?')) store.resetDemo();
  });
}
