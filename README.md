# Tracker App — v2.0

A zero-budget school pace-plan tracker for KWS students. Upload your xlsx pace plan once — the whole school year gets parsed and stored up front — and get an interactive month-by-month task tracker with instant month-switching, multi-user accounts, per-device sync, and a drag-to-reassign calendar view.

## Stack

**Frontend:** Vanilla JS + HTML/CSS, no build tools. Hosted free on GitHub Pages.

**Backend:** Supabase free tier (auth, database, file storage, edge functions).

**AI Parsing:** Groq's free API tier (`openai/gpt-oss-120b` model, 8000 TPM limit on free tier). API key hidden server-side in Supabase Edge Function.

**Xlsx Reading:** SheetJS client-side (`xlsx.full.min.js` from CDN).

**Calendar View:** FullCalendar (MIT, `fullcalendar` npm package, loaded via CDN global build — `dayGrid` + `interaction` only, no premium Scheduler views needed).

**Confetti:** `canvas-confetti` (MIT, loaded via CDN).

**Fonts:** Baloo 2 + Inter from Google Fonts.

## Budget

**Total cost: $0/month.** All free tiers. Since v2's full-year parse means each sheet is only parsed once (not once per month), Groq usage per user is now front-loaded rather than recurring — a one-time cost at generate time instead of a monthly one. Scaling limit is mostly about concurrent generates hitting the shared 8000 TPM budget, not steady-state usage.

## How It Works

1. **User logs in** → Supabase auth (email/password, no email confirmation).
2. **Upload xlsx** → SheetJS reads it client-side into raw rows. (If the pace plan lives in Google Sheets, the setup panel shows steps for exporting it as .xlsx first.)
3. **Pick sheets** → no month picker needed at generate time anymore — the whole year gets parsed in one go.
4. **Generate** → each checked sheet's full set of rows is chunked (20 rows per chunk by default) and sent through the parse-paceplan Edge Function; a progress bar shows live chunk-by-chunk status since this can take a few minutes for multiple dense courses. Chunks that come back too large are automatically split and retried; rate-limit (429) responses back off using Groq's own suggested wait time before retrying.
5. **Store** → the full year's parsed weeks per course are saved to Supabase (`user_data` table, single `vihaan_tracker_plan_full` key) + the uploaded xlsx stored in the private bucket.
6. **View any month** → the header's month dropdown re-renders instantly from already-parsed data — no more network calls or re-parsing when switching months.
7. **Check off tasks** → Synced to Supabase instantly (localStorage is fast cache, Supabase is source of truth); a confetti burst fires on check (not uncheck).
8. **Switch to calendar view** → Same tasks, laid out day-by-day (month or week grid); drag a task to a different day to reassign it — students choose their own daily pacing, the app never auto-schedules for them.

## Key Architecture Details

