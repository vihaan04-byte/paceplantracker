async function checkAnnouncements() {
  const { data: latest } = await sb.from('announcements').select('id, title, body').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!latest) return;
  const { data: seenRow } = await sb.from('user_data').select('value').eq('key', 'vihaan_tracker_last_seen_announcement').maybeSingle();
  if (!seenRow || seenRow.value !== latest.id) showAnnouncementModal(latest);
}

function showAnnouncementModal(a) {
  document.getElementById('announceTitle').textContent = a.title;
  document.getElementById('announceBody').textContent = a.body;
  document.getElementById('announceModal').style.display = 'flex';
  document.getElementById('announceModal').dataset.id = a.id;
}

document.getElementById('announceCloseBtn').addEventListener('click', () => {
  const id = Number(document.getElementById('announceModal').dataset.id);
  pushToSupabase('vihaan_tracker_last_seen_announcement', id);
  document.getElementById('announceModal').style.display = 'none';
});

document.getElementById('whatsNewBtn').addEventListener('click', async () => {
  const { data: latest } = await sb.from('announcements').select('id, title, body').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (latest) showAnnouncementModal(latest); else alert('No announcements yet.');
});
