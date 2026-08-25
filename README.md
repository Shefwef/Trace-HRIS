# Trace HRIS

Production-grade HR Information System for Trace Consulting Ltd. Handles leave,
attendance, holidays, employee management, audit, and reporting - designed for
a team of 12 today, scales cleanly to 100+ without architectural changes.

Live at [trace-hris.vercel.app](https://trace-hris.vercel.app).

---

## Documentation map

| Document | For |
|---|---|
| **This file** | Product overview, feature list, stack, roles - start here. |
| [`DEMO_GUIDE.md`](./DEMO_GUIDE.md) | 35-minute demo script + A-to-Z QA walkthrough + post-launch checklist. Written for a non-technical reader. |
| [`HRIS_Implementation.md`](./HRIS_Implementation.md) | Full engineering-level product spec - every screen, every field, every state transition. |
| [`BIOMETRIC_INTEGRATION.md`](./BIOMETRIC_INTEGRATION.md) | Three architecture options for a fingerprint scanner at the office entrance + recommended implementation plan. |
| [`hris/SETUP.md`](./hris/SETUP.md) | One-time provisioning of Clerk, Neon, Resend, Gemini. ~20 minutes total. |
| [`hris/README.md`](./hris/README.md) | Dev quick-start: local run, scripts, env vars, deploy. |

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Auth | Clerk 7 (email + password, Google OAuth, invites, webhook sync) |
| Database | Neon Postgres (serverless, auto-pause) via Prisma 6 |
| Email | Resend (leave decisions, holiday notices, welcome mails) |
| Chatbot | Google Gemini 3.6 Flash (free tier, scoped to HRIS topics) |
| PDF reports | `@react-pdf/renderer` - server-side, no headless browser |
| Hosting | Vercel |
| UI | React 19, Framer Motion, Recharts, Zustand, TanStack Query |
| Offline / install | PWA - web manifest + service worker, installable on phone and desktop |
| Language | TypeScript throughout |

**Total monthly infra cost at current scale: $0** - every service is on its free tier.

---

## Modules at a glance

### Leave
- 5-step application wizard: type, dates, half-day / time-range partial, reason, review
- Three types: **Casual** (12/cycle), **Sick** (12/cycle), **Replacement** (earned from extra work)
- Personal 12-month cycle per employee
- Approval routing is automatic - the applicant never picks an approver
- Reviewer can **modify allocation per day** at approval time (swap full↔half, add/remove days) subject to remaining balance
- Cancel own future-dated approved leave; days return to balance

### Attendance
- **Instant** clock-in/out via optimistic updates - no spinner, no wait
- Breaks (start/end, pausing the timer)
- Full history, monthly aggregations, overtime tracking
- Extra-work log → HR/Admin approval → replacement leave credit (full day = +1, half = +0.5)
- **Biometric-ready** - `POST /api/attendance/clock-in` accepts `{ source: "BIOMETRIC", biometricDeviceId, timestamp }` today. See [BIOMETRIC_INTEGRATION.md](./BIOMETRIC_INTEGRATION.md) for the wall-device rollout plan.

### Holidays
- CRUD via `/admin/holidays`
- One-click **Send Notice** dispatches Resend emails to selected recipients
- Auto-highlighted on dashboard mini-calendar and full calendar view

### Notifications & email
- In-app bell with unread badge
- Every state change (submit, approve, reject, cancel, holiday, invite) fires **both** an in-app notification and an email
- Whether a role receives a given notification type is itself a permission - see [Permission matrix](#permission-matrix-super-admin)
- **QA mode:** Settings → set `qaRedirectEmail` → every outgoing email is *silently* rerouted to that single inbox. No banner, no subject tag: recipients see a message indistinguishable from real delivery, which is the point - you are testing the real thing. The true `to`/`cc` are still recorded in `emailLog` for audit. Clear the field to resume normal delivery.

### Dashboards & analytics
- Employee dashboard: three arc rings (Casual/Sick/Replacement), attendance widget, recent activity
- Admin dashboard: team-wide pending count, upcoming leave, attendance snapshot
- Analytics: leave distribution donut, working-hours trend area chart, cumulative leaves taken
- Mini-calendar & full calendar: **status-tinted day cells** (green = Present, blue = Leave, purple = Holiday, amber = Half-day, red = Absent)

### Reports
Four branded PDF reports available at `/reports`, downloaded on demand:

| Report | Scope | Roles that see it |
|---|---|---|
| Performance summary | Cycle + selected month | Everyone |
| Monthly attendance | Selected month | Everyone |
| Leave history | Full cycle year | Everyone |
| Company cycle report (landscape A4) | All active employees | HR / Admin / Super Admin |

Every PDF embeds the Trace logo, brand blue header, footer with page-of-pages + generation timestamp. Rendered fresh on every download - nothing cached.

### Admin tools
- **Employees** - invite, deactivate/reactivate, **role editor per card** (see hierarchy below), **Assign team** for Line Managers, searchable. Everyone is listed including Super Admins; your own card is read-only.
- **Requests** - leave and extra-work inbox with review drawer + modify-allocation panel + editable decision email. Team-scoped for Line Managers.
- **Holidays** - full CRUD + notice dispatch
- **Settings** - sender email, working hours, standard hours/day, overtime threshold, QA redirect toggle
- **Permissions** (Super Admin) - live matrix of what each role may do and which notifications it receives
- **Audit log** (Super Admin) - every action with actor, IP, user-agent, timestamp; filterable
- **System health** (Super Admin) - DB latency, env-var status, security posture

### Chatbot (in-app assistant)
- Floating window bottom-right (doesn't block the UI)
- Powered by Google Gemini 3.6 Flash
- Scoped: only answers questions about **this app** or **general HR-information-system concepts** - anything else is politely refused
- Renders `**bold**` and `` `code` `` markdown properly
- Suggested prompt chips + conversation reset
- Rate-limited to 20 messages/min per user

---

## Roles & assignment hierarchy

Five roles, all server-enforced. A person can hold several at once - the highest
one becomes their *primary* role for display and routing. Rank is the order of
`ROLE_HIERARCHY` in `hris/src/lib/roles.ts`:

| Role | What it is |
|---|---|
| **Super Admin** | Technical owner. Full access + `/admin/audit` + `/admin/system` + `/admin/permissions`. |
| **Admin** | CEO/CTO. Reviews leave, CC'd on Employee submissions. |
| **HR** | People Operations. Reviews leave, invites employees, manages holidays and settings. |
| **Line Manager** | Reviews leave and extra work **for their own direct reports only**. No directory, holiday or settings powers. |
| **Employee** | General staff. Applies for leave, clocks in/out, logs extra work. |

### Line Managers

Line Manager is a role plus a reporting line. Grant the role on the Employees
page, then use **Assign team** on that person's card to pick who reports to them
(stored as `users.lineManagerId`). Once assigned:

- The manager's sidebar gains a **My Team → Team Requests** entry pointing at
  `/admin/requests`.
- That queue is **scoped to their reports** - `GET /api/leaves/requests` and
  `GET /api/extra-work` filter on `employee.lineManagerId`, so a Line Manager
  physically cannot load a request from outside their team.
- They become the first-named reviewer on their reports' submissions (see
  [Approval routing](#approval-routing-automatic)).
- Line Managers are excluded from the **Assign team** picker, so the UI cannot
  create a reporting cycle.

Someone who holds Line Manager *and* HR/Admin sees the full Administration
section and the unscoped queue - the narrow view is only for a pure Line Manager.

### Who can assign whom

| Actor | Can assign these roles |
|---|---|
| Super Admin | Super Admin · Admin · HR · Line Manager · Employee |
| Admin | Super Admin · Admin · HR · Line Manager · Employee |
| HR | HR · Line Manager · Employee (cannot promote to Admin or Super Admin) |
| Line Manager | - (Employees page not visible) |
| Employee | - (Employees page not visible) |

Safety guards:
- You **cannot change your own role** (400 SELF_ROLE_CHANGE)
- You **cannot deactivate yourself** (400 SELF_DEACTIVATE)
- You **cannot demote the last active Super Admin** (400 LAST_SUPER_ADMIN - must promote someone else first)
- HR trying to promote to Admin/Super Admin gets 403 ROLE_ELEVATION_FORBIDDEN
- A reviewer **cannot approve a request from someone at or above their own rank**
  (403 HIERARCHY_VIOLATION), and a Line Manager cannot approve outside their team
- Super Admin permissions are **immutable** - the `/admin/permissions` grid locks
  that column and `PATCH /api/permissions` rejects it (400 SUPER_ADMIN_LOCKED),
  so the owner can never lock themselves out

Your own card in the Employees directory is rendered read-only with a **You**
badge, because all three actions on it would be rejected server-side anyway.

Every role change syncs to Clerk's `publicMetadata` so future sessions carry the correct role.

---

## Permission matrix (Super Admin)

`/admin/permissions` turns each role's capabilities into runtime configuration
instead of hardcoded checks. The five roles are fixed - you cannot invent new
ones - but **what each role may do is editable**.

- **24 permissions** across two categories: 19 *actions* (`leave.approve`,
  `holiday.delete`, `employee.assign_line_manager`, `audit.view`, …) and
  5 *notification toggles* (`notifications.leave_pending`, …) that control
  whether a role receives that kind of notification at all.
- Stored in the `role_permissions` table, read through `checkPermission()` and
  `notifyIfPermitted()`, cached in memory with a **60-second TTL** - so a change
  takes effect within a minute across all server instances without a redeploy.
- Resolution order: a stored row wins; otherwise the compiled `DEFAULT_MATRIX`
  applies. An empty table therefore behaves exactly like a fresh install rather
  than denying everything. The grid renders the same fallback, so it never shows
  a misleading all-unchecked state.
- **Reset to defaults** re-seeds the table from `DEFAULT_MATRIX`.
- The Super Admin column is locked in both the UI and the API.

---

## Approval routing (automatic)

The applicant never picks an approver. Routing is derived from the submitter's
role, then the reporting line is layered on top:

| Submitter | Notified for approval | CC'd |
|---|---|---|
| Employee | Both HR users | CEO |
| HR | Other HR + CEO | Super Admin |
| Admin (CEO) | Super Admin + HR | - |
| Super Admin | HR + CEO | - |

**On top of that table:** if the applicant has a line manager, that manager is
**prepended** to the reviewer list - whatever role the applicant holds - and
becomes the named reviewer on the outgoing email. Deactivated users are filtered
out of every branch, so a request never routes to someone who can no longer sign
in.

At approval time, the reviewer sees a live **balance preview** and can modify the day-by-day allocation before approving. The final approved allocation is stored on the record for audit purposes. Reviewers can also edit the approve/reject email body before it goes out.

---

## Team roster (12 seeded users)

Multi-role: a person can hold more than one role simultaneously (e.g. a COO who needs both Admin and HR power). All 12 accounts are pre-verified in Clerk with photos uploaded; users sign in with email + password (no email verification code needed).

| # | Name | Designation | Email | Role set | Initial password |
|---|---|---|---|---|---|
| 1 | Shefadib (Super Admin) | System Administrator | `shefadib@gmail.com` | Super Admin + Admin + HR + Employee | `Trace-HRIS-Super-2026!` |
| 2 | Fuad M Khalid Hossen | Chief Executive Officer (CEO) | `fuad.khalid@traceconsultingltd.com` | Admin | `Trace-HRIS-Fuad-2026!` |
| 3 | Abu Saleh Muhammad Saifullah | Chief Operating Officer (COO) | `asmsaifullah@traceconsultingltd.com` | Admin + HR | `Trace-HRIS-Saifullah-2026!` |
| 4 | Umme Mahbuba Tama | Research Associate | `umtama@traceconsultingltd.com` | HR | `Trace-HRIS-Tama-2026!` |
| 5 | Tanvir Kabir | Digital Content & Multimedia Specialist | `tanvir.kabir@traceconsultingltd.com` | Employee | `Trace-HRIS-Tanvir-2026!` |
| 6 | Rubayat E Shams Anik | Policy, Research and Business Development Specialist | `res.anik@traceconsultingltd.com` | Employee | `Trace-HRIS-Anik-2026!` |
| 7 | Mimma Afrin | Technical Lead - Laboratory Operations | `mimma.afrin@traceconsultingltd.com` | Employee | `Trace-HRIS-Mimma-2026!` |
| 8 | Recardo Saurav Antor Halder | Manager, Business Development | `recardo.halder@traceconsultingltd.com` | Employee | `Trace-HRIS-Recardo-2026!` |
| 9 | Nabeel Khan | Head of Partnerships & Strategic Growth | `nabeel.khan@traceconsultingltd.com` | Employee | `Trace-HRIS-Nabeel-2026!` |
| 10 | Moudud Ahmmed Sujan | Head of External Affairs | `moudud.sujan@traceconsultingltd.com` | Employee | `Trace-HRIS-Moudud-2026!` |
| 11 | Ahmed Julker Nine | Research and Policy Analyst | `ahmed.nine@traceconsultingltd.com` | Employee | `Trace-HRIS-Ahmed-2026!` |
| 12 | Tahsina Shiva | IT Project Manager | `tahsina.shiva@traceconsultingltd.com` | Employee | `Trace-HRIS-Tahsina-2026!` |

Initial passwords follow the pattern `Trace-HRIS-<FirstName>-2026!` (upper + lower + digit + symbol, matches the Clerk complexity policy). Every user should change their password on first sign-in via avatar → **Account settings** → Security. Photos live in `hris/public/` and are also uploaded to Clerk profile pictures via `scripts/sync-roles.ts`.

The Super Admin account deliberately holds **all four** of Super Admin, Admin, HR
and Employee so a single sign-in can drive an entire submit → notify → approve →
email loop during QA. Strip the extra roles before handing the system over.

`LINE_MANAGER` is not in the seed list on purpose - reporting lines are org state,
not seed state. Grant the role and pick the team from the Employees page.

---

## Adding a new employee

Do NOT run `npm run db:seed` for a single add - it resets every existing user's password back to their initial value. Use the targeted flow:

```powershell
# 1. Append the new person to hris/prisma/seed-users.ts
# 2. Sync only them to Clerk + Postgres (no side-effects on other users):
cd hris
$env:TARGET_EMAIL='new.hire@traceconsultingltd.com'
npx tsx --env-file=.env.local scripts/add-employee.ts

# 3. Print a copy-paste welcome email (subject + body):
npx tsx scripts/print-welcome.ts
```

Once you have a verified domain on Resend, `scripts/send-welcome.ts` sends the email automatically instead.

---

## Feature checklist

- [x] Clerk auth with strict allowlist (only seeded users can sign in)
- [x] Google OAuth + password sign-in
- [x] Configurable password policy via Clerk dashboard
- [x] Leave application: 5-step wizard, full/half-day, time-range partial, replacement
- [x] Per-day allocation editor at approval time (balance-aware)
- [x] Approval routing per role hierarchy
- [x] Cancel own future approved leave
- [x] Attendance clock-in/out with **instant optimistic UI** (~0ms perceived latency)
- [x] Breaks, monthly history, overtime tracking
- [x] Log Extra Work → HR / Admin / Line Manager approval → Replacement leave credit
- [x] Biometric-ready attendance endpoint (`source: BIOMETRIC`)
- [x] Holiday CRUD + Resend notice dispatch
- [x] In-app notification center + email notifications for every state change
- [x] **QA email redirect mode** - reroute all outbound mail to one inbox during testing
- [x] Editable system settings (sender, working hours, overtime threshold, QA toggle)
- [x] Invite Employee flow with generated initial password
- [x] Deactivate / reactivate employees (Clerk + Postgres in sync), with Active / Deactivated / All tabs
- [x] **Role editor per employee card** with hierarchy enforcement (multi-role)
- [x] **Line Manager role** - assign a team, get a team-scoped review queue, review your reports' leave and extra work
- [x] **Runtime permission matrix** at `/admin/permissions` - 24 permissions × 5 roles, 60s TTL cache, reset-to-defaults
- [x] Employee search (name, ID, email, department) with clear button
- [x] Audit log viewer at `/admin/audit` (IP + user-agent captured)
- [x] System health page at `/admin/system` (Super Admin only)
- [x] Four downloadable PDF reports with Trace branding
- [x] Analytics page with real charts (leave distribution, hours trend, cumulative leaves)
- [x] Full calendar + mini-calendar with **status-tinted day cells**
- [x] Bangladesh work week (Sun-Thu) with local-date handling throughout - no UTC off-by-one
- [x] Security headers (HSTS, X-Frame, Referrer-Policy, Permissions-Policy)
- [x] Per-user write rate limiting (30/min via Postgres)
- [x] Clerk webhook sync (`user.deleted`, `user.updated`)
- [x] Neon cold-start retry via Prisma `$extends` (300/900/2100 ms backoff)
- [x] "Ask HRIS" chatbot (Gemini 3.6 Flash, scoped, markdown-aware)
- [x] Mobile responsive (sidebar drawer, reflowing tables, floating chat)
- [x] **Installable PWA** (`manifest.json` + service worker)
- [x] Next.js 16 conventions - `viewport` export for `themeColor`, `proxy.ts` instead of `middleware.ts`
- [x] GitHub Actions CI (build + typecheck on every push)

---

## Getting started

**First-time setup:**

1. Follow [`hris/SETUP.md`](./hris/SETUP.md) to provision Clerk, Neon, Resend, and Gemini (~20 min including DNS wait).
2. `cd hris && npm install` (auto-runs `prisma generate` via postinstall).
3. `npm run db:deploy` - apply migrations to Neon.
4. `npm run db:seed` - create the 12 users in Clerk + Postgres and seed the permission matrix. **Fresh databases only** - on an existing one use `npm run db:sync-roles`, which does the same work without resetting passwords or pruning users.
5. `npm run dev` - dev server on http://localhost:3000.

**Deploy to production:**

Push to `main`. Vercel picks it up automatically. Environment variables mirror `.env.local` and live under **Project Settings → Environment Variables** in Vercel. Root Directory must be `hris`; Framework Preset should read **Next.js**.

Full details in [`hris/README.md`](./hris/README.md).

---

## Post-launch checklist

Non-blocking items - see [`DEMO_GUIDE.md`](./DEMO_GUIDE.md#post-launch-checklist--what-still-needs-to-change) for step-by-step instructions:

- [ ] Verify a Trace domain on Resend so emails send from `hris@traceconsultingltd.com` instead of `onboarding@resend.dev`
- [ ] Add a custom Vercel domain (`hris.traceconsultingltd.com`)
- [ ] Set `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel so user deletes in Clerk auto-sync to Postgres
- [ ] Set `GEMINI_API_KEY` in Vercel prod (currently only in local `.env.local`)
- [ ] Strip the QA-only extra roles from the Super Admin account once real HR users are driving the system
- [ ] Follow [`BIOMETRIC_INTEGRATION.md`](./BIOMETRIC_INTEGRATION.md) when ready to add the fingerprint scanner
- [ ] Replace Clerk's deprecated `createRouteMatcher` in `hris/src/proxy.ts` with resource-based checks before the Clerk 8 upgrade
- [ ] Rotate all API keys quarterly (Clerk, Resend, Gemini)
- [x] ~~Migrate `hris/src/middleware.ts` → `proxy.ts`~~ (done - Next 16 convention)
- [x] ~~Add the missing Clerk URL vars to `.env.example`~~ (done - `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `..._FALLBACK_REDIRECT_URL`, `..._AFTER_SIGN_OUT_URL`)

---

## License & credits

Internal software for Trace Consulting Ltd. Not open source.

Built by [Shefayat Adib](https://github.com/Shefwef) for Trace Consulting Ltd, Dhaka, Bangladesh - 2026.
