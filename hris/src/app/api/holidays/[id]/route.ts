import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAuth, parseBody, err, canApprove } from '@/lib/api';
import { UpdateHolidaySchema } from '@/lib/validation';
import { serialize } from '../route';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  if (!canApprove(user.role))
    return err(403, 'FORBIDDEN', 'Only HR, Admin or Super Admin can update holidays.');

  const { id } = await ctx.params;
  const [input, badReq] = await parseBody(req, UpdateHolidaySchema);
  if (badReq) return badReq;

  const existing = await prisma.holiday.findUnique({ where: { id } });
  if (!existing) return err(404, 'NOT_FOUND', 'Holiday not found.');

  const updated = await prisma.holiday.update({
    where: { id },
    data: {
      name: input.name,
      date: input.date ? new Date(input.date + 'T00:00:00Z') : undefined,
      isRecurring: input.isRecurring,
      description: input.description,
      recipients: input.recipients,
      customRecipientIds: input.customRecipientIds,
    },
    include: { createdBy: { select: { id: true, fullName: true } } },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'HOLIDAY_UPDATED',
      targetType: 'holiday',
      targetId: id,
      metadata: input as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json(serialize(updated));
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  if (!canApprove(user.role))
    return err(403, 'FORBIDDEN', 'Only HR, Admin or Super Admin can delete holidays.');

  const { id } = await ctx.params;
  const existing = await prisma.holiday.findUnique({ where: { id } });
  if (!existing) return err(404, 'NOT_FOUND', 'Holiday not found.');

  await prisma.holiday.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'HOLIDAY_DELETED',
      targetType: 'holiday',
      targetId: id,
      metadata: { name: existing.name, date: existing.date.toISOString().slice(0, 10) },
    },
  });

  return NextResponse.json({ ok: true });
}
