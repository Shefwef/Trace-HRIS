import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth();
  if (error) return error;
  const { id } = await ctx.params;

  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n || n.recipientId !== user.id) return err(404, 'NOT_FOUND', 'Notification not found.');

  if (!n.isRead) {
    await prisma.notification.update({ where: { id }, data: { isRead: true } });
  }
  return NextResponse.json({ ok: true });
}
