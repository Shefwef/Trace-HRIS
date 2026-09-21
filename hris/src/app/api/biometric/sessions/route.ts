import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { localDayKey, dayKeyToDateOnly } from '@/lib/workday';

/**
 * GET /api/biometric/sessions?date=YYYY-MM-DD
 * Returns one row per employee who has an attendance record on that date.
 * Requires biometric.view permission.
 */
export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'biometric.view');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.view required.');

  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date') ?? localDayKey();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam))
    return err(400, 'BAD_DATE', 'date must be YYYY-MM-DD.');

  const dateOnly = dayKeyToDateOnly(dateParam);

  const records = await prisma.attendanceRecord.findMany({
    where: { date: dateOnly },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          employeeIdCode: true,
          department: true,
        },
      },
    },
    orderBy: { employee: { fullName: 'asc' } },
  });

  return NextResponse.json(
    records.map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employee.fullName,
      employeeIdCode: r.employee.employeeIdCode,
      department: r.employee.department,
      clockInTime: r.clockInTime?.toISOString() ?? null,
      clockOutTime: r.clockOutTime?.toISOString() ?? null,
      totalWorkedMinutes: r.totalWorkedMinutes,
      overtimeMinutes: r.overtimeMinutes,
      status: r.status,
    })),
  );
}
