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

// Sends one chunk of rows (already sliced/prepared by the caller) to the parse-paceplan
// Edge Function and returns its "weeks" array. No month filtering here anymore —
// that logic now lives in parseFullSheet, which decides what rows go in each chunk.
async function parseRowsChunk(rows, attempt = 1) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-paceplan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ rows })
  });

  const data = await res.json();

  // Free-tier Groq rate limit resets within a few seconds — wait it out and retry
  // a couple times instead of failing the whole chunk on a busy minute.
if (!res.ok && data?.error?.includes('rate_limit_exceeded') && attempt < 5) {
  const waitMatch = data.error.match(/try again in ([\d.]+)s/);
  const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 2000 : 20000;
  await new Promise(r => setTimeout(r, waitMs));
  return parseRowsChunk(rows, attempt + 1);
}

  if (!res.ok || data.error) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data.weeks;
}

// Parses an entire sheet (all months) by chunking its rows and calling
// parseRowsChunk per chunk, then merging all the returned "weeks" arrays.
// If a chunk is rejected as too large (413), it's split in half and each
// half is retried recursively — self-adjusts per course without needing
// to guess row-density upfront.
const DEFAULT_CHUNK_SIZE = 20;

async function parseChunkWithSplit(headerRow, dataRows) {
  try {
    const weeks = await parseRowsChunk([headerRow, ...dataRows]);
    return weeks;
  } catch (err) {
    if (err.status === 413 && dataRows.length > 1) {
      const mid = Math.ceil(dataRows.length / 2);
      const firstHalf = await parseChunkWithSplit(headerRow, dataRows.slice(0, mid));
      const secondHalf = await parseChunkWithSplit(headerRow, dataRows.slice(mid));
      return [...firstHalf, ...secondHalf];
    }
    throw err;
  }
}

async function parseFullSheet(sheetName, statusCallback, chunkDoneCallback) {
  const sheet = workbook.Sheets[sheetName];
  let rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  rows = rows.map(row => { while (row.length && (row[row.length-1] === null || row[row.length-1] === '')) row.pop(); return row; })
             .filter(row => row.length > 0);

  const headerIdx = rows.findIndex(row => row.some(cell => typeof cell === 'string' && /week/i.test(cell) && /number/i.test(cell)));
  const headerRow = headerIdx >= 0 ? rows[headerIdx] : rows[0];
  const dataRows = rows.filter((_, i) => i !== headerIdx);

  const allWeeks = [];
  for (let i = 0; i < dataRows.length; i += DEFAULT_CHUNK_SIZE) {
    const chunk = dataRows.slice(i, i + DEFAULT_CHUNK_SIZE);
    if (statusCallback) statusCallback(`Parsing rows ${i + 1}-${i + chunk.length} of ${dataRows.length}…`);
    const weeks = await parseChunkWithSplit(headerRow, chunk);
    allWeeks.push(...weeks);
    if (chunkDoneCallback) chunkDoneCallback();
  }
  return allWeeks;
}