# HRIS Architecture Reference

> **Who this is for:** you (developer / super admin) and future maintainers. This
> is the single doc that explains *how the whole thing works* — what talks to
> what, why we chose each piece of the stack, how the data stays consistent, and
> how to reason about the system when something breaks or needs extending.
>
> Read [`HRIS_Implementation.md`](../HRIS_Implementation.md) first for the *product* spec
> (what the app does). Read [`DEMO_GUIDE.md`](./DEMO_GUIDE.md) for the *user-facing walkthrough*.
> This doc covers *engineering*.

---

## 1. The one-page mental model

```
┌───────────── User's browser ─────────────┐
│                                          │
│  Next.js app (React UI, App Router)      │
│    ├─ Zustand: UI state                  │
│    └─ TanStack Query: server state cache │
│                                          │
│           ▲                    ▲         │
│           │ HTTP+JSON          │ Clerk   │
└───────────┼────────────────────┼─────────┘
            │                    │
            ▼                    ▼
┌──── Next.js API routes ────┐  ┌─── Clerk ───┐
│  /api/leaves/*             │  │ Auth server │
│  /api/attendance/*         │  │ (managed)   │
│  /api/extra-work/*         │  └─────────────┘
│  /api/holidays/*           │
│  /api/notifications/*      │
│  /api/users/*              │
│  /api/permissions/*        │
│  /api/settings/*           │
│  /api/reports/*            │
│                            │
│  Per-route guards:         │
│    requireAuth / role      │
│    checkPermission (60s $) │
│    canApproveRequest       │
│    team scoping (SQL)      │
│                            │
│  src/proxy.ts only does    │
│  the Clerk session gate.   │
└──────┬───────────────┬─────┘
       │               │
       │ Prisma        │ Resend SDK
       │               │
       ▼               ▼
┌── Neon Postgres ──┐  ┌── Resend ──┐
│  Tables (see §4): │  │ SMTP-less  │
│  users            │  │ email API  │
│  role_permissions │  └────────────┘
│  leave_requests   │
│  extra_work_logs  │
│  attendance_...   │
│  holidays         │
│  notifications    │
│  email_log        │
│  system_settings  │
│  rate_limit_...   │
│  audit_log        │
└───────────────────┘
```

**Golden rule:** the browser never touches the database or a third-party API
directly. Everything goes through our Next.js API routes so we can enforce
auth, role checks, and validation at the boundary.

---

## 2. Why this stack (rationale)

### Next.js (over the previous Vite SPA)
- **API routes are colocated with the UI** — no separate backend server to
  deploy, monitor, or CORS-configure. One `git push` deploys both.
- **Server components** let us render lists and dashboards on the server, so the
  browser gets pre-rendered HTML — faster first paint on low-end phones.
- **App Router** naturally maps to our route structure (`/leaves`, `/admin/...`).
- **Type-safety end-to-end** — the same TypeScript types are shared between
  the API route handler and the React component consuming it.
- **Vercel-native** — zero-config deploys, previews per branch, edge caching.

### Clerk (auth)
- **Invite flow is the killer feature.** HR clicks "Invite employee" → user
  gets email → clicks link → sets password OR signs in with Google → lands
  in the app already authenticated with their role. Zero custom code.
- **Password reset, email verification, session management, MFA** are all
  handled server-side by Clerk. We never store passwords.
- **Role assignment** lives in Clerk's `publicMetadata.role` field, mirrored
  into our `users` table. Change it in Clerk → webhook syncs to Postgres.

### Neon Postgres (over Supabase or self-hosted)
- **Serverless** — cold-start-friendly. Bills per second of CPU, not per hour.
- **Branching** — every git branch can have its own DB snapshot for staging.
- **Vercel integration** — `DATABASE_URL` set once, works everywhere.
- **Region: AWS Singapore** — ~50ms latency to Bangladesh users, fastest option
  Neon offers to South Asia today.
- **Postgres, not a proprietary DB** — you own your data. Can export to any
  other Postgres host in minutes.

### Prisma (ORM)
- **Type-safe queries** — the schema in `prisma/schema.prisma` generates
  TypeScript types automatically. Impossible to typo a column name.
- **Migrations that read like git commits** — `prisma migrate dev --name add_leave_time_range`
  produces a versioned SQL file. Applies safely in production.
- **Studio** — `npx prisma studio` gives you a spreadsheet-like GUI to
  browse/edit data during development. HR staff never see it; it's for you.

### Resend (email)
- **One SDK call, no SMTP** — no relay to configure, no port 587 to unblock on
  Vercel, no connection pooling. `resend.emails.send({ to, cc, subject, html })`.
- **Deliverability out of the box** — SPF/DKIM/DMARC handled when you verify
  your domain. Emails don't land in spam. Until then the sender falls back to
  `onboarding@resend.dev`, which delivers but shows Resend's domain.
- **Editable sender email in the DB** — `system_settings.senderEmail` /
  `senderName`, changeable from `/admin/settings` without a code deploy.
