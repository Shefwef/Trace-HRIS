# Trace HRIS — Demo Guide

> **For:** the instructor and senior reviewers walking through Trace HRIS for the first time.
> **Length:** 30 minutes end-to-end. Skim in 10, deep-dive in 60.
> **Style:** written for a non-technical reader. No code, no jargon without a definition.

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

The app is designed for a small team today (6 people at the time of writing),
but the architecture is built so that adding a 100th employee changes nothing
about how any of the existing screens work.

---

## Cast of characters — 4 roles, 6 real users

Trace HRIS treats every action through the lens of **who is doing it**. There are
four roles, each with a different level of access:

| Role | Who has it | What they can do |
|---|---|---|
| **Employee** | Everyone by default | Apply for leave, clock in/out, log extra work, see their own history |
| **HR** | People Operations team | Everything an Employee can do + review leave, invite employees, manage the holiday calendar, edit system settings |
| **Admin** | CEO / CTO | Everything HR can do + gets CC'd on Employee leave requests |
| **Super Admin** | Technical owner | Everything Admin can do + view the audit log + view the system health page |

The six real users seeded into the system:

| Name | Email | Role | Password (first-time) |
|---|---|---|---|
| Shefayat Adib | `shefadib@gmail.com` | **Super Admin** | `Trace-HRIS-Super-2026!` |
| Fuad Khalid | `fuad.khalid@traceconsultingltd.com` | **Admin** (CEO) | `Trace-HRIS-Fuad-2026!` |
| ASM Saifullah | `asmsaifullah@traceconsultingltd.com` | **HR** | `Trace-HRIS-Saifullah-2026!` |
| Umme Tama | `umtama@traceconsultingltd.com` | **HR** | `Trace-HRIS-Tama-2026!` |
| Tanvir Kabir | `tanvir.kabir@traceconsultingltd.com` | **Employee** | `Trace-HRIS-Tanvir-2026!` |
| Rubayat E Shams Anik | `res.anik@traceconsultingltd.com` | **Employee** | `Trace-HRIS-Anik-2026!` |

> **For the demo:** open six browser windows (or use Chrome profiles / private
> windows). Sign each into a different account. Line them up left-to-right so you
> can switch instantly. Don't try to log in/out during the demo — it wastes time
> and breaks the flow.

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

# The 30-minute demo script

Walk through in this order. Each block is 3–5 minutes.

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

1. Click the **Clock in** button on the attendance widget. Timer starts running.
2. Click **Start break** → timer freezes. Click **End break** → timer resumes.
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

## Block 9 — Wrap up and Q&A (2 min)

Return to the dashboard as any user. Summarize:

- **4 roles, 6 users, 4 modules** — leave, attendance, holidays, employees
- **Everything is audited.** Every action, every IP, every browser.
- **Everything is email-notified.** No more "did you see my request?"
- **Everything is mobile-responsive.** Demo on your phone if you want.
- **Everything is secured.** Only 5 approved emails can even see the login work.
- **Nothing hardcoded.** Sender email, working days, cycle start — all editable.

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

## Adding a new employee mid-year

The HR flow inside the app (`/admin/employees` → **Invite Employee**) works but
doesn't persist to the seed script — a future re-seed would wipe them. For
permanent hires, the technical owner runs two scripts:

1. Add the person's details to `hris/prisma/seed-users.ts`
2. `TARGET_EMAIL=<email> npx tsx --env-file=.env.local scripts/add-employee.ts` — creates the Clerk user, Postgres row, and a fresh leave balance for the current cycle. Non-destructive: doesn't touch anyone else's password.
3. `TARGET_EMAIL=<email> npx tsx scripts/print-welcome.ts` — prints a copy-paste-ready welcome email (subject + body). Paste it into your Gmail and send.

If your Resend account has a verified domain (SETUP.md Step 3 Option B), use
`scripts/send-welcome.ts` instead — it sends the email automatically from
your branded address.

**Example:** Rubayat E Shams Anik (Employee, Policy & Research, TRACE-102)
was added this way on 2026-08-20 — she's the sixth user in the roster above.

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

---

*This guide was written for the Trace HRIS launch demo. Keep it near you during
the presentation. If something in the app doesn't match this guide, the app is
authoritative — please flag the mismatch so this doc can be updated.*
