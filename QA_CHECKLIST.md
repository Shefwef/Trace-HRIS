# Trace HRIS — QA Checklist

Everything in the batch pushed as `217d3f9`, in the order I'd test it. Biometric
integration is **not** in scope and is not started.

This batch is **already committed and deployed** — you are QA'ing the live app, not a
pre-push tree. Anything you find here becomes a fix commit on top.

Three bodies of work are being signed off here:

| | What it is |
|---|---|
| **Phase 7** | Line Manager role, runtime permission matrix, employee deactivation |
| **Feature 1** | Work-location tracking with a Geoapify map |
| **Feature 3** | Excel-first reports (replacing PDF-first) |

Sign in as **shefadib@gmail.com** — `SUPER_ADMIN + ADMIN + HR + EMPLOYEE`, enough for
everything except the Line Manager checks (Part 2, which tells you how to cover them).

Legend: **Do** → what to click · **Expect** → what correct looks like

---

## Part 0 — Setup

### 0-1 · Geoapify key — done, already verified ✓
The key is in `hris/.env` and I've confirmed all three endpoints the app calls return HTTP 200:
place search, reverse geocoding, and the `positron` map style (47 layers, attribution present).
Nothing to do here except one thing:

**Fully stop and restart the dev server** if it was running before the key was saved.
`NEXT_PUBLIC_*` is inlined at build time, so a hot reload won't pick it up. This is the single
most likely reason for a blank map during QA.

**Expect** The "Change work location" modal shows a search box and a pale grey map.

### 0-1b · ⚠️ If you are QA'ing the deployed app, add the key to Vercel first
The key is gitignored, so **Vercel does not have it**. Until you add it, the deployed app
shows the typed-entry fallback instead of the map — and Part 6 will read as a total failure
when it is only a missing variable.

Vercel → your project → Settings → Environment Variables → add
`NEXT_PUBLIC_GEOAPIFY_API_KEY` for **Production** (and Preview if you use preview URLs) →
then **Redeploy**. The redeploy is not optional: `NEXT_PUBLIC_*` is baked into the JS bundle
at build time, so the deploy that is live right now already has "no key" compiled into it.

### 0-2 · Leave the key unrestricted for now
In the Geoapify dashboard, leave **Allowed IP addresses**, **Allowed HTTP referrers**,
**Allowed Origins** and **CORS Access-Control-Allow-Origin** all empty during QA.

On localhost these cause more trouble than they prevent: `localhost` and `127.0.0.1` are
different origins, Next dev silently moves to `:3001` if 3000 is busy, and any mismatch shows
up as an opaque 401 that looks exactly like a bug in the map code. There's no card on the
account, so the worst case of an unrestricted key is a burned 3,000-credit daily quota that
resets — not a bill.

**At deploy time**, set **Allowed Origins** to `https://yourdomain.com` (exact scheme + host,
no trailing slash; add `www.` and any preview domain separately). Leave the other three empty —
IP restriction is for server-side callers and every request here comes from the browser.

### 0-3 · Database is current
```bash
cd hris && npx prisma migrate status
```
**Expect** 7 migrations found, "Database schema is up to date!"

**Do not run `npm run db:seed`.** It reapplies hardcoded passwords to all 12 Clerk accounts
and prunes anyone not in its allowlist. Use `npm run db:sync-roles` if roles need a nudge.

---

## Part 1 — Permission matrix (Phase 7)

28 permission keys × 5 roles = 140 rows, already seeded. Cached in memory for 60 seconds,
with `DEFAULT_MATRIX` as the fallback when a row is missing.

### 1-1 · The matrix renders
**Do** Admin → **Permissions**.

**Expect** A grid of 28 keys against 5 role columns, pre-ticked to the seeded defaults.
Spot-check three that should differ by role:

| Key | SUPER_ADMIN | ADMIN | HR | LINE_MANAGER | EMPLOYEE |
|---|---|---|---|---|---|
| `reports.company` | ✓ | ✓ | ✓ | ✗ | ✗ |
| `work_location.correct` | ✓ | ✓ | ✓ | ✗ | ✗ |
| `settings.edit_qa_redirect` | ✓ | ✗ | ✗ | ✗ | ✗ |