- **Templates are plain HTML strings**, not React components — see
  [`src/emails/templates.ts`](./src/emails/templates.ts). Six functions
  (`leaveSubmittedEmail`, `leaveDecisionEmail`, `customLeaveEmail`,
  `extraWorkSubmittedEmail`, `extraWorkDecisionEmail`, `holidayNoticeEmail`)
  each return `{ subject, html }` and share one `shell()` skin with the brand
  gradient header and footer. Every interpolated value goes through `escape()`.
  Migrating to `@react-email/components` is a nice-to-have, not a blocker.
- **Every send is logged** to the `email_log` table with the real `to`/`cc`,
  the provider message ID and status — so QA redirect mode (§7) stays auditable.


### Zustand + TanStack Query (state)
- **Zustand** (kept from prototype) — for UI state that lives only in the
  browser: current user cache, mobile nav open/close, toast queue.
- **TanStack Query** — for server state: leave requests, attendance records,
  holidays. Handles caching, refetch on window focus, optimistic updates,
  loading/error states — all things we'd otherwise write by hand.

**When to use which:**
| State type | Tool | Example |
|---|---|---|
| "Is the sidebar open?" | Zustand | `useMobileNav()` |
| "What are my pending leave requests?" | TanStack Query | `useQuery(['leaves', 'mine'], ...)` |
| "Is the toast queue full?" | Zustand | `useToasts()` |
| "Did the approve mutation succeed?" | TanStack Query | `useMutation(approveLeave)` |

---

## 3. How data flows — the leave approval trip

Let's trace one end-to-end scenario: **Tanvir applies for leave, Umme (HR) approves it.**
The code is [`src/app/api/leaves/requests/route.ts`](./src/app/api/leaves/requests/route.ts)
and [`.../[id]/approve/route.ts`](./src/app/api/leaves/requests/[id]/approve/route.ts).

```
1. Tanvir opens /leaves, clicks "Apply for Leave"
   → LeaveApplicationFlow modal opens
   → he fills in 5 steps, clicks Submit
   → useMutation(createLeaveRequest) fires POST /api/leaves/requests
        Body: { leaveType, startDate, endDate, timeFrom?, timeTo?, reason, ... }

2. POST /api/leaves/requests (route handler):
   a. requireAuth(req) — Clerk session → Postgres user row, active check,
      and a 30-writes/min rate-limit hit in the same call
   b. parseBody(req, CreateLeaveSchema) — Zod validation
   c. computeDurationDays() — half-day / time-range aware, skips Fri+Sat
   d. Overlap check against this employee's PENDING + APPROVED requests → 409
   e. Balance lookup for the current cycle; requested > available → 400
   f. TRANSACTION:
        • INSERT INTO leave_requests (...)
        • UPDATE leave_balances SET casual_pending = casual_pending + duration
          (SICK likewise; REPLACEMENT reserves nothing — it debits on approval)
   g. Return 201 with the created row

3. Fan-out, after the transaction commits (deliberately outside it):
   - approvalRecipients(user, allActiveUsers, 'notifications.leave_pending')
     resolves { to, cc } from the role table AND prepends Tanvir's line manager
   - notifyMany() writes one notifications row per recipient
   - sendEmail() is fired void — a Resend failure must not undo a valid request

4. Client:
   - TanStack Query invalidates ['leaves', 'mine'] → refetches
   - Modal shows success, toast appears

5. Umme's browser (already signed in on another tab):
   - Notification bell polls the unread count every 30s (refetchInterval in
     src/lib/hooks.ts) — no websockets
   - Badge increments; her inbox gets the Resend mail too

6. Umme opens /admin/requests → Review drawer
   - Full details + Tanvir's live balance + per-day allocation editor
   - Preview shows "8 → 5 days after approval"

7. Umme clicks Approve → confirm (optionally editing the email body first)
   - POST /api/leaves/requests/:id/approve { adminNote?, allocation?,
                                             emailSubject?, emailBody? }
   - Guards BEFORE the transaction: status === 'PENDING', self-review,
     canApproveRequest() rank + line-manager team check
   - TRANSACTION:
     • UPDATE leave_requests SET status='APPROVED', reviewedById, reviewedAt,
                                 approvedAllocation
     • UPDATE leave_balances SET casual_used += d, casual_pending -= d
     • INSERT INTO audit_log (actorId=umme, action, targetType, targetId, ip, ua)
   - After commit: notifyIfPermitted(tanvir, ...) + sendEmail()
   - Return the updated row

8. Both browsers:
   - Umme: ['leaves','admin','pending'] invalidated, drawer closes, toast
   - Tanvir: next poll shows "Your leave was approved"
```

**Key properties of this flow:**
- **Balance mutations are transactional.** Request row and pending balance move
  together or not at all.
- **Email is outside the transaction, on purpose.** A Resend outage must not
  roll back an approval that already debited the balance. The cost is that a
  send failure is only visible in `email_log`, not to the reviewer.
