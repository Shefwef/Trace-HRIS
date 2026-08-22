# Trace HRIS — Demo Guide

> **For:** the instructor and senior reviewers walking through Trace HRIS for the first time.
> **Demo length:** ~35 minutes end-to-end. Skim in 10, deep-dive in 60.
> **Style:** written for a non-technical reader. No code, no jargon without a definition.

## What's inside this document

1. **What is this system?** — one paragraph elevator pitch
2. **Cast of characters** — the 4 roles and 6 real users
3. **Approval routing** — the one rule that governs every leave request
4. **The 35-minute demo script** — 10 blocks to walk through, in order
5. **Reference — one page per module** — role-by-role capability map
6. **Adding a new employee mid-year** — the 3-step onboarding workflow
7. **Q&A cheat sheet** — likely questions with prepared answers
8. **Post-launch checklist** — items to complete after the demo lands
9. **A-to-Z QA walkthrough** — 3-pass verification you can run yourself
10. **Fallback plans** — what to do if the demo goes sideways
11. **Where to look for more information** — pointers to the other docs

---

## What is this system?

Trace HRIS is the internal People Operations app for Trace Consulting Ltd. It replaces
the spreadsheets, WhatsApp threads and email chains that were being used to manage:

- **Leave** — who is off, when, and whether it's approved
- **Attendance** — who came in, when, and how long they worked
- **Holidays** — the office holiday calendar and the emails announcing them
- **Employees** — the roster, including onboarding new joiners and off-boarding leavers

Every action is logged, every approval flows to the right person automatically, and
every change triggers both an in-app notification *and* an email. Nothing lives in
one person's inbox anymore.

The app is designed for a small team today (12 people at the time of writing),
but the architecture is built so that adding a 100th employee changes nothing
about how any of the existing screens work.

---

## Cast of characters — 4 roles, 12 real users

Trace HRIS treats every action through the lens of **who is doing it**. There are
four roles, each with a different level of access:

| Role | Who has it | What they can do |
|---|---|---|
| **Employee** | Everyone by default | Apply for leave, clock in/out, log extra work, see their own history |
| **HR** | People Operations team | Everything an Employee can do + review leave, invite employees, manage the holiday calendar, edit system settings |
| **Admin** | CEO / CTO | Everything HR can do + gets CC'd on Employee leave requests |
| **Super Admin** | Technical owner | Everything Admin can do + view the audit log + view the system health page |

The 12 real users seeded into the system (multi-role — a person can hold more than one role at a time):

| Name | Designation | Email | Role set | Password (first-time) |
|---|---|---|---|---|
| Shefayat Adib | System Administrator | `shefadib@gmail.com` | **Super Admin** | `Trace-HRIS-Super-2026!` |
| Fuad M Khalid Hossen | Chief Executive Officer (CEO) | `fuad.khalid@traceconsultingltd.com` | **Admin** | `Trace-HRIS-Fuad-2026!` |
| Abu Saleh Muhammad Saifullah | Chief Operating Officer (COO) | `asmsaifullah@traceconsultingltd.com` | **Admin + HR** | `Trace-HRIS-Saifullah-2026!` |
| Umme Mahbuba Tama | Research Associate | `umtama@traceconsultingltd.com` | **HR** | `Trace-HRIS-Tama-2026!` |
| Tanvir Kabir | Digital Content & Multimedia Specialist | `tanvir.kabir@traceconsultingltd.com` | **Employee** | `Trace-HRIS-Tanvir-2026!` |
| Rubayat E Shams Anik | Policy, Research and Business Development Specialist | `res.anik@traceconsultingltd.com` | **Employee** | `Trace-HRIS-Anik-2026!` |
| Mimma Afrin | Technical Lead — Laboratory Operations | `mimma.afrin@traceconsultingltd.com` | **Employee** | `Trace-HRIS-Mimma-2026!` |
| Recardo Saurav Antor Halder | Manager, Business Development | `recardo.halder@traceconsultingltd.com` | **Employee** | `Trace-HRIS-Recardo-2026!` |
| Nabeel Khan | Head of Partnerships & Strategic Growth | `nabeel.khan@traceconsultingltd.com` | **Employee** | `Trace-HRIS-Nabeel-2026!` |
| Moudud Ahmmed Sujan | Head of External Affairs | `moudud.sujan@traceconsultingltd.com` | **Employee** | `Trace-HRIS-Moudud-2026!` |
| Ahmed Julker Nine | Research and Policy Analyst | `ahmed.nine@traceconsultingltd.com` | **Employee** | `Trace-HRIS-Ahmed-2026!` |
| Tahsina Shiva | IT Project Manager | `tahsina.shiva@traceconsultingltd.com` | **Employee** | `Trace-HRIS-Tahsina-2026!` |