### 1-2 · A toggle actually changes behaviour
**Do** Turn `reports.company` **off** for HR. Wait ~60s for the cache. As an HR-only user,
try the "All employees" export.

**Expect** Refused with 403. Turn it back on and confirm it works again. **This is the check
that proves the matrix is live rather than decorative** — if toggling changes nothing, the
whole feature is cosmetic.

### 1-3 · Reset restores defaults
**Do** Change several toggles, then use the reset action.

**Expect** All 140 rows return to `DEFAULT_MATRIX`.

### 1-4 · The matrix cannot lock you out
**Do** As SUPER_ADMIN, try to turn off your own `settings.edit`.

**Expect** Either it's blocked, or you can still reach the Permissions page to undo it.
A matrix that can permanently lock out the last admin is a blocker — note what happens.

---

## Part 2 — Line Manager role and team scope (Phase 7)

**Your account has no `LINE_MANAGER` role**, so none of this is covered by default. Set it up
first: Admin → Employees → pick a test user → grant LINE_MANAGER → assign 2–3 employees'
`lineManagerId` to them.

### 2-1 · Team-only visibility
**Do** Sign in as that line manager.

**Expect** Sidebar reads **Team Locations** (not "Work Locations"). The board shows only
their direct reports. `/admin/permissions` and company reports are refused.

### 2-2 · Team-only approvals
**Do** As the line manager, approve a direct report's leave. Then try to approve a leave from
someone outside their team (hit the API directly if the UI hides it).

**Expect** Own team succeeds. Outside the team is refused. `leave.approve` is `true` for
LINE_MANAGER but scoped server-side — this check is what proves the scoping exists, since
the permission alone would allow everything.

### 2-3 · Direct reports endpoint
**Do** Call `/api/users/<lineManagerId>/reports`.

**Expect** Only active direct reports. Deactivate one and confirm they drop out.

---

## Part 3 — Deactivation (Phase 7)

### 3-1 · Deactivate and disappear
**Do** Admin → Employees → deactivate a test employee.

**Expect** They vanish from the directory, from the location board, from report output, and
from leave-notification routing. `deactivatedAt` and `deactivatedById` get stamped.

### 3-2 · Reactivation clears the stamps
**Do** Reactivate them.

**Expect** `deactivatedAt` and `deactivatedById` return to `null`, and they reappear everywhere.

### 3-3 · You cannot deactivate yourself
**Expect** 400, "You cannot deactivate yourself."

### 3-4 · Deactivation blocks API access; UI pages still visible
**Do** Deactivate a test employee, then sign in as them.

**Expect** They can sign into Clerk and load the app pages, but **cannot perform any
actions**. Every API route goes through `requireAuth()` in `src/lib/api.ts:31`, which
returns `403 INACTIVE` when `isActive` is false — so clock-in, leave submission, and all
mutations are already blocked at the API layer. `getCurrentUser()` in `src/lib/auth.ts:10`
has no `isActive` filter (the checklist previously overstated this), but the mutation
endpoints do.

The remaining gap is UI-only: the app layout does not gate on `isActive`, so a deactivated
user sees the dashboard and navigation but every action fails. If you want to redirect them
to an "account deactivated" page instead, that is a one-line check in the app layout.

---

## Part 4 — Work location, employee path (Feature 1)

Seven rules in `src/lib/workLocation.ts`. Each check maps to one, so a failure names the
broken rule instead of just "location is wrong."

### 4-1 · Rule 4 — no off-site before clocking in
**Do** Before clocking in, look at the work-location card on **Attendance**.
**Expect** "Clock in to start tracking your work location." No off-site button.

### 4-2 · Rule 1 — clock-in sets the office baseline
**Do** Clock in.
**Expect** Card flips to **In office**, showing `Trace Consulting Ltd` and the full Mohakhali
address. In Prisma Studio, `work_location_events` has one row, `OFFICE_CLOCK_IN`, `endedAt = null`.

