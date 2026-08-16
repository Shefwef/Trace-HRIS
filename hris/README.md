# HRIS — People, simplified.

A clickable prototype of the HR Information System described in
[`../HRIS_Implementation.md`](../HRIS_Implementation.md). Built with React 18,
TypeScript and Vite. Runs entirely in the browser against seeded mock data —
no backend required.

## What's in the box

- **Employee**: dashboard with animated leave-balance arc rings, live attendance
  widget, 5-step leave application flow, tabbed leave history, monthly
  calendar, analytics, and PDF-report shells.
- **Admin (HR / CEO)**: leave inbox with slide-in review drawer (approve /
  reject with balance preview), holiday manager with in-app notice dispatch,
  employee directory, and settings.
- **App shell**: sidebar nav, top bar with a **demo user switcher** so you can
  toggle between Employee and Admin views instantly, notification bell, toast
  system, login page with quick-pick demo accounts.

## Run locally

```bash
npm install
npm run dev
# → http://localhost:5173
```

## Deploy to Vercel

The `vercel.json` at the project root already wires up SPA fallback so deep
links like `/admin/requests` work in production.

**Option A — CLI**

```bash
npm i -g vercel
cd hris
vercel        # follow prompts; framework = "Vite"
vercel --prod # promote when you're ready
```

**Option B — Dashboard**

1. Push this `hris/` folder to a GitHub repo.
2. On <https://vercel.com/new>, import the repo.
3. Set **Root Directory** to `hris` (if you kept the folder structure).
4. Framework preset: **Vite**. Build command: `npm run build`. Output: `dist`.
5. Deploy — you get a URL like `hris-xxxxx.vercel.app`.

See [`DEMO_GUIDE.md`](./DEMO_GUIDE.md) for a full walkthrough script and the
"what does what" reference.
