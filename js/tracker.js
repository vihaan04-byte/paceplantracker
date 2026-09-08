// ---------- persistence ----------
const STATE_KEY = "vihaan_tracker_state_v1";
let state = { done: {}, deleted: {}, custom: {} };
try { const s = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); if (s) state = s; } catch(e) {}
function persistState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch(e) {}
  pushToSupabase(STATE_KEY, state);
}

// Re-reads state from localStorage into the in-memory `state` variable.
// Needed after pullFromSupabase() writes fresh data to localStorage, since the app
// otherwise keeps using whatever `state` was loaded at page-load time (before login).
function reloadStateFromLocalStorage() {
  try { const s = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); if (s) state = s; } catch(e) {}
}

function planKey(month) { return "vihaan_tracker_plan_" + month; }

// ---------- dynamic data (populated after generation or load) ----------
let COURSES = {};
let baseWeeks = [];
let currentMonth = null;

const PALETTE = ["#2EC4B6","#FF6B6B","#FFC145","#6C7BFF","#A78BFA","#FF8FB1","#4FC3F7","#A0D468"];

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
function normalizeDateRange(dr) { return String(dr).trim().replace(/\s+/g, ' ').replace(/\s*-\s*/g, ' - '); }
function dateSortKey(dr) {
  const m = String(dr).toLowerCase().match(/([a-z]+)\s+(\d+)/);
  if (!m) return 0;
  const mi = MONTHS.indexOf(m[1]);
  return (mi >= 0 ? mi : 0) * 100 + parseInt(m[2], 10);
}

function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

// Turns the combined {month, courses:[{course, weeks:[...]}]} AI output into
// the {COURSES, baseWeeks} shape the renderer below expects.
function buildTrackerData(combined) {
  const weekMap = {};
  const courses = {};
  const failedCourses = [];
  let colorIdx = 0;

  combined.courses.forEach(courseObj => {
    if (courseObj.error) { failedCourses.push(courseObj.course); return; }
    if (!courseObj.weeks) return;
    const key = slugify(courseObj.course);
    if (!courses[key]) {
      courses[key] = { name: courseObj.course, color: PALETTE[colorIdx % PALETTE.length] };
      colorIdx++;
    }
    courseObj.weeks.forEach(week => {
      const rawDr = week.dateRange || ('wk' + week.weekNumber);
      const dr = normalizeDateRange(rawDr);
      const wid = slugify(dr);
      if (!weekMap[dr]) {
        weekMap[dr] = {
          id: wid,
          date: (week.weekNumber != null ? `Week ${week.weekNumber} · ` : '') + dr,
          title: week.isBreak ? 'Break' : '',
          note: week.isBreak ? 'break' : null,
          sortKey: dateSortKey(dr),
          groups: {}
        };
      }
      if (!week.isBreak && week.tasks && week.tasks.length) {
        weekMap[dr].groups[key] = week.tasks.map((t, i) => ({
          id: `${key}-${wid}-${i}`,
          t: t.text,
          seedDone: !!t.done,
          optional: !!t.optional
        }));
      }
    });
  });

  const weeks = Object.values(weekMap).sort((a, b) => a.sortKey - b.sortKey);
  return { courses, weeks, failedCourses };
}

function loadPlan(month) {
  try {
    const raw = localStorage.getItem(planKey(month));
    if (!raw) return false;
    const combined = JSON.parse(raw);
    applyPlan(combined);
    return true;
  } catch (e) { return false; }
}

function applyPlan(combined) {
  const built = buildTrackerData(combined);
  COURSES = built.courses;
  baseWeeks = built.weeks;
  currentMonth = combined.month;

  // Seed done-state from the source pace plan's own status column,
  // but only for tasks we haven't seen before (don't clobber manual toggles on regenerate).
  baseWeeks.forEach(w => Object.values(w.groups).forEach(tasks => tasks.forEach(t => {
    if (!(t.id in state.done)) state.done[t.id] = t.seedDone;
  })));
  persistState();

  document.getElementById('top-label').textContent = `KWS — ${currentMonth}`;
  document.getElementById('page-title').innerHTML = `${currentMonth} <em>tracker</em>`;
  document.getElementById('page-subtitle').textContent = Object.values(COURSES).map(c => c.name).join(' · ');
  document.getElementById('statsWrap').style.display = '';
  document.getElementById('setup').open = false;
  // Switch on the sidebar layout now that there's a plan to show alongside the setup
  // panel — on first-time setup (no plan yet) the panel stays full-width instead.
  document.getElementById('layoutWrap').classList.add('has-plan');

  const failBanner = document.getElementById('failBanner');
  if (built.failedCourses.length) {
    failBanner.style.display = '';
    failBanner.innerHTML = `⚠ <strong>Didn't generate:</strong> ${built.failedCourses.join(', ')} — try hitting Generate again below.`;
  } else {
    failBanner.style.display = 'none';
  }

  const legend = document.getElementById('legend');
  legend.innerHTML = Object.values(COURSES).map(c =>
    `<div class="leg"><div class="leg-dot" style="background:${c.color}"></div>${c.name}</div>`
  ).join('');

  render();
}