- **The audit row is inside the transaction** on decisions, so there is no
  approved request without a matching `audit_log` entry.
- **Guards run before the transaction opens**, which leaves a narrow
  double-approve window — see §6 *Race conditions*.

---


## 4. Database schema (Prisma)

Full schema lives in `prisma/schema.prisma`. The main tables:

- **`User`** — mirrors Clerk's user + role set, department, employee code, cycle start date. Foreign key target for everything. Carries three Phase 7 additions:
  - `roles Role[]` (the multi-role set) alongside the denormalized `role` (highest rank, used for display and routing)
  - `lineManagerId` — self-referential FK, `onDelete: SetNull`, indexed. Exposes `lineManager` and `directReports` relations.
  - `deactivatedAt` + `deactivatedById` — soft deactivation. `isActive` is the flag; these two record *when* and *by whom*, so a deactivation is auditable without reading the audit log.
- **`RolePermission`** — the permission matrix. One row per (role, permission) with a compound unique on `role_permission`. Read through the 60-second cache in `src/lib/permissions.ts`; a missing row falls back to `DEFAULT_MATRIX`.
- **`LeaveBalance`** — one row per user per cycle year. Casual/sick totals & used, replacement bank, overtime hours bank. Enforces the "no inflation" rule.
- **`LeaveRequest`** — the core of the app. Includes `timeFrom`/`timeTo` for partial-day leave and `attachmentUrl`. Status enum. Foreign keys to `User` (employee + reviewer).
- **`ExtraWorkLog`** — records extra work done on weekends/holidays. `workDate`, `workType` (FULL_DAY | HALF_DAY_MORNING | HALF_DAY_AFTERNOON), `status` (PENDING/APPROVED/REJECTED), reviewer. When approved, credits `LeaveBalance.replacementBalance` (+1.0 for full, +0.5 for half). Same approval rules as leave requests — HR, Admin, Super Admin, or the applicant's Line Manager.
- **`AttendanceRecord`** — one row per user per date. Includes `source` (MANUAL / BIOMETRIC) for the future scanner integration.
- **`BreakSession`** — child of `AttendanceRecord`. Many-to-one.
- **`Holiday`** — company calendar. Recurring flag, notification schedule, recipients enum.
- **`Notification`** — in-app inbox. Links to `User` recipient + optional reference to another row (leave request, holiday). Written through `notifyIfPermitted()`, so a role that has its notification permission turned off never gets a row.
- **`EmailLog`** — every email we send is logged for audit, with the *real* `to`/`cc` even when QA redirect is active. Includes Resend's message ID for tracing bounces.
- **`SystemSettings`** — singleton row (`id = 'singleton'`). Editable sender email, sender name, standard hours per day, work start/end time, `workDaysBitmask` (**31 = Sun–Thu**, the Bangladesh work week), `qaRedirectEmail`. Admin/HR/Super Admin can edit.
- **`AuditLog`** — `actorId` + `action` + `targetType`/`targetId` + `metadata` JSON + `ip` + `userAgent` + `createdAt` for every state-changing action. Append-only; `actorId` is `SetNull` so deleting a user never erases the trail.
- **`RateLimitBucket`** — fixed-window counters for the Postgres-backed rate limiter (see §7).

**Foreign key strategy:**
- `ON DELETE CASCADE` for `attendance_records`, `break_sessions`, `notifications`, `leave_requests` when a user is deleted.
- `ON DELETE SET NULL` for `users.lineManagerId` and `audit_log.actorId` — removing a manager orphans their reports rather than deleting people, and removing a user preserves their audit history.
- **We never actually delete users** — deactivation flips `isActive = false` and stamps `deactivatedAt`/`deactivatedById`. Cascade is a defence-in-depth measure.

**Indexes:**
- `leave_requests(employee_id, status)` — fast "my pending requests" query
- `leave_requests(status, created_at DESC)` — fast admin inbox
- `attendance_records(employee_id, date DESC)` — fast history view
- `notifications(recipient_id, is_read, created_at DESC)` — fast bell dropdown
- `users(lineManagerId)` — fast team-scoped review queue
- `audit_log(actor_id, created_at DESC)` and `audit_log(target_type, target_id)` — audit filtering

---

## 5. How the roles map

Five roles, ranked. A user holds a **set** of them (`users.roles`), plus a
denormalized `users.role` holding the highest one for display and for the
routing table below.

Rank is **ordinal, by position** in `ROLE_HIERARCHY` in
[`src/lib/roles.ts`](./src/lib/roles.ts) — there are no numeric weights:

```typescript
export const ROLE_HIERARCHY: Role[] = ['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE'];
```

| Role | Surfaces it unlocks |
|---|---|
| `SUPER_ADMIN` | Everything, plus `/admin/audit`, `/admin/system`, `/admin/permissions` |
| `ADMIN` | All of `/admin/*` except the three Super-Admin-only pages |
| `HR` | `/admin/requests`, `/admin/employees`, `/admin/holidays`, `/admin/settings` |
| `LINE_MANAGER` | `/admin/requests` only, **scoped to their own direct reports** |
| `EMPLOYEE` | Personal pages only |

