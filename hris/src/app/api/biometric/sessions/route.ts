import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { localDayKey, dayKeyToDateOnly } from '@/lib/workday';

/**
 * GET /api/biometric/sessions?date=YYYY-MM-DD               — single day
 * GET /api/biometric/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD — inclusive range
 *
 * Returns one row per attendance record. `totalWorkedMinutes` falls back to
 * clockOut − clockIn when the stored value is 0 (e.g. legacy records written
 * before the biometric ingest computed durations). Requires biometric.view.
 */
export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'biometric.view');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.view required.');

  const url = new URL(req.url);
  const dateStr = url.searchParams.get('date');
  const fromStr = url.searchParams.get('from');
  const toStr   = url.searchParams.get('to');

  const dateFilter = (() => {
    if (fromStr && toStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr))
        return null;
      const from = dayKeyToDateOnly(fromStr);
      // range is inclusive → add 1 day to `to`
      const [y, m, d] = toStr.split('-').map(Number);
      const to = new Date(Date.UTC(y, m - 1, d + 1));
      return { gte: from, lt: to };
    }
    const single = dateStr ?? localDayKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(single)) return null;
    return { equals: dayKeyToDateOnly(single) };
  })();

  if (!dateFilter) return err(400, 'BAD_DATE', 'date/from/to must be YYYY-MM-DD.');

  const records = await prisma.attendanceRecord.findMany({
    where: { date: dateFilter },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeIdCode: true, department: true,
        },
      },
    },
    orderBy: [{ date: 'desc' }, { employee: { fullName: 'asc' } }],
  });

  return NextResponse.json(
    records.map((r) => {
      const worked =
        r.totalWorkedMinutes > 0
          ? r.totalWorkedMinutes
          : r.clockInTime && r.clockOutTime
            ? Math.max(0, Math.round((r.clockOutTime.getTime() - r.clockInTime.getTime()) / 60_000))
            : 0;
      return {
        date: r.date.toISOString().slice(0, 10),
        employeeId: r.employeeId,
        employeeName: r.employee.fullName,
        employeeIdCode: r.employee.employeeIdCode,
        department: r.employee.department,
        clockInTime: r.clockInTime?.toISOString() ?? null,
        clockOutTime: r.clockOutTime?.toISOString() ?? null,
        totalWorkedMinutes: worked,
        overtimeMinutes: r.overtimeMinutes,
        deficitMinutes: r.deficitMinutes,
        status: r.status,
      };
    }),
  );
}
