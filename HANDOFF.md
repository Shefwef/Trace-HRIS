# Context handoff — Trace HRIS

Paste this whole file as your first message in the new chat.

---

You are picking up a production HRIS for **Trace Consulting Ltd** (Dhaka, Bangladesh).
The repo is `https://github.com/Shefwef/Trace-HRIS.git`, app lives in `hris/`, branch `main`.
Everything described below is **already committed and pushed** as of `217d3f9`.

## Stack

Next.js 16 App Router (Turbopack) · Neon Postgres · Prisma 6 · Clerk 7 · Resend · Gemini ·
TanStack Query v5 · Zustand · Framer Motion · Lucide · Zod 4 · ExcelJS 4.4 · MapLibre GL 6.6 ·
deployed on Vercel.

**This is not the Next.js in your training data.** `hris/AGENTS.md` (auto-written by `next dev`)
requires reading the relevant guide in `node_modules/next/dist/docs/` before writing code.
Notable differences already hit: `middleware.ts` is named **`proxy.ts`**, `next lint` no longer
exists (only `tsc --noEmit`), and `next/dynamic` with `ssr: false` works only inside Client
Components with a literal import path.

## What is done and pushed

| Phase / Feature | Contents |
|---|---|
| Phases 1–6 | Auth, roles, attendance (clock in/out/break), leave workflow with email, holidays, calendar, heatmap, extra-work logs, Clerk webhooks, Gemini chatbot, audit log, PWA manifest |
| Phase 7 | `LINE_MANAGER` role, runtime permission matrix, employee deactivation |
| Feature 1 | Work-location tracking + OSM/Nominatim map picker + HR location board |
| Feature 2 | OSM dashboard map, HR off-site notification, Super Admin account protection, live "This month" stats, PWA icons from company logo |
| Feature 3 | Excel-first report exports (PDF demoted to secondary) |

Last commits (as of this handoff):

```
9a3179e docs: update QA findings, add handoff document
4e61c1c fix(auth): client-safe permissions meta, guard Super Admin accounts
d20c891 feat(map): switch to OpenStreetMap, add dashboard map, fix office pin
217d3f9 docs: rewrite biometric integration plan around how the device is actually used
d9344d2 feat(reports): Excel-first exports with live formulas and real numbers
```

**Maps note:** Geoapify was replaced with OpenStreetMap raster tiles (no API key) + Nominatim for geocoding.
`NEXT_PUBLIC_GEOAPIFY_API_KEY` is no longer needed. `MAPS_ENABLED` is unconditionally `true`.
The QA checklist sections about Geoapify (Part 0, Part 6) are now outdated — skip them.

