import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth, err, parseBody } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { ingestPunches } from '@/lib/biometric';
import { localDayKey } from '@/lib/workday';

const SimulateSchema = z.object({
  employeeId: z.string(),
  punchState: z.enum(['0', '1']),
  /** ISO datetime; defaults to now. */
  timestamp: z.iso.datetime().optional(),
});

export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'biometric.simulate');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.simulate required.');

  const [input, bad] = await parseBody(req, SimulateSchema);
  if (bad) return bad;

  const employee = await prisma.user.findUnique({
    where: { id: input.employeeId },
    select: { biometricUserId: true, fullName: true },
  });
  if (!employee) return err(404, 'NOT_FOUND', 'Employee not found.');
  if (!employee.biometricUserId)
    return err(400, 'NOT_MAPPED', 'Employee has no biometric ID assigned. Map one first.');

  // Find any active device to simulate through (use first active device)
  const device = await prisma.biometricDevice.findFirst({ where: { isActive: true } });
  if (!device) return err(400, 'NO_DEVICE', 'No active device registered. Register one first.');

  const at = input.timestamp ? new Date(input.timestamp) : new Date();
  // Format as wall-clock in the configured timezone (what the device would send)
  const wallClock = localDayKey(at) + ' ' + at.toISOString().slice(11, 19);

  const result = await ingestPunches({
    deviceSerial: device.serial,
    punches: [{
      deviceUserId: employee.biometricUserId,
      punchedAt: wallClock,
      punchState: input.punchState,
      verifyType: 99, // 99 = simulated, clearly not a real verify_type
    }],
    isMock: true,
  });

  return NextResponse.json({ ok: true, ...result });
}
