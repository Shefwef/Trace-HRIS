import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { holidaysForYear } from '@/lib/bdHolidays';

/**
 * POST /api/holidays/sync-bd?year=YYYY
 * Seeds Bangladesh public holidays for the given year from Google's official
 * "Holidays in Bangladesh" ICS feed — includes fixed dates AND moon-dependent
 * Islamic/Hindu observances (Eids, Puja, Ashura, etc.). Falls back to a
 * hardcoded fixed-date list if the Google fetch fails. Idempotent — a holiday
 * with the same (name, date) is skipped rather than duplicated.
 */
export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'holiday.create');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'You do not have permission to create holidays.');

  const url = new URL(req.url);
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 3000)
    return err(400, 'BAD_YEAR', 'Invalid year.');

  const seed = await holidaysForYear(year);

  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const existing = await prisma.holiday.findMany({
    where: { date: { gte: from, lt: to } },
    select: { name: true, date: true },
  });
  const existingKeys = new Set(
    existing.map((h) => `${h.name.toLowerCase()}|${h.date.toISOString().slice(0, 10)}`),
  );

  const toCreate = seed.filter(
    (h) => !existingKeys.has(`${h.name.toLowerCase()}|${h.date}`),
  );

  if (toCreate.length === 0) {
    return NextResponse.json({
      ok: true,
      year,
      created: 0,
      skipped: seed.length,
      message: `All ${seed.length} fixed BD holidays for ${year} are already in the calendar.`,
    });
  }

  await prisma.holiday.createMany({
    data: toCreate.map((h) => ({
      name: h.name,
      date: new Date(h.date + 'T00:00:00Z'),
      isRecurring: true,
      description: h.description ?? null,
      recipients: 'ALL' as const,
      createdById: user.id,
    })),
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'HOLIDAYS_SYNCED_BD',
      targetType: 'holiday',
      targetId: null,
      metadata: {
        year,
        created: toCreate.length,
        names: toCreate.map((h) => h.name),
      },
    },
  });

  return NextResponse.json({
    ok: true,
    year,
    created: toCreate.length,
    skipped: seed.length - toCreate.length,
    message: `Added ${toCreate.length} BD holidays for ${year} from Google's official calendar (includes Eids, Puja, and other moon-dependent dates).`,
  });
}
