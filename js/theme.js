// ---------- theme switching ----------
// Themes are just [data-theme="..."] attribute values on <html>, matched against
// blocks defined in style.css. Adding a future theme (e.g. dark mode) only needs:
//   1. a new [data-theme="..."] block in style.css with the same variable names
//   2. a new <option> in the #themeSelect dropdown in index.html
// No JS changes required beyond that.
const THEME_KEY = 'vihaan_tracker_theme';
const VALID_THEMES = ['default', 'teal', 'blue', 'rose', 'orange'];

function applyTheme(theme) {
  if (!VALID_THEMES.includes(theme)) theme = 'default';
  document.documentElement.setAttribute('data-theme', theme);
  const select = document.getElementById('themeSelect');
  if (select) select.value = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
}

// Called once after login (see auth.js) so a theme saved on another device
// takes effect here too, overriding whatever the local/inline default was.
async function loadThemeFromSupabase() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { data } = await sb.from('user_data').select('key, value').in('key', [THEME_KEY, MODE_KEY]);
  (data || []).forEach(row => {
    if (row.key === THEME_KEY && row.value) applyTheme(row.value);
    if (row.key === MODE_KEY && row.value) applyMode(row.value);
  });
}

document.getElementById('themeSelect').addEventListener('change', (e) => {
  const theme = e.target.value;
  applyTheme(theme);
  pushToSupabase(THEME_KEY, theme);
});

// ---------- mode (light / dark / system) ----------
// Stored pref is 'system' | 'light' | 'dark'. <html data-mode> always holds the resolved
// 'light' or 'dark', so CSS only ever deals with two values.
const MODE_KEY = 'vihaan_tracker_mode';
const VALID_MODES = ['system', 'light', 'dark'];
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
let currentModePref = 'system';

function applyMode(pref) {
  if (!VALID_MODES.includes(pref)) pref = 'system';
  currentModePref = pref;
  const resolved = pref === 'system' ? (darkQuery.matches ? 'dark' : 'light') : pref;
  document.documentElement.setAttribute('data-mode', resolved);
  const select = document.getElementById('modeSelect');
  if (select) select.value = pref;
  try { localStorage.setItem(MODE_KEY, pref); } catch (e) {}
}

// In Auto, follow the OS live (e.g. sunset auto-switch) without a reload.
darkQuery.addEventListener('change', () => {
  if (currentModePref === 'system') applyMode('system');
});

document.getElementById('modeSelect').addEventListener('change', (e) => {
  applyMode(e.target.value);
  pushToSupabase(MODE_KEY, e.target.value);
});

// Sync the dropdown and state with whatever the head script already applied.
applyMode((localStorage.getItem(MODE_KEY) || 'system').replace(/"/g, ''));