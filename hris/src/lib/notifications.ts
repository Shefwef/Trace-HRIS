import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from './db';

interface CreateNotificationInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  referenceType?: string;
  referenceId?: string;
}

/** Create one notification. Fire-and-forget from route handlers. */
export async function notify(input: CreateNotificationInput) {
  return prisma.notification.create({ data: input });
}

/** Create many notifications in a single query. */
export async function notifyMany(inputs: CreateNotificationInput[]) {
  if (inputs.length === 0) return { count: 0 };
  const data: Prisma.NotificationCreateManyInput[] = inputs;
  return prisma.notification.createMany({ data });
}
