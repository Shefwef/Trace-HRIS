import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api';

export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const year = new Date().getFullYear();
  // upsert is atomic — a race between two first-load requests for the same
  // employee can't produce a P2002 unique violation.
  const balance = await prisma.leaveBalance.upsert({
    where: { employeeId_cycleYear: { employeeId: user.id, cycleYear: year } },
    create: {
      employeeId: user.id,
      cycleYear: year,
      cycleStartDate: new Date(Date.UTC(year, 0, 1)),
      cycleEndDate: new Date(Date.UTC(year, 11, 31)),
    },
    update: {},
  });

  return NextResponse.json({
    cycleYear: balance.cycleYear,
    cycleStartDate: balance.cycleStartDate.toISOString().slice(0, 10),
    cycleEndDate: balance.cycleEndDate.toISOString().slice(0, 10),
    casualTotal: Number(balance.casualTotal),
    casualUsed: Number(balance.casualUsed),
    casualPending: Number(balance.casualPending),
    sickTotal: Number(balance.sickTotal),
    sickUsed: Number(balance.sickUsed),
    sickPending: Number(balance.sickPending),
    replacementBalance: Number(balance.replacementBalance),
  });
}