**Notification routing under the multi-role model:** any leave request notifies **anyone with the HR role** (Saifullah + Tama). Fuad, who is Admin-only, retains the power to approve but gets no notifications or emails. Saifullah gets both because he holds Admin + HR.

> **For the demo:** you don't need to open 11 browsers — just pick the roles you're
> actually demoing (usually Super Admin + Admin + HR + one Employee = 4 windows).
> Line them up left-to-right so you can switch instantly. Don't try to log in/out
> during the demo — it wastes time and breaks the flow.

---

## Approval routing — the one rule to explain

Whenever anyone applies for leave, the system automatically picks the right people
to notify. **The applicant never has to choose an approver.**

| If the applicant is… | Approval goes to… | And CCs… |
|---|---|---|
| An **Employee** | **Both HR** users | The **CEO** |
| An **HR** user | The **other HR** user + the **CEO** | The **Super Admin** |
| The **Admin (CEO)** | The **Super Admin** + **HR** | — |
| The **Super Admin** | **HR** + the **CEO** | — |

At review time, the reviewer can **modify the allocation** — swap a full day for a
half, add a day, remove a day — subject to the applicant's remaining balance.

---

# The 35-minute demo script

Walk through in this order. Each block is 2–5 minutes. **Total: ~35 minutes**
of active demo. Skip Block 7 (Super Admin) or Block 10 (Reports) if you're
short on time — the essentials are Blocks 1–4.

## Block 1 — Sign in and the dashboard (3 min)

**Show as: Tanvir (Employee)**

