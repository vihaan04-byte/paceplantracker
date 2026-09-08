// Push one key/value pair up to Supabase for the current logged-in user.
// Fire-and-forget: we don't await this at call sites, so the UI stays instant
// (localStorage is still the immediate read/write cache; Supabase is the durable backup).
async function pushToSupabase(key, value) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { error } = await sb.from('user_data').upsert({
    user_id: user.id, key, value, updated_at: new Date().toISOString()
  });
  if (error) console.error('Supabase sync failed:', error.message);
}

// Deletes every row belonging to the current user — used by the "Reset all local data" button.
async function clearSupabaseData() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { error } = await sb.from('user_data').delete().eq('user_id', user.id);
  if (error) console.error('Supabase clear failed:', error.message);
}

// ---------- saved paceplan file (for auto-rollover) ----------
const PACEPLAN_BUCKET = 'paceplans';

async function uploadPaceplanFile(file) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { error } = await sb.storage.from(PACEPLAN_BUCKET).upload(`${user.id}/paceplan.xlsx`, file, { upsert: true });
  if (error) console.error('Paceplan upload failed:', error.message);
}

// Downloads the saved paceplan file and reads it into a workbook, or returns null if none saved yet.
async function downloadPaceplanWorkbook() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.storage.from(PACEPLAN_BUCKET).download(`${user.id}/paceplan.xlsx`);
  if (error || !data) return null;
  const buffer = await data.arrayBuffer();
  return XLSX.read(new Uint8Array(buffer), { type: 'array' });
}
async function pullFromSupabase() {
  const { data, error } = await sb.from('user_data').select('key, value');
  if (error) { console.error('Supabase pull failed:', error.message); return; }
  data.forEach(row => {
    localStorage.setItem(row.key, JSON.stringify(row.value));
  });
}
