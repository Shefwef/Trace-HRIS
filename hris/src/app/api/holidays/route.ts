import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, parseBody, err, canApprove } from '@/lib/api';
import { CreateHolidaySchema } from '@/lib/validation';

/**
 * GET /api/holidays?year=YYYY (defaults to current year)
 *   Everyone can list holidays for the calendar.
 */
export async function GET(req: Request) {
  const [, error] = await requireAuth(req);
  if (error) return error;

  const url = new URL(req.url);
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 3000)
    return err(400, 'BAD_YEAR', 'Invalid year.');

  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: from, lt: to } },
    orderBy: { date: 'asc' },
    include: { createdBy: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json(holidays.map(serialize));
}

/** POST /api/holidays — create a new holiday (HR/Admin/Super Admin only). */
export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  if (!canApprove(user.role))
    return err(403, 'FORBIDDEN', 'Only HR, Admin or Super Admin can create holidays.');

  const [input, badReq] = await parseBody(req, CreateHolidaySchema);
  if (badReq) return badReq;

  const created = await prisma.holiday.create({
    data: {
      name: input.name,
      date: new Date(input.date + 'T00:00:00Z'),
      isRecurring: input.isRecurring,
      description: input.description,
      recipients: input.recipients,
      customRecipientIds: input.customRecipientIds,
      createdById: user.id,
    },
    include: { createdBy: { select: { id: true, fullName: true } } },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'HOLIDAY_CREATED',
      targetType: 'holiday',
      targetId: created.id,
      metadata: { name: input.name, date: input.date },
    },
  });

  return NextResponse.json(serialize(created), { status: 201 });
}

interface RawHoliday {
  id: string;
  name: string;
  date: Date;
  isRecurring: boolean;
  description: string | null;
  notificationScheduled: boolean;
  notificationSendAt: Date | null;
  recipients: 'ALL' | 'HR_ONLY' | 'STAFF_ONLY' | 'CUSTOM';
  customRecipientIds: string[];
  notificationSentAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { id: string; fullName: string } | null;
}

export function serialize(h: RawHoliday) {
  return {
    id: h.id,
    name: h.name,
    date: h.date.toISOString().slice(0, 10),
    isRecurring: h.isRecurring,
    description: h.description,
    notificationScheduled: h.notificationScheduled,
    notificationSendAt: h.notificationSendAt?.toISOString() ?? null,
    recipients: h.recipients,
    customRecipientIds: h.customRecipientIds,
    notificationSentAt: h.notificationSentAt?.toISOString() ?? null,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
    createdBy: h.createdBy,
  };
}
