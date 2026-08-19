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
│  /api/holidays/*           │  └─────────────┘
│  /api/notifications/*      │
│  /api/users/*              │
│  /api/settings/*           │
│                            │
│  (Middleware: Clerk auth,  │
│   role guards, rate limit) │
└──────┬───────────────┬─────┘
       │               │
       │ Prisma        │ Resend SDK
       │               │
       ▼               ▼
┌── Neon Postgres ──┐  ┌── Resend ──┐
│  Tables (see §4): │  │ SMTP-less  │
│  users            │  │ email API  │
│  leave_requests   │  └────────────┘
│  attendance_...   │
│  holidays         │
│  notifications    │
│  system_settings  │
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
- **React email templates** — leave-approved emails, invite emails, holiday
  notices are all React components. Same design system as the app.
- **Deliverability out of the box** — SPF/DKIM/DMARC handled when you verify
  your domain. Emails don't land in spam.
- **Editable sender email in the DB** — you can change the "from" address
  from the admin dashboard without a code deploy.

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

```
1. Tanvir opens /leaves, clicks "Apply for Leave"
   → LeaveApplicationFlow modal opens
   → he fills in 5 steps, clicks Submit
   → useMutation(createLeaveRequest) fires POST /api/leaves/requests
        Body: { leaveType, startDate, endDate, timeFrom?, timeTo?, reason, ... }

2. /api/leaves/requests (route handler):
   a. Clerk middleware verifies session → gets Tanvir's userId
   b. Loads Tanvir's user row from Postgres, checks role = EMPLOYEE
   c. Runs Zod validation on the body
   d. Checks Tanvir's remaining leave balance in the same DB transaction
   e. INSERT INTO leave_requests (...) RETURNING *
   f. UPDATE leave_balances SET casual_pending = casual_pending + duration WHERE ...
      (Same transaction — either both succeed or both roll back)
   g. INSERT INTO notifications (recipient_id, type, ...) for each HR user + CEO
   h. Enqueue emails to send via Resend (Umme, Abu Saleh CC Fuad)
   i. Return the created leave_request row

3. Client:
   - TanStack Query invalidates ['leaves', 'mine'] → refetches
   - Modal shows success animation
   - Toast "Leave request submitted" appears

4. Umme's browser (she was already logged in on another tab):
   - Notification bell polls /api/notifications/unread-count every 30s
     (or via websocket in a later phase)
   - Sees new count → she clicks bell, sees the request
   - Umme's email inbox also gets the message via Resend

5. Umme clicks "Review" → Drawer opens
   - GET /api/leaves/requests/:id returns full details + Tanvir's current balance
   - Preview shows "8 → 5 days after approval"

6. Umme clicks Approve → confirmation modal → confirm
   - POST /api/leaves/requests/:id/approve with { note }
   - Route handler (in transaction):
     • UPDATE leave_requests SET status = 'APPROVED', reviewed_by = umme_id, ...
     • UPDATE leave_balances SET casual_used = casual_used + duration,
                                  casual_pending = casual_pending - duration
     • INSERT INTO notifications (recipient_id = tanvir_id, type = 'LEAVE_APPROVED', ...)
     • INSERT INTO audit_log (actor = umme, action = 'LEAVE_APPROVED', target = req_id)
     • Enqueue email to Tanvir via Resend
   - Return updated row

7. Umme's browser:
   - TanStack Query invalidates ['leaves', 'admin', 'pending']
   - Drawer closes, toast appears

8. Tanvir's browser (if open):
   - Next unread-count poll shows the new notification
   - Bell badge increments
   - Tanvir clicks bell → sees "Your leave was approved"
```

**Key properties of this flow:**
- Every DB write happens in a **transaction**. If email queueing fails, the DB write still commits (email is retried by Resend). If the DB write fails, no email goes out.
- **Audit trail** — every state-changing action creates an `audit_log` row.
- **Optimistic UI** — TanStack Query lets us show the approved state instantly
  and roll back if the server rejects (rare, but nice).

---

## 4. Database schema (Prisma)

Full schema lives in `prisma/schema.prisma`. The main tables:

- **`User`** — mirrors Clerk's user + role, department, employee code, cycle start date. Foreign key target for everything.
- **`LeaveBalance`** — one row per user per cycle year. Casual/sick totals & used, replacement bank, overtime hours bank. Enforces the "no inflation" rule.
- **`LeaveRequest`** — the core of the app. Includes new `timeFrom`/`timeTo` for partial-day leave. Status enum. Foreign keys to `User` (employee + reviewer).
- **`ExtraWorkLog`** — records extra work done on weekends/holidays. `workDate`, `workType` (FULL_DAY | HALF_DAY_MORNING | HALF_DAY_AFTERNOON), `status` (PENDING/APPROVED/REJECTED), reviewer. When approved, credits `LeaveBalance.replacementBalance` (+1.0 for full, +0.5 for half). Same approval rules as leave requests (HR + Admin can approve).
- **`AttendanceRecord`** — one row per user per date. Includes `source` (MANUAL / BIOMETRIC) for the future scanner integration.
- **`BreakSession`** — child of `AttendanceRecord`. Many-to-one.
- **`Holiday`** — company calendar. Recurring flag, notification schedule, recipients enum.
- **`Notification`** — in-app inbox. Links to `User` recipient + optional reference to another row (leave request, holiday).
- **`EmailLog`** — every email we send is logged for audit. Includes Resend's message ID for tracing bounces.
- **`SystemSettings`** — singleton row. Editable sender email, sender name, standard hours per day, work start/end time, work days bitmask. Admin/HR/Super Admin can edit.
- **`AuditLog`** — actor + action + target + timestamp + IP + user-agent for every state-changing action. Immutable, append-only.

**Foreign key strategy:**
- `ON DELETE CASCADE` for `attendance_records`, `break_sessions`, `notifications`, `leave_requests` when a user is deleted.
- **We never actually delete users** — deactivation flips `isActive = false`. Cascade is a defence-in-depth measure.

**Indexes:**
- `leave_requests(employee_id, status)` — fast "my pending requests" query
- `leave_requests(status, created_at DESC)` — fast admin inbox
- `attendance_records(employee_id, date DESC)` — fast history view
- `notifications(recipient_id, is_read, created_at DESC)` — fast bell dropdown

---

## 5. How the roles map

| Role | Where it's stored | How it's checked |
|---|---|---|
| `SUPER_ADMIN` | Clerk `publicMetadata.role = 'SUPER_ADMIN'` + mirror in `users.role` | Middleware on `/admin/system/*`, `/admin/audit/*` |
| `ADMIN` | Same, `= 'ADMIN'` | Middleware on `/admin/*` |
| `HR` | Same, `= 'HR'` | Middleware on `/admin/requests/*`, `/admin/employees/*` (subset of admin surfaces) |
| `EMPLOYEE` | Same, `= 'EMPLOYEE'` | Default; can access personal pages only |

**Approval routing rules (server-side, in `/api/leaves/requests` POST handler):**

```typescript
function approvalRecipients(applicant: User): { to: User[]; cc: User[] } {
  const hrUsers = allUsers.filter(u => u.role === 'HR' && u.isActive);
  const ceo = allUsers.find(u => u.role === 'ADMIN' && u.designation.includes('CEO'));
  const superAdmin = allUsers.find(u => u.role === 'SUPER_ADMIN');

  if (applicant.role === 'EMPLOYEE') {
    return { to: hrUsers, cc: ceo ? [ceo] : [] };
  }
  if (applicant.role === 'HR') {
    // Route to the OTHER HR + CEO
    return { to: hrUsers.filter(u => u.id !== applicant.id).concat(ceo ? [ceo] : []), cc: superAdmin ? [superAdmin] : [] };
  }
  if (applicant.role === 'ADMIN') {
    // CEO applying → go to Super Admin + HR
    return { to: [superAdmin!].concat(hrUsers), cc: [] };
  }
  if (applicant.role === 'SUPER_ADMIN') {
    return { to: hrUsers.concat(ceo ? [ceo] : []), cc: [] };
  }
  return { to: [], cc: [] };
}
```

**Who can approve any given request?** Anyone with role `HR`, `ADMIN`, or `SUPER_ADMIN`. UI hides the Approve/Reject buttons for `EMPLOYEE`.

---

## 6. Data consistency guarantees

### Transactions
Every multi-row write uses `prisma.$transaction([...])`. Examples:
- Creating a leave request + updating pending balance + inserting notifications
- Approving a request + moving pending → used + inserting notification + inserting audit row
- Clocking out + updating overtime bank + creating replacement leave day (if bank ≥ 8h)

If any step in the transaction fails, all are rolled back. Neon Postgres handles isolation at `READ COMMITTED` (default).

### Race conditions
Concurrent approve/reject on the same request is prevented by:
1. **Optimistic locking** via `updatedAt` — the mutation includes the last-seen `updatedAt`; if the DB row's `updatedAt` differs, the mutation is rejected ("Someone else already handled this — refresh").
2. **DB constraints** — the `leave_requests.status` enum prevents an already-APPROVED request from being re-approved.

### Balance invariants
Enforced in the DB with a check constraint:
```sql
CONSTRAINT valid_balance CHECK (
  casual_used + casual_pending <= casual_total AND
  sick_used + sick_pending <= sick_total AND
  casual_used >= 0 AND sick_used >= 0
)
```
If any mutation would violate this, Postgres rejects the write. Belt-and-suspenders with the app-level validation.

### Time zones
- **Every timestamp in the DB is UTC** (Postgres `TIMESTAMPTZ`).
- **Display in the user's local timezone** — the browser handles it via `date-fns-tz`. Bangladesh is `Asia/Dhaka` (UTC+6).
- **Dates without times** (like leave `startDate`) use plain `DATE` type — no timezone confusion.

---

## 7. Security posture

### Authentication
- Handled by **Clerk**. Session tokens are HTTP-only, secure, SameSite=Lax cookies.
- We never see, store, or handle passwords.
- MFA can be enabled per-user from Clerk's UI later.

### Authorization
- **Every API route** starts with a Clerk middleware check that:
  1. Verifies the session
  2. Loads the user's role from Postgres (cached 30s)
  3. Rejects with 403 if the role doesn't match the route's required role
- Role checks happen **server-side only**. The client also hides UI, but that's UX, not security.

### Input validation
- Every API route uses **Zod** to validate the request body/query. Invalid input returns 400 with a helpful error message.
- File uploads (leave attachments) are:
  - Limited to `.pdf`, `.jpg`, `.png`
  - Max 5 MB
  - Stored in Vercel Blob with a scoped URL (not publicly listable)
  - Virus-scanned by ClamAV in a background job (future phase)

### SQL injection
- **Impossible.** Prisma uses parameterized queries under the hood. No raw SQL in the codebase except read-only reports (also parameterized).

### CSRF
- Next.js API routes require the request to originate from the same host (enforced by Clerk middleware + CORS defaults).
- All state-changing routes are POST/PATCH/DELETE, not GET.

### XSS
- React escapes all rendered content by default. No `dangerouslySetInnerHTML` anywhere except the sanitized rich-text preview in the leave message editor (sanitized with DOMPurify).

### Rate limiting
- Per-user: 60 requests/minute for read routes, 20/minute for writes. Implemented with `@upstash/ratelimit` + Upstash Redis (free tier).
- Login attempts: handled by Clerk.

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

## 8. How to add a new employee (the seamless flow you asked about)

**From the admin/HR/super-admin dashboard, "Employees → Invite":**

1. Form: name, email, role, department, designation, employee code, cycle start month.
2. Submit → hits `POST /api/users/invite`:
   ```typescript
   // Server-side
   const clerkUser = await clerkClient.users.createUser({
     emailAddress: [email],
     firstName, lastName,
     publicMetadata: { role, department, employeeCode },
     skipPasswordChecks: true,      // Let them set on first login
     skipPasswordRequirement: true,
   });

   await prisma.user.create({
     data: {
       id: clerkUser.id,            // Same ID as Clerk for easy joins
       fullName, email, role, department, designation, employeeIdCode,
       cycleStartMonth,
     },
   });

   await prisma.leaveBalance.create({
     data: {
       userId: clerkUser.id,
       cycleYear: new Date().getFullYear(),
       cycleStartDate: computeCycleStart(cycleStartMonth),
       cycleEndDate: computeCycleEnd(cycleStartMonth),
       // Defaults from SystemSettings
     },
   });

   await clerkClient.invitations.createInvitation({
     emailAddress: email,
     redirectUrl: `${env.APP_URL}/onboarding`,
   });
   ```
3. Clerk sends the invite email using its default template (customizable later).
4. New employee clicks the link → sets their own password OR signs in with Google → lands on `/onboarding`.
5. `/onboarding` shows a "Welcome, Tanvir!" screen, asks them to confirm their department and any other info we didn't seed, then routes them to their dashboard.

**No password generation on our side.** No password ever crosses email.

**To bulk-add later:** an "Import CSV" button on the same page. The CSV parses into the same `POST /api/users/invite` call, one per row.

---

## 9. Deployment & environments

| Environment | URL | Postgres | Clerk | Purpose |
|---|---|---|---|---|
| Local dev | `http://localhost:3000` | Neon `dev` branch | Clerk `Development` instance | Your machine |
| Preview | `https://trace-hris-*.vercel.app` (per PR) | Neon `dev` branch | Clerk `Development` instance | Auto-created by Vercel per branch |
| Production | `https://your-domain.com` | Neon `main` branch | Clerk `Production` instance | Real users |

**Migrations:** `npx prisma migrate deploy` runs automatically on Vercel build via `postbuild` script. Never migrate against production from your laptop.

**Rollback:** Vercel keeps every deploy. One-click rollback to any prior version. DB migrations that need reversing require `prisma migrate resolve` + a compensating migration (rare).

---

## 10. Extending the system

**Adding a new leave type (e.g. "Bereavement Leave"):**
1. Add value to `LeaveType` enum in `prisma/schema.prisma`
2. `npx prisma migrate dev --name add_bereavement_leave`
3. Add color token to `src/index.css`
4. Add case to `leaveTypeLabel()` and `leaveTypeShort()` in `src/lib/utils.ts`
5. Add balance fields to `LeaveBalance` if it's a separate quota

**Adding a new notification type:**
1. Add value to `NotificationType` enum in Prisma schema
2. Add icon+color mapping in `Topbar.tsx`
3. Emit from the relevant API route via `createNotification()` helper

**Adding a new role:**
1. Add value to `Role` enum
2. Update `approvalRecipients()` in `src/lib/routing.ts`
3. Add sidebar nav section (if needed)
4. Update middleware in `src/middleware.ts`

**Integrating the biometric scanner** (spec §15):
1. The scanner posts to `POST /api/attendance/clock-in` with `{ source: "BIOMETRIC", biometric_device_id, biometric_verified, timestamp }`.
2. The API route already accepts these fields — just add API-key auth for scanner requests (they don't have a Clerk session).
3. Store the scanner's device ID in a `BiometricDevice` table for allowlisting.

---

## 11. Cost projections

| Users | Clerk | Neon | Resend | Vercel | Total/mo |
|---|---|---|---|---|---|
| 4 (today) | $0 (free) | $0 (free 0.5GB) | $0 (free 100/day) | $0 (hobby) | **$0** |
| 50 | $0 | $0 | $0 | $0 | **$0** |
| 500 | $0 | $19 (Launch) | $0 | $20 (Pro) | **$39** |
| 5,000 | $25 (Pro) | $69 (Scale) | $20 (Pro) | $20 | **$134** |

You're well within the free tier for the foreseeable future.

---

## 12. Where things live

```
hris/
├── prisma/
│   ├── schema.prisma          # DB schema
│   ├── migrations/            # Versioned SQL migrations
│   └── seed.ts                # Seed real users (Fuad, Abu Saleh, Umme, Tanvir)
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/            # Sign-in, invitation callback
│   │   ├── (app)/             # Authenticated app shell
│   │   │   ├── page.tsx       # Employee dashboard
│   │   │   ├── leaves/
│   │   │   ├── attendance/
│   │   │   └── admin/         # Admin-only routes (protected in middleware)
│   │   └── api/               # API route handlers
│   │       ├── leaves/
│   │       ├── attendance/
│   │       ├── holidays/
│   │       ├── notifications/
│   │       ├── users/
│   │       └── settings/
│   ├── components/            # Same as prototype — UI, layout, leave, attendance
│   ├── lib/
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── auth.ts            # Clerk helpers
│   │   ├── email.ts           # Resend client + template renderers
│   │   ├── routing.ts         # approvalRecipients() etc.
│   │   ├── validation.ts      # Zod schemas
│   │   └── audit.ts           # audit_log writer
│   ├── emails/                # React email templates (via @react-email/components)
│   │   ├── LeaveSubmitted.tsx
│   │   ├── LeaveApproved.tsx
│   │   ├── LeaveRejected.tsx
│   │   ├── HolidayNotice.tsx
│   │   └── EmployeeInvite.tsx
│   └── middleware.ts          # Clerk auth + role guards + rate limiting
├── SETUP.md                   # First-time setup guide (env vars, service signups)
├── ARCHITECTURE.md            # This document
├── DEMO_GUIDE.md              # User-facing walkthrough
└── README.md                  # Project overview
```

---

## 13. Glossary

- **Cycle** — a 12-month leave period per employee. `cycle_start_month` determines when balances reset.
- **Extra work day** — a weekend or holiday on which an employee volunteers to work. Recorded via an Extra Work Log; when approved, credits replacement leave (+1 day for full-day work, +0.5 for half-day).
- **Replacement leave** — earned time-off. 1 approved full extra-work day → 1 replacement leave day. 1 approved half-day → 0.5 replacement leave day. **Not** hourly / **not** overtime-based.
- **HR** — the two-person team (Abu Saleh, Umme) who receive leave requests. Not "an HR system".
- **Admin (CEO)** — Fuad. Has approve rights; also receives leave request CCs.
- **Super Admin** — currently you (Shefadib). Full system access + can rotate the sender email + view audit logs.
- **Sender email** — the "from" address on outgoing emails. Stored in `system_settings.sender_email`, editable from the Settings page.

---

*Last updated: whenever the code was last committed. If this doc drifts from the code, the code is right — but please update this doc too.*
