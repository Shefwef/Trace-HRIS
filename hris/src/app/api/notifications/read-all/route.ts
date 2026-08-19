import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api';

export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  await prisma.notification.updateMany({
    where: { recipientId: user.id, isRead: false },
    data: { isRead: true },
  });
  return NextResponse.json({ ok: true });
}
