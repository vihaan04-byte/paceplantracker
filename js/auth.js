function showAuthScreen() {
  document.getElementById('authScreen').style.display = '';
  document.getElementById('appContent').style.display = 'none';
}

let appBooted = false;

async function showApp(session) {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appContent').style.display = '';
  document.getElementById('userEmail').textContent = session.user.email;
  // Supabase fires more than one "logged in" event on page load (getSession() + onAuthStateChange).
  // Without this guard, pullFromSupabase()/bootTracker() would run twice concurrently.
  if (appBooted) return;
  appBooted = true;
  await pullFromSupabase();
  reloadStateFromLocalStorage();
  await bootTracker();
  checkAnnouncements();
}

document.getElementById('signupBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errBox = document.getElementById('authError');
  errBox.textContent = '';
  if (!email || !password) { errBox.textContent = 'Enter an email and password.'; return; }

  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) { errBox.textContent = error.message; return; }
  if (data.session) { showApp(data.session); }
  else { errBox.textContent = 'Account created — try logging in.'; }
});

document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errBox = document.getElementById('authError');
  errBox.textContent = '';
  if (!email || !password) { errBox.textContent = 'Enter an email and password.'; return; }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errBox.textContent = error.message; return; }
  showApp(data.session);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  appBooted = false;
  showAuthScreen();
});

// On load, and whenever auth state changes (login/logout in any tab), show the right screen.
sb.auth.getSession().then(({ data: { session } }) => {
  if (session) showApp(session); else showAuthScreen();
});
sb.auth.onAuthStateChange((_event, session) => {
  if (session) showApp(session); else showAuthScreen();
});
