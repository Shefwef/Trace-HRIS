# HRIS Production Setup Guide

> **Who this is for:** you (the developer/super-admin). This is what you need to do
> before the production build can start talking to real services. Everything on
> this page is a one-time setup, and every account has a **free tier** that
> covers your starting scale (4 users → 100+ employees).

## The 4 services you'll create

| # | Service | What it does | Free tier | Sign-up URL |
|---|---|---|---|---|
| 1 | **Clerk** | User auth, invites, Google OAuth, password reset | 10,000 monthly active users | https://clerk.com |
| 2 | **Neon** | Serverless Postgres database | 0.5 GB storage, unlimited queries | https://neon.tech |
| 3 | **Resend** | Transactional email (leave notifications, invites, holidays) | 100 emails/day, 3,000/month | https://resend.com |
| 4 | **Vercel** | Deployment (you already have this) | — | https://vercel.com |

Total cost: **$0** while you're getting started.

---

## Step 1 — Clerk (auth)

Time: ~5 min.

1. Go to https://dashboard.clerk.com/sign-up and sign up with `shefadib@gmail.com`.
2. Click **Create application**. Name it `Trace HRIS`.
3. On the "How will your users sign in?" screen, enable:
   - **Email** (with password)
   - **Google**
4. Click **Create application**.
5. On the dashboard, go to **API Keys** in the left sidebar.
6. Copy these two values — you'll paste them to me:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
7. Still in Clerk, go to **User & Authentication → Email, Phone, Username**. Confirm "Password" and "Google" are both toggled on. Save.
8. Go to **Sessions**. Set "Session timeout" to `7 days` (default is fine; adjust if you want).
9. **Don't invite users yet** — I'll seed them programmatically once the app is wired.
10. **Webhook (recommended)** — keeps our DB in sync when a user is deleted or updated directly in the Clerk dashboard:
    - Go to **Webhooks → Add Endpoint**.
    - Endpoint URL: `https://<your-vercel-domain>/api/webhooks/clerk` (for local dev use an ngrok tunnel).
    - Message filters: check `user.deleted` and `user.updated`.
    - Save, then copy the **Signing Secret** (starts with `whsec_...`) and paste to me alongside the other keys:
    ```
    CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
    ```
    - Without this the webhook returns 501 and syncing falls back to manual. The app still works.

---

## Step 2 — Neon (database)

Time: ~3 min.

1. Go to https://console.neon.tech/signup and sign up with `shefadib@gmail.com` (use Google OAuth for speed).
2. On the "Create project" screen:
   - Project name: `trace-hris`
   - Postgres version: **17** (latest)
   - Region: pick **AWS Singapore** (closest to Bangladesh)
   - Click **Create project**.
3. On the project dashboard, open the **Connect to your database** dialog. Make sure **Connection pooling** is toggled ON.
4. Copy the string shown — it will look like:
   ```
   postgresql://neondb_owner:xxxxx@ep-xxxx-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
   This is your `DATABASE_URL` (pooled, for runtime queries).
5. Derive the `DIRECT_URL` by removing `-pooler` from the host. Same string, same password — just the hostname changes:
   ```
   postgresql://neondb_owner:xxxxx@ep-xxxx.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
   (Or: toggle **Connection pooling** off in the same dialog and copy that string — same result.)
6. Paste both to me labelled `DATABASE_URL` and `DIRECT_URL`.

---

## Step 3 — Resend (email)

Time: ~5 min (plus DNS verification wait, ~10 min).

1. Go to https://resend.com/signup and sign up with `shefadib@gmail.com`.
2. Verify your email (they send a confirmation link).
3. In the dashboard, go to **API Keys → Create API Key**. Name it `Trace HRIS Production`. Permission: **Full access**.
4. Copy the key (starts with `re_...`) — you'll only see it once:
   ```
   RESEND_API_KEY=re_...
   ```
5. **Sender email — two options:**

   **Option A (fastest, works immediately):**
   Use Resend's test domain. Emails send from `onboarding@resend.dev`. Good enough while we test, but obviously not branded. Skip to step 6.

   **Option B (branded, ~10 min DNS):**
   In Resend, go to **Domains → Add domain**. Enter a domain you own (if you have one — e.g. `traceconsultingltd.com` if you'll get access later, or your personal domain for now). Follow the DNS instructions.
   - This is only useful if you have DNS access to a domain right now.
   - We can flip to this later when you get the company domain — the app reads the sender address from `SYSTEM_SETTINGS.sender_email` in the DB, so it's a one-click change from the admin dashboard.

6. **For now, we'll use Option A.** The sender email in the DB will default to `shefadib@gmail.com` as the reply-to; the from-address will be `onboarding@resend.dev` until you verify a domain.

---

## Step 4 — Vercel Postgres (already handled via Neon)

You're already deploying to Vercel from https://github.com/Shefwef/Trace-HRIS. We'll add the environment variables from steps 1–3 to that Vercel project so production picks them up.

You don't need to do anything here yet — I'll walk you through pasting the env vars into Vercel once we have all four values ready.

---

## Step 5 — Gemini API (in-app assistant, optional)

Time: ~2 min. **Free tier — no credit card required.**

Powers the "Ask HRIS" chatbot in the bottom-right of every authenticated page. Scoped to only answer questions about this app or general HR-information-system concepts. Uses Google Gemini 3.6 Flash — the free tier covers ~1,500 requests/day, well beyond what a 4–100 person team will use.

1. Go to https://aistudio.google.com/apikey and sign in with your Google account.
2. Click **Create API key** → **Create API key in new project** (or pick an existing GCP project).
3. Copy the key (starts with `AIza...`):
   ```
   GEMINI_API_KEY=AIza...
   ```
4. Paste to me alongside the other keys.

If you skip this, the help panel still opens but shows a "chat not configured" message. Nothing else breaks.

---

## What to send me

Paste all of this back to me in a message (redact/mask if you're pasting anywhere public, but the assistant chat is fine):

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Neon
DATABASE_URL=postgresql://...pooled connection string...
DIRECT_URL=postgresql://...direct connection string...

# Resend
RESEND_API_KEY=re_...
```

Once I have these, I can:
- Migrate the app to Next.js
- Seed the 4 real users with their roles
- Run the Prisma migrations to create the schema in Neon
- Send a test invite email to confirm Resend works end-to-end
- Push to Vercel

---

## Security note (important)

- **Never commit these keys to git.** I'll set up `.env.local` (git-ignored) for local dev and use Vercel's env vars for production. If a key ever leaks, you can rotate it from the respective service's dashboard.
- **`.env.local` will be in `.gitignore`** — I'll double-check this before any commit.
- **Rotate keys quarterly** as a habit. Takes 2 minutes per service.

---

## While you're doing this

I'll start the Next.js migration in parallel. It doesn't need any of the keys yet — I'm just moving the file structure f in e services the moment you hand me the values.rom Vthe itto Next.js and setting up the routing, so we're ready to plug
