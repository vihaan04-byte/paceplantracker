# Tracker App — v1.75

A zero-budget school pace-plan tracker for KWS students. Upload your xlsx pace plan once, get an interactive month-by-month task tracker with auto-rollover, multi-user accounts, per-device sync, and a drag-to-reassign calendar view.

## Stack

**Frontend:** Vanilla JS + HTML/CSS, no build tools. Hosted free on GitHub Pages.

**Backend:** Supabase free tier (auth, database, file storage, edge functions).

**AI Parsing:** Groq's free API tier (`openai/gpt-oss-120b` model, ~30 req/min limit). API key hidden server-side in Supabase Edge Function.

**Xlsx Reading:** SheetJS client-side (`xlsx.full.min.js` from CDN).

**Calendar View:** FullCalendar (MIT, `fullcalendar` npm package, loaded via CDN global build — `dayGrid` + `interaction` only, no premium Scheduler views needed).

**Confetti:** `canvas-confetti` (MIT, loaded via CDN).

**Fonts:** Baloo 2 + Inter from Google Fonts.

## Budget

**Total cost: $0/month.** All free tiers. Scaling limit: ~5 active users before hitting Groq's free-tier rate limits (8000 tokens/min). Past that, upgrade Groq to paid or batch parses over time.

## How It Works

1. **User logs in** → Supabase auth (email/password, no email confirmation).
2. **Upload xlsx** → SheetJS reads it client-side into raw rows. (If the pace plan lives in Google Sheets, the setup panel shows steps for exporting it as .xlsx first.)
3. **Pick sheets & month** → Groq API (via Edge Function) parses rows into structured week/task JSON.
4. **Generate plan** → Saved to Supabase (`user_data` table) + uploaded xlsx stored in private bucket.
5. **Check off tasks** → Synced to Supabase instantly (localStorage is fast cache, Supabase is source of truth); a confetti burst fires on check (not uncheck).
6. **Switch to calendar view** → Same tasks, laid out day-by-day (month or week grid); drag a task to a different day to reassign it — students choose their own daily pacing, the app never auto-schedules for them.
7. **Next month** → If no plan exists for current month, auto-regenerates from saved xlsx.

## Key Architecture Details

