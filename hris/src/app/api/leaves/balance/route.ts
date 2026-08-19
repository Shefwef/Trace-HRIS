import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api';

export async function GET() {
  const [user, error] = await requireAuth();
  if (error) return error;

  const year = new Date().getFullYear();
  let balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: user.id, cycleYear: year } },
  });

  if (!balance) {
    balance = await prisma.leaveBalance.create({
      data: {
        employeeId: user.id,
        cycleYear: year,
        cycleStartDate: new Date(year, 0, 1),
        cycleEndDate: new Date(year, 11, 31),
      },
    });
  }

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
