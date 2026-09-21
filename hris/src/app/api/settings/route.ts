import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, parseBody, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { UpdateSettingsSchema } from '@/lib/validation';

function serialize(s: {
  senderEmail: string; senderName: string; fromEmail: string;
  standardHoursPerDay: number; workStartTime: string; workEndTime: string;
  workDaysBitmask: number; overtimeThresholdMinutes: number; updatedAt: Date;
}) {
  return {
    senderEmail: s.senderEmail,
    senderName: s.senderName,
    fromEmail: s.fromEmail,
    standardHoursPerDay: s.standardHoursPerDay,
    workStartTime: s.workStartTime,
    workEndTime: s.workEndTime,
    workDaysBitmask: s.workDaysBitmask,
    overtimeThresholdMinutes: s.overtimeThresholdMinutes,
    updatedAt: s.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const [, error] = await requireAuth(req);
  if (error) return error;

  const s = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  return NextResponse.json(serialize(s));
}

export async function PATCH(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'settings.edit');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'You do not have permission to edit system settings.');

  const [input, badReq] = await parseBody(req, UpdateSettingsSchema);
  if (badReq) return badReq;

  const before = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  const updated = await prisma.systemSettings.update({
    where: { id: 'singleton' },
    data: input,
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'SETTINGS_UPDATED',
      targetType: 'system_settings',
      targetId: 'singleton',
      metadata: {
        changes: Object.fromEntries(
          Object.entries(input).filter(([, v]) => v !== undefined)
        ),
        previousSenderEmail: before.senderEmail,
      } as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
  });

  return NextResponse.json(serialize(updated));
}
