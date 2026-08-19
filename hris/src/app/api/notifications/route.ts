import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api';

export async function GET() {
  const [user, error] = await requireAuth();
  if (error) return error;

  const notifs = await prisma.notification.findMany({
    where: { recipientId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  const unread = await prisma.notification.count({
    where: { recipientId: user.id, isRead: false },
  });

  return NextResponse.json({
    unread,
    items: notifs.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      referenceType: n.referenceType,
      referenceId: n.referenceId,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}