### 4-3 · Start off-site work
**Do** Search a Dhaka place, pick it, add a purpose, submit.
**Expect** Card flips to **Off-site** with place name, address, purpose, and a live
"Since 2:14 PM · 6m so far". A 1-character name is rejected (min 2); purpose is optional.

### 4-4 · Rule 2 — location never touches clock times ← most important check here
**Do** With an off-site period open, check your clock-in time.
**Expect** **Byte-identical** to before. An employee at a ministry all afternoon is still
clocked in at 08:58. Worked minutes unchanged too.

### 4-5 · Rule 6 — a second destination is a move, not a new start
**Do** While off-site, pick a different destination.
**Expect** Two rows, the first now carrying `endedAt`. Never two open rows.

### 4-6 · Rule 3 — exactly one current location
**Do** Double-click submit, fast.
**Expect** One period. Enforced by a partial unique index on `(employeeId) WHERE endedAt IS
NULL`, so the second insert fails in Postgres rather than in application code. An error toast
is fine; two open periods is not.

### 4-7 · Rule 5 — return to office
**Do** Click **Return to office**, then click it again.
**Expect** First closes the period. Second is refused — nothing to return from.

### 4-8 · Rule 7 — clock-out closes an open period
**Do** Go off-site, then clock out *without* returning.
**Expect** Period closed at clock-out time, stamped `autoClosed = true`, amber warning on the
card. Times are **not** silently rewritten to look like a normal return.

---

## Part 5 — Work location, HR board

### 5-1 · The board
**Do** Sidebar → **Work Locations** (`/admin/locations`).
**Expect** Every active employee with their current location. Someone who never clocked in
today must not read as "in office".

### 5-2 · Corrections are append-only ← blocker if it fails
**Do** Correct one of your own off-site records.
**Expect** The original row **survives**; the correction is a new `ADMIN_CORRECTION` row.
If the original disappears, the audit trail is broken.

### 5-3 · Correction updates the mirror
**Expect** The attendance row's `workLocation` reflects the corrected state.

### 5-4 · Employees cannot reach the board
**Do** As a plain EMPLOYEE, open `/admin/locations` directly.
**Expect** Lands on **not-authorized** — not a blank page, not a crash.

---

## Part 6 — The map (Geoapify)

Swapped from Google Maps this session. One key now covers search *and* tiles.

### 6-1 · Map loads and looks right
**Expect** A pale grey-white basemap (`positron`), a dark blue pin, zoom +/− only.
Attribution in the corner crediting Geoapify, OpenStreetMap and OpenMapTiles — **leave it
alone**, the free tier requires it.

No rotation, no tilt, no compass, no camera animation: picking a result should *land*
instantly, not fly across Dhaka. All of that is switched off deliberately.

### 6-2 · Nothing loads until you open the modal
**Do** Open DevTools → Network. Load `/attendance`. Then open the location modal.
**Expect** No MapLibre on page load; a ~950 KB chunk arrives on first modal open, then is
cached. I verified the build puts it in its own chunk absent from `build-manifest.json`, but
worth seeing once in the browser.

### 6-3 · Search quality — calibrate your expectations first
Geoapify is OpenStreetMap-backed, so I measured it against your key on realistic off-site
destinations rather than guessing. **Named landmarks resolve well; street addresses do not.**

| Searched | Top hit |
|---|---|
| Bangladesh Secretariat | ✓ Bangladesh Secretariat |
| Ministry of Finance Dhaka | ✓ Finance Division, Ministry of Finance |
| National Board of Revenue | ✓ National Board Of Revenue (NBR) |
| Gulshan Club | ✓ Gulshan Club |
| Bashundhara City | ✓ Bashundhara City |
| Jamuna Future Park | ✓ Jamuna Future Park |
| BRAC Centre Mohakhali | ✓ BRAC Center |
| Dhaka North City Corporation | ✓ Dhaka North City Corporation |
| Mohakhali New DOHS | ~ `2Rs2` — a real building, uselessly named |
| **Road 19/C Mohakhali New DOHS** | ✗ Curewell Hospital — **wrong building** |