Roles live in Clerk's `publicMetadata.roles` and are mirrored into
`users.roles`. `primaryRole()`, `effectiveRoles()`, `hasRole()`,
`canApproveLeave()` and `assignableRoles()` in `src/lib/roles.ts` are the single
source of truth for collapsing a set into a decision. Because assignable-role
sets are monotonic in rank, checking the denormalized primary role is equivalent
to checking the whole set — which is why the client-side copy of
`assignableRoles()` in `Employees.tsx` can take just `user.role` and still agree
with the server.

Enforcement happens in three places, and all three matter:

1. **`src/proxy.ts`** — Clerk session check. Signed-out requests get redirected
   to `/sign-in`. This is coarse: it knows *authenticated vs not*, not *which role*.
2. **Page server components** — `requireUser()` then an explicit role test and
   `redirect()`. This is what actually keeps an Employee out of `/admin/audit`.
3. **API route handlers** — `requireAuth()` / `requireRole()` / `checkPermission()`.
   This is the only layer that matters for security; the other two are UX.

### Line Managers

`LINE_MANAGER` is a role *plus* a reporting line (`users.lineManagerId`,
self-referential FK with `onDelete: SetNull`). The role alone does nothing until
someone is assigned to report to them.

- **Sidebar:** a pure Line Manager (no HR/Admin role) gets a **My Team** section
  with a single entry, `Team Requests` → `/admin/requests`. Someone who also
  holds HR or Admin sees the full Administration section instead.
- **Page guard:** `/admin/requests` admits `SUPER_ADMIN | ADMIN | HR | LINE_MANAGER`.
- **Data scoping:** this is the important part. `GET /api/leaves/requests` and
  `GET /api/extra-work` add `where: { employee: { lineManagerId: user.id } }`
  for a Line Manager who holds no wider reviewer role. The queue is filtered in
  SQL, not in the client, so a Line Manager cannot see a request outside their
  team even by crafting the request by hand.
- **Approval guard:** `canApproveRequest()` in [`src/lib/api.ts`](./src/lib/api.ts)
  independently re-checks `applicant.lineManagerId === actor.id`. The list query
  and the mutation guard agree, but neither trusts the other.
- **Cycle prevention:** the *Assign team* picker excludes other Line Managers, so
  the UI cannot build a reporting loop.

**Approval routing** lives in `approvalRecipients()` in
[`src/lib/routing.ts`](./src/lib/routing.ts). Two layers:

```typescript
// Layer 1 — a table keyed on the applicant's primary role.
//   EMPLOYEE    → to: all HR            cc: CEO
//   HR          → to: other HR + CEO    cc: Super Admin
//   ADMIN (CEO) → to: Super Admin + HR  cc: —
//   SUPER_ADMIN → to: HR + CEO          cc: —

// Layer 2 — the reporting line, applied on top of every branch:
if (applicant.lineManagerId) {
  const lm = active.find((u) => u.id === applicant.lineManagerId);
  if (lm) toUsers.unshift(lm);   // head of the list → named reviewer in the email
}
```

Deactivated users are filtered out before either layer runs, so a request never
routes to an account that can no longer sign in.

**Who can approve a given request?** Anyone holding `HR`, `ADMIN` or
`SUPER_ADMIN`, plus the applicant's own Line Manager. On top of that,
`canApproveRequest()` rejects approving a request from someone at or above your
own rank (403 `HIERARCHY_VIOLATION`).

---

## 5a. The permission matrix

Roles are fixed; **what each role may do is runtime configuration**, edited by a
Super Admin at `/admin/permissions`.

**Catalog** — 24 keys in [`src/lib/permissions.ts`](./src/lib/permissions.ts),
split into two kinds:

- **19 actions** — `leave.approve`, `leave.cancel_others`, `extra_work.approve`,
  `holiday.delete`, `employee.assign_line_manager`, `settings.edit_qa_redirect`,
  `reports.company`, `audit.view`, `system.view`, …
- **5 notification toggles** — `notifications.leave_pending`,
  `notifications.leave_decision`, … Each controls whether a role *receives* that
  class of notification at all.

**Storage and resolution:**

```
role_permissions table  (unique on role+permission)
        │
        ▼  60-second in-memory TTL cache
checkPermission(user, key)
        │
        ├─ stored row exists?  → use it
        └─ otherwise           → DEFAULT_MATRIX[role][key]  (compiled fallback)
```

Consequences worth internalising:

- **An empty table is not a lockout.** A fresh database with no `role_permissions`
  rows behaves exactly like the compiled defaults. The `/admin/permissions` grid
  applies the same fallback, so it never renders a misleading all-unchecked state.
- **Changes propagate within 60 seconds** across every serverless instance, with
  no redeploy. The cache is per-instance and time-based, not invalidated globally —
  `invalidatePermissionCache()` only clears the instance that handled the PATCH.