1. Open the login page. Point out: only the 5 pre-approved emails can sign in. If you type any other email, Clerk (the auth layer) refuses. This is the security allowlist.
2. Sign in as Tanvir. The dashboard opens.
3. Point at the **arc rings** — three circles showing leave balances:
   - **Casual:** 12 out of 12 days remaining
   - **Sick:** 12 out of 12 days remaining
   - **Replacement:** 0 (earned by working extra time — we'll see this later)
4. Point at the **Attendance widget** — shows current time and a big "Clock in" button.
5. Point at the **Notification bell** — top right. Currently 0 unread.
6. Point at the **"Ask HRIS" button** — bottom-right. We'll come back to this.

> **What to say:** "Everything the employee needs on day one is on this screen.
> They don't have to hunt through menus."

## Block 2 — Applying for leave (5 min)

**Continue as: Tanvir**

1. Click **Apply for Leave**. A 5-step wizard opens.
2. **Step 1: Type.** Three clean icons — a palm tree for Casual, a stethoscope for Sick, repeat-arrows for Replacement. Pick Casual.
3. **Step 2: Duration.** Pick a date next week. Change "Full day" to "Half day
   (morning)". Point at the balance preview: "0.5 days will be deducted from
   your Casual balance."
4. **Step 3: Reason.** Type "Doctor's appointment."
5. **Step 4: Review.** Show the summary card — who will be notified, what the
   balance impact will be.
6. **Step 5: Submit.** The request moves to PENDING. A toast confirms.

**Now switch to: Saifullah (HR)** — this is why we opened five windows.

7. Open the notification bell — it has a new unread. Click it → jumps to Tanvir's request.
8. This is the **review drawer**. Show:
   - Applicant name, role, remaining balance
   - The requested day and slot
   - **Modify allocation** panel — change the half-day to a full day. The balance preview updates in real-time.
   - Approve / Reject buttons at the bottom
9. Click **Approve**. Confirmation toast.

**Switch back to: Tanvir**

10. Notification bell now shows a decision notification. Click it.
11. Check email — an email from `onboarding@resend.dev` announces the approval.
12. Dashboard now shows the updated balance (11.0 / 12 Casual — or whatever the reviewer chose).

> **What to say:** "The employee submits once. The system routes it, notifies
> the right people, and the approver can even fine-tune the request without
> forcing a rejection-and-resubmit loop."

## Block 3 — Attendance and extra work (5 min)

**Continue as: Tanvir**

1. Click the **Clock in** button on the attendance widget. **The timer starts instantly** — no spinner, no wait. (This is the optimistic-update pattern: the UI flips the moment you click, then reconciles with the server in the background.)
2. Click **Start break** → timer freezes immediately. Click **End break** → timer resumes.
3. Click **Clock out**. The session gets saved to your history.
4. Show the attendance page — table of today's session with clock-in, breaks, clock-out timestamps.
5. Now navigate to **Log Extra Work**. Fill in: worked last Saturday, full day. Submit.

**Switch to: Saifullah (HR)**

6. Show the Extra Work approval tab. Tanvir's request is pending. Approve it.

**Switch back to: Tanvir**

7. Dashboard now shows **Replacement leave: 1.0**. He earned a day off by working
   an off-day. Point out: half-day extra work (9-1 or 1-5) earns 0.5, full day earns 1.
   Never hourly — this matches Trace's actual policy.

> **What to say:** "Attendance isn't just about tracking hours — it's the
> foundation for the replacement leave system. Work on Saturday, take Monday
> off. All properly recorded."

## Block 4 — Holidays and the calendar (3 min)

**Switch to: Saifullah (HR)**

1. Navigate to **Admin → Holidays**.
2. Add a new holiday for a future date — "Test Holiday" on some Friday next month.
3. After saving, click **Send Notice**. Point at the confirmation: 4 emails were dispatched (one to each other user).
4. Show the checkbox to include Tanvir + the CEO + Umme + shefadib in the recipient list.

**Switch to: Tanvir**

5. Check inbox — holiday notice email arrived.
6. On the dashboard, the **mini calendar** shows the new holiday highlighted.
7. Navigate to the full **Calendar** page — the holiday is on the right date.

> **What to say:** "One place to publish holidays. Everyone gets the email,
> and the calendar updates instantly across the whole app — no separate
> announcements, no forgotten Slack channels."

## Block 5 — Reviewer's inbox and history (3 min)

**Switch to: Saifullah (HR)**

1. Navigate to **Admin → Requests**.
2. Show three tabs: **Pending** (needs review), **Approved**, **Rejected**.
3. Open one that's already approved — show the audit trail:
   - Who submitted, when
   - Who reviewed, when
   - Any allocation modifications made
   - Any reason given for rejection

> **What to say:** "Every decision is on the record. No 'I don't remember
> approving that' conversations."

## Block 6 — Admin tools: employees and settings (4 min)

**Continue as: Saifullah (HR)**

1. Navigate to **Admin → Employees**.
2. Show the employee cards — each has status, role badge, cycle info, **Deactivate** button pinned to the bottom.
3. Click **Invite Employee**. Fill in a fake name/email. The system:
   - Creates a Clerk user (so they can sign in)
   - Creates a Postgres record (so they have a profile)
   - Shows the **initial password** — copy this and share it via a secure channel with the new joiner
4. (Skip actually creating a real user unless you want to.)
5. Navigate to **Admin → Settings**.
6. Show the editable fields — sender email for outgoing emails, working days per week, cycle start month.
7. Change one, save, show the confirmation toast.

> **What to say:** "Onboarding is one click. Off-boarding is one click. HR
> doesn't need a developer to change how the app works — the important knobs
> are in the settings panel."

## Block 7 — Super Admin only: audit and system health (3 min)

**Switch to: Shefayat (Super Admin)**

1. Show that Saifullah / Tanvir / Fuad *cannot* see this next section — try the URL as Tanvir to demonstrate the "Not authorized" screen.
2. Navigate to **Admin → Audit Log**.
3. Show the last 20-ish actions — every login, every leave submission, every
   approval, every settings change. Each entry shows the actor's IP address
   and browser.
4. Filter by "action = LEAVE_APPROVED" — narrows the view.
5. Navigate to **Admin → System**.
6. Show the health indicators:
   - Database latency (should be < 100ms)
   - Environment configuration (Clerk / Resend / Gemini all green)
   - Security posture card (headers, rate limiting, webhook — all green)
7. Click the **avatar in the top-right** → **Account settings** — Clerk's user-profile modal slides open. Point out that from here anyone can:
   - Change their password
   - Add or verify a second email address
   - Enable 2FA
   - Manage connected accounts (Google sign-in, etc.)

> **What to say:** "For compliance and incident response, we can prove exactly
> what happened, when, and who did it. This is the kind of thing an auditor
> or a lawyer would ask for. Meanwhile, every user manages their own account
> security — no HR ticket required for a password change."

## Block 8 — The in-app assistant (2 min)

**Switch to: any user**

1. Click the bottom-right **"Ask HRIS"** button. A **small floating window pops open** in the bottom-right corner — notice the rest of the app stays fully visible and usable behind it. The chat is a widget, not a takeover.
2. Ask: *"How do I approve a leave request with modifications?"* → get a helpful step-by-step answer.
3. Ask: *"What's the capital of France?"* → politely declines. The bot only answers questions about **this app** or about **HR-information-system concepts in general**.
4. Ask: *"What is replacement leave?"* → explains the policy correctly.
5. Point at the reset button in the header — clears the conversation.
6. **While the chat is open**, click the dashboard or open Apply-for-Leave — the chat window travels with you and stays reachable. No context loss.

> **What to say:** "New joiners don't have to bug HR with the same 10
> questions every month. The assistant knows the app inside-out, can't be
> hijacked to answer off-topic questions, and — because it's a floating
> widget rather than a modal — you can ask it a question about the exact
> form you're staring at without losing your place."

## Block 9 — Reports: real downloadable PDFs (3 min)

**Switch to: Saifullah (HR)** — so we can show both employee-level and
company-wide reports.

1. Navigate to **Reports**.
2. Point at the **period picker** at the top — Year + Month dropdowns.
   Every report card underneath shows its current scope ("August 2026" or
   "Full cycle 2026") right on the card. Change the year → all four cards
   update.
3. Click **Download PDF** on the **Performance summary** card. Button flips to
   "Generating…" with a spinner, then to "Downloaded ✓" — the PDF opens.
4. Open the PDF and point at:
   - **Trace logo** in the blue header bar, top-left
   - **Report title** + **Cycle year** in the header meta on the right
   - **Employee profile** card, **headline metrics** row (4 KPIs), **balance
     snapshot** row, **leave activity** card
   - Footer: "Trace Consulting Ltd · Confidential · Generated [timestamp]"
     and "Page X of Y" — every page has this
5. Back in the app, click **Download PDF** on **Monthly attendance**. Open
   the PDF. Point at the daily table with color-coded status badges
   (green PRESENT, gray WEEKEND, red ABSENT).
6. Click **Download PDF** on **Company cycle report** (this button is only
   visible to HR / Admin / Super Admin — not Employees). Open the PDF —
   it's **landscape A4** with every active employee side-by-side: balance,
   attendance %, pending requests. Perfect for a board pack.

> **What to say:** "Every report is rendered fresh on the server the moment
> you click — nothing is cached, so what you see is the current state of
> the database. All four reports use the same Trace branding, so if you
> hand these to auditors or bring them to a board meeting, they look like
> they came from a real system, not a spreadsheet."

## Block 10 — Wrap up and Q&A (2 min)

Return to the dashboard as any user. Summarize:

- **4 roles, 12 users, 4 modules** — leave, attendance, holidays, employees
- **Everything is audited.** Every action, every IP, every browser.
- **Everything is email-notified.** No more "did you see my request?"
- **Everything is mobile-responsive.** Demo on your phone if you want.
- **Everything is secured.** Only pre-approved emails can even reach the sign-in flow.
- **Nothing hardcoded.** Sender email, working days, cycle start — all editable.
- **Everything downloadable.** Four branded PDF reports on demand.
- **Ready for biometric attendance** — one wall device + a small bridge and clock-in becomes a fingerprint press. See [BIOMETRIC_INTEGRATION.md](./BIOMETRIC_INTEGRATION.md).

---

# Reference — one page per module

## Employee's world

**What they see:**
- Dashboard with 3 arc rings (Casual / Sick / Replacement)
- Attendance widget (clock in / out / breaks)
- "Apply for Leave" button (5-step wizard)
- Notification bell
- "Ask HRIS" chatbot

**What they can do:**
- Apply for full-day, half-day (morning/afternoon), or time-range partial leave
- Cancel their own pending or approved (future) leave
- Clock in / clock out, take breaks
- Log extra work (for replacement leave credit)
- Read notifications and marked-read history
- **Download branded PDF reports** for themselves — attendance, leave history, performance summary
- **Manage their own account** via avatar → Account settings (change password, add second email, enable 2FA)

**What they cannot do:**
- Approve or reject anyone's leave
- See other employees' data
- Change any system-wide settings

## HR's world

Everything Employees can, plus:
- **Admin → Requests** — leave inbox with review drawer, modify allocation panel
- **Admin → Employees** — invite, deactivate, edit
- **Admin → Holidays** — full CRUD + send notice email
- **Admin → Settings** — sender email, working days, cycle start
- **Reports → Company cycle report** — landscape A4 PDF spanning all active employees
- Manage their own account (same as Employee)

## Admin (CEO)'s world

Same as HR, but:
- Automatically CC'd on every Employee leave request
- Has final say on Super Admin's leave requests

## Super Admin's world

Same as Admin, plus:
- **Admin → Audit Log** — every action with actor, IP, user-agent
- **Admin → System** — live database health, env-var status, security posture

---

## Adding a new employee (two supported flows)

### Flow A — In-app invite (recommended for HR)

For a new hire that HR is onboarding:

1. Sign in as HR, Admin, or Super Admin.
2. Go to **Admin → Employees**.
3. Click **Invite Employee** (top right).
4. Fill the form:
   - **First / Last name** — how they appear in the app.
   - **Work email** — pre-verified in Clerk on creation. They can sign in immediately with email + password (no verification code required).
   - **Roles** — tick one or more. A person can hold multiple roles (e.g. tick both **Admin** and **HR** for a COO who needs both).
   - **Employee ID** — the next code in the sequence (`TRACE-108`, `TRACE-109`, …).
   - **Cycle starts in** — usually **January**.
   - **Department** and **Designation** — free text; used in badges and PDF reports.
5. Click **Create account**.
6. A success screen shows the **initial password**. Click **Copy all credentials** and send them to the new hire via a secure channel.
7. Tell them to **sign in with email + password**. If Clerk shows an "Email code" option, they should skip it — a code email may be delayed or spam-filtered.

Once created, the person appears in `/admin/employees` immediately. Their leave balance is pre-populated for the current cycle. You can adjust their roles from the card at any time.

### Flow B — Permanent seed entry (for the technical owner)

Use this when you want the person to survive a full `npm run db:seed`:

1. Append the person's details to `hris/prisma/seed-users.ts` — see [`hris/prisma/seed-users.ts`](./hris/prisma/seed-users.ts) for the exact shape. Include a `roles` array (never just `role`), and a photo path pointing to a file you've dropped into `hris/public/`.
2. Run the sync script:
   ```powershell
   cd hris
   npx tsx --env-file=.env.local scripts/sync-roles.ts
   ```
   This creates any missing Clerk accounts with the initial password, uploads their profile photo to Clerk, refreshes their `publicMetadata`, and upserts their Postgres row + current-cycle leave balance. **Non-destructive** — no passwords touched for anyone already signed in.
3. Optional: print a copy-paste welcome email:
   ```powershell
   TARGET_EMAIL=<their-email> npx tsx scripts/print-welcome.ts
   ```
4. Paste the printed subject + body into your own Gmail and send. When Resend domain verification is done, `scripts/send-welcome.ts` will send it automatically.

**Example — how the current roster was populated:** all 11 users (Shefayat, Fuad, Saifullah, Umme, Tanvir, Rubayat, Mimma, Recardo, Nabeel, Moudud, Ahmed) live in `seed-users.ts` with the roles they should hold on day one. A single run of `sync-roles.ts` provisioned all of them.

### Super Admin QA — "Can I add an employee that behaves normally?"

To verify the flow end-to-end tomorrow:

1. Sign in as Shefayat (Super Admin).
2. Turn on QA mode: **Admin → Settings → QA mode → set your email → Save**. Now every notification email will redirect to your inbox with a banner showing the real recipient.
3. Go to **Admin → Employees → Invite Employee**. Create a test person (any name, any real email you control — QA redirect protects them from receiving anything).
4. Sign out and sign in as the new person with the initial password from the success screen.
5. Apply for a 1-day leave.
6. Sign out and sign in as Saifullah (HR). Review and approve.
7. Check your own email — the approval notification should have arrived at your inbox with a `[QA→new-person@…]` prefix.
8. Sign back in as Super Admin, go to **Admin → Employees**, and click **Deactivate** on the test person. They can no longer sign in, but their audit trail remains.

Total time: **~5 minutes**. Confirms the whole invite → login → apply → approve → email pipeline is intact before you sit in front of the seniors.

---

# Likely Q&A cheat sheet

**Q: What happens if a user leaves the company?**
A: HR/Super Admin clicks **Deactivate** on their employee card. They immediately
lose the ability to sign in. Their data (past leaves, attendance) is preserved
for historical reporting. If they're later re-hired, they can be reactivated
in one click.

**Q: What if an approver is on leave themselves?**
A: The system notifies **both HR users** for Employee requests, and CCs Super
Admin for HR requests. There's always at least two people who can approve.
For total emergencies, the Super Admin has unrestricted approval rights.

**Q: What if the internet goes down mid-clock-in?**
A: The clock-in only counts once the server confirms. If the server didn't
respond, the button stays in "clock in" state and the employee sees an error
toast. No half-recorded sessions.

**Q: Can employees see each other's leave?**
A: Only in aggregate. The calendar shows who is out on which day (so people
can plan around each other), but reasons and rejection details are private
to the applicant and the approvers.

**Q: What about biometric attendance?**
A: The attendance API is designed to accept clock-in events from any source —
manual button, biometric device, mobile app. The spec includes the endpoint
contract for a future biometric integration.

**Q: How much does this cost to run?**
A: For a team of 4–50 people, **$0/month**. Clerk (auth), Neon (database),
Resend (email), Vercel (hosting), Gemini (chatbot) are all on generous free
tiers. Beyond that, the biggest jump is Vercel's Pro plan at $20/month.

**Q: What happens if we want to change the leave allocation from 12 to 15 days?**
A: One line change in the seed script + a re-seed. HR can lobby for that; the
Super Admin runs it. Takes 5 minutes.

**Q: Can we generate a PDF report of a specific employee's history?**
A: Yes — the **Reports** page has PDF export for leave history, attendance
summary, and holiday list, scoped by date range.

**Q: What if I forget my password?**
A: Sign-in page → "Forgot password?" → Clerk sends a reset link to your
company email. Standard OAuth-grade flow, no admin intervention needed.

**Q: What if someone tries to abuse the system with a million requests?**
A: Every write is rate-limited to 30 per minute per user (chat is 20 per
minute). A 31st request in the same minute gets a 429 error with a
`Retry-After` header explaining when they can try again.

**Q: What if I close the chatbot mid-conversation?**
A: It reopens with your last conversation intact. Click the reset button in
the header if you want a fresh start. Because the chat is a floating widget
and not a full-screen takeover, closing it doesn't interrupt whatever you
were doing in the app underneath.

**Q: How do I change my password?**
A: Click your avatar in the top-right → **Account settings**. Clerk's
profile manager slides open where you can update your password, add a
second email, enable two-factor authentication, and manage your Google (or
other OAuth) sign-in connections. No HR ticket, no admin involvement.

**Q: Can we integrate a fingerprint scanner at the office entrance?**
A: Yes — the attendance API already accepts biometric events. Add a
wall-mounted device (e.g. ZKTeco K40, ~$200) and a small bridge service on
the office LAN, and clock-in becomes a fingerprint press. Full plan in
[BIOMETRIC_INTEGRATION.md](./BIOMETRIC_INTEGRATION.md).

**Q: Are these PDF reports really generated on the fly?**
A: Yes. Every click hits the server, queries the current database, renders
the PDF with React-PDF, and streams it back. Nothing is pre-baked or
cached. Change any data and the next download reflects it immediately.

---

# Post-launch checklist — what still needs to change

The app works today. Before you hand it to a wider audience, a handful of
"one-time production hygiene" items should get done. None of these are
launch blockers, but they matter for a polished long-term deployment.

## Email — switch off the personal address

**Current state:** outgoing emails come from `onboarding@resend.dev` (Resend's
test sender), with a Reply-To of `shefadib@gmail.com` (a personal address).
Resend's free tier only lets emails leave the system if the recipient is
already registered on the Resend account — so notification emails to Fuad,
Saifullah, Tama, Tanvir and Rubayat currently bounce silently.

**Fix (~10 minutes + ~10 minutes DNS wait):**

1. Log into [https://resend.com/domains](https://resend.com/domains).
2. Click **Add Domain** → enter `traceconsultingltd.com` (or a subdomain
   like `mail.traceconsultingltd.com`).
3. Resend gives you 4 DNS records (MX, TXT, DKIM). Add them in the domain
   registrar's DNS panel. Wait ~10 minutes for verification.
4. In Trace HRIS, sign in as Super Admin → **Admin → Settings**:
   - **Sender email (from):** `hris@traceconsultingltd.com` (must match the
     verified domain)
   - **Sender name:** `Trace HRIS` (already set)
   - **Reply-to:** `people@traceconsultingltd.com` (or your ops inbox)
5. Save. Test with a leave submission — email should now arrive at any
   recipient.

Until this is done, either:
- Send from `onboarding@resend.dev` (emails still deliver, look
  unbranded) — this is the current default
- Or use the `scripts/print-welcome.ts` fallback: prints the email content
  to the terminal, you paste it into your own Gmail

## Trace domain on Vercel

**Current state:** the app lives at a `.vercel.app` URL. Fine for demo, not
for production.

**Fix:** Vercel → Project → Settings → **Domains** → **Add** → enter
`hris.traceconsultingltd.com` → follow the DNS instructions Vercel gives.
Once verified, also update:
- Vercel env var `NEXT_PUBLIC_APP_URL` → `https://hris.traceconsultingltd.com`
- Clerk dashboard → Applications → your app → **Domains** → add the new
  hostname so Clerk accepts sessions from it

## Clerk webhook — auto-sync deletes

**Current state:** if someone gets deleted directly in Clerk (rather than
via the app's Deactivate flow), Postgres is left with a stale user row.
The webhook endpoint exists (`/api/webhooks/clerk`) but currently returns
501 because `CLERK_WEBHOOK_SIGNING_SECRET` isn't set.

**Fix (~5 minutes):**

1. Clerk dashboard → **Webhooks → Add Endpoint**
2. Endpoint URL: `https://hris.traceconsultingltd.com/api/webhooks/clerk`
3. Message filters: check `user.deleted` and `user.updated`
4. Copy the **Signing Secret** (starts with `whsec_...`)
5. Vercel → env vars → add `CLERK_WEBHOOK_SIGNING_SECRET` → redeploy

## Gemini key on Vercel

**Current state:** `GEMINI_API_KEY` is set in local `.env.local` but not
yet in Vercel. On the deployed app the chatbot returns "not configured."

**Fix:** Vercel → Project → Settings → Environment Variables → add
`GEMINI_API_KEY` with the value from your local `.env.local`. Redeploy.

## Convert biometric

Currently attendance is button-click only. When you're ready:
1. Read [BIOMETRIC_INTEGRATION.md](./BIOMETRIC_INTEGRATION.md)
2. Order the device (2–7 days)
3. Follow the 5-step implementation checklist there

## Next.js middleware → proxy rename

**Current state:** on `next dev` you see a warning "The 'middleware' file
convention is deprecated. Please use 'proxy' instead." Non-breaking; safe
to defer until you're doing a Next.js 17 upgrade later.

**Fix:** `npx @next/codemod@canary middleware-to-proxy hris/` — one command
migration.

## Verified sender for holiday notices

Same story as leave emails — holiday notice broadcasts also go through
Resend. Once the domain is verified above, they'll flow to everyone. No
extra work.

## Rotate keys quarterly

Every ~3 months, rotate:
- Clerk secret key (Clerk dashboard → API Keys → rotate)
- Resend API key (Resend dashboard → API Keys → rotate)
- Gemini API key (AI Studio → rotate)
- Update each in Vercel env vars, redeploy

Set a calendar reminder. Takes 5 minutes per service.

## Grow the seed roster as people join

When a new hire comes:
1. Append them to `hris/prisma/seed-users.ts` with an initial password
2. `TARGET_EMAIL=<their-email> npx tsx --env-file=.env.local scripts/add-employee.ts`
3. `TARGET_EMAIL=<their-email> npx tsx scripts/print-welcome.ts` and send them the email

Never run the full `npm run db:seed` for a single add — it resets every
existing user's password.

---

# A-to-Z QA walkthrough

Use this checklist to verify the whole system works end-to-end. Group it
into three passes: **backend sanity**, **role-based flows**, **cross-
cutting**. Each pass takes ~15 minutes.

## Pass 1 — Backend sanity (10 min)

Sign in as Super Admin (Shefayat) and open two browser tabs.

- [ ] **Sign in works** — `shefadib@gmail.com` + password `Trace-HRIS-Super-2026!`.
- [ ] **Dashboard loads** — arc rings render, attendance widget visible, no console errors.
- [ ] **Sidebar** — Employees, Requests, Holidays, Settings, Audit Log, System all visible for Super Admin.
- [ ] **Wrong email is rejected** — try to sign in as `random@example.com` → Clerk refuses (not in allowlist).
- [ ] **Deep link to unauthorized page** — as Employee (Tanvir), visit `/admin/audit` → redirected to `/not-authorized`.
- [ ] **DB latency** — as Super Admin, open **Admin → System**. Latency should be < 300 ms; DB status green.
- [ ] **Env config** — same page: Clerk, Resend, Gemini all show ✓.
- [ ] **Audit log records logins** — Refresh `/admin/audit` and confirm a fresh entry for your last sign-in.

## Pass 2 — Role-based flows (30 min)

### Leave — Employee submits → HR approves

- [ ] As **Tanvir**, click **Apply for Leave**.
- [ ] Pick Casual, next Wednesday, half-day (morning), reason "dentist."
- [ ] Submit. Toast confirms. Notification bell shows a new notification.
- [ ] Check email: **you'll only see the email if you're the recipient AND your address is on the Resend allowlist**. Until domain verification, this means only `shefayatadib@iut-dhaka.edu` gets emails.
- [ ] As **Saifullah** (HR), go to **Admin → Requests**. Tanvir's request is in Pending. Notification bell has one unread.
- [ ] Open the review drawer. Balance impact shows -0.5 casual.
- [ ] Try **Modify allocation** — flip the half to full. Preview updates to -1.0.
- [ ] Approve. Toast. As **Tanvir**, refresh dashboard — balance decremented, notification arrived.

### Leave — HR submits → other HR + CEO approve

- [ ] As **Saifullah**, submit a 2-day leave.
- [ ] As **Umme** (HR), check inbox — request is there, plus a note that CEO is also notified.
- [ ] As **Fuad** (CEO), check inbox — request is there.
- [ ] Reject as Fuad with a reason. Verify Saifullah gets rejection notification + email attempt.

### Attendance

- [ ] As **Tanvir**, click **Clock In**. Timer starts **instantly** (no spinner delay).
- [ ] Wait a few seconds. Start a break — timer freezes.
- [ ] End break — resumes.
- [ ] Clock out. Session appears in today's history.
- [ ] Refresh the page — attendance state persists.
- [ ] Try clocking in on a Saturday — it works (weekend hard-block was removed).
- [ ] Attendance page → history table shows the session with correct clock-in/out times.

### Extra work → Replacement leave

- [ ] As **Tanvir**, **Log Extra Work** → last Sunday, full day. Submit.
- [ ] As **Saifullah**, **Extra Work** tab → approve.
- [ ] As **Tanvir**, dashboard → **Replacement: 1.0** now shows.
- [ ] Log another extra day but choose "half (9-1)" → 0.5.
- [ ] Approve → Replacement becomes 1.5.

### Holidays

- [ ] As **Saifullah**, **Admin → Holidays** → **Add Holiday**.
- [ ] Name: "Test Holiday," date: next Friday.
- [ ] Save. Card appears in the list.
- [ ] Click **Send Notice**. Success toast (email attempts logged; delivery only if recipient is on Resend allowlist).
- [ ] As **Tanvir**, dashboard → mini-calendar highlights next Friday.
- [ ] `/calendar` full view shows the holiday.

### Reports

- [ ] As **Tanvir**, **Reports** → pick current year + month.
- [ ] **Performance summary** → Download → PDF opens with Trace logo, brand blue header, 4 KPI cards, balance snapshot.
- [ ] **Monthly attendance** → Download → daily table with status badges.
- [ ] **Leave history** → Download → cycle summary + request table.
- [ ] Verify **Company cycle report** card is NOT visible to Tanvir (he's Employee).
- [ ] As **Saifullah**, **Reports** → **Company cycle report** card IS visible → Download → landscape A4 with every employee.

### Chatbot

- [ ] Click the **MessageCircle** button bottom-right. Floating window opens (no backdrop).
- [ ] Ask "How do I apply for a half-day?" → helpful answer.
- [ ] Ask "What's the weather?" → politely declines (out of scope).
- [ ] Click reset — conversation clears.
- [ ] Send 21 messages in a minute → 21st gets rate-limited.

### Account settings

- [ ] Avatar top-right → **Account settings** → Clerk modal opens.
- [ ] Try changing password → succeeds.
- [ ] Sign out → sign back in with the new password → works.

## Pass 3 — Cross-cutting (10 min)

- [ ] **Security headers** — DevTools → Network → any page → response headers include `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Permissions-Policy`.
- [ ] **Unauthenticated API** — sign out, then `curl -i https://<domain>/api/leaves/requests` → 401.
- [ ] **Rate limit** — sign back in, submit 31 leave requests in a minute → 31st gets 429.
- [ ] **Mobile** — DevTools → toggle mobile view (375 px). Sidebar collapses to drawer, tables reflow, no horizontal scroll.
- [ ] **Dark mode / print** — not implemented; ignore.
- [ ] **Neon cold-start** — leave the app idle 15 min, refresh. First request should retry silently (300/900/2100 ms backoff).
- [ ] **Audit trail integrity** — as Super Admin, `/admin/audit` shows every action from this QA session, with correct actors, timestamps, IPs, and user-agents.

If every checkbox passes, the system is production-ready modulo the
post-launch checklist items above.

---

# Fallback plans if the demo goes sideways

1. **Wi-Fi dies mid-demo.** All the state you've set up (leaves, holidays)
   is on Neon's cloud DB — refresh the page and pick up where you left off.
2. **Email doesn't arrive during the demo.** Resend can take up to 30 seconds.
   Show the in-app notification bell instead — that's synchronous.
3. **A user gets locked out.** As Super Admin, go to Clerk dashboard →
   Users → find them → click "Reset password." One minute fix.
4. **Vercel is having an outage** (rare but real). Run the app locally with
   `cd hris && npm run dev` — same code, same DB, just on your laptop.
5. **The chatbot doesn't respond.** Check that `GEMINI_API_KEY` is set in
   Vercel env vars. If missing, the panel shows a "not configured" message
   instead of appearing broken.

---

# Where to look for more information

- **Full product spec:** [`HRIS_Implementation.md`](./HRIS_Implementation.md) — every screen, every field, every state transition, in engineering-level detail.
- **How the app was set up:** [`hris/SETUP.md`](./hris/SETUP.md) — the one-time provisioning of Clerk, Neon, Resend, Gemini.
- **Developer quick-start:** [`hris/README.md`](./hris/README.md) — run locally, deploy, environment variables.
- **Product overview:** [`README.md`](./README.md) — feature checklist, tech stack, roles at a glance.
- **Biometric integration plan:** [`BIOMETRIC_INTEGRATION.md`](./BIOMETRIC_INTEGRATION.md) — three architecture options, recommended device, bridge implementation.

---

*This guide was written for the Trace HRIS launch demo. Keep it near you during
the presentation. If something in the app doesn't match this guide, the app is
authoritative — please flag the mismatch so this doc can be updated.*
