/**
 * Print a copy-paste-ready welcome email (subject + plaintext body + HTML) for
 * a seeded employee. Useful when Resend can't send to their address yet
 * because you haven't verified a sender domain — you can paste this into
 * your own Gmail / Outlook and send it directly.
 *
 * Usage:
 *   TARGET_EMAIL=res.anik@traceconsultingltd.com npx tsx --env-file=.env.local scripts/print-welcome.ts
 */
import { SEED_USERS } from '../prisma/seed-users';

const target = process.env.TARGET_EMAIL?.toLowerCase();
if (!target) {
  console.error('❌ Set TARGET_EMAIL=<email> and re-run.');
  process.exit(1);
}

const u = SEED_USERS.find((x) => x.email.toLowerCase() === target);
if (!u) {
  console.error(`❌ ${target} is not in SEED_USERS.`);
  process.exit(1);
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://trace-hris.vercel.app';

const roleTour: Record<string, string> = {
  EMPLOYEE:
    "apply for leave, clock in/out for the day, log any extra work you do on weekends or holidays (which becomes replacement leave), and see the full holiday calendar.",
  HR: "review leave requests, manage the holiday calendar, invite new hires, and edit system-wide settings — plus everything an employee can do.",
  ADMIN:
    "review leave requests, get CC'd on every employee submission, and manage the team — plus everything an employee can do.",
  SUPER_ADMIN: "do everything, plus view the audit log and system health page.",
};

const subject = `Welcome to Trace HRIS, ${u.firstName}`;
const body = `Hi ${u.firstName},

You've been added to Trace HRIS, our internal HR portal. It's where you'll manage leave, log attendance, and see the office calendar — no more spreadsheets or WhatsApp threads.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR LOGIN CREDENTIALS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Portal:   ${appUrl}
  Email:    ${u.email}
  Password: ${u.password}
  Role:     ${u.role}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please change your password on first sign-in — click your avatar in the top right → Account settings → Security.

What you can do here:
In Trace HRIS you can ${roleTour[u.role] ?? 'use the app.'}

First things to try:
  1. Sign in and click the little bot icon in the bottom-right — it can answer any question about the app.
  2. Check your leave balance on the dashboard (three arc rings — Casual, Sick, Replacement).
  3. Try the attendance widget — click Clock In, take a break, clock out. It's all logged.
  4. If you need time off, click Apply for Leave and the 5-step wizard walks you through it.

Trouble signing in? Use the "Forgot password?" link on the sign-in page — it emails a reset link. If that doesn't work, message me.

Welcome aboard!
Shefayat
`;

console.log('\n════════════════════════════════════════════════════');
console.log('  COPY-PASTE THIS INTO YOUR EMAIL CLIENT');
console.log('════════════════════════════════════════════════════\n');
console.log(`To:      ${u.email}`);
console.log(`Subject: ${subject}`);
console.log('\n--- BODY ---\n');
console.log(body);
console.log('════════════════════════════════════════════════════\n');