- **Super Admin is immutable.** The grid locks that column and
  `PATCH /api/permissions` returns 400 `SUPER_ADMIN_LOCKED`. Without this, the
  owner could revoke their own `audit.view` and lock the org out of its own
  system with no recovery path short of a SQL console.
- **The PATCH body is constrained to the catalog** (`ALL_PERMISSIONS`), so a
  hand-crafted request cannot write rows for keys nothing reads.
- `notifyIfPermitted(recipient, key, payload)` is the notification-side wrapper —
  it consults the matrix before writing the row and sending the mail.

Seeded by `seedPermissionDefaults()`, which runs from `npm run db:sync-roles`,
`npm run db:seed`, and the **Reset to defaults** button.

---

## 6. Data consistency guarantees

### Transactions
Every multi-row write uses `prisma.$transaction([...])`. Examples:
- Creating a leave request + updating pending balance + inserting notifications
- Approving a request + moving pending → used + inserting notification + inserting audit row
- Clocking out + updating overtime bank + creating replacement leave day (if bank ≥ 8h)

If any step in the transaction fails, all are rolled back. Neon Postgres handles isolation at `READ COMMITTED` (default).

### Race conditions
Each approve/reject handler re-reads the row and returns 409 `ALREADY_DECIDED`
if `status !== 'PENDING'`, so the normal case — two reviewers opening the same
request minutes apart — produces a clean error rather than a double-credit.

Be honest about the limit: that read happens **before** the transaction opens,
so there is a narrow time-of-check-to-time-of-use window in which two truly
simultaneous approvals could both pass the guard. Closing it means moving the
status test into the transaction as a conditional update
(`updateMany({ where: { id, status: 'PENDING' } })` and treating `count === 0`
as the conflict), or adding an `updatedAt` token to the API contract. Neither is
done today. With 12 users and one reviewer per request it has never fired, but
it is a real gap, not a solved problem.

### Balance invariants
Enforced in **application code**, inside the same transaction as the write:
the handler reads the current `LeaveBalance`, computes the post-write figures,
and aborts before committing if they would go negative or exceed the cycle
total. There is deliberately **no Postgres `CHECK` constraint** backing this —
if you want belt-and-suspenders, that is a genuine open improvement, and it
needs a migration plus a decision about what to do with any existing rows that
would violate it.

### Self-review guards
All four decision routes (leave approve/reject, extra-work approve/reject)
reject `actor.id === applicant.id` with 403 `SELF_APPROVE` / `SELF_REJECT`.
These were temporarily removed once to allow single-account QA and have been
**reinstated for production** — so a full submit → approve loop now needs two
distinct accounts. Plan QA accordingly rather than removing them again.

### Time zones
- **Every timestamp in the DB is UTC** (Postgres `TIMESTAMPTZ`).
- **Dates without times** (leave `startDate`, `workDate`, attendance `date`) use
  plain `DATE` — no timezone component to get wrong.
- **Formatting is local, via `date-fns`.** This matters more than it sounds:
  the calendar and heatmap must use `format(d, 'yyyy-MM-dd')`, *never*
  `toISOString().slice(0, 10)`. The latter converts to UTC first, so for
  Bangladesh (UTC+6) any date rendered after 6 PM local lands on the wrong day
  and stops matching its own database row. This has bitten the calendar and the
  attendance heatmap; both are fixed, and it is the first thing to check if
  dates ever look off by one again.
- **The work week is Sunday–Thursday**, stored as `workDaysBitmask = 31`.
  Weekend detection is Friday + Saturday. The Mon–Fri default (`62`) is wrong
  for this company and should not reappear.

---

## 7. Security posture

### Authentication
- Handled by **Clerk**. Session tokens are HTTP-only, secure, SameSite=Lax cookies.
- We never see, store, or handle passwords.
- MFA can be enabled per-user from Clerk's UI later.

### Authorization
Three layers, only one of which is security:

1. **`src/proxy.ts`** — Clerk session gate. Redirects signed-out requests to
   `/sign-in` (via explicit `unauthenticatedUrl`/`unauthorizedUrl`; without them
   `auth.protect()` throws a Next `notFound()` and users get a bare 404).
   Knows authenticated-vs-not, nothing about roles.
2. **Page server components** — `requireUser()` plus an explicit role test and
   `redirect()`. Keeps the wrong people out of the wrong screens.
3. **API route handlers** — `requireAuth()`, `requireRole()`, `checkPermission()`,
   `canApproveRequest()`, and SQL-level scoping for Line Managers. **This is the
   security boundary.** Everything above it is UX.

Client-side role checks (hidden buttons, filtered nav) exist purely so the UI
isn't confusing. They are never load-bearing.

> **Note:** Clerk 7 deprecates `createRouteMatcher`, which `proxy.ts` still uses,
> in favour of resource-based checks in each page/route. The app already does
> those checks, so the proxy is defense-in-depth. Replacing the matcher is queued
> for the Clerk 8 upgrade.

