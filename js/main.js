document.getElementById('monthSelect').value =
  ['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()];

document.getElementById('genBtn').addEventListener('click', async () => {
  const month = document.getElementById('monthSelect').value;
  const status = document.getElementById('genStatus');
  if (!workbook) { alert('Upload a file first.'); return; }

  const checkedSheets = Array.from(document.querySelectorAll('#sheetChecks .sheet-row'))
    .filter(row => row.querySelector('input').checked).map(row => row.dataset.sheetName);
  if (checkedSheets.length === 0) { alert('Check at least one sheet.'); return; }

  const combined = { month, courses: [] };
  status.textContent = '';
  for (const sheetName of checkedSheets) {
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
  pushToSupabase('vihaan_tracker_selected_sheets', checkedSheets);
  const uploadedFile = document.getElementById('fileInput').files[0];
  if (uploadedFile) uploadPaceplanFile(uploadedFile);
  status.textContent += `Done — ${month} generated.`;
  applyPlan(combined);
});

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

// Called after login (see auth.js), once Supabase data has been pulled into localStorage.
async function bootTracker() {
  const thisMonth = ['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()];
  const loaded = loadPlan(thisMonth);
  if (!loaded) {
    await attemptAutoRollover(thisMonth);
  }
}
