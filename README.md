# Trace HRIS

Production-grade HR Information System for Trace Consulting Ltd. Handles leave,
attendance, holidays and audit — for a team of 4 today, scales to 100+.

Full product spec: [`HRIS_Implementation.md`](./HRIS_Implementation.md).
Provisioning walkthrough: [`hris/SETUP.md`](./hris/SETUP.md).
Dev quick-start: [`hris/README.md`](./hris/README.md).

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Auth | Clerk 7 (email+password, Google OAuth, invites, webhook sync) |
| Database | Neon Postgres (serverless) via Prisma 6 |
| Email | Resend (leave decisions, holiday notices, invites) |
| Chatbot | Google Gemini 3.6 Flash (free tier, scoped to HRIS topics) |
| Hosting | Vercel |
| UI | React 19, Framer Motion, Recharts, Zustand, TanStack Query |

## Roles (server-enforced)

- **Super Admin** — technical owner. Full access + `/admin/audit` + `/admin/system`.
- **Admin** — CEO/CTO. Reviews leave, CC'd on Employee submissions.
- **HR** — People Operations. Reviews leave, invites employees, manages holidays and settings.
- **Employee** — general staff. Applies for leave, clocks in/out, logs extra work.

## Team roster (seeded)

| Role | Name | Email | Employee ID |
|---|---|---|---|
| Super Admin | Shefayat Adib | `shefadib@gmail.com` | SUPER-001 |
| Admin (CEO) | Fuad M Khalid Hossen | `fuad.khalid@traceconsultingltd.com` | TRACE-001 |
| HR | Abu Saleh Muhammad Saifullah | `asmsaifullah@traceconsultingltd.com` | TRACE-002 |
| HR | Umme Mahbuba Tama | `umtama@traceconsultingltd.com` | TRACE-003 |
| Employee | Tanvir Kabir | `tanvir.kabir@traceconsultingltd.com` | TRACE-101 |
| Employee | Rubayat E Shams Anik | `res.anik@traceconsultingltd.com` | TRACE-102 |

To add another employee: append them to [`hris/prisma/seed-users.ts`](./hris/prisma/seed-users.ts), then run:

```powershell
cd hris
TARGET_EMAIL=<their-email> npx tsx --env-file=.env.local scripts/add-employee.ts       # sync to Clerk + Postgres
TARGET_EMAIL=<their-email> npx tsx scripts/print-welcome.ts                            # print copy-paste welcome email
```

Never run `npm run db:seed` for a single add — it resets everyone's passwords back to the initial values.

## Approval routing

- Employee → both HR users, CCs the CEO.
- HR → other HR user + CEO, CCs Super Admin.
- Admin → Super Admin + HR.
- Super Admin → HR + CEO.

At approval time, HR/Admin/Super Admin can **modify the allocation per-day**
(swap full ↔ half, add days, remove days) subject to the applicant's remaining
balance.

## Feature checklist

- [x] Auth allowlist (only 5 seeded users can sign in)
- [x] Leave application (5-step wizard, full/half-day, time-range partial, replacement)
- [x] Per-day allocation editing at approval time
- [x] Attendance clock-in/out + breaks + biometric-ready endpoint
- [x] Log Extra Work → HR/Admin approval → replacement leave credit
- [x] Holiday CRUD + Resend notice dispatch, wired into Dashboard/Calendar
- [x] In-app notification center + email notifications for every state change
- [x] Editable system settings (sender email, working days, cycle start month)
- [x] Invite Employee flow with initial password
- [x] Deactivate/reactivate employees (both DB and Clerk)
- [x] Audit log viewer at `/admin/audit` (IP + user agent captured)
- [x] System health page at `/admin/system` (Super Admin only)
- [x] Security headers (HSTS, X-Frame, Permissions-Policy)
- [x] Per-user write rate limiting (30/min via Postgres)
- [x] Clerk webhook sync (`user.deleted`, `user.updated`)
- [x] Neon cold-start retry via Prisma `$extends`
- [x] "Ask HRIS" chatbot scoped to app + general HR-information-system concepts
- [x] Mobile responsive (sidebar drawer, reflowing tables)

## Getting started

1. Follow [`hris/SETUP.md`](./hris/SETUP.md) to provision Clerk, Neon, Resend and Gemini.
2. Then `cd hris && npm install && npm run dev` — see [`hris/README.md`](./hris/README.md).