### Input validation
- Every API route validates its body/query with **Zod 4**. Invalid input returns
  400 with a message safe to show the user.
- `PATCH /api/permissions` additionally constrains the `permission` field to the
  compiled `ALL_PERMISSIONS` catalog, so no request can create rows for keys
  nothing reads.
- `LeaveRequest.attachmentUrl` exists in the schema and the apply wizard has a
  file input, but **there is no upload pipeline yet** — no blob store, no MIME
  allowlist, no size cap, no scanning. Treat the column as reserved. Wiring this
  up is an open item, and the validation belongs server-side when it happens.

### SQL injection
- Prisma parameterizes every query. There is no raw SQL in the codebase.

### CSRF
- All state-changing routes are POST/PATCH/DELETE, never GET, and require a
  Clerk session cookie that is `SameSite=Lax`.

### XSS
- React escapes rendered content by default.
- `dangerouslySetInnerHTML` appears in exactly one place: the service-worker
  registration script in `src/app/layout.tsx`, which is a static string literal
  with no user input. Outgoing **email** HTML is assembled from templates in
  `src/emails/templates.ts` — reviewer-supplied note text goes into those, so
  keep escaping it there. Email HTML is never rendered back into the app.

### Rate limiting
- **Postgres-backed fixed-window limiter** in
  [`src/lib/ratelimit.ts`](./src/lib/ratelimit.ts) — no Redis, no extra service.
  A `UNIQUE (subject, key, windowStart)` constraint plus an incrementing upsert
  makes concurrent requests safe by letting Postgres do the merge.
- Applied automatically by `requireAuth(req)` to **write methods only**
  (POST/PATCH/PUT/DELETE) at **30 per user per minute** by default. Reads are
  not limited. `/api/chat` overrides to 20/min.
- Buckets expire by time; `prune()` exists but is not yet scheduled, so the
  table grows slowly. Worth a cron eventually.
- Login attempt throttling is Clerk's problem, not ours.

### Secrets
- All secrets live in Vercel env vars (production) or `.env.local` (dev).
- `.env.local` is git-ignored.
- Rotate quarterly.

### Audit log
- Every state change (approve, reject, invite, deactivate, settings change) writes to `audit_log`. Super Admin can view; nobody can delete.

### Backups
- **Neon** takes automatic point-in-time snapshots every hour (7-day retention on free tier; 30-day on paid).
- Manual export: `pg_dump $DATABASE_URL > backup-$(date +%F).sql` any time.

---

## 8. How to add a new employee

Two paths, depending on whether you're adding someone at runtime or seeding.

### Path A — the Invite flow (runtime, what HR actually uses)

**Employees → Invite employee.** Form collects name, email, **role set**
(checkboxes, multi-role), department, designation, employee code, cycle start
month, and optionally a **line manager**. Submitting hits
`POST /api/users/invite`, which:

1. `requireAuth(req)` — session + write rate limit.
2. `checkPermission(actor, 'employee.invite')` — the matrix decides, not a
   hardcoded role list.
3. `validateRoleAssignment(actor, input.roles)` — an HR user inviting someone as
   Admin gets 403 `ROLE_ELEVATION_FORBIDDEN`.
4. Duplicate check against **both** Postgres and Clerk → 409 `ALREADY_EXISTS`.
5. `clerk.users.createUser()` with a **generated initial password** and
   `publicMetadata: { role, roles, department, designation, employeeIdCode }`.
6. `prisma.user.create()` using **the Clerk user ID as the primary key**, so
   every join is a straight ID match with no mapping table. `lineManagerId` is
   written here if one was picked.
7. `prisma.leaveBalance.create()` for the current cycle, derived from
   `cycleStartMonth`.

Note what this is *not*: it does **not** use Clerk's
`invitations.createInvitation()`, and there is **no `/onboarding` page**. The
account is created ready-to-use with a generated password that HR passes to the
new hire, who changes it from Clerk's **Manage account** screen. If you'd prefer
a true invite-link flow (no password ever leaving the server), that's a real
change to this route, not a config toggle.

### Path B — the seed scripts (bootstrap / bulk)

For the 12 known staff, `prisma/seed-users.ts` is the allowlist:

| Script | Behaviour |
|---|---|
| `npm run db:sync-roles` | **Safe.** Upserts role sets, department, designation, Clerk profile photo, Postgres row and leave balance. Seeds missing `role_permissions`. Touches no passwords, prunes nobody. This is the one to reach for. |
| `npm run db:seed` | **Destructive.** Everything above, plus re-applies each hardcoded initial password (`skipPasswordChecks: true`) and deletes any Clerk/Postgres user not in the allowlist. Fresh databases only. |
| `TARGET_EMAIL=… npx tsx scripts/add-employee.ts` | Syncs exactly one person, no side effects on anyone else. |

`LINE_MANAGER` is deliberately absent from the seed list — reporting lines are
org state, not seed state. Grant the role and assign the team from the UI.

