// ---------- calendar view (month view) ----------
// Adds a per-task day assignment on top of the existing week-based state, without
// touching state.done / state.custom / state.deleted or the Groq parsing pipeline.
// state.taskDay = { taskId: "2026-09-10" }  (ISO date string)

let fcCalendar = null;
let calTooltipEl = null;

function ensureTaskDay() {
  if (!state.taskDay) state.taskDay = {};
}

// Monday-of-week fallback for tasks that haven't been dragged to a specific day yet.
// Scans the week's date label for a month name, then grabs the first number after it,
// so it works regardless of whatever prefix ("Week N ·") comes before the date.
function weekMondayISO(week) {
  const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const str = String(week.date).toLowerCase();
  for (let mi = 0; mi < monthNames.length; mi++) {
    const idx = str.indexOf(monthNames[mi]);
    if (idx === -1) continue;
    const after = str.slice(idx + monthNames[mi].length);
    const dayMatch = after.match(/\d+/);
    if (!dayMatch) continue;
    const day = parseInt(dayMatch[0], 10);
    const year = new Date().getFullYear();
    return new Date(year, mi, day).toISOString().slice(0, 10);
  }
  return null;
}

// Stable hash of a task's own id -> 0-4, so un-dragged tasks spread across
// Mon-Fri of their week instead of all piling onto Monday. Same task always
// lands on the same day by default (no flicker on re-render).
function taskOffsetDays(taskId) {
  let sum = 0;
  for (let i = 0; i < taskId.length; i++) sum += taskId.charCodeAt(i);
  return sum % 5;
}

function getTaskDay(taskId, week) {
  ensureTaskDay();
  if (state.taskDay[taskId]) return state.taskDay[taskId];
  const monday = weekMondayISO(week);
  if (!monday) return null;
  const d = new Date(monday + 'T00:00:00');
  d.setDate(d.getDate() + taskOffsetDays(taskId));
  return d.toISOString().slice(0, 10);
}

// Flattens all tasks (base + custom, excluding deleted) across all weeks into
// FullCalendar event objects.
function buildCalendarEvents() {
  const events = [];
  baseWeeks.forEach(w => {
    Object.keys(w.groups).forEach(courseKey => {
      const course = COURSES[courseKey];
      getGroupTasks(w, courseKey).forEach(t => {
        const day = getTaskDay(t.id, w);
        if (!day) return;
        events.push({
          id: t.id,
          title: t.t,
          start: day,
          allDay: true,
          backgroundColor: course.color,
          borderColor: course.color,
          textColor: '#ffffff',
          classNames: t.done ? ['fc-task-done'] : [],
        });
      });
    });
  });
  return events;
}

// ---------- custom hover tooltip (native title attr is too subtle/delayed) ----------
function ensureCalTooltip() {
  if (calTooltipEl) return calTooltipEl;
  calTooltipEl = document.createElement('div');
  calTooltipEl.className = 'cal-tooltip';
  document.body.appendChild(calTooltipEl);
  return calTooltipEl;
}

function showCalTooltip(el, text) {
  const tip = ensureCalTooltip();
  tip.textContent = text;
  tip.style.display = 'block';
  const rect = el.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = rect.left;
  if (left + tipRect.width > window.innerWidth - 8) left = window.innerWidth - tipRect.width - 8;
  tip.style.left = Math.max(8, left) + 'px';
  tip.style.top = Math.max(8, rect.top - tipRect.height - 8) + 'px';
}

function hideCalTooltip() {
  if (calTooltipEl) calTooltipEl.style.display = 'none';
}

// ---------- floating legend (shown in fullscreen calendar mode) ----------
function renderCalLegend() {
  const el = document.getElementById('calLegend');
  if (!el) return;
  el.innerHTML = Object.values(COURSES).map(c =>
    `<div class="leg"><div class="leg-dot" style="background:${c.color}"></div>${c.name}</div>`
  ).join('');
}

function initCalendarView() {
  const root = document.getElementById('calRoot');
  if (!root || typeof FullCalendar === 'undefined') return;

  if (fcCalendar) { fcCalendar.destroy(); fcCalendar = null; }

  fcCalendar = new FullCalendar.Calendar(root, {
    initialView: 'dayGridMonth',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' },
    buttonText: { dayGridMonth: 'month', dayGridWeek: 'week' },
    editable: true,
    dayMaxEvents: true,
    views: {
      dayGridWeek: { dayMaxEventRows: false },
    },
    moreLinkClick: 'popover',
    height: 'auto',
    events: buildCalendarEvents(),
    eventMouseEnter: (info) => showCalTooltip(info.el, info.event.title),
    eventMouseLeave: hideCalTooltip,
    eventDragStart: hideCalTooltip,
    eventDrop: (info) => {
      ensureTaskDay();
      const iso = info.event.startStr.slice(0, 10);
      state.taskDay[info.event.id] = iso;
      persistState();
    },
    eventClick: (info) => {
      hideCalTooltip();
      const id = info.event.id;
      state.done[id] = !state.done[id];
      persistState();
      render();
      updateStats();
      refreshCalendarEvents();
    },
  });

  fcCalendar.render();
  renderCalLegend();
}

function refreshCalendarEvents() {
  if (!fcCalendar) return;
  fcCalendar.removeAllEvents();
  fcCalendar.addEventSource(buildCalendarEvents());
  renderCalLegend();
}

// ---------- view toggle (calendar mode goes fullscreen: sidebar hides, legend floats) ----------
document.getElementById('viewToggleBtn').addEventListener('click', () => {
  const listEl = document.getElementById('plan');
  const calEl = document.getElementById('calendarView');
  const layoutWrap = document.getElementById('layoutWrap');
  const btn = document.getElementById('viewToggleBtn');
  const showingCalendar = calEl.style.display !== 'none';

  if (showingCalendar) {
    calEl.style.display = 'none';
    listEl.style.display = '';
    layoutWrap.classList.remove('cal-active');
    btn.textContent = '📅 Calendar view';
    hideCalTooltip();
  } else {
    listEl.style.display = 'none';
    calEl.style.display = '';
    layoutWrap.classList.add('cal-active');
    btn.textContent = '📋 List view';
    if (!fcCalendar) initCalendarView();
    else { refreshCalendarEvents(); fcCalendar.updateSize(); }
  }
});