// ---------- renderer (same interaction model as the original tracker) ----------
function getGroupTasks(week, courseKey) {
  const base = (week.groups[courseKey] || [])
    .filter(t => !state.deleted[t.id])
    .map(t => ({ id: t.id, t: t.t, done: !!state.done[t.id], custom: false, optional: !!t.optional }));
  const customKey = `${week.id}-${courseKey}`;
  const custom = (state.custom[customKey] || [])
    .filter(t => !state.deleted[t.id])
    .map(t => ({ id: t.id, t: t.t, done: !!state.done[t.id], custom: true }));
  return base.concat(custom);
}

function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function updateStats() {
  let total = 0, done = 0;
  baseWeeks.forEach(w => {
    Object.keys(w.groups).forEach(ck => {
      getGroupTasks(w, ck).forEach(t => { total++; if (t.done) done++; });
    });
  });
  const pct = total ? Math.round(done/total*100) : 0;
  document.getElementById("s-done").textContent = done;
  document.getElementById("s-left").textContent = total - done;
  document.getElementById("s-total").textContent = total;
  document.getElementById("pfill").style.width = pct + "%";
  document.getElementById("ppct").textContent = pct + "%";
}

function render() {
  const plan = document.getElementById("plan");
  plan.innerHTML = "";
  if (baseWeeks.length === 0) {
    plan.innerHTML = '<div class="empty-state">No plan generated yet.</div>';
    return;
  }

  baseWeeks.forEach((w) => {
    const courseKeys = Object.keys(w.groups);
    const allTasks = courseKeys.map(ck => getGroupTasks(w, ck)).flat();
    const hasTasks = allTasks.length > 0;
    const allDone = hasTasks && allTasks.every(t => t.done);
    const doneCount = allTasks.filter(t => t.done).length;

    const block = document.createElement("div");
    block.className = "week-block";

    const hdr = document.createElement("div");
    hdr.className = "week-header" + (allDone ? " all-done" : "");

    let pill = "";
    if (w.note === "break") pill = `<span class="pill">break</span>`;

    hdr.innerHTML = `
      <span class="week-date">${w.date}</span>
      <span class="week-title">${w.title}</span>
      ${pill}
      <span class="week-count">${hasTasks ? doneCount + "/" + allTasks.length : (w.note === 'break' ? '' : 'empty')}</span>
      <span class="chevron">▾</span>
    `;
    hdr.addEventListener("click", () => {
      hdr.classList.toggle("collapsed");
      body.classList.toggle("hidden");
    });

    const body = document.createElement("div");
    body.className = "week-body" + (allDone ? " hidden" : "");

    courseKeys.forEach((courseKey) => {
      const tasks = getGroupTasks(w, courseKey);
      const course = COURSES[courseKey];
      const group = document.createElement("div");
      group.className = "course-group";

      const cDone = tasks.filter(t => t.done).length;
      const label = document.createElement("div");
      label.className = "course-label";
      label.style.color = course.color;
      label.innerHTML = `
        <span class="course-dot" style="background:${course.color}"></span>
        ${course.name}
        ${/seminar/i.test(course.name) ? '<span class="custom-tag" style="color:var(--warn);border-color:var(--warn);">self-filled</span>' : ''}
        <span class="course-count">${tasks.length ? cDone + "/" + tasks.length : ""}</span>
      `;
      group.appendChild(label);

      if (tasks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-note";
        empty.textContent = "Nothing added yet.";
        group.appendChild(empty);
      }

      tasks.forEach((t) => {
        const row = document.createElement("div");
        row.className = "task" + (t.done ? " done" : "");
        row.innerHTML = `
          <div class="checkbox">
            <svg class="check-icon" viewBox="0 0 8 8" fill="none">
              <polyline points="1,4 3,6.5 7,1.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <span class="task-text">${t.t}</span>
          ${t.optional ? '<span class="custom-tag" style="color:var(--muted);border-color:var(--border2);">optional</span>' : ''}
          ${t.custom ? '<span class="custom-tag">added</span>' : ''}
          <button class="del-btn" title="Delete task">✕</button>
        `;
        row.querySelector(".checkbox").addEventListener("click", () => { state.done[t.id] = !t.done; persistState(); render(); updateStats(); });
        row.querySelector(".task-text").addEventListener("click", () => { state.done[t.id] = !t.done; persistState(); render(); updateStats(); });
        row.querySelector(".del-btn").addEventListener("click", (e) => { e.stopPropagation(); state.deleted[t.id] = true; persistState(); render(); updateStats(); });
        group.appendChild(row);
      });

      const addRow = document.createElement("div");
      addRow.className = "add-row";
      addRow.innerHTML = `<input class="add-input" type="text" placeholder="Add a task to ${course.name}…" /><button class="add-btn">+ add</button>`;
      const input = addRow.querySelector(".add-input");
      const btn = addRow.querySelector(".add-btn");
      const doAdd = () => {
        const val = input.value.trim();
        if (!val) return;
        const customKey = `${w.id}-${courseKey}`;
        if (!state.custom[customKey]) state.custom[customKey] = [];
        state.custom[customKey].push({ id: uid(), t: val });
        persistState(); render(); updateStats();
      };
      btn.addEventListener("click", doAdd);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
      group.appendChild(addRow);

      body.appendChild(group);
    });

    block.appendChild(hdr);
    block.appendChild(body);
    plan.appendChild(block);
  });

  updateStats();
}
