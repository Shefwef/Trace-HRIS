import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err, canApprove } from '@/lib/api';
import { notifyMany } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { holidayNoticeEmail } from '@/emails/templates';

/**
 * POST /api/holidays/[id]/send-notice
 *   Dispatches the holiday notice by email + in-app to the configured recipients.
 *   Idempotent-ish: sets notificationSentAt so admins can see it was sent, but
 *   we DO allow re-sending (in case the first attempt bounced etc.).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  if (!canApprove(user.role))
    return err(403, 'FORBIDDEN', 'Only HR, Admin or Super Admin can send holiday notices.');

  const { id } = await ctx.params;
  const holiday = await prisma.holiday.findUnique({ where: { id } });
  if (!holiday) return err(404, 'NOT_FOUND', 'Holiday not found.');

  const allUsers = await prisma.user.findMany({ where: { isActive: true } });
  let recipients = allUsers;

  if (holiday.recipients === 'HR_ONLY')
    recipients = allUsers.filter((u) => u.role === 'HR');
  else if (holiday.recipients === 'STAFF_ONLY')
    recipients = allUsers.filter((u) => u.role === 'EMPLOYEE');
  else if (holiday.recipients === 'CUSTOM')
    recipients = allUsers.filter((u) => holiday.customRecipientIds.includes(u.id));
  // ALL — everyone (excluding SUPER_ADMIN if you'd like; keeping inclusive for now)

  if (recipients.length === 0)
    return err(400, 'NO_RECIPIENTS', 'No recipients matched the current selection.');

  const settings = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  const dateLabel = new Date(holiday.date).toLocaleDateString('en', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  await notifyMany(
    recipients.map((r) => ({
      recipientId: r.id,
      type: 'HOLIDAY_NOTICE' as const,
      title: `Holiday — ${holiday.name}`,
      body: `${holiday.name} on ${dateLabel}. The office will be closed.`,
      referenceType: 'holiday',
      referenceId: holiday.id,
    }))
  );

  const ctaUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/calendar`;
  const { subject, html } = holidayNoticeEmail(
    {
      holidayName: holiday.name,
      holidayDate: dateLabel,
      description: holiday.description ?? undefined,
      ctaUrl,
    },
    { senderName: settings.senderName }
  );
  void sendEmail({
    to: recipients.map((r) => r.email),
    subject,
    html,
    referenceType: 'holiday',
    referenceId: holiday.id,
  });

  await prisma.holiday.update({
    where: { id },
    data: { notificationSentAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'HOLIDAY_NOTICE_SENT',
      targetType: 'holiday',
      targetId: id,
      metadata: { recipients: recipients.length, name: holiday.name },
    },
  });

  return NextResponse.json({ ok: true, recipients: recipients.length });
}
