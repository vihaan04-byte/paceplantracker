// ---------- setup panel: upload + parse ----------
let workbook = null;

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
    const container = document.getElementById('sheetChecks');
    container.innerHTML = '';
    workbook.SheetNames.forEach((name, i) => {
      const isSelfFilled = /seminar/i.test(name);
      const row = document.createElement('div');
      row.className = 'sheet-row';
      row.innerHTML = `<input type="checkbox" id="sheet_${i}" checked><label for="sheet_${i}">${name}</label>${isSelfFilled ? ' <span class="custom-tag" style="color:var(--warn);border-color:var(--warn);">self-filled, may be unreliable</span>' : ''}`;
      row.dataset.sheetName = name;
      container.appendChild(row);
    });
    document.getElementById('genBtn').disabled = false;
  };
  reader.readAsArrayBuffer(file);
});

// Parses one sheet down to the target month's weeks, via the parse-paceplan Edge Function
// (which holds the Groq key server-side). Returns the "weeks" array.
async function parseSheet(sheetName, month, attempt = 1) {
  const sheet = workbook.Sheets[sheetName];
  let rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  rows = rows.map(row => { while (row.length && (row[row.length-1] === null || row[row.length-1] === '')) row.pop(); return row; })
             .filter(row => row.length > 0);

  const headerIdx = rows.findIndex(row => row.some(cell => typeof cell === 'string' && /week/i.test(cell) && /number/i.test(cell)));
  const headerRows = headerIdx >= 0 ? [rows[headerIdx]] : rows.slice(0, 1);
  const dateColIdx = headerRows[0].findIndex(cell => typeof cell === 'string' && /date/i.test(cell));
  const effectiveDateColIdx = dateColIdx >= 0 ? dateColIdx : 1;

  // Forward-fill the date onto blank continuation rows before filtering, so rows that
  // continue the previous week (blank Week Number/Dates) aren't silently dropped.
  let currentDate = null;
  const monthRows = rows.filter((row, i) => {
    if (i === headerIdx) return false;
    if (row[effectiveDateColIdx]) currentDate = row[effectiveDateColIdx];
    return typeof currentDate === 'string' && currentDate.toLowerCase().includes(month.toLowerCase());
  });
  rows = [...headerRows, ...monthRows];

  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-paceplan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ rows, month })
  });

  const data = await res.json();

  // Free-tier Groq rate limit resets within a few seconds — wait it out and retry
  // a couple times instead of failing the whole sheet on a busy minute.
  if (!res.ok && res.status === 429 && attempt < 3) {
    await new Promise(r => setTimeout(r, 7000));
    return parseSheet(sheetName, month, attempt + 1);
  }

  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data.weeks;
}
