import { NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { err } from '@/lib/api';
import { ingestPunches } from '@/lib/biometric';
import { z } from 'zod';
import { requireAuth } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';

const PunchSchema = z.object({
  deviceUserId: z.string().min(1),
  punchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    'punchedAt must be "YYYY-MM-DD HH:MM:SS"'),
  punchState: z.string(),
  verifyType: z.number().int().optional(),
  sourceId: z.string().optional(),
});

const BodySchema = z.object({
  deviceSerial: z.string().min(1),
  punches: z.array(PunchSchema).max(500),
});

/** Bearer-token check for the office agent (not a Clerk session). */
function checkBearerToken(req: Request): boolean {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) return false;
  const token = process.env.BIOMETRIC_INGEST_TOKEN ?? '';
  if (!token) return false;
  try {
    return timingSafeEqual(
      createHash('sha256').update(match[1]).digest(),
      createHash('sha256').update(token).digest(),
    );
  } catch {
    return false;
  }
}

/** POST /api/biometric/punches — called by the office agent (bearer token). */
export async function POST(req: Request) {
  if (!checkBearerToken(req))
    return err(401, 'UNAUTHORIZED', 'Invalid or missing bearer token.');

  let body: unknown;
  try { body = await req.json(); } catch {
    return err(400, 'BAD_JSON', 'Request body is not valid JSON.');
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success)
    return err(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body.');

  const result = await ingestPunches(parsed.data);
  return NextResponse.json(result);
}

/** GET /api/biometric/punches — recent punches, admin-only (Clerk session). */
export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'biometric.view');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.view required.');

  const url = new URL(req.url);
  const deviceId = url.searchParams.get('deviceId');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 200);

  const punches = await prisma.biometricPunch.findMany({
    where: deviceId ? { deviceId } : {},
    orderBy: { punchedAt: 'desc' },
    take: limit,
    include: { device: { select: { serial: true, alias: true } } },
  });

  // BiometricPunch has no employee relation, so batch-fetch the names.
  const employeeIds = [...new Set(punches.map((p) => p.employeeId).filter((id): id is string => !!id))];
  const employees = employeeIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const nameById = new Map(employees.map((e) => [e.id, e.fullName]));

  return NextResponse.json(
    punches.map((p) => ({
      id: p.id,
      deviceSerial: p.device.serial,
      deviceAlias: p.device.alias,
      deviceUserId: p.deviceUserId,
      employeeName: p.employeeId ? nameById.get(p.employeeId) ?? null : null,
      punchedAt: p.punchedAt.toISOString(),
      punchState: p.punchState,
      verifyType: p.verifyType,
      employeeId: p.employeeId,
      appliedAt: p.appliedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
  );
}
