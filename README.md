# Tracker App — v1

A zero-budget school pace-plan tracker for KWS students. Upload your xlsx pace plan once, get an interactive month-by-month task tracker with auto-rollover, multi-user accounts, and per-device sync.

## Stack

**Frontend:** Vanilla JS + HTML/CSS, no build tools. Hosted free on GitHub Pages.

**Backend:** Supabase free tier (auth, database, file storage, edge functions).

**AI Parsing:** Groq's free API tier (`openai/gpt-oss-120b` model, ~30 req/min limit). API key hidden server-side in Supabase Edge Function.

**Xlsx Reading:** SheetJS client-side (`xlsx.full.min.js` from CDN).

**Fonts:** Baloo 2 + Inter from Google Fonts.

## Budget

**Total cost: $0/month.** All free tiers. Scaling limit: ~5 active users before hitting Groq's free-tier rate limits (8000 tokens/min). Past that, upgrade Groq to paid or batch parses over time.

## How It Works

1. **User logs in** → Supabase auth (email/password, no email confirmation).
2. **Upload xlsx** → SheetJS reads it client-side into raw rows.
3. **Pick sheets & month** → Groq API (via Edge Function) parses rows into structured week/task JSON.
4. **Generate plan** → Saved to Supabase (`user_data` table) + uploaded xlsx stored in private bucket.
5. **Check off tasks** → Synced to Supabase instantly (localStorage is fast cache, Supabase is source of truth).
6. **Next month** → If no plan exists for current month, auto-regenerates from saved xlsx.

## Key Architecture Details

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
├── style.css                  # All styling, CSS vars for theming
├── js/
│   ├── supabase-client.js     # Supabase connection + dev/prod toggle
│   ├── auth.js                # Login/signup screen + session mgmt
│   ├── sync.js                # Supabase read/write + Storage file ops
│   ├── tracker.js             # Rendering, state mgmt, UI interactions
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

**localStorage + Supabase pattern:** Keep localStorage as a fast local cache; Supabase is the source of truth. On login, pull Supabase → reload state in memory → render. Saves network round-trips for every click while staying synced across devices.

**Auth event duplication:** `getSession()` + `onAuthStateChange()` both fire on page load, causing functions to run twice if not guarded.

**Date normalization:** Different sheets format dates slightly differently (extra spaces, dash spacing). Normalize before using as merge key, or you get duplicate weeks.

## Supabase Schema

- **user_data:** `(user_id, key, value, updated_at)` with RLS. Stores all app state as key/value pairs (tasks, progress, plan cache, etc).
- **announcements:** `(id, title, body, created_at)` with RLS. Admin adds rows via Table Editor dashboard; app fetches latest on login.
- **Storage/paceplans:** Private bucket. Users' uploaded xlsx files stored at `user_id/paceplan.xlsx`, RLS policies lock each user to their own.

## Maintenance Notes

- **Add an announcement:** Table Editor → announcements → Insert → fill title/body, save. Pops up for users on next login.
- **Switch to dev:** Change `const ENV = 'dev'` in `supabase-client.js`, commit, push. GitHub Pages auto-deploys.
- **Groq rate limit hit:** Wait 60 seconds or batch parses across multiple minutes. For recurring, upgrade Groq account.
- **Reset a user's data:** Table Editor → user_data → delete rows where `user_id` matches theirs (get UUID from Supabase Auth tab).

## Future Roadmap (Beyond v1)

- Drag-to-reorder tasks/weeks.
- Adaptive rescheduling: detect overdue tasks, intelligently push remaining work to future weeks.
- Configurable course end dates ("move Bio from May to Jan").
- Dark mode (all CSS vars already in place).
- Mascot.
- Full UI for admins to manage announcements/users (not yet built; Table Editor is current admin panel).

## Deployment

**Live:** https://github.com/your-username/tracker-app → GitHub Pages auto-deploys from `main` branch. Share the GitHub Pages URL with friends.

**Dev testing:** Same repo, flip `ENV = 'dev'` in supabase-client.js, commit/push. Your dev instance runs on same GitHub Pages URL but talks to dev Supabase project.

## Contact/Questions

Vihaan — built this across multiple chat sessions with Claude. Repo has all code; `.md` files document key decisions and architecture.