So spot-check two or three landmarks and expect them to work. Then check the two failure
modes, which are the interesting part:

- **6-3a** Search a **street address** rather than a landmark. Expect a nearby-but-wrong
  building, not an empty list. This is the case that matters, because a wrong-but-plausible
  hit can be accepted in a hurry and lands in HR's report. Confirm the dropdown's second
  line shows enough address for you to notice it's wrong before picking it.
- **6-3b** Names arrive in English, so the Bengali-script problem I expected mostly isn't
  there. If you do hit one, the **Destination** field is editable — rename it and confirm
  your text is what gets saved.

> Note: I originally shipped this against Geoapify's `/autocomplete` endpoint, which is what
> they market for type-ahead. Measured, it returned **0 hits** for "Jamuna Future Park" and
> confidently wrong matches for Gulshan Club and BRAC Centre. `/search` costs the same credit
> and fixed all three, so the code now uses `/search`. The table above is from the shipped
> path. Reason recorded in [geoapify.ts](hris/src/lib/geoapify.ts) so nobody reverts it.

### 6-4 · Drop a pin — the fallback for what search can't find
**Do** Search a **street address** (e.g. `Road 19/C Mohakhali New DOHS`). Note the top hit is
the wrong building. Now pan the map and click the actual location instead.
**Expect** Pin drops, coordinates appear, and the name/address fill in from reverse geocoding.
If reverse geocoding fails, the pin and coordinates are still kept. **This path is why the map
is clickable** — for anything identified by address rather than name it's the only correct
route, so treat it as a first-class flow, not an edge case.

### 6-5 · Typing wins over the map
**Do** Pick a place, then type a different name into **Destination**. Submit.
**Expect** Your typed name is recorded, with the map's coordinates. `placeName` is the only
required field.

### 6-6 · Missing-key fallback still works
**Do** Comment out the key, restart, open the modal.
**Expect** A note explaining search isn't configured, plus plain Destination and Address
fields. Off-site recording works end to end. Restore the key afterwards.

---

## Part 7 — Excel reports (Feature 3)

**Reports** → each card has **Export Excel** (primary) and **PDF** (secondary). Off-site is
Excel-only and deliberately has no PDF button.

### 7-1 · Everything opens
**Do** Export all five as Excel, then all four PDFs.
**Expect** Nine files, none prompting Excel to repair. Filenames carry the date range.

### 7-2 · Formatting
**Do** Open `company-report-*.xlsx`.
**Expect** Opens on a **Summary** sheet before any raw rows. Header row dark blue, bold white,
**frozen** and **filterable**. Sheets: Summary / Employee Summary / Daily Attendance / Leave
Requests. The Off-site tab is suppressed when there are no location events.

### 7-3 · Numbers are numbers, not text
**Do** Click a **Worked Hours** cell, then **Attendance Rate**.
**Expect** `0.00` right-aligned and sortable; rate as a percentage like `82%` stored as 0.82.
Left-aligned text here defeats the point of exporting a spreadsheet.

### 7-4 · Totals are live formulas
**Do** Click a cell in the bold **Total** row, then delete a data row.
**Expect** Formula bar shows `=SUM(H2:H13)`, and the total **updates**. A hardcoded total
becomes a lie the moment someone filters.

### 7-5 · Times are Dhaka time ← most likely to catch a real bug
**Do** Compare **Clock In** in Daily Attendance against the app.
**Expect** They match. ExcelJS converts dates using pure UTC arithmetic, so an unshifted
timestamp renders 08:58 Dhaka as **02:58** — the same UTC-vs-office bug that already bit the
calendar and the heatmap twice. I verified one record end to end (stored `22:09Z` → exported
`04:09 AM` next day, correct), but your data is the real test.

Also check **Applied On** in Leave Requests for anything submitted late at night: 23:30 Dhaka
is 17:30 UTC *the same day*, and a wrong shift would file it under the previous day.

