syncMonthDropdowns(['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()]);

function syncMonthDropdowns(month) {
  document.getElementById('monthSelect').value = month;
  document.getElementById('monthSwitcher').value = month;
}

document.getElementById('monthSelect').addEventListener('change', () => {
  const month = document.getElementById('monthSelect').value;
  syncMonthDropdowns(month);
  const raw = localStorage.getItem(PLAN_KEY);
  if (raw) applyPlan(JSON.parse(raw), month);
});

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
  localStorage.setItem(PLAN_KEY, JSON.stringify(combined));
  pushToSupabase(PLAN_KEY, combined);
  pushToSupabase('vihaan_tracker_selected_sheets', checkedSheets);
  const uploadedFile = document.getElementById('fileInput').files[0];
  if (uploadedFile) uploadPaceplanFile(uploadedFile);
  document.getElementById('legacyBanner').style.display = 'none';
  status.textContent += `Done — full year parsed.`;
  applyPlan(combined, currentViewMonth());
});

function currentViewMonth() {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()];
}

async function bootTracker() {
  const rawFull = localStorage.getItem(PLAN_KEY);
  if (rawFull) {
    applyPlan(JSON.parse(rawFull), currentViewMonth());
    return;
  }
  // Temporary fallback: old per-month plans still work until you manually clear them.
  const legacyKey = 'vihaan_tracker_plan_' + currentViewMonth();
  const rawLegacy = localStorage.getItem(legacyKey);
  if (rawLegacy) {
    applyPlan(JSON.parse(rawLegacy), currentViewMonth());
    const banner = document.getElementById('legacyBanner');
    banner.style.display = '';
    banner.innerHTML = `📦 You're viewing your old September plan. Re-upload your pace plan above to switch to the new full-year tracker — old data will be cleared October 5th.`;
  }
}

document.getElementById('resetBtn').addEventListener('click', async () => {
  if (!confirm('This clears all saved progress and generated plans — from this device AND your account. Continue?')) return;
  await clearSupabaseData();
  Object.keys(localStorage).filter(k => k.startsWith('vihaan_tracker_')).forEach(k => localStorage.removeItem(k));
  location.reload();
});

// Tries to auto-generate the given month from a previously saved paceplan file + sheet
// selection, if one exists. Returns true if it succeeded, false if there's nothing saved yet.
async function attemptAutoRollover(month) {
  const { data: sheetRow } = await sb.from('user_data').select('value').eq('key', 'vihaan_tracker_selected_sheets').maybeSingle();
  if (!sheetRow) return false;
  const sheetNames = sheetRow.value;

  const wb = await downloadPaceplanWorkbook();
  if (!wb) return false;
  workbook = wb;

  const status = document.getElementById('genStatus');
  status.textContent = `New month detected — auto-generating ${month} from your saved paceplan…\n`;
  const combined = { month, courses: [] };
  for (const sheetName of sheetNames) {
    status.textContent += `Parsing "${sheetName}"…\n`;
    try {
      const weeks = await parseSheet(sheetName, month);
      combined.courses.push({ course: sheetName, weeks });
    } catch (err) {
      combined.courses.push({ course: sheetName, error: err.message });
      status.textContent += `  ⚠ ${sheetName} failed: ${err.message}\n`;
    }
  }
  localStorage.setItem(planKey(month), JSON.stringify(combined));
  pushToSupabase(planKey(month), combined);
  status.textContent += `Done — ${month} generated automatically.`;
  applyPlan(combined);
  return true;
}

function currentViewMonth() {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()];
}

async function bootTracker() {
  const raw = localStorage.getItem(PLAN_KEY);
  if (raw) {
    applyPlan(JSON.parse(raw), currentViewMonth());
  }
}