- **Calendar view (v1.75):** A second, optional view of the same task data — no separate data source. Tasks default to a day within their assigned week (spread Mon–Fri via a stable per-task hash, not all piled on Monday) until the student manually drags one to a specific day. Drag position is stored per-task in `state.taskDay` (`{ taskId: "YYYY-MM-DD" }`), synced through the existing `persistState()` → Supabase `user_data` pipeline like everything else — no new tables or schema changes. Month and week grids only (no hour/time slots, since the app deliberately doesn't schedule *when in the day* something happens — only *which day*). Switching to calendar view hides the sidebar and expands the calendar to full width, with a floating course-color legend. Clicking a task in the calendar toggles done state, same as list view.
- **Confetti on task completion (v1.75):** A multi-burst `canvas-confetti` animation (dual corner cannons + center burst + two trailing waves) fires only when a task transitions from unchecked → checked, using the current month's course colors. Purely cosmetic — no state or sync implications.
- **Theming:** 3 built-in themes (default/mint/lavender), each its own accent color, switchable via a dropdown in the header. Themes are plain CSS variables scoped under `[data-theme="..."]` blocks in `style.css`, with `theme.js` handling the switch, localStorage caching (avoids a flash of the wrong theme on load — applied via an inline script in `<head>`, before first paint), and Supabase sync so the choice follows a user across devices. Structural tokens (radius, fonts) live once on `:root`; only color tokens are per-theme — adding a future theme (e.g. dark mode) is just a new `[data-theme="..."]` block plus a new `<option>` in the dropdown, no JS changes needed. The calendar view's colors are wired to the same CSS variables (via FullCalendar's `--fc-*` custom properties), so it re-themes automatically too.
- **Responsive layout:** Below ~1000px width, the setup panel/stats and the week list stack in a single column. At ≥1000px, once a plan has been generated, the layout switches to a sticky sidebar (setup + stats) alongside a scrolling main column (the week list) so wide screens are put to use. Before a plan exists (first-time setup), the layout instead centers the setup panel as a focused ~640px-wide card rather than spreading it thin across the full page width. In calendar view, the sidebar hides entirely and the calendar takes the full width instead.
- **Dev/prod split:** `supabase-client.js` has `const ENV = 'dev'` or `'prod'` — flip one line to switch. Dev data is isolated, safe for testing.
- **RLS (Row Level Security):** Every table has Supabase policies so users can only see/edit their own data — enforced at DB level, not UI.
- **Forward-fill dates:** Some xlsx sheets (ELA 9b) have blank week numbers on continuation rows. Parser forward-fills the date column so those rows don't get dropped by month filter.
- **Retry-with-backoff on 429:** If Groq hits rate limit, parseSheet retries up to 3 times with 7-second delays instead of failing immediately.
- **appBooted guard:** Supabase fires multiple auth events on page load. Without the `appBooted` flag in auth.js, boot runs twice concurrently, doubling token usage. Fixed in v1.
- **Failed course banner:** If a sheet fails to parse (Groq error, bad data, etc.), its name shows in a red banner instead of silently vanishing.

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
│   ├── tracker.js             # Rendering, state mgmt, UI interactions, confetti
│   ├── calendar.js            # Calendar view (month/week), drag-to-reassign, floating legend, tooltips
│   ├── parser.js              # SheetJS + Groq parsing
│   ├── announcements.js       # What's-new popup, last-seen tracking
│   └── main.js                # Button handlers, boot flow
├── supabase/                  # CLI config (don't touch)
├── package.json               # CLI dependencies
└── .gitignore
```

## Critical Learnings

**Parsing edge cases:** Pace plans are inconsistent per course — multi-line assignment text, blank week numbers on continuation rows, section headers vs tasks, optional "get ahead" suggestions. All caught and handled in the Groq prompt after many iterations.

**Token limits hit fast:** Parsing 4-6 courses in quick succession can exceed Groq's 8000 TPM free limit. Use retry logic + space out parses. For beta, users are small enough this rarely happens.

**localStorage + Supabase pattern:** Keep localStorage as a fast local cache; Supabase is the source of truth. On login, pull Supabase → reload state in memory → render. Saves network round-trips for every click while staying synced across devices. The same pattern is reused for theme preference and calendar day-assignments.

**Auth event duplication:** `getSession()` + `onAuthStateChange()` both fire on page load, causing functions to run twice if not guarded.

**Date normalization:** Different sheets format dates slightly differently (extra spaces, dash spacing). Normalize before using as merge key, or you get duplicate weeks.

**Theming via CSS variables:** Keeping all color tokens as CSS variables from the start (rather than hardcoded hex values scattered through the stylesheet) made adding a theme switcher trivial later — just wrap the variable block in `[data-theme="..."]` selectors instead of touching every rule that uses color. This paid off again for the calendar view, which themes correctly for free via FullCalendar's own CSS-variable API.

**Week-label date parsing:** Week date labels look like `"Week 1 · August 31 - September 4"`. A naive regex matching "word + number" grabs "Week 1" instead of the actual date. The calendar's day-assignment fallback scans for a known month name first, then reads the number after it, so it's independent of whatever prefix text precedes the date.

**FullCalendar sizing gotcha:** Setting `height: 'parent'` on the calendar while its container only has `min-height` (not a real `height`) collapses the grid to zero, since percentage heights can't resolve against `min-height`. Use `height: 'auto'` instead and let the container's own `min-height` handle month vs. week view sizing via per-view CSS overrides.

## Supabase Schema

- **user_data:** `(user_id, key, value, updated_at)` with RLS. Stores all app state as key/value pairs (tasks, progress, plan cache, theme preference, calendar day-assignments, etc).
- **announcements:** `(id, title, body, created_at)` with RLS. Admin adds rows via Table Editor dashboard; app fetches latest on login.
- **Storage/paceplans:** Private bucket. Users' uploaded xlsx files stored at `user_id/paceplan.xlsx`, RLS policies lock each user to their own.

## Maintenance Notes

- **Add an announcement:** Table Editor → announcements → Insert → fill title/body, save. Pops up for users on next login.
- **Switch to dev:** Change `const ENV = 'dev'` in `supabase-client.js`, commit, push. GitHub Pages auto-deploys.
- **Groq rate limit hit:** Wait 60 seconds or batch parses across multiple minutes. For recurring, upgrade Groq account.
- **Reset a user's data:** Table Editor → user_data → delete rows where `user_id` matches theirs (get UUID from Supabase Auth tab).
- **Add a new theme:** Add a `[data-theme="yourname"]` block in `style.css` with the same variable names as the existing themes, then add a matching `<option value="yourname">` to `#themeSelect` in `index.html`. No JS changes needed — `theme.js` reads theme names generically.

## Future Roadmap (Beyond v1)

- Day-view calendar (currently month + week only).
- Adaptive rescheduling: detect overdue tasks, intelligently push remaining work to future weeks.
- Configurable course end dates ("move Bio from May to Jan").
- Dark mode (structure is already in place — see "Add a new theme" above).
- Mascot.
- Full UI for admins to manage announcements/users (not yet built; Table Editor is current admin panel).

## Deployment

**Live:** https://github.com/vihaan04-byte/paceplantracker → GitHub Pages auto-deploys from `main` branch. Share the GitHub Pages URL with friends.

**Dev testing:** Same repo, flip `ENV = 'dev'` in supabase-client.js, commit/push. Your dev instance runs on same GitHub Pages URL but talks to dev Supabase project.

## Contact/Questions

Vihaan — built this across multiple chat sessions with Claude. Repo has all code; `.md` files document key decisions and architecture.
