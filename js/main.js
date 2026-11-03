syncMonthDropdowns(['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()]);

function syncMonthDropdowns(month) {
  document.getElementById('monthSwitcher').value = month;
}

document.getElementById('monthSwitcher').addEventListener('change', () => {
  const month = document.getElementById('monthSwitcher').value;
  syncMonthDropdowns(month);
  const raw = localStorage.getItem(PLAN_KEY);
  if (raw) applyPlan(JSON.parse(raw), month);
});

function showGenProgress(show) {
  document.getElementById('genProgressWrap').style.display = show ? '' : 'none';
}
function updateGenProgress(done, total, label) {
  const pct = total ? Math.round(done / total * 100) : 0;
  document.getElementById('genProgressFill').style.width = pct + '%';
  document.getElementById('genProgressPct').textContent = pct + '%';
  document.getElementById('genProgressLabel').textContent = label;
}

document.getElementById('genBtn').addEventListener('click', async () => {
  const status = document.getElementById('genStatus');
  if (!workbook) { alert('Upload a file first.'); return; }

  const checkedSheets = Array.from(document.querySelectorAll('#sheetChecks .sheet-row'))
    .filter(row => row.querySelector('input').checked).map(row => row.dataset.sheetName);
  if (checkedSheets.length === 0) { alert('Check at least one sheet.'); return; }

  // Precompute total chunk count across all checked sheets, for the progress bar.
  const chunkCounts = checkedSheets.map(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    let rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    rows = rows.map(row => { while (row.length && (row[row.length-1] === null || row[row.length-1] === '')) row.pop(); return row; }).filter(row => row.length > 0);
    const headerIdx = rows.findIndex(row => row.some(cell => typeof cell === 'string' && /week/i.test(cell) && /number/i.test(cell)));
    const dataRowCount = rows.filter((_, i) => i !== headerIdx).length;
    return Math.ceil(dataRowCount / DEFAULT_CHUNK_SIZE);
  });
  const totalChunks = chunkCounts.reduce((a, b) => a + b, 0);
  let completedChunks = 0;

  status.textContent = '';
  showGenProgress(true);
  updateGenProgress(0, totalChunks, 'Starting…');

  const combined = { courses: [] };
  for (const sheetName of checkedSheets) {
    try {
      const weeks = await parseFullSheet(
        sheetName,
        msg => { updateGenProgress(completedChunks, totalChunks, `${sheetName}: ${msg}`); },
        () => { completedChunks++; updateGenProgress(completedChunks, totalChunks, `${sheetName}…`); }
      );
      combined.courses.push({ course: sheetName, weeks });
    } catch (err) {
      combined.courses.push({ course: sheetName, error: err.message });
      status.textContent += `⚠ ${sheetName} failed: ${err.message}\n`;
    }
  }
  showGenProgress(false);
  let existing = { courses: [] };
  try { existing = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null') || existing; } catch (e) {}
  const newNames = new Set(combined.courses.map(c => c.course));
  const merged = { courses: [...existing.courses.filter(c => !newNames.has(c.course)), ...combined.courses] };
  localStorage.setItem(PLAN_KEY, JSON.stringify(merged));
  pushToSupabase(PLAN_KEY, merged);
  pushToSupabase('vihaan_tracker_selected_sheets', checkedSheets);
  const uploadedFile = document.getElementById('fileInput').files[0];
  if (uploadedFile) uploadPaceplanFile(uploadedFile);
  document.getElementById('legacyBanner').style.display = 'none';
  status.textContent += `Done — full year parsed.`;
  applyPlan(merged, currentViewMonth())
});

document.getElementById('addManualBtn').addEventListener('click', () => {
  const input = document.getElementById('manualCourseName');
  const msg = document.getElementById('manualStatus');
  const name = input.value.trim();
  if (!name) { msg.textContent = 'Enter a course name.'; return; }

  let existing = { courses: [] };
  try { existing = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null') || existing; } catch (e) {}
  if (existing.courses.some(c => c.course.toLowerCase() === name.toLowerCase())) {
    msg.textContent = `"${name}" already exists.`;
    return;
  }

  existing.courses.push({ course: name, manual: true, weeks: [] });
  localStorage.setItem(PLAN_KEY, JSON.stringify(existing));
  pushToSupabase(PLAN_KEY, existing);
  input.value = '';
  msg.textContent = `Added ${name}.`;
  applyPlan(existing, document.getElementById('monthSwitcher').value);
});

function renderCourseList(combined) {
  const el = document.getElementById('courseList');
  el.innerHTML = '';
  combined.courses.forEach(c => {
    const row = document.createElement('div');
    row.className = 'sheet-row';
    const label = document.createElement('span');
    label.style.flex = '1';
    label.textContent = c.course + (c.manual ? ' (manual)' : '') + (c.error ? ' (failed)' : '');
    const btn = document.createElement('button');
    btn.className = 'del-btn';
    btn.style.opacity = 1;
    btn.title = 'Remove course';
    btn.textContent = '✕';
    btn.addEventListener('click', () => deleteCourse(c.course));
    row.appendChild(label);
    row.appendChild(btn);
    el.appendChild(row);
  });
}

function deleteCourse(name) {
  if (!confirm(`Remove "${name}" from your tracker? Your progress on it is kept, so re-adding a course with the same name restores it.`)) return;
  let existing = { courses: [] };
  try { existing = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null') || existing; } catch (e) {}
  existing.courses = existing.courses.filter(c => c.course !== name);
  localStorage.setItem(PLAN_KEY, JSON.stringify(existing));
  pushToSupabase(PLAN_KEY, existing);
  applyPlan(existing, document.getElementById('monthSwitcher').value);
}

function currentViewMonth() {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()];
}

async function bootTracker() {
  const raw = localStorage.getItem(PLAN_KEY);
  if (raw) applyPlan(JSON.parse(raw), currentViewMonth());
}

document.getElementById('resetBtn').addEventListener('click', async () => {
  if (!confirm('This clears all saved progress and generated plans — from this device AND your account. Continue?')) return;
  await clearSupabaseData();
  Object.keys(localStorage).filter(k => k.startsWith('vihaan_tracker_')).forEach(k => localStorage.removeItem(k));
  location.reload();
});

