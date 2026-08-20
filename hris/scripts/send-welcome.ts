/**
 * Send a welcome email to a seeded employee with their credentials and a
 * quick tour of what they can do in Trace HRIS. Uses Resend + the app's
 * brand template.
 *
 * Usage:
 *   TARGET_EMAIL=res.anik@traceconsultingltd.com npx tsx --env-file=.env.local scripts/send-welcome.ts
 */
import { Resend } from 'resend';
import { PrismaClient } from '@prisma/client';
import { SEED_USERS } from '../prisma/seed-users';

const target = process.env.TARGET_EMAIL?.toLowerCase();
if (!target) {
  console.error('❌ Set TARGET_EMAIL=<email> and re-run.');
  process.exit(1);
}

const BRAND_PRIMARY = '#2C5282';
const BRAND_SECONDARY = '#3182CE';

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderWelcomeHtml(u: {
  fullName: string;
  firstName: string;
  role: string;
  email: string;
  password: string;
  designation: string;
  department: string;
  appUrl: string;
  senderName: string;
}): string {
  const roleTour: Record<string, string> = {
    EMPLOYEE:
      'apply for leave, clock in/out for the day, log any extra work you do on weekends or holidays (which converts into replacement leave), and see the full holiday calendar.',
    HR: 'review leave requests, manage the holiday calendar, invite new hires, and edit the system-wide settings — plus everything an employee can do.',
    ADMIN:
      'review leave requests, get CC\'d on every employee submission, and manage the team — plus everything an employee can do.',
    SUPER_ADMIN:
      'do everything, plus view the audit log and the system health page.',
  };

  return `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>Welcome to Trace HRIS</title></head>
<body style="margin:0;padding:0;background:#f7f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a202c;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f7f9fc;padding:32px 16px;"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.06);">

<tr><td style="background:linear-gradient(135deg,${BRAND_PRIMARY},${BRAND_SECONDARY});padding:32px;color:white;">
  <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.85;">Trace HRIS</div>
  <div style="font-size:24px;font-weight:700;margin-top:6px;">Welcome, ${escape(u.firstName)} 👋</div>
  <div style="font-size:14px;opacity:0.9;margin-top:4px;">Your account is ready.</div>
</td></tr>

<tr><td style="padding:32px;font-size:15px;line-height:1.6;color:#1a202c;">
<p style="margin:0 0 16px;">Hi ${escape(u.firstName)},</p>
<p style="margin:0 0 16px;">You've been added to <strong>Trace HRIS</strong>, our internal HR portal. It's where you'll manage your leave, log your attendance, and see the office calendar — no more spreadsheets or WhatsApp threads.</p>

<div style="margin:24px 0;padding:20px;background:#f7f9fc;border-radius:8px;border-left:4px solid ${BRAND_PRIMARY};">
  <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#4a5568;margin-bottom:12px;font-weight:600;">Your login credentials</div>
  <div style="margin:6px 0;font-size:14px;"><strong style="color:#4a5568;">Portal:</strong> <a href="${escape(u.appUrl)}" style="color:${BRAND_PRIMARY};">${escape(u.appUrl)}</a></div>
  <div style="margin:6px 0;font-size:14px;"><strong style="color:#4a5568;">Email:</strong> ${escape(u.email)}</div>
  <div style="margin:6px 0;font-size:14px;"><strong style="color:#4a5568;">Initial password:</strong> <code style="background:#edf2f7;padding:3px 8px;border-radius:4px;font-family:'SF Mono',Menlo,monospace;font-size:13px;">${escape(u.password)}</code></div>
  <div style="margin:6px 0;font-size:14px;"><strong style="color:#4a5568;">Role:</strong> ${escape(u.role)}</div>
</div>

<p style="margin:16px 0;"><strong>Please change your password on first sign-in</strong> — click your avatar in the top right → <em>Account settings</em> → security.</p>

<div style="margin:24px 0 12px;font-size:16px;font-weight:600;color:#2d3748;">What you can do here</div>
<p style="margin:0 0 12px;color:#4a5568;">As a <strong>${escape(u.role)}</strong>, you can ${roleTour[u.role] ?? 'use the app.'}</p>

<div style="margin:24px 0 12px;font-size:16px;font-weight:600;color:#2d3748;">First things to try</div>
<ol style="margin:8px 0 16px 22px;padding:0;color:#2d3748;">
  <li style="margin-bottom:8px;">Sign in and click the little bot icon in the bottom-right — it can answer any question about the app.</li>
  <li style="margin-bottom:8px;">Check your leave balance on the dashboard (three arc rings — Casual, Sick, Replacement).</li>
  <li style="margin-bottom:8px;">Try the attendance widget on the same dashboard — click <em>Clock In</em>, take a break, clock out. It's all logged.</li>
  <li style="margin-bottom:0;">If you need time off, click <em>Apply for Leave</em> and the 5-step wizard walks you through it.</li>
</ol>

<div style="margin:24px 0;padding:16px;background:#fef5e7;border-radius:8px;border-left:4px solid #dd6b20;font-size:14px;">
  <strong>Trouble signing in?</strong> Use the "Forgot password?" link on the sign-in page — it emails a reset link. If that doesn't work, message ${escape(u.senderName)}.
</div>

<div style="margin-top:28px;"><a href="${escape(u.appUrl)}" style="display:inline-block;background:${BRAND_PRIMARY};color:white;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">Sign in to Trace HRIS</a></div>

<p style="margin:24px 0 0;color:#718096;font-size:13px;">Welcome aboard.</p>
</td></tr>

<tr><td style="padding:20px 32px;background:#f7f9fc;border-top:1px solid #e2e8f0;color:#718096;font-size:12px;">
Sent by ${escape(u.senderName)} · Trace Consulting Ltd · Dhaka, Bangladesh
</td></tr>

</table></td></tr></table></body></html>`;
}

async function main() {
  const u = SEED_USERS.find((x) => x.email.toLowerCase() === target);
  if (!u) {
    console.error(`❌ ${target} is not in SEED_USERS. Add them first.`);
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY is not set.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const settings = await prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
  await prisma.$disconnect();

  const from = settings?.fromEmail ?? 'onboarding@resend.dev';
  const senderName = settings?.senderName ?? 'Trace HRIS';
  const replyTo = settings?.senderEmail ?? undefined;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://trace-hris.vercel.app';

  const html = renderWelcomeHtml({
    fullName: u.fullName,
    firstName: u.firstName,
    role: u.role,
    email: u.email,
    password: u.password,
    designation: u.designation,
    department: u.department,
    appUrl,
    senderName,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const res = await resend.emails.send({
    from: `${senderName} <${from}>`,
    to: u.email,
    replyTo: replyTo,
    subject: `Welcome to Trace HRIS, ${u.firstName}`,
    html,
  });

  if (res.error) {
    console.error('❌ Resend error:', res.error);
    process.exit(1);
  }

  console.log(`\n✓ Welcome email sent to ${u.email}`);
  console.log(`  Message ID: ${res.data?.id}`);
  console.log(`  From:       ${senderName} <${from}>`);
  console.log(`  Reply-to:   ${replyTo ?? '(none)'}\n`);
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