**PWA note:** Company logo (`public/Trace Consulting Logo.png`) is now the source of all PWA icons.
Generated: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`. Manifest updated with `id`,
`scope`, `orientation`. Service worker bumped to cache-v2. App is installable on iOS and Android.

## What is NOT done

**Biometric fingerprint integration — the entire remaining scope.** A ZKTeco M2-LR is already
installed in the office. Nothing in this codebase talks to it yet. Follow
`BIOMETRIC_FINGERPRINT_INTEGRATION_STEPS.md` (Steps 1–16). Do not start until the user says
their QA pass is finished.

Smaller known gaps — do not fix without asking:
- `DEMO_GUIDE.md` (root) still says "4 roles" and predates `LINE_MANAGER`.
- `npm audit`: 5 vulnerabilities, all pre-existing transitives, none on a reachable path.

## Open decisions — ask, do not assume

1. **Deactivation does not revoke access.** `getCurrentUser()` in `src/lib/auth.ts:10` looks
   users up by Clerk id with **no `isActive` filter**, and neither `proxy.ts` nor the session
   layer gates on it. A deactivated employee is hidden from directories, reports and
   notification routing but **can still sign in, clock in and request leave**. This may be a
   deliberate soft delete, but the Employees UI reads like revocation. The user has been asked
   and has not yet answered.
2. **`DEMO_GUIDE (1).docx`** sits untracked at the repo root. Keep, delete, or ignore — unanswered.

## Hard constraints — do not violate

- **Never run `npm run db:seed`.** It reapplies hardcoded passwords to all 12 Clerk accounts
  (including the CEO and COO) with `skipPasswordChecks: true` and prunes any Clerk/Postgres
  user outside its allowlist. Use `npm run db:sync-roles` for the safe path.
- **Never commit env files.** `.gitignore` covers `.env`, `.env.*`, `.env*.local` (with
  `!.env.example`). When inspecting them, print variable **names** only, never values.
- Commit author must be `Shefayat <shefayatadib@iut-dhaka.edu>`.
- Do not push without the user's approval for that batch.
- **Biometric, from the user's own brief:** the vendor installed and configured the M2-LR, so
  never factory-reset it, never clear its attendance logs, and never take over its single ADMS
  server slot. Do not store raw fingerprint images or templates in this database. Do not claim
  the device is integrated until a real device test has passed.
- Do not implement background GPS tracking. Work location is destination *declaration*, chosen
  by the employee when they leave — not sampling.

## Verified environment facts — expensive to rediscover

**Deployment.** Vercel, auto-deploys on push to `main`. Build is `prisma generate && next build`
with **no `prisma migrate deploy`**, so migrations do not apply automatically. Neon host is
`ep-broad-salad-azxj8mfq`; 7 migrations, schema up to date.

**`NEXT_PUBLIC_GEOAPIFY_API_KEY` must exist in Vercel's environment variables** or the map
silently degrades to typed entry. `NEXT_PUBLIC_*` is inlined at **build** time, so adding the
variable requires a redeploy to take effect. Locally the key lives in `hris/.env` (not
`.env.local`); both are loaded by Next, but `package.json` scripts pass
`--env-file=.env.local`, so server-side scripts would not see it.

**Timezone is the recurring bug class.** Asia/Dhaka is UTC+6, no DST. `toISOString().slice(0,10)`
and `getUTCDate()` file any pre-06:00-local event under the previous day; this has already
caused bugs in the calendar, the heatmap and `todayISO()`. ExcelJS converts a `Date` to a serial
with pure UTC arithmetic (`25569 + t/86400000`, verified at
`node_modules/exceljs/lib/utils/utils.js:55`), so **true instants must be shifted by the office
offset while `@db.Date` values must not be** — shifting the latter moves them a day.

**Permissions.** 28 keys × 5 roles = 140 `RolePermission` rows, all present in Neon. 60-second
in-memory cache; `DEFAULT_MATRIX` is the fallback when a row is missing, so new keys degrade
gracefully. `seedPermissionDefaults()` runs **only** from `/api/permissions/reset` — nothing
auto-seeds. Model fields are `role` / `permission` / `enabled` (not `permissionKey`/`allowed`).
Role hierarchy is **ordinal** — rank is position in `ROLE_HIERARCHY = ['SUPER_ADMIN','ADMIN',
'HR','LINE_MANAGER','EMPLOYEE']`. There are no numeric weights.

**Work location.** Seven rules in `src/lib/workLocation.ts`: R1 clock-in opens an OFFICE
baseline; R2 location never touches clock times; R3 exactly one open period, enforced by a
partial unique index on `(employeeId) WHERE endedAt IS NULL`; R4 no off-site without clock-in;
R5 return-to-office closes the period; R6 a second destination is a move; R7 clock-out closes
and stamps `autoClosed`. `work_location_events` is **append-only** — only `endedAt` and
`autoClosed` are ever updated, and HR corrections append an `ADMIN_CORRECTION` row.

**Maps.** Geoapify, chosen because its free tier needs no billing information and permits
commercial use with attribution. Search uses **`/search`, not `/autocomplete`** — measured on
Dhaka data, autocomplete returned 0 hits for "Jamuna Future Park" and confidently wrong matches
for Gulshan Club and BRAC Centre, while `/search` resolves 9 of 10 realistic destinations at the
same 1 credit. Do not revert this; the reason is recorded in `src/lib/geoapify.ts`. OSM has **no
usable Dhaka street addressing** — a street query returns a nearby wrong building — which is why
pin-drop and the editable Destination field are first-class paths. Attribution renders
automatically from the style TileJSON and must not be hidden. `maplibre-gl` 6.6 has **no default
export**; import named (`MapLibreMap`, `Marker`, `NavigationControl`). MapLibre speaks
`[lng, lat]`; our own code speaks `{lat, lng}` and flips only in `LocationMap.tsx`.

**Other.** `workDaysBitmask` is 31 (Sun–Thu); weekend is Fri(5) + Sat(6). `db.ts` wraps Prisma
in `$extends()` for Neon cold-start retries, which breaks `Prisma.TransactionClient` type
matching — hence the hand-rolled `Tx` type in `workLocation.ts`. `tsconfig.json` uses an
explicit `include` list, so ambient `.d.ts` files must sit inside it. On Windows/Git Bash,
`tsx` cannot run top-level `await`, and `npx tsx -e` silently produces nothing for ESM snippets.

## Documentation map

Read in this order when you need context:

| File | What it is | Trust it? |
|---|---|---|
| `hris/AGENTS.md` + `hris/CLAUDE.md` | Mandate to read Next 16 docs before coding | Yes — binding |
| `hris/ARCHITECTURE.md` | Mental model, stack rationale, data flow, schema, role mapping | Yes |
| `hris/SETUP.md` | Clerk / Neon / Resend / Vercel provisioning walkthrough | Yes |
| `hris/README.md` | Dev quick start, scripts, env vars, folder layout | Yes |
| `QA_CHECKLIST.md` | Parts 0–8 QA pass for the work-location + Excel batch, plus measured Geoapify coverage and the open findings | Yes — currently in use |
| `BIOMETRIC_INTEGRATION.md` | The M2-LR integration **plan** and decisions | Yes — rewritten against the real installed setup |
| `BIOMETRIC_FINGERPRINT_INTEGRATION_STEPS.md` | The **runbook**, Steps 1–16, to follow when implementing | Yes — this is the next work |
| `ATTENDANCE_BIOMETRIC_EXCEL_IMPLEMENTATION_PROMPT.md` | The original LLM-authored spec that seeded this work | Partly — written without codebase knowledge, so its naming is unreliable; the *intent* is right |
| `HRIS_Implementation.md` | Original product + implementation documentation, design system, roles | Mostly — predates Phase 7 |
| `README.md` (root) | Project overview, documentation map, modules | Mostly — its static permission matrix predates the runtime one |
| `DEMO_GUIDE.md` (root) | 35-minute demo script, 12 real users | Mostly — says "4 roles", predates `LINE_MANAGER` |
| `hris/DEMO_GUIDE.md` | Old prototype walkthrough, "2 roles", 7 minutes | **No — stale** |

## Immediate next steps

1. The user is running QA from `QA_CHECKLIST.md`. Wait for their results.
2. Fix whatever QA turns up.
3. Get an answer on the deactivation-access decision above.
4. Only then begin biometric integration from
   `BIOMETRIC_FINGERPRINT_INTEGRATION_STEPS.md`.

Do not commit or push without the user's explicit approval for that batch.
