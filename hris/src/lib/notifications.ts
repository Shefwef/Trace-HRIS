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

/** Check a permission before creating the notification. */
export async function notifyIfPermitted(
  recipient: { id: string; role: any; roles?: any[] | null },
  permissionKey: string,
  input: Omit<CreateNotificationInput, 'recipientId'>
) {
  const { checkPermission } = await import('./permissions');
  const hasPerm = await checkPermission(recipient, permissionKey);
  if (hasPerm) {
    return notify({ ...input, recipientId: recipient.id });
  }
  return null;
}
