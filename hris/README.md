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
npm run db:seed            # creates the 5 real users in Clerk + Postgres
npm run dev                # → http://localhost:3000
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Runs `prisma generate` then `next build` |
| `npm run start` | Serves the built app |
| `npm run lint` | Next.js ESLint |
| `npm run db:migrate` | Create a new dev migration |
| `npm run db:deploy` | Apply migrations (used in CI and prod) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:seed` | Idempotent seed of the 5 real users |

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
│   │   ├── admin/          # admin, HR, super-admin only
│   │   ├── dashboard/
│   │   ├── leaves/
│   │   ├── attendance/
│   │   └── ...
│   ├── api/                # route handlers
│   ├── sign-in/
│   └── layout.tsx
├── components/             # cross-page UI (widgets, drawers, modals)
├── screens/                # page bodies rendered by app/ routes
├── lib/                    # api helpers, prisma, email, chatKb, ratelimit
└── middleware.ts           # Clerk + route guards
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
  `npm run db:seed` (idempotent).
- **Middleware deprecation warning on `next dev`** — Next 16 renamed
  `middleware.ts` → `proxy.ts`. Non-breaking; migration will happen with the
  rest of the Next 17 prep.
