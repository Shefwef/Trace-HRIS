# Trace HRIS — dev quick start

Next.js 16 app for Trace Consulting's HRIS. See [`../README.md`](../README.md)
for the product overview and [`SETUP.md`](./SETUP.md) for the one-time provisioning
of external services (Clerk, Neon, Resend, Gemini).

## Requirements

- Node.js 22 or newer
- A `.env.local` filled in from [`.env.example`](./.env.example) (copy the file,
  swap in real values). Never commit `.env.local`.

## First-time setup

```bash
npm install                # runs `prisma generate` via postinstall
npm run db:deploy          # applies migrations to Neon
npm run db:seed            # creates the 12 seeded users + permission defaults
npm run dev                # → http://localhost:3000
```

On an existing database, prefer `npm run db:sync-roles` over `db:seed` — see the
table below for why.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Runs `prisma generate` then `next build` |
| `npm run start` | Serves the built app |
| `npm run typecheck` | `tsc --noEmit` — the project has no ESLint config; Next 16 removed `next lint` |
| `npm run db:migrate` | Create a new dev migration |
| `npm run db:deploy` | Apply migrations (used in CI and prod) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:sync-roles` | **Safe refresh.** Syncs role sets, departments, designations and Clerk profile photos for all 12 seeded users, and seeds any missing `role_permissions` rows. Touches no passwords, deletes nobody. |
| `npm run db:seed` | **Destructive full re-seed.** Everything `db:sync-roles` does, plus it re-applies each user's hardcoded initial password (`skipPasswordChecks: true`) and deletes any Clerk/Postgres user not in the `prisma/seed-users.ts` allowlist. Use on a fresh database only. |

## Environment variables

All are required except `GEMINI_API_KEY` (chatbot) and
`CLERK_WEBHOOK_SIGNING_SECRET` (Clerk → HRIS sync webhook). Both degrade
gracefully — the affected endpoints return `501 NOT_CONFIGURED` and the rest
of the app keeps working.

See [`.env.example`](./.env.example) for the complete list.

## Layout

```
src/
├── app/                    # Next.js App Router
│   ├── (app)/              # authenticated pages (sidebar shell)
│   │   ├── admin/          # Admin/HR/Super Admin; /admin/requests also
│   │   │                   #   admits Line Managers (team-scoped queue)
│   │   ├── dashboard/
│   │   ├── leaves/
│   │   ├── attendance/
│   │   └── ...
│   ├── (auth)/sign-in/     # Clerk catch-all sign-in route
│   ├── api/                # route handlers
│   └── layout.tsx          # metadata + viewport exports, PWA registration
├── components/             # cross-page UI (widgets, drawers, modals)
├── screens/                # page bodies rendered by app/ routes
├── lib/                    # api helpers, prisma, email, permissions, routing
└── proxy.ts                # Clerk + route guards (Next 16 renamed this from
                            #   middleware.ts; the convention, not Clerk's API)
```

## Deployment

Push to `main` and Vercel picks it up. Environment variables mirror `.env.local`
under **Project Settings → Environment Variables** in Vercel.

Prisma migrations run automatically on Vercel via the `build` script only when
you also call `npm run db:deploy` — set that up as a Vercel deploy hook or run
it manually against `DIRECT_URL` after a schema change:

```bash
DATABASE_URL=$DIRECT_URL npm run db:deploy
```

## Common pitfalls

- **`P1001` on cold-start** — Neon suspends after ~5 min of inactivity. The
  Prisma client in [`src/lib/db.ts`](./src/lib/db.ts) auto-retries three times
  (300/900/2100 ms) so first-request-after-idle is transparent.
- **Clerk keys with wrong domain** — publishable and secret keys must belong to
  the same Clerk application. Copy both from the same **API Keys** page.
- **Sign-in works but no data** — the Clerk user isn't in Postgres. Run
  `npm run db:sync-roles`, which upserts them without touching passwords.
- **Permissions screen shows checkboxes but no saved state** — `role_permissions`
  is empty. Both the screen and `checkPermission()` fall back to `DEFAULT_MATRIX`
  so nothing is broken, but run `npm run db:sync-roles` (or hit **Reset to
  defaults** on `/admin/permissions`) to materialise the rows.
- **Signed-out visitor gets a 404 instead of the sign-in page** — Clerk's
  `auth.protect()` throws a Next `notFound()` unless you pass
  `unauthenticatedUrl`/`unauthorizedUrl`. Both are set in
  [`src/proxy.ts`](./src/proxy.ts); don't drop them.
- **`createRouteMatcher` deprecation warning on `next dev`** — Clerk 7 wants
  resource-based checks inside each page/route rather than path matching in the
  proxy. The app already does those checks (`requireUser()` in pages,
  `requireAuth()` in routes), so the proxy is defense-in-depth. Removing the
  matcher is queued for the Clerk 8 upgrade.