**To bulk-add later:** an "Import CSV" button on the Employees page would parse
into the same `POST /api/users/invite` call, one row at a time. Not built.

---

## 9. Deployment & environments

| Environment | URL | Postgres | Clerk | Purpose |
|---|---|---|---|---|
| Local dev | `http://localhost:3000` | Neon `dev` branch | Clerk `Development` instance | Your machine |
| Preview | `https://trace-hris-*.vercel.app` (per PR) | Neon `dev` branch | Clerk `Development` instance | Auto-created by Vercel per branch |
| Production | `https://your-domain.com` | Neon `main` branch | Clerk `Production` instance | Real users |

**Migrations:** there is **no** `postbuild` hook — `npm run build` is only
`prisma generate && next build`. Migrations are applied deliberately, by running
`npm run db:deploy` against `DIRECT_URL` (the non-pooled connection):

```bash
DATABASE_URL=$DIRECT_URL npm run db:deploy
```

Do that before or right after the deploy that needs the new columns, not from a
build step that runs on every preview branch.

**CI:** `.github/workflows/ci.yml` runs `npm run build` then `npm run typecheck`
on every push and PR to `main`, using format-valid dummy credentials. It never
touches a real service. There is no ESLint step — the project has no ESLint
config, and Next 16 removed the `next lint` command.

**Rollback:** Vercel keeps every deploy; one-click rollback to any prior version. DB migrations that need reversing require `prisma migrate resolve` + a compensating migration (rare).

---

## 10. Extending the system

**Adding a new leave type (e.g. "Bereavement Leave"):**
1. Add value to `LeaveType` enum in `prisma/schema.prisma`
2. `npx prisma migrate dev --name add_bereavement_leave`
3. Add color token to `src/app/globals.css`
4. Add case to `leaveTypeLabel()` and `leaveTypeShort()` in `src/lib/utils.ts`
5. Add balance fields to `LeaveBalance` if it's a separate quota

**Adding a new notification type:**
1. Add value to `NotificationType` enum in Prisma schema
2. Add icon+color mapping in `Topbar.tsx`
3. Emit from the relevant API route via `notifyIfPermitted()` — not `notify()`
   directly, unless the notification must bypass the permission matrix

**Adding a new permission:**
1. Add the key to `ACTION_PERMISSIONS` or `NOTIFICATION_PERMISSIONS` in
   `src/lib/permissions.ts` — this also constrains what `PATCH /api/permissions`
   will accept, so nothing else is needed to make it writable
2. Add a label to `PERMISSION_LABELS` and slot the key into a `PERMISSION_GROUPS`
   entry, or it won't appear in the grid
3. Set the per-role defaults in `DEFAULT_MATRIX`
4. Enforce it: `await checkPermission(user, 'your.key')` in the route
5. Run `npm run db:sync-roles` (or hit **Reset to defaults**) to materialise rows

**Adding a new role:**
1. Add value to the `Role` enum + migrate
2. Insert it at the right position in `ROLE_HIERARCHY` in `src/lib/roles.ts` —
   rank is ordinal, so position *is* the rank, and everything hierarchical
   derives from this one array
3. Add a `DEFAULT_MATRIX` column in `src/lib/permissions.ts`
4. Update `assignableRoles()` (same file as step 2) so someone can grant it, and
   mirror the change in the local copy in `src/screens/admin/Employees.tsx`
5. Update `approvalRecipients()` in `src/lib/routing.ts` if it participates in routing
6. Add a sidebar nav section in `src/components/layout/Sidebar.tsx` if it needs one
7. Add page guards in the relevant `src/app/(app)/**/page.tsx` server components
   — **not** in `src/proxy.ts`, which only does the session check

