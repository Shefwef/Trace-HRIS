# HRIS — HR Information System
## Comprehensive Product & Implementation Documentation

> **Purpose of this document:** This is the single source of truth for building the HRIS web application. Every section — from color tokens to database schema to animation timing — is written to be pasted directly into a code generation prompt or developer handoff. Follow everything here exactly.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Design System](#2-design-system)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Module 1 — Employee Leave Management](#4-module-1--employee-leave-management)
5. [Module 2 — Attendance Tracking](#5-module-2--attendance-tracking)
6. [Module 3 — Holiday Management](#6-module-3--holiday-management)
7. [Notification & Messaging System](#7-notification--messaging-system)
8. [Dashboards & Analytics](#8-dashboards--analytics)
9. [PDF Export](#9-pdf-export)
10. [Database Schema](#10-database-schema)
11. [API Endpoint Specification](#11-api-endpoint-specification)
12. [Animation & Interaction Specification](#12-animation--interaction-specification)
13. [Page-by-Page Layout Specification](#13-page-by-page-layout-specification)
14. [Tech Stack Recommendation](#14-tech-stack-recommendation)
15. [Biometric Integration Note](#15-biometric-integration-note)

---

## 1. Product Overview

### 1.1 What Is This System

HRIS (Human Resource Information System) is a web-based platform for managing the complete employee lifecycle within a company. The first and highest-priority implementation is the **Employee Leave Management** module, followed by **Attendance Tracking** and **Holiday Management**. All three modules feed into unified dashboards for employees, HR admins, and the super admin.

### 1.2 Core Modules (Priority Order)

| Priority | Module | Description |
|----------|--------|-------------|
| 1 | Employee Leave Management | Apply, approve, reject, and track casual, sick, and replacement leaves |
| 2 | Attendance Tracking | Manual clock-in/clock-out with break tracking and analytics; biometric-ready architecture |
| 3 | Holiday Management | Calendar-aware holiday notification with automated email/message dispatch |

### 1.3 Key Principles

- **Year-relative leave cycles:** Each employee's leave year starts on a custom date (e.g., Jan 1, Jul 1, Feb 1). The system always calculates leave balances relative to each employee's personal cycle start date.
- **Three user roles:** Super Admin, Normal Admin (HR/CEO), and General Employee.
- **Dual notification channel:** All leave events and holiday alerts can be sent via Email or In-App Message, with Email pre-selected by default. The user always has the ability to switch or use both.
- **No leave balance inflation:** Standard leave days (12 casual + 12 sick = 24 total) are static per cycle. They only decrease and never automatically refill mid-cycle.
- **Replacement leaves are additive:** Replacement leaves come from logged overtime and exist in a separate balance pool, not from the 24 standard days.

---

## 2. Design System

### 2.1 Brand Identity

**Product Name:** HRIS  
**Tagline:** "People, simplified."  
**Personality:** Trustworthy, clean, professional — but with warmth. Not sterile like a government form. Think of the design as a high-end internal tool: confident structure, breathing whitespace, and color used with restraint to carry meaning rather than decoration.

---

### 2.2 Color Palette

All colors below are named tokens. Use these token names everywhere in CSS variables and component props. Never hardcode hex values outside this definition.

```css
:root {
  /* ── Primary Brand ── */
  --color-brand-primary:     #2C5282;   /* Deep slate blue — headers, active nav, CTAs */
  --color-brand-secondary:   #3182CE;   /* Medium blue — hover states, links, badges */
  --color-brand-accent:      #63B3ED;   /* Sky blue — progress bars, highlights, tags */

  /* ── Surface & Background ── */
  --color-bg-canvas:         #F7F9FC;   /* Near-white canvas — overall page background */
  --color-bg-surface:        #FFFFFF;   /* Card and panel background */
  --color-bg-subtle:         #EDF2F7;   /* Sidebar, input background, table row hover */
  --color-bg-muted:          #E2E8F0;   /* Dividers, skeleton loaders, empty states */

  /* ── Text ── */
  --color-text-primary:      #1A202C;   /* Body copy, table data */
  --color-text-secondary:    #4A5568;   /* Labels, captions, secondary info */
  --color-text-muted:        #718096;   /* Placeholder, disabled, helper text */
  --color-text-inverse:      #FFFFFF;   /* Text on dark/colored backgrounds */

  /* ── Semantic Status Colors ── */
  --color-success:           #38A169;   /* Approved, present, on-track */
  --color-success-light:     #F0FFF4;   /* Success badge background */
  --color-warning:           #D69E2E;   /* Pending, partial, needs review */
  --color-warning-light:     #FFFFF0;   /* Warning badge background */
  --color-danger:            #E53E3E;   /* Rejected, absent, critical */
  --color-danger-light:      #FFF5F5;   /* Danger badge background */
  --color-info:              #3182CE;   /* Informational notices */
  --color-info-light:        #EBF8FF;   /* Info badge background */

  /* ── Leave Type Colors (used in calendar + analytics) ── */
  --color-leave-casual:      #805AD5;   /* Purple — casual leave */
  --color-leave-casual-light:#FAF5FF;
  --color-leave-sick:        #DD6B20;   /* Orange — sick leave */
  --color-leave-sick-light:  #FFFAF0;
  --color-leave-replacement: #319795;   /* Teal — replacement leave */
  --color-leave-replacement-light: #E6FFFA;
  --color-leave-holiday:     #2C5282;   /* Brand blue — public holiday */
  --color-leave-holiday-light:#EBF4FF;

  /* ── Borders & Shadows ── */
  --color-border-default:    #E2E8F0;
  --color-border-focus:      #3182CE;
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md:  0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05);
  --shadow-lg:  0 10px 25px rgba(0,0,0,0.10), 0 6px 10px rgba(0,0,0,0.04);
  --shadow-xl:  0 20px 40px rgba(0,0,0,0.12);

  /* ── Border Radius ── */
  --radius-sm:  4px;
  --radius-md:  8px;
  --radius-lg:  12px;
  --radius-xl:  16px;
  --radius-full: 9999px;

  /* ── Spacing Scale (8px base) ── */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

**Palette rationale:** The deep slate-blue primary signals reliability and authority — appropriate for HR. The semantic status colors are distinct enough to be scannable at a glance on dashboards. Leave types use a hue-diverse set (purple/orange/teal/blue) so calendar dots are never ambiguous, even at small sizes.

---

### 2.3 Typography

```css
/* Import via Google Fonts in <head> */
/* @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'); */

:root {
  /* Display / Headings — Plus Jakarta Sans */
  --font-display: 'Plus Jakarta Sans', system-ui, sans-serif;

  /* Body / UI — Inter */
  --font-body: 'Inter', system-ui, sans-serif;

  /* Monospace — for timestamps, IDs, code snippets */
  --font-mono: 'JetBrains Mono', 'Courier New', monospace;

  /* Type Scale */
  --text-xs:   0.75rem;    /* 12px — captions, micro-labels */
  --text-sm:   0.875rem;   /* 14px — table data, helper text */
  --text-base: 1rem;       /* 16px — body default */
  --text-lg:   1.125rem;   /* 18px — card titles */
  --text-xl:   1.25rem;    /* 20px — section headings */
  --text-2xl:  1.5rem;     /* 24px — page headings */
  --text-3xl:  1.875rem;   /* 30px — dashboard stats */
  --text-4xl:  2.25rem;    /* 36px — hero numbers */

  /* Font Weight */
  --weight-regular:   400;
  --weight-medium:    500;
  --weight-semibold:  600;
  --weight-bold:      700;

  /* Line Height */
  --leading-tight:   1.25;
  --leading-normal:  1.5;
  --leading-relaxed: 1.625;
}

/* Typography utility classes */
.text-display    { font-family: var(--font-display); }
.text-mono       { font-family: var(--font-mono); letter-spacing: -0.02em; }

h1, h2, h3, h4  { font-family: var(--font-display); font-weight: var(--weight-semibold); color: var(--color-text-primary); }
body, p, td, li  { font-family: var(--font-body); font-weight: var(--weight-regular); color: var(--color-text-primary); line-height: var(--leading-relaxed); }
```

**Font pairing rationale:** Plus Jakarta Sans has a slightly rounded, warm geometric feel for headings — professional but approachable. Inter is the gold standard for UI data density. JetBrains Mono makes timestamps and numeric data immediately scannable.

---

### 2.4 Signature Design Element

**The leave balance arc ring.** On every employee dashboard, remaining leave days are displayed as animated SVG arc rings — one per leave type. As days decrease, the arc animates clockwise from full. The ring color matches the leave type token. This element is the single most memorable visual in the system and appears on both the employee home and within any leave detail view. It is never replaced with a plain progress bar.

**Implementation:**
```html
<!-- SVG Arc Ring: 120px × 120px, stroke-width 8, used in cards -->
<svg viewBox="0 0 120 120" width="120" height="120">
  <!-- Track (background ring) -->
  <circle cx="60" cy="60" r="52"
    fill="none"
    stroke="var(--color-bg-muted)"
    stroke-width="8" />
  <!-- Animated arc — JS sets stroke-dashoffset on mount -->
  <circle cx="60" cy="60" r="52"
    fill="none"
    stroke="var(--color-leave-casual)"
    stroke-width="8"
    stroke-linecap="round"
    stroke-dasharray="326.7"
    stroke-dashoffset="calc(326.7 - (326.7 * var(--pct) / 100))"
    transform="rotate(-90 60 60)"
    class="arc-ring" />
  <!-- Center text -->
  <text x="60" y="56" text-anchor="middle"
    font-family="var(--font-display)"
    font-size="22" font-weight="700"
    fill="var(--color-text-primary)">8</text>
  <text x="60" y="72" text-anchor="middle"
    font-family="var(--font-body)"
    font-size="11"
    fill="var(--color-text-muted)">left</text>
</svg>
```

---

## 3. User Roles & Permissions

### 3.1 Role Overview

| Role | Who | Access Level |
|------|-----|-------------|
| `SUPER_ADMIN` | Technical owner / system administrator | Full system access including configuration, schema-level settings, audit logs |
| `ADMIN` | HR Manager, CEO, CTO | Operational control: approve/reject leaves, manage employees, send holiday notices, view all analytics |
| `EMPLOYEE` | General staff | Personal dashboard: apply for leave, track attendance, view own analytics |

### 3.2 Permission Matrix

| Feature | SUPER_ADMIN | ADMIN | EMPLOYEE |
|---------|:-----------:|:-----:|:--------:|
| Configure leave year cycle per employee | ✅ | ✅ | ❌ |
| View all employees' leave records | ✅ | ✅ | ❌ |
| View own leave records | ✅ | ✅ | ✅ |
| Apply for leave | ❌ | ❌ | ✅ |
| Approve / Reject leave | ✅ | ✅ | ❌ |
| Manage replacement leave rules | ✅ | ✅ | ❌ |
| Log attendance (clock in/out) | ✅ | ✅ | ✅ |
| View all attendance records | ✅ | ✅ | ❌ |
| Create / edit holidays | ✅ | ✅ | ❌ |
| Send holiday notifications | ✅ | ✅ | ❌ |
| Configure notification recipients | ✅ | ✅ | ❌ |
| Add / deactivate employees | ✅ | ✅ | ❌ |
| Download own analytics PDF | ✅ | ✅ | ✅ |
| Download any employee's analytics PDF | ✅ | ✅ | ❌ |
| Modify system-level configurations | ✅ | ❌ | ❌ |
| Access audit logs | ✅ | ❌ | ❌ |

---

## 4. Module 1 — Employee Leave Management

### 4.1 Leave Types & Balances

#### Standard Leaves (Static, per leave cycle)

| Type | Code | Annual Quota | Color Token |
|------|------|:------------:|-------------|
| Casual Leave | `CL` | 12 days | `--color-leave-casual` |
| Sick Leave | `SL` | 12 days | `--color-leave-sick` |
| **Total Standard** | | **24 days** | |

**Rules:**
- The 24 days are allocated once at the start of each leave year cycle.
- They count **down only** — no automatic reset mid-cycle.
- Unused days do **not** carry over to the next cycle (configurable by Super Admin per company policy, but default is no carry-over).
- Half-day leaves deduct 0.5 from the balance.

#### Replacement Leaves (Dynamic, earned)

| Type | Code | Source | Color Token |
|------|------|--------|-------------|
| Replacement Leave | `RL` | Overtime hours ÷ standard work hours per day | `--color-leave-replacement` |

**Replacement Leave Earning Logic:**
```
Standard work hours per day = 8 hours (configurable by Admin)

Replacement Leave earned = floor(total_overtime_hours / standard_hours_per_day)

Example:
  Overtime logged: 19 hours
  Standard day: 8 hours
  Replacement leave balance += floor(19/8) = 2 days
  Remaining fractional hours: 19 mod 8 = 3 hours (carry forward)
```

**Implementation note:** The system tracks fractional overtime hours in a `overtime_hours_bank` field. Each time overtime is logged, the bank accumulates. Whole-day multiples are converted to replacement leave days; the remainder stays in the bank.

---

### 4.2 Leave Year Cycle Configuration

Each employee is assigned a `leave_cycle_start` date (day + month only, no year). The system calculates `cycle_start_date` and `cycle_end_date` dynamically for any given calendar year.

```
Examples:
  Employee A: cycle_start = Jan 1  → Cycle: Jan 1 – Dec 31
  Employee B: cycle_start = Jul 1  → Cycle: Jul 1 – Jun 30 (next year)
  Employee C: cycle_start = Feb 1  → Cycle: Feb 1 – Jan 31 (next year)
```

**Setup flow (Admin):**
1. When creating or editing an employee profile, Admin selects the **Leave Cycle Start Month** from a dropdown (January through December).
2. System auto-calculates `cycle_end_date` as one day before the same month in the following year.
3. At the start of each new cycle, the system automatically resets `casual_leave_balance = 12` and `sick_leave_balance = 12`. Replacement leave balance is **not** reset (it carries over).

---

### 4.3 Leave Application Flow

#### Step-by-step from the employee's perspective

```
Dashboard → "Apply for Leave" button
  → Leave Application Modal / Page (multi-step)
      Step 1: Select Leave Type
      Step 2: Select Date Range & Duration
      Step 3: Fill Details (reason, description)
      Step 4: Choose Notification Method
      Step 5: Review (auto-generated message preview)
      Step 6: Submit
```

#### Step 1: Select Leave Type

The employee is presented with three radio-card options:

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ 🟣 Casual Leave │  │ 🟠 Sick Leave   │  │ 🟢 Replacement  │
│   8 days left   │  │  12 days left   │  │   2 days left   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

Each card shows:
- Leave type name and emoji/icon
- Current balance (remaining days for that type)
- If balance is 0: card is disabled with tooltip "No days remaining"

#### Step 2: Select Date Range & Duration

Fields:
- **Start Date** — date picker (only future dates selectable, weekends grayed but selectable, public holidays marked in red with a tooltip showing holiday name)
- **End Date** — date picker (must be ≥ start date; auto-disabled dates beyond remaining balance)
- **Duration indicator** — auto-calculated: "You are applying for **X working days**" (system subtracts weekends and public holidays from the range automatically)
- **Half-day toggle** — only visible if start date = end date. Options: Full Day / Morning Half / Afternoon Half (deducts 0.5)

**Validation:**
- Duration cannot exceed remaining balance for chosen leave type
- Cannot overlap with an already-approved or pending leave
- If overlap detected: show inline error "You already have a leave request for [date range]. Please adjust your dates."

#### Step 3: Fill Details

Fields:
- **Reason/Title** (required) — text input, max 100 characters
- **Description** (optional) — textarea, max 500 characters. Placeholder: "Provide additional context if needed (e.g., medical condition, travel details)"
- **Supporting Document** (optional) — file upload, accepted: .pdf, .jpg, .png, max 5MB. Label: "Attach a document (e.g., medical certificate)"

#### Step 4: Choose Notification Method

Two toggle buttons (not radio — multiple can be selected):

```
┌─────────────────────┐    ┌──────────────────────┐
│  📧 Email           │    │  💬 In-App Message   │
│  (selected default) │    │                      │
└─────────────────────┘    └──────────────────────┘
```

- **Email** is pre-selected by default.
- **Recipients** are shown below: auto-populated with HR email(s) and CEO email. The employee cannot change recipients but can see them ("This will be sent to: hr@company.com, ceo@company.com").
- If only **In-App Message** is selected, recipients are shown as their names: "HR Manager (Fatima Khan), CEO (Rafiq Ahmed)".

#### Step 5: Review — Auto-Generated Message Preview

After all fields are filled, the system generates a preview of the outgoing message. The preview is fully editable.

**Email preview:**

```
TO:        hr@company.com; ceo@company.com
SUBJECT:   Leave Application — [Employee Name] | [Leave Type] | [Start Date] to [End Date]

Dear [Recipient Name],

I hope this message finds you well. I am writing to formally request
[leave type] from [Start Date] to [End Date] ([X] working day(s)).

Reason: [Reason/Title entered by employee]

[Description if provided]

[If document attached: Please find the supporting document attached.]

I have ensured that my responsibilities will be covered during this
period. I kindly request your approval at your earliest convenience.

Thank you for your consideration.

Regards,
[Employee Full Name]
[Employee ID]
[Department]
[Date of Application]
```

**In-App Message preview:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Leave Request — [Employee Name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Type:        [Leave Type]
Period:      [Start Date] – [End Date] ([X] days)
Reason:      [Reason/Title]
Details:     [Description]
Applied on:  [Timestamp]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Preview UI controls:**
- "Edit" button on the preview opens the text directly in an inline rich-text or plain-text editor.
- "Reset to default" link below the editor restores auto-generated content.
- Character count shown below textarea.

#### Step 6: Submit

Primary button: **"Submit Leave Request"**

On submit:
1. A spinning loader appears on the button (button disabled during submission).
2. On success: modal/page slides out, replaced by a **full-page success state**:
   - Green checkmark animation (SVG, 600ms draw animation)
   - "Your leave request has been submitted."
   - "You will be notified once it is reviewed."
   - "View my leave history →" link
3. On failure: inline error message, form state preserved.

---

### 4.4 Leave Request States

| State | Code | Description | Color |
|-------|------|-------------|-------|
| Pending Review | `PENDING` | Submitted, awaiting admin decision | Warning yellow |
| Approved | `APPROVED` | Admin approved; leave days deducted from balance | Success green |
| Rejected | `REJECTED` | Admin rejected; leave days NOT deducted | Danger red |
| Cancelled | `CANCELLED` | Employee cancelled before approval | Muted gray |

**Balance deduction happens only on `APPROVED`.** Transitioning from `APPROVED` back to any state (if an admin reverses a decision) re-credits the days. This is only possible by Super Admin.

---

### 4.5 Admin — Leave Review Interface

#### Leave Inbox (Admin Dashboard)

A paginated table of all pending leave requests:

| Column | Description |
|--------|-------------|
| Employee | Avatar + name + department |
| Leave Type | Colored badge (CL / SL / RL) |
| Period | "15 Mar – 18 Mar (3 days)" |
| Applied On | Relative time ("2 hours ago") |
| Status | Badge pill |
| Actions | "Review" button |

Default sort: most recent first.  
Filters: by leave type, by status, by department, by date range.

#### Leave Detail View (Admin)

Clicking "Review" opens a full detail panel (slide-in drawer from the right, 480px wide on desktop; full-screen on mobile):

```
┌────────────────────────────────────────────────┐
│  Nazmul Hasan — Casual Leave Request           │
│  Applied: 12 Aug 2026 at 10:34 AM              │
├────────────────────────────────────────────────┤
│  Period:       15 Aug – 18 Aug 2026 (3 days)   │
│  Remaining CL: 8 days (before this request)    │
│  Remaining CL: 5 days (if approved)            │
├────────────────────────────────────────────────┤
│  Reason:  Family event                         │
│  Details: My sister's wedding is scheduled…    │
│  Attachment: [medical_cert.pdf] 📎             │
├────────────────────────────────────────────────┤
│  Notification sent via: Email, In-App          │
│  Message preview:  [View / Hide ▼]             │
├────────────────────────────────────────────────┤
│  Admin Note (optional):                        │
│  ┌─────────────────────────────────────┐       │
│  │                                     │       │
│  └─────────────────────────────────────┘       │
├────────────────────────────────────────────────┤
│   [Reject ✗]              [Approve ✓]          │
└────────────────────────────────────────────────┘
```

**Approve action:**
1. Confirmation dialog: "Approving will deduct 3 casual leave days from Nazmul's balance. Confirm?" → "Yes, Approve"
2. On confirm: status → `APPROVED`, balance updated, notification sent to employee.

**Reject action:**
1. Admin must enter a rejection reason (required field) before confirming.
2. On confirm: status → `REJECTED`, no balance change, notification sent to employee with rejection reason included.

---

### 4.6 Employee — Leave History View

A tabbed view on the employee dashboard:

**Tabs:** All | Pending | Approved | Rejected | Cancelled

Table columns:
| Column | Content |
|--------|---------|
| Leave Type | Colored badge |
| Period | "15 Mar – 18 Mar" |
| Duration | "3 days" |
| Status | Pill badge |
| Applied On | Date |
| Decided On | Date (or "—" if pending) |
| Admin Note | Short text or "—" |
| Action | "Cancel" (only for PENDING status) |

---

## 5. Module 2 — Attendance Tracking

### 5.1 Overview

In the full production deployment, attendance is recorded via biometric fingerprint scanners. For this prototype/demo, all clock actions are performed via manual button clicks in the browser. The system architecture is built to accept biometric data via the same API endpoints (see Section 11), so swapping the input source requires no backend change.

### 5.2 Working Hours Configuration (Admin)

Before attendance can be tracked, the Admin configures a work schedule:

| Setting | Default | Description |
|---------|---------|-------------|
| Work Start Time | 09:00 | Official start of the working day |
| Work End Time | 17:00 | Official end of the working day |
| Standard Hours/Day | 8 | Used for overtime and replacement leave calculation |
| Break Duration | 60 min | Unpaid break deducted from total presence |
| Overtime Threshold | 8 hours | Hours beyond this are counted as overtime |
| Work Days | Mon–Fri | Weekends excluded from attendance calculation |

This schedule is global (applies to all employees) but can be overridden per employee (e.g., for part-time staff).

### 5.3 Clock-In / Clock-Out Flow (Employee)

#### The Attendance Widget

Displayed prominently on the employee dashboard, always visible at the top of the page:

```
┌─────────────────────────────────────────────────────────┐
│  Today: Monday, 17 August 2026                          │
│                                                         │
│         ⏱  00:00:00                                     │
│         Currently: Not clocked in                       │
│                                                         │
│              [  ▶  Clock In  ]                         │
└─────────────────────────────────────────────────────────┘
```

**States:**

1. **Not clocked in:**
   - Timer shows `--:--:--`
   - Single button: "▶ Clock In" (brand primary color)

2. **Clocked in (active session):**
   - Timer counts up in real time: `HH:MM:SS` (JavaScript `setInterval`, 1000ms)
   - Two buttons appear: "☕ Start Break" and "⏹ Clock Out"
   - A small pulsing green dot indicates active session

3. **On break:**
   - Timer pauses (shows time at break start, grayed out)
   - Break timer counts up separately below: "Break: 00:12:35"
   - One button: "▶ Resume" (teal color)
   - Clock Out is disabled during a break (user must resume first)

4. **Clocked out:**
   - Timer shows final session duration
   - Summary appears: "Today: 7h 32m worked | 48m break | 0h overtime"
   - No further actions until next day

#### Clock-In validation:
- If employee tries to clock in on a day already clocked out: "You've already completed today's session. See you tomorrow!"
- If employee tries to clock in on a weekend: "Today is a non-working day. Attendance is not tracked."
- If employee tries to clock in on a public holiday: "Today is [Holiday Name]. Attendance is not tracked."

### 5.4 Attendance Data Structure (per session)

Each clock action logs an `attendance_record`:

```
attendance_record {
  id                  UUID
  employee_id         UUID (FK)
  date                DATE
  clock_in_time       TIMESTAMP
  clock_out_time      TIMESTAMP (null until clocked out)
  breaks[]            Array of { start: TIMESTAMP, end: TIMESTAMP }
  total_break_minutes INTEGER (computed)
  total_worked_minutes INTEGER (computed: clock_out - clock_in - breaks)
  overtime_minutes    INTEGER (computed: max(0, total_worked - standard_minutes))
  status              ENUM: PRESENT | ABSENT | HALF_DAY | LEAVE | HOLIDAY
  source              ENUM: MANUAL | BIOMETRIC (default MANUAL for demo)
  notes               TEXT (optional)
}
```

### 5.5 Overtime → Replacement Leave Conversion

After each clock-out, if `overtime_minutes > 0`:
```
1. Add overtime_minutes to employee.overtime_hours_bank (in minutes)
2. If overtime_hours_bank >= standard_minutes_per_day (e.g., 480 min):
     earned_days = floor(overtime_hours_bank / 480)
     employee.replacement_leave_balance += earned_days
     employee.overtime_hours_bank -= (earned_days * 480)
3. Display notification: "You've earned [X] replacement leave day(s)!"
```

### 5.6 Attendance Analytics View

Accessible from the employee dashboard:

**Monthly Calendar View:**
- Each day cell shows a colored status dot:
  - 🟢 Green: Present (full day)
  - 🟡 Yellow: Half-day or partial
  - 🔴 Red: Absent (unexpected)
  - 🟣 Purple: Casual leave
  - 🟠 Orange: Sick leave
  - 🟢 Teal: Replacement leave
  - 🔵 Blue: Public holiday
  - ⬜ Gray: Weekend / non-working
- Hovering/tapping any day shows a tooltip: "Present — 8h 12m worked — 0h 12m overtime"

**Monthly Summary Cards (below calendar):**
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Present     │ │  Absent      │ │  Leaves Taken│ │  Overtime    │
│     18 days  │ │     1 day    │ │     3 days   │ │  4h 30m      │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**Daily Breakdown Table:**
| Date | Clock In | Clock Out | Break | Hours Worked | Overtime | Status |
|------|----------|-----------|-------|:------------:|:--------:|--------|
| Aug 1 | 9:02 AM | 5:14 PM | 1h 00m | 7h 12m | — | Present |
| Aug 2 | 8:45 AM | 6:30 PM | 1h 00m | 8h 45m | 0h 45m | Present |

---

## 6. Module 3 — Holiday Management

### 6.1 Holiday Calendar (Admin)

Admins manage a master holiday calendar. Each holiday has:

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | "Eid ul-Fitr" |
| `date` | date | The holiday date |
| `is_recurring` | boolean | Re-adds every year if true |
| `notification_scheduled` | boolean | Whether auto-notification is queued |
| `notification_send_at` | datetime | Default: 1 day before at 10:00 AM |
| `notification_recipients` | ENUM | `HR_ONLY`, `STAFF_ONLY`, `ALL`, `CUSTOM` |
| `custom_recipient_ids` | UUID[] | Used when recipient = CUSTOM |

### 6.2 Automated Notification System

The system runs a background job (cron) at a configurable interval (default: every hour) to check for holidays whose `notification_send_at` is within the next execution window.

When triggered, the system:
1. Generates a **pre-filled notification template** (see below).
2. Sends the draft to the HR admin as an **In-App notification**: "Holiday notice ready to send — Eid ul-Fitr (12 Sep). [Review & Send] [Dismiss]"

The HR admin is not required to be online — the notification waits in their inbox. They can:
- **Review & Edit** the template
- **Send Now** — dispatches to all configured recipients
- **Schedule** — pick a different send time
- **Dismiss** — cancels this notification (holiday stays on calendar)

### 6.3 Holiday Notification Template

**Email:**
```
SUBJECT: Holiday Notice — [Holiday Name] | [Date]

Dear Team,

We would like to inform you that [Date (Day, Month Year)] is a
public holiday in observance of [Holiday Name].

The office will remain closed on this day. Please plan your
work accordingly.

We wish you a wonderful [Holiday Name]!

Warm regards,
[Company Name] HR Team
```

**In-App Broadcast:**
```
📅 Holiday Notice
[Holiday Name] — [Full Date]

The office will be closed on this day.
Wishing everyone a wonderful [Holiday Name]! 🎉
```

Both templates are editable before sending. After editing, the "Reset to default" option is available.

### 6.4 Recipient Selection UI

```
Send notification to:
  ○ All employees
  ○ HR team only
  ○ Staff only
  ○ Custom selection
    [Search employees or departments…] → multi-select
```

---

## 7. Notification & Messaging System

### 7.1 In-App Notification Center

A bell icon (🔔) in the top navigation bar shows a badge count of unread notifications. Clicking opens a dropdown panel (320px wide, max 400px tall, scrollable):

Each notification item:
```
┌──────────────────────────────────────────────┐
│  ✅  Your leave request was approved         │
│      Casual Leave | 15–18 Aug 2026           │
│      2 hours ago                             │  [Mark read]
└──────────────────────────────────────────────┘
```

Notification types and their icons:

| Type | Icon | Color |
|------|------|-------|
| Leave approved | ✅ | Success green |
| Leave rejected | ❌ | Danger red |
| Leave pending review | ⏳ | Warning yellow |
| Replacement leave earned | ⭐ | Brand accent |
| Holiday notice | 📅 | Brand primary |
| Attendance reminder | ⏰ | Info blue |
| System message | ℹ️ | Muted |

### 7.2 Email Notification

All email notifications are sent via the system's configured SMTP/email provider. HTML email templates match the design system: brand blue header, clean white body, action button, footer with company info.

Emails are also logged in the database (`email_log` table) for audit purposes.

### 7.3 Employee Leave Decision Notification

When a leave request is approved or rejected, the employee receives:

**Email (if email was selected during application):**
```
SUBJECT: Leave [Approved ✓ / Rejected ✗] — [Leave Type] | [Date Range]

Dear [Employee Name],

Your [leave type] request for [Start Date] to [End Date] has been
[APPROVED / REJECTED] by [Admin Name] on [Decision Date].

[If approved:]
Your remaining [leave type] balance is now [X] days.

[If rejected:]
Reason: [Admin's rejection note]
Your leave balance remains unchanged.

If you have any questions, please contact HR directly.

Regards,
[Company Name] HR Team
```

---

## 8. Dashboards & Analytics

### 8.1 Employee Dashboard

**Layout: Left sidebar navigation + Main content area**

```
┌───────────────────────────────────────────────────────────────────┐
│  🏢 HRIS           [🔔 3]  [👤 Nazmul ▾]                         │
├─────────────┬─────────────────────────────────────────────────────┤
│             │  Good morning, Nazmul. 👋                           │
│  📊 Home    │  Monday, 17 August 2026                             │
│  📋 Leaves  │                                                     │
│  ⏱ Attend. │  ┌─ Attendance ─────────────────────────────────┐  │
│  📅 Calendar│  │  ⏱ 00:00:00         [▶ Clock In]             │  │
│  📄 Reports │  └─────────────────────────────────────────────┘  │
│             │                                                     │
│             │  Leave Balances                                     │
│             │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│             │  │ [arc]    │  │ [arc]    │  │ [arc]    │         │
│             │  │ Casual   │  │  Sick    │  │ Replace. │         │
│             │  │  8/12    │  │  12/12   │  │  2 days  │         │
│             │  └──────────┘  └──────────┘  └──────────┘         │
│             │                                                     │
│             │  [Apply for Leave →]                               │
│             │                                                     │
│             │  Recent Leave Activity                              │
│             │  ┌───────────────────────────────────────────────┐ │
│             │  │ CL   15–18 Aug   ⏳ Pending    3 days ago     │ │
│             │  │ SL   03–04 Aug   ✅ Approved   12 days ago    │ │
│             │  └───────────────────────────────────────────────┘ │
│             │                                                     │
│             │  📅 This Month's Calendar                          │
│             │  [Calendar component — see Section 8.3]            │
└─────────────┴─────────────────────────────────────────────────────┘
```

### 8.2 Admin Dashboard

**Additional panels beyond the employee view:**

1. **Leave Inbox** — count of pending requests with "Review All" CTA
2. **Team Attendance Overview** — today's present/absent/leave count for each department
3. **Upcoming Holidays** — next 3 holidays with send-notification status
4. **Leave Balance Summary** (company-wide) — bar chart: average remaining CL and SL per department
5. **Employee Directory** — searchable list with leave and attendance status

```
┌─────────────────────────────────────────────────────────────────┐
│  Admin Overview                                                 │
├─────────────────┬───────────────┬───────────────┬──────────────┤
│  Leave Requests │ Present Today │  On Leave     │  Upcoming    │
│     3 pending   │    42 / 50    │     5 today   │  Holiday: 2d │
└─────────────────┴───────────────┴───────────────┴──────────────┘
```

### 8.3 Mini Calendar Component

Appears on both dashboards. Shows current month with:
- Day cells colored by status (employee view: own status; admin view: aggregate status)
- Legend at bottom: colored dots with labels
- Navigation: "‹ Previous" and "Next ›" month buttons
- Clicking a day opens a popover with that day's attendance or leave details

### 8.4 Analytics Charts

All charts use a consistent library (Recharts for React or Chart.js). Chart types:

| Chart | Type | Where |
|-------|------|-------|
| Monthly attendance rate | Line chart | Employee & Admin dashboard |
| Leave type distribution | Donut/pie | Employee dashboard |
| Team leave calendar | Heatmap | Admin dashboard |
| Daily hours worked | Bar chart | Employee attendance view |
| Department leave usage | Grouped bar | Admin analytics page |

**Chart style rules:**
- Grid lines: `--color-bg-muted`, very light
- Axis labels: `--font-body`, `--text-sm`, `--color-text-muted`
- Tooltips: white background, `--shadow-md`, rounded `--radius-md`
- Legend: horizontal, centered below chart, dots match `--color-leave-*` tokens

---

## 9. PDF Export

### 9.1 What Can Be Exported

| Report | Who Can Export | Contents |
|--------|:-------------:|----------|
| My Attendance Report | Employee, Admin | Monthly attendance log, total hours, overtime |
| My Leave Report | Employee, Admin | Leave history for selected cycle |
| My Performance Summary | Employee, Admin | Attendance rate, leave utilization, overtime |
| All Employees Report | Admin, Super Admin | Company-wide attendance and leave summary |

### 9.2 PDF Layout Specification

**Header:**
- Company logo (left) + Report title (right)
- Employee name, ID, department, report period
- Generated on: [timestamp]
- Horizontal divider

**Body:**
- Summary statistics boxes (2×2 grid)
- Main data table (zebra-striped: `--color-bg-subtle` on alternating rows)
- Charts rendered as static images (server-side rendering recommended)

**Footer:**
- "Generated by HRIS" + company name + page number (e.g., "Page 1 of 3")
- Horizontal divider above footer

**Typography in PDF:**
- Use system fonts or embed Inter and Plus Jakarta Sans via PDF library
- Headings: 16pt Bold, body: 10pt Regular, captions: 8pt Regular
- Color printing assumed; fall back to bold for status distinctions if printed grayscale

---

## 10. Database Schema

### Core Tables

```sql
-- Users (all roles)
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             VARCHAR(255) NOT NULL,
  email                 VARCHAR(255) UNIQUE NOT NULL,
  password_hash         TEXT NOT NULL,
  role                  ENUM('SUPER_ADMIN', 'ADMIN', 'EMPLOYEE') NOT NULL,
  department            VARCHAR(100),
  designation           VARCHAR(100),
  employee_id_code      VARCHAR(50) UNIQUE,
  avatar_url            TEXT,
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- Leave Cycle Configuration (per employee)
CREATE TABLE leave_cycles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  cycle_start_month     SMALLINT NOT NULL CHECK (cycle_start_month BETWEEN 1 AND 12),
  cycle_start_day       SMALLINT NOT NULL DEFAULT 1,
  standard_hours_per_day DECIMAL(4,2) DEFAULT 8.0,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- Leave Balances (one row per employee per active cycle)
CREATE TABLE leave_balances (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id               UUID REFERENCES users(id) ON DELETE CASCADE,
  cycle_year                SMALLINT NOT NULL,            -- The year the cycle STARTS in
  cycle_start_date          DATE NOT NULL,
  cycle_end_date            DATE NOT NULL,
  casual_leave_total        DECIMAL(4,1) DEFAULT 12.0,
  casual_leave_used         DECIMAL(4,1) DEFAULT 0.0,
  casual_leave_pending      DECIMAL(4,1) DEFAULT 0.0,    -- In pending requests
  sick_leave_total          DECIMAL(4,1) DEFAULT 12.0,
  sick_leave_used           DECIMAL(4,1) DEFAULT 0.0,
  sick_leave_pending        DECIMAL(4,1) DEFAULT 0.0,
  replacement_leave_balance DECIMAL(4,1) DEFAULT 0.0,
  overtime_hours_bank       DECIMAL(6,2) DEFAULT 0.0,    -- Fractional overtime hours
  UNIQUE(employee_id, cycle_year)
);

-- Leave Requests
CREATE TABLE leave_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  leave_type            ENUM('CASUAL', 'SICK', 'REPLACEMENT') NOT NULL,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  is_half_day           BOOLEAN DEFAULT false,
  half_day_slot         ENUM('MORNING', 'AFTERNOON'),    -- null if full days
  duration_days         DECIMAL(4,1) NOT NULL,           -- Computed, stored for speed
  reason                VARCHAR(100) NOT NULL,
  description           TEXT,
  attachment_url        TEXT,
  notification_channels JSONB DEFAULT '["EMAIL"]',       -- ["EMAIL", "IN_APP"]
  custom_message        TEXT,                            -- Edited message body (null = auto-generated)
  status                ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') DEFAULT 'PENDING',
  admin_note            TEXT,
  reviewed_by           UUID REFERENCES users(id),
  reviewed_at           TIMESTAMP,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- Attendance Records
CREATE TABLE attendance_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  clock_in_time         TIMESTAMP,
  clock_out_time        TIMESTAMP,
  total_worked_minutes  INTEGER,                         -- Computed on clock-out
  total_break_minutes   INTEGER DEFAULT 0,
  overtime_minutes      INTEGER DEFAULT 0,
  status                ENUM('PRESENT','ABSENT','HALF_DAY','LEAVE','HOLIDAY','WEEKEND') NOT NULL,
  source                ENUM('MANUAL', 'BIOMETRIC') DEFAULT 'MANUAL',
  notes                 TEXT,
  created_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

-- Break Sessions (child of attendance_records)
CREATE TABLE break_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id         UUID REFERENCES attendance_records(id) ON DELETE CASCADE,
  break_start           TIMESTAMP NOT NULL,
  break_end             TIMESTAMP,
  duration_minutes      INTEGER                          -- Computed on break_end
);

-- Holidays
CREATE TABLE holidays (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(255) NOT NULL,
  date                  DATE NOT NULL,
  is_recurring          BOOLEAN DEFAULT true,
  description           TEXT,
  notification_scheduled BOOLEAN DEFAULT true,
  notification_send_at  TIMESTAMP,
  recipients            ENUM('ALL', 'HR_ONLY', 'STAFF_ONLY', 'CUSTOM') DEFAULT 'ALL',
  custom_recipient_ids  UUID[],
  notification_sent_at  TIMESTAMP,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  type                  VARCHAR(100) NOT NULL,
  title                 VARCHAR(255) NOT NULL,
  body                  TEXT NOT NULL,
  reference_type        VARCHAR(50),                     -- 'leave_request', 'holiday', etc.
  reference_id          UUID,
  is_read               BOOLEAN DEFAULT false,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- Email Log (audit)
CREATE TABLE email_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address            TEXT NOT NULL,
  subject               TEXT NOT NULL,
  body_html             TEXT,
  status                ENUM('QUEUED', 'SENT', 'FAILED') DEFAULT 'QUEUED',
  sent_at               TIMESTAMP,
  reference_type        VARCHAR(50),
  reference_id          UUID,
  created_at            TIMESTAMP DEFAULT NOW()
);
```

---

## 11. API Endpoint Specification

All endpoints are RESTful. Base path: `/api/v1`. All responses are JSON. Authentication: JWT Bearer token in `Authorization` header. Role guards are noted per endpoint.

### Authentication

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/auth/login` | Public | Email + password login, returns JWT |
| POST | `/auth/logout` | Authenticated | Invalidate token |
| GET | `/auth/me` | Authenticated | Current user profile |
| PATCH | `/auth/me/password` | Authenticated | Change own password |

### Leave Management

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/leaves/balance` | Employee | Own leave balance for current cycle |
| GET | `/leaves/balance/:employeeId` | Admin | Any employee's leave balance |
| GET | `/leaves/requests` | Employee | Own leave request history |
| GET | `/leaves/requests/all` | Admin | All leave requests (paginated, filterable) |
| POST | `/leaves/requests` | Employee | Submit new leave request |
| GET | `/leaves/requests/:id` | Employee/Admin | Single leave request detail |
| PATCH | `/leaves/requests/:id/cancel` | Employee | Cancel own pending request |
| PATCH | `/leaves/requests/:id/approve` | Admin | Approve request |
| PATCH | `/leaves/requests/:id/reject` | Admin | Reject request (body: `{ note: string }`) |
| GET | `/leaves/message-preview` | Employee | Generate default message template (params: request data) |

### Attendance

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/attendance/clock-in` | Employee | Start attendance session |
| POST | `/attendance/clock-out` | Employee | End attendance session |
| POST | `/attendance/break/start` | Employee | Start a break |
| POST | `/attendance/break/end` | Employee | End a break |
| GET | `/attendance/today` | Employee | Today's own attendance record |
| GET | `/attendance/history` | Employee | Own monthly attendance (params: `?year=&month=`) |
| GET | `/attendance/history/:employeeId` | Admin | Any employee's attendance |
| GET | `/attendance/team/today` | Admin | All employees' status today |

### Holidays

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/holidays` | Authenticated | All holidays (params: `?year=`) |
| POST | `/holidays` | Admin | Create holiday |
| PATCH | `/holidays/:id` | Admin | Update holiday |
| DELETE | `/holidays/:id` | Admin | Delete holiday |
| POST | `/holidays/:id/notify` | Admin | Send notification for holiday |

### Notifications

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/notifications` | Authenticated | Own notifications (paginated) |
| PATCH | `/notifications/:id/read` | Authenticated | Mark one as read |
| PATCH | `/notifications/read-all` | Authenticated | Mark all as read |
| GET | `/notifications/unread-count` | Authenticated | Badge count |

### Reports / PDF

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/reports/attendance` | Employee/Admin | Download attendance PDF (params: `?employeeId=&month=&year=`) |
| GET | `/reports/leaves` | Employee/Admin | Download leave history PDF |
| GET | `/reports/summary` | Employee/Admin | Download performance summary PDF |
| GET | `/reports/all-employees` | Admin | Full company report PDF |

### Users (Admin)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/users` | Admin | Employee directory (paginated, searchable) |
| POST | `/users` | Admin | Create employee account |
| GET | `/users/:id` | Admin | Employee profile |
| PATCH | `/users/:id` | Admin | Update employee profile |
| PATCH | `/users/:id/deactivate` | Admin | Deactivate employee |
| POST | `/users/:id/leave-cycle` | Admin | Set/update leave cycle |

---

## 12. Animation & Interaction Specification

### 12.1 Global Timing & Easing

```css
:root {
  --transition-fast:   120ms ease-out;   /* Hover color changes, focus rings */
  --transition-normal: 220ms ease-out;   /* Button states, badge updates */
  --transition-slow:   380ms ease-in-out; /* Panel slides, modal open/close */
  --transition-spring: 400ms cubic-bezier(0.34, 1.56, 0.64, 1); /* Arc ring on mount */
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 12.2 Component Animations

| Component | Animation | Timing |
|-----------|-----------|--------|
| Arc ring (leave balance) | `stroke-dashoffset` from 100% to actual % on first render | 700ms, spring easing, staggered: ring 1 at 0ms, ring 2 at 150ms, ring 3 at 300ms |
| Leave request submit success | Checkmark SVG path draw (stroke animation) | 600ms ease-out |
| Leave request status badge | Color cross-fade on status change | 300ms ease |
| Admin review drawer | Slide in from right: `translateX(100%) → translateX(0)` | 380ms ease-out |
| Notification dropdown | `opacity: 0, translateY(-8px) → opacity: 1, translateY(0)` | 220ms ease-out |
| Clock-in timer | Digits update with subtle `scale(1.05) → scale(1)` on each second | 150ms ease-out |
| Active session pulse dot | Keyframe: `opacity: 1 → 0.3 → 1`, `scale: 1 → 1.2 → 1` | 2s infinite |
| Page load skeleton | Shimmer gradient: left-to-right sweep | 1.5s infinite |
| Month calendar transition | Slide: new month slides in from right, old from left | 300ms ease-in-out |
| Button click ripple | Material-style radial expand from click point | 400ms ease-out |
| Toast notification | Slide in from top-right, auto-dismiss with progress bar | Enter 300ms, stay 4s, exit 300ms |

### 12.3 Hover States

```css
/* All interactive cards */
.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  transition: transform var(--transition-normal), box-shadow var(--transition-normal);
}

/* Navigation items */
.nav-item:hover {
  background: var(--color-bg-subtle);
  color: var(--color-brand-secondary);
  transition: background var(--transition-fast), color var(--transition-fast);
}

/* Primary buttons */
.btn-primary:hover {
  background: var(--color-brand-secondary);  /* Lightens on hover */
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(44, 82, 130, 0.35);
}

/* Danger/reject buttons */
.btn-danger:hover {
  background: #C53030;
  transform: translateY(-1px);
}
```

### 12.4 Focus States

All focusable elements must have a visible focus ring for accessibility:
```css
:focus-visible {
  outline: 3px solid var(--color-border-focus);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

---

## 13. Page-by-Page Layout Specification

### 13.1 Login Page

- **Background:** `--color-bg-canvas`, left half filled with a subtle geometric pattern using `--color-brand-primary` at 5% opacity (diagonal grid or dot matrix — not a photo)
- **Right half:** White card, centered, 420px wide max
- **Contents:** HRIS logo + tagline, email field, password field + show/hide toggle, "Sign in" button, "Forgot password?" link
- **No sign-up link** — accounts are created by admins only
- **Animation on load:** Card fades in with `translateY(16px) → translateY(0)`, 400ms

### 13.2 Sidebar Navigation (Persistent)

Width: 240px desktop, collapsible to 64px (icon-only mode). On mobile: drawer overlay.

**Employee nav items:**
- 🏠 Home (Dashboard)
- 📋 My Leaves
- ⏱ Attendance
- 📅 Calendar
- 📊 Analytics
- 📄 Reports

**Admin additions:**
- 👥 Employees
- ✉️ Leave Requests
- 📅 Holiday Manager
- ⚙️ Settings

**Super Admin additions:**
- 🔧 System Config
- 📋 Audit Logs

Active item: left border `4px solid var(--color-brand-primary)`, background `--color-bg-subtle`, text `--color-brand-primary`.

### 13.3 Leave Application — Multi-Step Flow

The multi-step form should use a horizontal step indicator at the top:
```
  ①─────②─────③─────④─────⑤
  Type  Dates  Details  Send  Review
```
- Completed steps: filled circle with checkmark, color `--color-success`
- Current step: filled circle, color `--color-brand-primary`, label bold
- Future steps: empty circle, color `--color-bg-muted`, label muted
- Each step panel transitions with a horizontal slide (left-to-right when going forward, right-to-left when going back)
- "Back" and "Continue" buttons at the bottom of each panel
- A step cannot be skipped; "Continue" validates the current step before advancing

### 13.4 Admin Leave Detail Drawer

- Right-side drawer, `width: 480px` desktop / full-width mobile
- Background: `--color-bg-surface`, `--shadow-xl` on left edge
- Overlay: `rgba(0,0,0,0.4)` behind drawer; clicking overlay closes drawer
- Sections separated by `--color-border-default` horizontal dividers
- Approve button: `--color-success` filled; Reject button: `--color-danger` filled
- Both buttons require confirmation dialog before action executes

### 13.5 Calendar Page (Employee)

Full-page calendar view:
- Month navigation at top center
- Each day cell: `min-height: 80px` (desktop), clickable
- Day cell contents: date number (top-left), status dot (top-right), event label (bottom)
- Below calendar: month summary stats row + day-by-day table
- Right panel (desktop): mini "This week" summary + next upcoming leave

---

## 14. Tech Stack Recommendation

### Frontend
- **Framework:** React 18+ with TypeScript
- **Routing:** React Router v6
- **State:** Zustand (global: auth, notifications) + React Query (server state)
- **UI components:** Shadcn/ui (headless, styled with the design tokens above)
- **Charts:** Recharts
- **Date handling:** date-fns
- **PDF generation (client-side preview):** @react-pdf/renderer
- **Animations:** Framer Motion (for drawer/modal transitions, arc ring springs)
- **Forms:** React Hook Form + Zod validation

### Backend
- **Runtime:** Node.js (Express or Fastify) **or** Django REST Framework (Python)
- **Database:** PostgreSQL 15+
- **ORM:** Prisma (Node) or Django ORM
- **Auth:** JWT with refresh token rotation
- **Email:** Nodemailer + SMTP (or SendGrid/Resend for production)
- **Background jobs:** BullMQ (Node) or Celery (Python) — for holiday notification scheduler
- **File uploads:** Multer → stored in S3-compatible storage (MinIO for self-hosted)
- **PDF generation (server-side):** Puppeteer or WeasyPrint

### Infrastructure (Demo)
- **Database:** Supabase (hosted Postgres with built-in auth) — simplest for prototype
- **Hosting:** Vercel (frontend) + Railway or Render (backend)
- **File storage:** Supabase Storage

---

## 15. Biometric Integration Note

The attendance system is architected to be biometric-ready. The `attendance_records.source` field accepts `BIOMETRIC` as a value. The clock-in/clock-out API endpoints (`POST /attendance/clock-in`, `POST /attendance/clock-out`) accept the request body:

```json
{
  "source": "BIOMETRIC",
  "biometric_device_id": "device-uuid",
  "biometric_verified": true,
  "timestamp": "2026-08-17T09:02:15Z"
}
```

When integrating a fingerprint scanner:
1. The scanner device sends an HTTP POST to the backend endpoint with the employee ID (from its enrolled fingerprint database) and the timestamp.
2. The backend processes it identically to a manual clock-in.
3. On the UI, the attendance record will show a fingerprint icon (🖐) instead of a cursor icon to indicate source.

For the current demo, the `source` defaults to `MANUAL` and the above fields are not required. **No code changes to the core logic are needed when upgrading to biometric** — only the input source changes.

---

*End of HRIS Product & Implementation Documentation*  
*Version 1.0 — August 2026*  
*Prepared for development handoff*