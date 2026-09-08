// ---------- theme switching ----------
// Themes are just [data-theme="..."] attribute values on <html>, matched against
// blocks defined in style.css. Adding a future theme (e.g. dark mode) only needs:
//   1. a new [data-theme="..."] block in style.css with the same variable names
//   2. a new <option> in the #themeSelect dropdown in index.html
// No JS changes required beyond that.
const THEME_KEY = 'vihaan_tracker_theme';
const VALID_THEMES = ['default', 'mint', 'lavender'];

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
  const { data } = await sb.from('user_data').select('value').eq('key', THEME_KEY).maybeSingle();
  if (data && data.value) applyTheme(data.value);
}

document.getElementById('themeSelect').addEventListener('change', (e) => {
  const theme = e.target.value;
  applyTheme(theme);
  pushToSupabase(THEME_KEY, theme);
});
