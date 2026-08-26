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
  /** Optional custom email fields. If provided, override the default template. */
  emailSubject: z.string().min(3).max(200).optional(),
  emailBody: z.string().min(10).max(4000).optional(),
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
  /** Optional custom email fields. If provided, override the default template. */
  emailSubject: z.string().min(3).max(200).optional(),
  emailBody: z.string().min(10).max(4000).optional(),
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

export const UpdateSettingsSchema = z.object({
  senderEmail: z.email().optional(),
  senderName: z.string().min(2).max(80).optional(),
  fromEmail: z.email().optional(),
  qaRedirectEmail: z.union([z.email(), z.literal('')]).optional(),
  standardHoursPerDay: z.int().min(1).max(24).optional(),
  workStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm').optional(),
  workEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm').optional(),
  overtimeThresholdMinutes: z.int().min(0).max(24 * 60).optional(),
});
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

export const InviteEmployeeSchema = z.object({
  email: z.email(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  /** One or more roles to grant on creation. Must be non-empty. */
  roles: z
    .array(z.enum(['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE']))
    .min(1)
    .max(5),
  department: z.string().min(1).max(120),
  designation: z.string().min(1).max(120),
  employeeIdCode: z.string().min(1).max(50),
  cycleStartMonth: z.int().min(1).max(12).default(1),
  password: z.string().min(8).max(100).optional(),
  /** Optional line manager assignment on invite. */
  lineManagerId: z.string().optional(),
});
export type InviteEmployeeInput = z.infer<typeof InviteEmployeeSchema>;

export const UpdateEmployeeSchema = z.object({
  fullName: z.string().min(2).max(160).optional(),
  /** Full role set. If provided, must contain at least one role. */
  roles: z
    .array(z.enum(['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE']))
    .min(1)
    .max(5)
    .optional(),
  department: z.string().max(120).optional(),
  designation: z.string().max(120).optional(),
  employeeIdCode: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
  /** Set to a user ID to assign a line manager, or null to remove. */
  lineManagerId: z.union([z.string(), z.null()]).optional(),
});
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;

// ─── Work location ────────────────────────────────────────

/**
 * A destination the employee picked. `placeName` is the only hard requirement:
 * when no Google Maps key is configured the modal falls back to typed entry, so
 * placeId/lat/lng are all optional. Coordinates are bounds-checked because a
 * bad Places response is easier to catch here than in a report six weeks later.
 */
export const StartOffsiteSchema = z.object({
  placeId: z.string().max(300).optional(),
  placeName: z.string().min(2).max(200),
  formattedAddress: z.string().max(400).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  purpose: z.string().max(200).optional(),
});
export type StartOffsiteInput = z.infer<typeof StartOffsiteSchema>;

export const CorrectWorkLocationSchema = z.object({
  eventId: z.string().min(1),
  note: z.string().min(3).max(200),
});
export type CorrectWorkLocationInput = z.infer<typeof CorrectWorkLocationSchema>;

