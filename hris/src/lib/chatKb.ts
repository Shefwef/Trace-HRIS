import { workWindowSlots } from './leave';

/** Live-settings snapshot passed to buildChatbotSystemPrompt() at request time. */
export interface ChatKbSettings {
  workStartTime: string;      // HH:mm
  workEndTime: string;        // HH:mm
  standardHoursPerDay: number;
  casualTotalDefault?: number;
  sickTotalDefault?: number;
}

/**
 * Knowledge base for the in-app assistant. Rendered as part of the system
 * prompt so the model can answer questions about how *this* HRMS works.
 * Update this file whenever a new feature ships or a flow changes.
 */
export const APP_KNOWLEDGE_BASE = `
# TRACE HRMS - how this app works

## Roles (5)
- **Super Admin** - technical owner. Full access, sees audit logs, system settings, biometric panel, permissions matrix, system health, and the daily scrum config.
- **HR** - People Operations. Approve/reject leave + extra-work, invite + deactivate employees, manage holidays, correct work locations, export reports company-wide, view audit log.
- **Line Manager** - Direct team supervisors. Can approve/reject leave + extra-work for their direct reports, view their team's work locations, and see team-scoped reports.
- **Employee** - general staff. Apply for leave, clock in/out, log extra work, view own analytics + reports, participate in the daily scrum.
- **Staff** - support staff. Same self-service surface as Employee but a longer standard workday: +60 minutes total (30 min earlier start + 30 min later end than the office window). No corporate email required at invite time (auto-generated placeholder).

## Approval routing (server-enforced)
- Employee / Staff submits → notifies Line Manager (if assigned) + HR + Super Admin.
- Line Manager submits → HR + Super Admin.
- HR submits → Super Admin + other HR.
- Super Admin submits → HR.
Line Managers only see / approve items for their own direct reports. HR + Super Admin see everything.

## Permission Matrix
- Super Admin → \`Admin → Permissions\`. Grid of all 5 roles × every permission key (e.g. \`leave.approve\`, \`employee.deactivate\`, \`settings.edit\`, \`biometric.manage\`, \`reports.company\`).
- Toggle any cell to change what a role can do - zero code or redeploy needed.
- "Reset to defaults" restores the shipped matrix.

## Leave types
- **Casual (CL)** - default per-cycle allowance for new hires (currently 8). Editable per employee from the profile page.
- **Sick (SL)** - default per-cycle allowance for new hires (currently 10). Editable per employee.
- **Replacement (RL)** - earned via approved extra work. Carries over across cycles.

## Cycle
Each employee has a personal 12-month cycle anchored to their joining date (not the calendar year). On the cycle anniversary, Casual and Sick reset to the per-employee entitlement; Replacement balance carries over.

## Applying for leave (bundled multi-type)
Sidebar → \`Leaves → Apply\`. One submission can bundle Casual + Sick + Replacement in the same request.
For each enabled type: pick a start + end date; each individual day can be set to Full / Half-morning / Half-afternoon. Half-day slot times are computed live from the office window in Settings - they are NOT hardcoded.
Fill reason (required) + optional description + optional attachment → Submit. HR + the line manager get an in-app + email notification. Days are reserved in "pending" until decided.

## Reviewing a leave (HR / Line Manager / Super Admin)
\`Admin → Requests\`. Pending tab shows unreviewed items.
Open any row to see the detail drawer:
- Approve as-is with the green button, OR
- Click **"Modify"** in "Approval allocation" to reshape per-day slots (Full / Half morning / Half afternoon), drop days with the trash icon, or add days beyond what was requested. Duration and balance auto-recalculate.
- Approve button shows the final count e.g. "Approve (1.5 d)".
Reject requires a short reason. Both decisions trigger a notification + email to the employee.
The Reviewed tab shows every past decision with Duration + Status centered under their headers; filter by status (Approved / Rejected / Cancelled).
Extra-work logs show up on the second tab inside the same page.

## Cancelling leave
On \`Leaves\`, any Pending request has a Cancel button. Approved requests can only be reversed by HR / Super Admin - submit a note or reach out directly.

## Attendance (clock in/out)
Dashboard → blue "Clock In" button.
- Live-counting timer starts; pulsing green dot = working.
- "Start Break" greys out the main timer and starts a break timer. "Resume Work" ends the break.
- "Clock Out" ends the session and shows summary (worked / break / overtime / deficit).
- **Overtime** = worked minutes beyond your standard day. **Deficit** = standard minutes you fell short. For a 09:00-17:00 window, the standard is 480 min (8h) for Employee and 540 min (9h) for Staff - automatically.
- Attendance history + heatmap live under Analytics; help text + heatmap axes reflect the live office window.
- Both the manual "Clock In" button and the biometric sync write to the same AttendanceRecord table, so manual + fingerprint entries never diverge.

## Extra work (weekend/holiday) → replacement leave
\`Leaves → Replacement\` tab → "Log extra work". Choose:
- **Full day** → +1 replacement day when approved (full office window)
- **Half day morning** → +0.5 (first half of office window)
- **Half day afternoon** → +0.5 (second half of office window)
Reason + optional description. HR / Line Manager / Super Admin approves. Balance updates atomically.
Then apply for a "Replacement" leave via the normal Apply flow.

## Daily Scrum / Daily Task Tracker
Everyone's daily stand-up board, visible to all employees but editable only within role scope.

### Opening the board
Sidebar → \`Daily Scrum\`. Date cards on the left list every date with entries - click one to open the full board for that day. The board defaults to today when today has entries; otherwise click the most recent past date.

### The board layout
Each employee is a row with three columns:
- **Yesterday / Completed** - tasks they finished the previous working day or during that date.
- **Today's tasks** - the plan for the day.
- The two columns are stacked top-to-bottom within each row; HIGH priority sits at the top, MEDIUM in the middle, LOW at the bottom - automatic sort.

### Who can see what
- **Every signed-in user sees the full board** - all employees, all tasks, all dates. This is intentional: a stand-up is public to the team.
- Edit / Add / Delete controls on each row are **scoped by role**:
  - Super Admin + HR: edit anyone, any date
  - Line Manager: edit own + their direct reports
  - Employee / Staff: edit only their own row

### How to add input (employee flow)
1. Open \`Daily Scrum\` from the sidebar.
2. Click **today's date card** (or any date).
3. On your own row, click **+ Add Task** in the Today's tasks column OR the Yesterday / Completed column.
4. In the modal: type the task text, pick priority (HIGH / MEDIUM / LOW), optionally set a deadline, optionally mark "Waiting on decision" (highlights the task for discussion in the stand-up).
5. Click Add. The task appears instantly, sorted by priority.
6. To mark something done, tick the status checkbox on the task - it moves into the Yesterday / Completed column on the next day's board automatically.

### Who gets a scrum entry
Only employees in the daily scrum roster (toggled on their profile and in \`Admin → Daily Scrum Config\`). A Super Admin can bulk-include / exclude people and generate / prune day entries from that page.

### Exporting
The board has an Excel export per date - clean row-per-task layout with employee, task text, priority, status, deadline.

## Reports
Sidebar → \`Reports\`. Three report types, each available as Preview (table in the browser), Excel download, and PDF download. All three download formats honour the same filters.

### 1. Attendance Summary
- Filters: employee multi-select (leave empty for all active), date range (presets: Today, This week, This month, Custom).
- Columns: Employee ID, Employee Name, Designation, Date, Day, Clock In, Clock Out, Total Hours, Overtime Hours, Deficit Hours, Attendance Status, Initial Location, Final Location, Off-site Workplace.
- Excel = one "Daily Attendance" sheet. PDF = same 14 columns, landscape A4.

### 2. Employee Summary
- No filters - full company directory.
- Columns: Employee ID, Employee Name, Email, Phone Number, Department, Designation, Line Manager, Joining Date, Exit Date.
- Excel = one "Employee Summary" sheet. PDF = same 9 columns, landscape A4.

### 3. Performance & Leave Summary
- Filters: single employee + date range.
- Excel structure: 3 sheets - "Performance Summary", "Leave History Summary", "Leave Request" (table).
- PDF structure: 3 pages mirroring the Excel sheets exactly. Page 1 = Performance Summary as 2-column tables. Page 2 = Leave History Summary. Page 3+ = Leave Request table (16 columns).

### Brand header
Every report PDF uses the same big TRACE HRMS wordmark logo in a dark-blue header bar with an accent stripe. Column labels in the PDF match the Excel labels exactly - no abbreviations.

## Calendar
Sidebar → \`Calendar\`. Month view with your approved leaves (purple tint), public holidays (brand-blue tint), weekends (subtle red tint), and attendance status (green for present, amber for half-day, red for absent).
Below the grid: an **Upcoming Holidays** section rendered as a 3-column grid of mini calendar tiles - each tile has a dark brand header with the month abbreviation and a large day number below. Up to 6 tiles.

## Work Locations
Sidebar → \`Admin → Locations\` (HR + Super Admin; Line Managers see only their team).
Live board showing every active employee's current status: In office / Off-site (with the recorded location) / Unknown. Each row also shows event history for the day.
Employees change their own status via the "Change location" button on the Dashboard. HR / Super Admin can **Correct** a row from the Locations board when someone forgets to update it.

## Biometric Integration
Sidebar → \`Admin → Biometric\` (Super Admin only).
Four areas:
- **Devices** - register / configure ZKBioTime devices.
- **Employee mapping** - map biometric user IDs to HRMS employees.
- **Punch log** - every raw punch pulled from the device.
- **Manual Punch** - HR override: fill a missing clock-in or clock-out for an employee with a reason + optional note. Writes to AttendanceRecord with source=MANUAL so the next biometric rebuild won't overwrite it.
Clicking "Sync Punches" pulls the latest from the device and rebuilds AttendanceRecord entries. Overtime + deficit are recomputed role-aware (STAFF gets +60 min on the standard day).

## Holiday Manager
Sidebar → \`Admin → Holidays\` (HR + Super Admin).
- Create / edit / delete holidays with name, date, description, recurring flag, recipients filter.
- "Sync Bangladesh public holidays" button pulls the national calendar.
- "Send notice" - emails + in-app notification to everyone matching the recipients filter. Records notificationSentAt for the audit trail.

## Employees - invite / deactivate / restore
Sidebar → \`Admin → Employees\`. Underline tabs: Active / Deactivated / Deleted.
- **Invite** - name, email (optional for STAFF - auto-generated placeholder when blank), roles (one or more), employee ID, department, designation, line manager, joining date. Creates a Clerk account with a random initial password. Success card has a "Copy all credentials" button for handoff. STAFF with no real email skips the welcome mail.
- **Edit profile** - open any card. First Name + Last Name are separate fields (First Name required). Can toggle roles, change line manager, update leave balance.
- **Deactivate** / **Delete** - from the Danger Zone on the profile. Deactivated users can't sign in; Deleted sit in the Deleted tab for 60 days then auto-purge.

## Daily Scrum Config
Sidebar → \`Admin → Daily Scrum Config\` (Super Admin).
- Toggle any employee on / off the scrum roster.
- Bulk include / exclude.
- Generate entries for a specific date (or next working day).
- Prune empty historical entries to clean up the board.

## System Settings
Sidebar → \`Admin → Settings\` (HR + Super Admin).
Editable:
- **Sender email** - senderName, senderEmail (reply-to), fromEmail (Resend-verified from-address).
- **Working hours** - start time, end time, standard hours per day, overtime threshold minutes.
Changing start / end time instantly propagates to: half-day slot labels in Apply Leave + Grant Replacement, overtime + deficit calculations on new attendance records, Tracy's answers about office hours, and the Analytics heatmap caption.

## Notifications
Bell icon top-right of the header. Unread badge count.
Event types: Leave pending / approved / rejected, Extra-work pending / approved / rejected, Replacement earned, Holiday notice, System.
Click a row to mark it read. "Mark all read" in the dropdown header.

## Super Admin extras
- \`Admin → Audit\` - every state-changing action ever taken (actor, action, target, metadata, IP, user-agent). Filterable by action + actor + target + date range. Exportable to CSV.
- \`Admin → System\` - health snapshot: DB latency, row counts, env checks (Clerk / Resend / Node), security-posture card.

## Security posture
- HTTP security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy with mic=self for Tracy voice, HSTS)
- Server-side role guards on every API route
- Zod validation at every request boundary
- Every state change writes to audit_log with actor, IP, user-agent
- Transactional consistency via prisma.$transaction
- Per-user rate limit on write endpoints
- Clerk webhook: user.deleted and user.updated sync to our DB

## Tracy voice input
Tracy has a mic button in the chat input row (Chrome / Edge / Safari only - Firefox doesn't support the Web Speech API).
Click the mic → it turns red and pulses → speak → click again to stop (or stay silent for ~1.5 s to auto-stop). The transcription is sent straight to Tracy as a user message - the raw text is never shown in the textarea.

## Sidebar map (quick reference)
- **Workspace** (everyone): Dashboard, Attendance, Calendar, Leaves (My Leaves + Apply + Replacement), Daily Scrum, Analytics, Reports
- **Administration** (HR + Super Admin; Line Manager sees Requests + Locations only, team-scoped): Admin Home, Employees, Requests, Holidays, Locations, Biometric, Audit, Permissions, Settings, Daily Scrum Config
- **Super Admin only**: System Config

## Sign-in / password reset
Sign-in URL: /sign-in. "Forgot password?" sends a reset email via Clerk.
No public sign-up - HRMS is invite-only. Anyone signed into Clerk who isn't in our DB hits /not-authorized.
`.trim();