**Integrating the biometric scanner** (spec §15):
1. The scanner posts to `POST /api/attendance/clock-in` with `{ source: "BIOMETRIC", biometric_device_id, biometric_verified, timestamp }`.
2. The API route already accepts these fields — just add API-key auth for scanner requests (they don't have a Clerk session).
3. Store the scanner's device ID in a `BiometricDevice` table for allowlisting.

---

## 11. Cost projections

| Users | Clerk | Neon | Resend | Vercel | Total/mo |
|---|---|---|---|---|---|
| 12 (today) | $0 (free) | $0 (free 0.5GB) | $0 (free 100/day) | $0 (hobby) | **$0** |
| 50 | $0 | $0 | $0 | $0 | **$0** |
| 500 | $0 | $19 (Launch) | $0 | $20 (Pro) | **$39** |
| 5,000 | $25 (Pro) | $69 (Scale) | $20 (Pro) | $20 | **$134** |

Well within the free tier for the foreseeable future. The one limit worth
watching is Resend's **100 emails/day** on the free plan — a busy leave day with
12 people fans out to a handful of reviewers each, so it is not close yet, but a
holiday notice to all staff is 12 sends in one click.

---

## 12. Where things live

```
hris/
├── prisma/
│   ├── schema.prisma          # DB schema (see §4)
│   ├── migrations/            # Versioned SQL migrations
│   ├── seed-users.ts          # The 12-person allowlist + role sets
│   └── seed.ts                # DESTRUCTIVE full re-seed (resets passwords)
├── scripts/
│   ├── sync-roles.ts          # Safe refresh: roles, photos, permission defaults
│   ├── add-employee.ts        # Single-user sync via TARGET_EMAIL
│   └── print-welcome.ts       # Copy-paste welcome email text
├── src/
│   ├── app/
│   │   ├── (auth)/sign-in/    # Clerk catch-all sign-in
│   │   ├── (app)/             # Authenticated shell (sidebar + header)
│   │   │   ├── dashboard/     # Employee dashboard
│   │   │   ├── leaves/  attendance/  calendar/  analytics/  reports/
│   │   │   └── admin/         # employees, requests, holidays, settings,
│   │   │                      #   permissions, audit, system
│   │   ├── api/               # Route handlers
│   │   │   ├── leaves/  attendance/  extra-work/  holidays/
│   │   │   ├── users/  permissions/  settings/  notifications/
│   │   │   ├── reports/  audit-log/  system/  chat/
│   │   │   └── webhooks/      # Clerk user.deleted / user.updated
│   │   └── layout.tsx         # metadata + viewport exports, PWA registration
│   ├── components/            # Cross-page UI (widgets, drawers, modals)
│   ├── screens/               # Page bodies rendered by app/ routes
│   ├── emails/
│   │   └── templates.ts       # 6 HTML-string builders sharing one shell()
│   ├── lib/
│   │   ├── db.ts              # Prisma singleton + Neon cold-start retry
│   │   ├── api.ts             # requireAuth / parseBody / err helpers
│   │   ├── auth.ts            # Clerk helpers, requireUser()
│   │   ├── roles.ts           # ROLE_HIERARCHY, canApproveRequest, rank checks
│   │   ├── permissions.ts     # Matrix, 60s cache, checkPermission()
│   │   ├── routing.ts         # approvalRecipients() incl. line-manager prepend
│   │   ├── notifications.ts   # notify / notifyMany / notifyIfPermitted
│   │   ├── email.ts           # Resend client, QA redirect, email_log writer
│   │   ├── ratelimit.ts       # Postgres fixed-window limiter
│   │   ├── leave.ts           # Duration maths, Bangladesh work week
│   │   ├── reports/           # PDF report definitions (@react-pdf/renderer)
│   │   ├── validation.ts      # Zod schemas
│   │   └── audit.ts           # audit_log writer
│   └── proxy.ts               # Clerk session gate (Next 16 name for middleware)
├── public/                    # Logo, employee photos, manifest.json, sw.js
├── SETUP.md                   # First-time provisioning of external services
├── ARCHITECTURE.md            # This document
├── DEMO_GUIDE.md              # User-facing walkthrough
└── README.md                  # Dev quick start
```

---

## 13. Glossary

- **Cycle** — a 12-month leave period per employee. `cycleStartMonth` on the user
  determines when balances reset; balances are per `(employeeId, cycleYear)`.
- **Extra work day** — a weekend or holiday on which an employee volunteers to
  work. Recorded via an Extra Work Log; when approved, credits replacement leave
  (+1 day for full-day work, +0.5 for half-day).
- **Replacement leave** — earned time-off. 1 approved full extra-work day → 1
  replacement leave day. **Not** hourly / **not** overtime-based. Unlike casual
  and sick leave it reserves nothing on submission — it debits on approval.
- **Primary role** — the highest-ranked entry in a user's `roles[]` array,
  denormalized onto `users.role` for display, sidebar and routing decisions.
- **Rank** — position in `ROLE_HIERARCHY`. Ordinal, not numeric: earlier in the
  array means higher authority.
- **Line Manager** — a role *plus* a reporting line. Reviews leave and extra
  work for their direct reports only (`users.lineManagerId`), and is prepended
  to the reviewer list for those reports' submissions.
- **Permission matrix** — the `role_permissions` table exposed at
  `/admin/permissions`. 24 keys × 5 roles, 60-second cache,
  `DEFAULT_MATRIX` fallback. See §5a.
- **HR** — the people who receive leave requests by role, currently Umme (HR) and
  Saifullah (Admin + HR). Not "an HR system".
- **Admin (CEO)** — Fuad. Approve rights; also receives leave-request CCs.
- **Super Admin** — the technical owner (Shefadib). Full access plus audit,
  system health and the permission matrix. Permissions are immutable.
- **Sender email** — the "from" address on outgoing mail. Stored in
  `system_settings.senderEmail`, editable from `/admin/settings`.
- **QA redirect** — `system_settings.qaRedirectEmail`. When set, every outgoing
  email is silently rerouted to that inbox while `email_log` keeps the real
  recipients. No banner, no subject tag.

---

*Last updated: whenever the code was last committed. If this doc drifts from the code, the code is right — but please update this doc too.*
