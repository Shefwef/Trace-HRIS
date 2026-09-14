import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth, err, parseBody } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { ingestPunches } from '@/lib/biometric';
import { localDayKey, APP_TZ } from '@/lib/workday';

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
  // Format as wall-clock in the office timezone — exactly what the device sends.
  // toISOString() gives UTC time, not local; use Intl to get the local time parts.
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TZ, hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => timeParts.find((p) => p.type === t)?.value ?? '00';
  const wallClock = `${localDayKey(at)} ${get('hour')}:${get('minute')}:${get('second')}`;

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