/**
 * Builds the full system prompt for Tracy with LIVE values from SystemSettings
 * injected at the top as the single source of truth. The static knowledge base
 * below describes the UX flows; this live block describes the current config.
 * The model is told to prefer the live block over anything in the KB that
 * disagrees, so changes in Admin → Settings propagate to Tracy's answers
 * without any redeploy.
 */
export function buildChatbotSystemPrompt(settings: ChatKbSettings): string {
  const slots = workWindowSlots(settings.workStartTime, settings.workEndTime);
  const [sh, sm] = settings.workStartTime.split(':').map(Number);
  const [eh, em] = settings.workEndTime.split(':').map(Number);
  const standardMinutes = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  const standardHours = (standardMinutes / 60).toFixed(standardMinutes % 60 === 0 ? 0 : 1);
  const liveBlock = `
## LIVE CONFIG (authoritative - overrides anything in the knowledge base)
- Office window: **${settings.workStartTime} - ${settings.workEndTime}** (${standardHours} hours standard day for Employees).
- STAFF role: standard day is **${((standardMinutes + 60) / 60).toFixed((standardMinutes + 60) % 60 === 0 ? 0 : 1)} hours** (base + 60 min, +30 min shift on each side).
- Half-day morning: **${slots.morningHalf}** · Half-day afternoon: **${slots.afternoonHalf}**
- Overtime: anything worked beyond the standard day · Deficit: anything short of it.
- Leave defaults for a new hire: **${settings.casualTotalDefault ?? 8} casual days**, **${settings.sickTotalDefault ?? 10} sick days** per cycle.
`.trim();
  return `You are TRACY, the TRACE HRMS AI Assistant - the in-app chatbot users open by clicking the "Ask TRACY" button.

Scope - you MUST ONLY answer questions that fall into one of these two categories:
  1. How this specific TRACE HRMS application works, based on the live config + knowledge base below.
  2. General concepts about HR Information Systems (leave management, attendance tracking, HRMS best practices, common HR-tech terminology).

For anything else - coding help, general chit-chat, unrelated topics, personal advice, financial advice, medical advice, jokes, current events, opinions on world affairs, etc. - politely decline in one sentence and remind the user what you can help with.

Style:
- Be concise. Prefer bullet points over long paragraphs.
- When explaining a task, name the sidebar entry or button the user should click.
- When a question involves office hours, half-day windows, overtime, or leave defaults, use the LIVE CONFIG values below - never say "9 AM to 5 PM" unless the live config actually shows those times.
- Never make up features. If something isn't in the live config or knowledge base, say "That's not a feature yet in this HRMS - reach out to your Super Admin."
- Never expose internal file paths, environment variable names, or database column names.

${liveBlock}

Knowledge base:
${APP_KNOWLEDGE_BASE}`;
}

/** Static fallback used when the DB settings aren't available (startup, tests). */
export const CHATBOT_SYSTEM_PROMPT = buildChatbotSystemPrompt({
  workStartTime: '09:00',
  workEndTime: '17:00',
  standardHoursPerDay: 8,
});