### 7-6 · Location columns
**Expect** After Part 4, a day reading `Office / Office / Yes / 1.50`. Days never clocked into
leave both location cells blank. Pre-feature records fall back to the attendance row's own
location rather than sitting blank beside a filled Final Location.

### 7-7 · Scope is enforced server-side
**Do** As a plain EMPLOYEE, request `/api/reports/all-employees?format=xlsx` in the URL bar.
**Expect** **403**. Then `/api/reports/offsite?format=pdf` → **400** explaining it's
Excel-only, not a 404.

---

## Part 8 — Regression

These already worked; the batch touched code near them.

- **8-1** Clock in → break → end break → clock out. Worked and break minutes correct.
- **8-2** Heatmap paints correctly (>30-minutes-worked rule, Sun–Thu rows).
- **8-3** Leave request → HR notified → approve → email arrives with **no** "QA MODE" banner
  and **no** `[QA->...]` subject prefix. Reviewer can edit the email before sending.
- **8-4** Calendar dates align to Dhaka, not UTC.
- **8-5** Dashboard, Employees and Requests pages load. Super Admin rows stay hidden from the
  Employees directory. Sidebar says "Requests", not "Leave Requests".

---

## Findings to decide on

Not QA failures — decisions or known gaps.

1. **Deactivation revokes API access but not UI visibility** (check 3-4). All mutations
   return `403 INACTIVE` via `requireAuth()`. The only remaining gap: a deactivated user can
   still navigate app pages (the layout has no `isActive` gate). Add a redirect in the app
   layout if you want them to land on a "deactivated" screen instead of seeing the dashboard.
2. **OSM can't do Dhaka street addresses** — a street query returns a nearby wrong building.
   Named landmarks are fine (9/10 measured). Structural to OSM, not fixable by us; mitigated
   by click-to-pin and the editable name field. Google would be better here and needs a card.
3. ~~Office coordinates are approximate.~~ **Resolved.** Reverse-geocoding `23.7815, 90.4001`
   against your key returns *"new dohs, mohakhali, Bir Uttam A. K. Khandakar Road, Dhaka"* —
   correct neighbourhood, and notably **not** the other Mohakhali DOHS in Kafrul, which was
   the risk. Fine as the map anchor. No env override needed. (OSM names that building `2Rs2`,
   which is meaningless, but the address line is right and nothing recorded depends on it.)
4. `public/manifest.json` references `/icon-192.png` and `/icon-512.png`, neither of which
   exists — PWA is manifest-ready but not installable.
5. `Dashboard.tsx` `.edash-perf` still shows hardcoded placeholder stats (96% / 13 / 2h 30m / 2).
6. `DEMO_GUIDE (1).docx` is sitting untracked at the repo root and needs a keep-or-delete call.
7. `npm audit`: 5 vulnerabilities, all pre-existing transitives, none on a reachable path.
8. Only 5 attendance rows and 0 location events exist company-wide, so reports look thin until
   Part 4 generates data. Not a bug.
9. Your Geoapify key lives in `hris/.env` (line 11), not `.env.local`. Works fine — Next loads
   both and `.env` is gitignored — but note `package.json` scripts pass `--env-file=.env.local`,
   so a future *server-side* script wanting this key wouldn't see it. Nothing needs it today.

---

## Sign-off

This batch is already on `origin/main` at `217d3f9`. Parts 0–8 are verifying what shipped,
so the outcome is a list of fixes rather than a go/no-go on pushing.

When you have run through it:
- Note which checks failed and which findings you want acted on.
- Those become fix commits on top of `217d3f9`.
- **Biometric integration starts only after that** — see
  [BIOMETRIC_FINGERPRINT_INTEGRATION_STEPS.md](BIOMETRIC_FINGERPRINT_INTEGRATION_STEPS.md).

Still open outside this checklist: add `NEXT_PUBLIC_GEOAPIFY_API_KEY` to Vercel and redeploy
(0-1b), and confirm Vercel's `DATABASE_URL` points at the same Neon host you develop against —
`npm run build` does **not** run `prisma migrate deploy`, so a separate production branch would
be missing all 7 migrations.
