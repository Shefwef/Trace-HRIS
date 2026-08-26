import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth, err, parseBody } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';

const RegisterSchema = z.object({
  serial: z.string().min(1),
  alias: z.string().min(1),
});

export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  const hasPerm = await checkPermission(user, 'biometric.view');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.view required.');

  const devices = await prisma.biometricDevice.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { punches: true } } },
  });

  return NextResponse.json(
    devices.map((d) => ({
      id: d.id,
      serial: d.serial,
      alias: d.alias,
      isActive: d.isActive,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      punchCount: d._count.punches,
      createdAt: d.createdAt.toISOString(),
    })),
  );
}

export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  const hasPerm = await checkPermission(user, 'biometric.manage');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.manage required.');

  const [input, bad] = await parseBody(req, RegisterSchema);
  if (bad) return bad;

  const existing = await prisma.biometricDevice.findUnique({ where: { serial: input.serial } });
  if (existing) return err(409, 'DUPLICATE_SERIAL', 'A device with this serial is already registered.');

  const device = await prisma.biometricDevice.create({
    data: { serial: input.serial, alias: input.alias },
  });

  return NextResponse.json({ ok: true, id: device.id }, { status: 201 });
}
