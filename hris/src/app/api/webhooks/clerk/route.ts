import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/lib/audit';

/**
 * POST /api/webhooks/clerk
 *
 * Verifies the Svix signature using CLERK_WEBHOOK_SIGNING_SECRET and syncs
 * user-lifecycle events into our Postgres users table:
 *   - user.deleted → soft-deactivate (isActive = false)
 *   - user.updated → sync fullName / email / role / department / designation / employeeIdCode from publicMetadata
 *
 * The Invite flow already handles user.created one-way, so we ignore that
 * here to avoid duplicate inserts.
 *
 * This route is intentionally public (no requireAuth) because Clerk sends
 * signed requests; we verify the signature instead. It's also excluded from
 * Clerk middleware in src/middleware.ts.
 */
export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    console.warn('[webhooks/clerk] CLERK_WEBHOOK_SIGNING_SECRET is not set');
    return NextResponse.json(
      { error: 'NOT_CONFIGURED', message: 'Webhook not configured on this deployment.' },
      { status: 501 }
    );
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'BAD_HEADERS' }, { status: 400 });
  }

  const body = await req.text();
  let evt: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as { type: string; data: Record<string, unknown> };
  } catch (e) {
    console.error('[webhooks/clerk] signature verification failed:', e);
    return NextResponse.json({ error: 'BAD_SIGNATURE' }, { status: 401 });
  }

  const type = evt.type;
  const data = evt.data;

  try {
    if (type === 'user.deleted') {
      const id = data.id as string | undefined;
      if (!id) return NextResponse.json({ ok: true, note: 'no id' });
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return NextResponse.json({ ok: true, note: 'unknown user' });
      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
      await writeAudit({
        req,
        actorId: null,
        action: 'USER_DELETED_VIA_WEBHOOK',
        targetType: 'user',
        targetId: id,
        metadata: { email: existing.email },
      });
      return NextResponse.json({ ok: true, synced: 'deactivated' });
    }

    if (type === 'user.updated') {
      const id = data.id as string | undefined;
      if (!id) return NextResponse.json({ ok: true, note: 'no id' });
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return NextResponse.json({ ok: true, note: 'unknown user' });

      const emailAddresses = (data.email_addresses ?? []) as Array<{ email_address: string }>;
      const email = emailAddresses[0]?.email_address;
      const firstName = data.first_name as string | undefined;
      const lastName = data.last_name as string | undefined;
      const meta = (data.public_metadata ?? {}) as Record<string, unknown>;
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || existing.fullName;

      await prisma.user.update({
        where: { id },
        data: {
          email: email ?? existing.email,
          fullName,
          role: (meta.role as typeof existing.role | undefined) ?? existing.role,
          department: (meta.department as string | undefined) ?? existing.department,
          designation: (meta.designation as string | undefined) ?? existing.designation,
          employeeIdCode: (meta.employeeIdCode as string | undefined) ?? existing.employeeIdCode,
        },
      });
      await writeAudit({
        req,
        actorId: null,
        action: 'USER_SYNCED_VIA_WEBHOOK',
        targetType: 'user',
        targetId: id,
        metadata: { source: 'clerk.user.updated' },
      });
      return NextResponse.json({ ok: true, synced: 'updated' });
    }

    // Silently accept other events
    return NextResponse.json({ ok: true, ignored: type });
  } catch (e) {
    console.error('[webhooks/clerk] handler error:', e);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