- **Full-year single-parse (v2):** The core architecture change from v1. Previously, each month required its own Groq parse call, and `attemptAutoRollover` re-parsed automatically when a new month started. Now, `parseFullSheet` (in `parser.js`) parses an entire sheet's full year in one generate action: it chunks the sheet's data rows (default 20 rows/chunk, tunable via `DEFAULT_CHUNK_SIZE`), sends each chunk through `parseRowsChunk`, and merges all chunks' `weeks` arrays. Two failure modes are handled automatically: a chunk that's too large for the model's response cap gets split in half and retried recursively (`parseChunkWithSplit`); a 429 rate-limit response is detected by parsing the error message text (the edge function always returns HTTP 500 regardless of the underlying Groq status code, so `res.status` alone can't distinguish a rate limit from any other failure) and retried after the wait time Groq itself reports, plus a small buffer. The full merged result — every week across the whole year, per course — is stored once under a single `vihaan_tracker_plan_full` key, replacing the old per-month `vihaan_tracker_plan_<month>` keys. `buildTrackerData`/`applyPlan` now take a `month` argument and filter the stored weeks client-side at render time, so switching months is a pure in-memory re-render with zero network calls. `attemptAutoRollover` is removed entirely — there's nothing left to auto-roll, every month's data already exists after the first generate.
- **Known v1→v2 migration gap:** Task IDs are derived from course + week + index, so a fresh full-year parse produces different IDs than the old per-month parses did. This means a user's previously-checked progress doesn't carry over automatically on first v2 generate — old Supabase rows aren't deleted, just orphaned from the new ID scheme. Handled via a one-time announcement asking testers to re-check completed tasks, rather than building ID-matching migration logic for a beta-stage, one-time transition.
- **Month switcher (v2):** A month `<select>` now lives directly in the persistent header bar (`#monthSwitcher`), not just inside the collapsible Setup panel, since switching months is now a routine action rather than a one-time setup step. Both dropdowns stay in sync via `syncMonthDropdowns`.
- **Generate progress UI (v2):** Since a full-year generate can take a few minutes (especially across multiple dense courses, due to Groq's free-tier 8000 TPM limit forcing retries/backoff), the Setup panel shows a live progress bar (`#genProgressWrap`) that ticks up per completed chunk across all checked sheets, with a text label showing which sheet/row-range is currently parsing.
- **Legacy-data fallback banner (v2):** Existing users who haven't re-generated yet still see their old v1 per-month plan (if one exists in localStorage) on login, with a banner explaining that old data will be cleared on a set date and prompting them to re-upload. This is a deliberate, time-boxed migration bridge — see Maintenance Notes for the cleanup step.
- **Calendar view:** A second, optional view of the same task data — no separate data source. Tasks default to a day within their assigned week (spread Mon–Fri via a stable per-task hash, not all piled on Monday) until the student manually drags one to a specific day. Drag position is stored per-task in `state.taskDay` (`{ taskId: "YYYY-MM-DD" }`), synced through the existing `persistState()` → Supabase `user_data` pipeline like everything else — no new tables or schema changes. Month and week grids only (no hour/time slots, since the app deliberately doesn't schedule *when in the day* something happens — only *which day*). Switching to calendar view hides the sidebar and expands the calendar to full width, with a floating course-color legend. Clicking a task in the calendar toggles done state, same as list view.
- **Confetti on task completion:** A multi-burst `canvas-confetti` animation (dual corner cannons + center burst + two trailing waves) fires only when a task transitions from unchecked → checked, using the current month's course colors. Purely cosmetic — no state or sync implications.
- **Theming:** 3 built-in themes (default/mint/lavender), each its own accent color, switchable via a dropdown in the header. Themes are plain CSS variables scoped under `[data-theme="..."]` blocks in `style.css`, with `theme.js` handling the switch, localStorage caching (avoids a flash of the wrong theme on load — applied via an inline script in `<head>`, before first paint), and Supabase sync so the choice follows a user across devices. Structural tokens (radius, fonts) live once on `:root`; only color tokens are per-theme — adding a future theme (e.g. dark mode) is just a new `[data-theme="..."]` block plus a new `<option>` in the dropdown, no JS changes needed. The calendar view's colors are wired to the same CSS variables (via FullCalendar's `--fc-*` custom properties), so it re-themes automatically too.
- **Responsive layout:** Below ~1000px width, the setup panel/stats and the week list stack in a single column. At ≥1000px, once a plan has been generated, the layout switches to a sticky sidebar (setup + stats) alongside a scrolling main column (the week list) so wide screens are put to use. Before a plan exists (first-time setup), the layout instead centers the setup panel as a focused ~640px-wide card rather than spreading it thin across the full page width. In calendar view, the sidebar hides entirely and the calendar takes the full width instead.
- **Dev/prod split:** `supabase-client.js` has `const ENV = 'dev'` or `'prod'` — flip one line to switch. Dev data is isolated, safe for testing. **Always double-check this is `'prod'` before committing/pushing** — this has bitten the project before.
- **RLS (Row Level Security):** Every table has Supabase policies so users can only see/edit their own data — enforced at DB level, not UI.
- **Forward-fill dates:** Some xlsx sheets (ELA 9b) have blank week numbers on continuation rows. Parser forward-fills the date column so those rows don't get dropped.
- **Failed course banner:** If a sheet fails to parse (Groq error, bad data, etc.), its name shows in a red banner instead of silently vanishing.
- **appBooted guard:** Supabase fires multiple auth events on page load. Without the `appBooted` flag in auth.js, boot runs twice concurrently, doubling token usage. Fixed in v1.

## File Structure

```
tracker-app/
├── index.html                 # Markup only
├── style.css                  # All styling, CSS vars scoped per theme, responsive layout rules, calendar theming
├── js/
│   ├── supabase-client.js     # Supabase connection + dev/prod toggle
│   ├── auth.js                # Login/signup screen + session mgmt
│   ├── sync.js                # Supabase read/write + Storage file ops
│   ├── theme.js                # Theme switching, localStorage cache, Supabase sync
│   ├── tracker.js             # Rendering, month-filtered state mgmt, UI interactions, confetti
│   ├── calendar.js            # Calendar view (month/week), drag-to-reassign, floating legend, tooltips
│   ├── parser.js              # SheetJS + chunked full-year Groq parsing with retry/backoff
│   ├── announcements.js       # What's-new popup, last-seen tracking
│   └── main.js                # Button handlers, boot flow, progress UI, month switcher
├── supabase/                  # CLI config (don't touch)
├── package.json               # CLI dependencies
└── .gitignore
```

## Critical Learnings

**Parsing edge cases:** Pace plans are inconsistent per course — multi-line assignment text, blank week numbers on continuation rows, section headers vs tasks, optional "get ahead" suggestions. All caught and handled in the Groq prompt after many iterations.

**Groq's TPM limit is the real bottleneck, not the response token cap:** Early tuning assumed truncated JSON (response too long) was the only failure mode, so `max_completion_tokens` kept getting raised. That backfired — raising it inflates the token *reservation* per request, which pushed the free-tier 8000 TPM ceiling even with fewer rows. The actual fix was chunking (smaller requests) plus real backoff (see below), with `max_completion_tokens` settled at 6000 as a middle ground.

**The edge function masks the real Groq status code:** `parse-paceplan/index.ts` returns HTTP 500 for *any* Groq-side error — a 429 rate limit and a 413 payload-too-large both come back as 500 from the client's point of view. Detecting a rate limit client-side requires checking the error message text (`rate_limit_exceeded`) rather than `res.status`, and Groq's error message conveniently includes its own suggested wait time ("try again in X.Xs"), which is more reliable than a fixed backoff delay.

**localStorage + Supabase pattern:** Keep localStorage as a fast local cache; Supabase is the source of truth. On login, pull Supabase → reload state in memory → render. Saves network round-trips for every click while staying synced across devices. The same pattern is reused for theme preference and calendar day-assignments.

**Auth event duplication:** `getSession()` + `onAuthStateChange()` both fire on page load, causing functions to run twice if not guarded.

**Date normalization:** Different sheets format dates slightly differently (extra spaces, dash spacing). Normalize before using as merge key, or you get duplicate weeks.

**Theming via CSS variables:** Keeping all color tokens as CSS variables from the start (rather than hardcoded hex values scattered through the stylesheet) made adding a theme switcher trivial later — just wrap the variable block in `[data-theme="..."]` selectors instead of touching every rule that uses color. This paid off again for the calendar view, which themes correctly for free via FullCalendar's own CSS-variable API.

**Week-label date parsing:** Week date labels look like `"Week 1 · August 31 - September 4"`. A naive regex matching "word + number" grabs "Week 1" instead of the actual date. The calendar's day-assignment fallback scans for a known month name first, then reads the number after it, so it's independent of whatever prefix text precedes the date.

**FullCalendar sizing gotcha:** Setting `height: 'parent'` on the calendar while its container only has `min-height` (not a real `height`) collapses the grid to zero, since percentage heights can't resolve against `min-height`. Use `height: 'auto'` instead and let the container's own `min-height` handle month vs. week view sizing via per-view CSS overrides.

## Supabase Schema

- **user_data:** `(user_id, key, value, updated_at)` with RLS. Stores all app state as key/value pairs — including the full-year plan (`vihaan_tracker_plan_full`), progress, theme preference, calendar day-assignments, etc.
- **announcements:** `(id, title, body, created_at)` with RLS. Admin adds rows via Table Editor dashboard; app fetches latest on login.
- **Storage/paceplans:** Private bucket. Users' uploaded xlsx files stored at `user_id/paceplan.xlsx`, RLS policies lock each user to their own.

## Maintenance Notes

- **Add an announcement:** Table Editor → announcements → Insert → fill title/body, save. Pops up for users on next login.
- **Switch to dev:** Change `const ENV = 'dev'` in `supabase-client.js`, commit, push. GitHub Pages auto-deploys.
- **Groq rate limit hit during a generate:** Handled automatically now via retry/backoff — no manual action needed unless it's persistently failing, in which case check Groq's dashboard for account-level throttling.
- **Reset a user's data:** Table Editor → user_data → delete rows where `user_id` matches theirs (get UUID from Supabase Auth tab).
- **Add a new theme:** Add a `[data-theme="yourname"]` block in `style.css` with the same variable names as the existing themes, then add a matching `<option value="yourname">` to `#themeSelect` in `index.html`. No JS changes needed — `theme.js` reads theme names generically.
- **v1 → v2 legacy data cleanup (time-boxed):** After the announced cutoff date, remove the legacy-fallback block in `bootTracker` (main.js) that reads old `vihaan_tracker_plan_<month>` keys and shows `#legacyBanner`. This was a deliberate short-term bridge, not permanent — leaving it in indefinitely adds dead-weight complexity once all testers have re-generated.

## Future Roadmap (Beyond v2)

- Day-view calendar (currently month + week only).
- Adaptive rescheduling: detect overdue tasks, intelligently push remaining work to future weeks.
- Configurable course end dates ("move Bio from May to Jan").
- Multi-file upload: support uploading multiple pace plan files for courses added throughout the year, appending to a shared sheet checklist.
- Dark mode (structure is already in place — see "Add a new theme" above).
- Mascot.
- Full UI for admins to manage announcements/users (not yet built; Table Editor is current admin panel).

## Deployment

**Live:** https://github.com/vihaan04-byte/paceplantracker → GitHub Pages auto-deploys from `main` branch. Share the GitHub Pages URL with friends.

**Dev testing:** Same repo, flip `ENV = 'dev'` in supabase-client.js, commit/push. Your dev instance runs on same GitHub Pages URL but talks to dev Supabase project.
