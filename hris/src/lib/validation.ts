import { z } from 'zod';

export const CreateLeaveSchema = z
  .object({
    leaveType: z.enum(['CASUAL', 'SICK', 'REPLACEMENT']),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    isHalfDay: z.boolean().default(false),
    halfDaySlot: z.enum(['MORNING', 'AFTERNOON']).optional(),
    /** HH:mm 24-hour format */
    timeFrom: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm')
      .optional(),
    timeTo: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm')
      .optional(),
    reason: z.string().min(2).max(100),
    description: z.string().max(500).optional(),
    attachmentUrl: z.string().url().optional(),
    channels: z.array(z.enum(['EMAIL', 'IN_APP'])).min(1),
    customMessage: z.string().max(4000).optional(),
  })
  .refine(
    (v) => new Date(v.endDate) >= new Date(v.startDate),
    { message: 'endDate must be on or after startDate', path: ['endDate'] }
  )
  .refine(
    (v) =>
      !(v.timeFrom && v.timeTo) ||
      (v.startDate === v.endDate && !v.isHalfDay),
    {
      message:
        'Time-range leave must be within a single day and cannot be combined with half-day.',
      path: ['timeTo'],
    }
  )
  .refine(
    (v) => !v.timeFrom || (v.timeTo && v.timeFrom < v.timeTo),
    { message: 'timeTo must be after timeFrom', path: ['timeTo'] }
  );

export type CreateLeaveInput = z.infer<typeof CreateLeaveSchema>;

export const RejectLeaveSchema = z.object({
  note: z.string().min(4).max(500),
});

export const AllocationEntrySchema = z.object({
  date: z.iso.date(),
  slot: z.enum(['FULL', 'HALF_MORNING', 'HALF_AFTERNOON']),
});

export const ApproveLeaveSchema = z.object({
  note: z.string().max(500).optional(),
  /** Optional per-day allocation. If provided, replaces the request's original
   *  duration with the sum of these entries. */
  allocation: z.array(AllocationEntrySchema).min(1).max(60).optional(),
});
export type AllocationEntry = z.infer<typeof AllocationEntrySchema>;

export const CreateExtraWorkSchema = z.object({
  workDate: z.iso.date(),
  workType: z.enum(['FULL_DAY', 'HALF_DAY_MORNING', 'HALF_DAY_AFTERNOON']),
  reason: z.string().min(2).max(200),
  description: z.string().max(500).optional(),
});
export type CreateExtraWorkInput = z.infer<typeof CreateExtraWorkSchema>;

export const CreateHolidaySchema = z.object({
  name: z.string().min(2).max(120),
  date: z.iso.date(),
  isRecurring: z.boolean().default(true),
  description: z.string().max(500).optional(),
  recipients: z.enum(['ALL', 'HR_ONLY', 'STAFF_ONLY', 'CUSTOM']).default('ALL'),
  customRecipientIds: z.array(z.string()).default([]),
});
export type CreateHolidayInput = z.infer<typeof CreateHolidaySchema>;

export const UpdateHolidaySchema = CreateHolidaySchema.partial();
export type UpdateHolidayInput = z.infer<typeof UpdateHolidaySchema>;
