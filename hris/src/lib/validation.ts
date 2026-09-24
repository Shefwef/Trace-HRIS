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
    // Accepts either a relative path returned by /api/upload/leave-attachment
    // ("/attachments/...") or a full https URL from an external doc host.
    // `.url()` alone would reject the relative path our own uploader returns.
    attachmentUrl: z.string().min(1).max(500).optional(),
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
export type AllocationEntryInput = z.infer<typeof AllocationEntrySchema>;

/**
 * Payload for the new multi-type apply flow. One submit produces N leave
 * requests (one per enabled type), all sharing a bundleId. Shared fields
 * (reason/description/attachment/channels) apply to every row in the bundle.
 *
 * Legacy `CreateLeaveSchema` above stays valid for single-type requests
 * (existing entry points, admin grant flow, etc.).
 */
export const CreateLeaveBundleSchema = z.object({
  items: z
    .array(
      z.object({
        leaveType: z.enum(['CASUAL', 'SICK', 'REPLACEMENT']),
        /** Sorted list of day slots covered by this leave type. */
        perDayAllocation: z.array(AllocationEntrySchema).min(1).max(60),
      }),
    )
    .min(1)
    .max(3)
    .refine(
      (items) => new Set(items.map((i) => i.leaveType)).size === items.length,
      { message: 'A bundle cannot include the same leave type twice.' },
    ),
  reason: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  // Same rule as CreateLeaveSchema — allow relative paths from our uploader.
  attachmentUrl: z.string().min(1).max(500).optional(),
  channels: z.array(z.enum(['EMAIL', 'IN_APP'])).min(1),
  customMessage: z.string().max(4000).optional(),
});
export type CreateLeaveBundleInput = z.infer<typeof CreateLeaveBundleSchema>;

export const ApproveLeaveSchema = z.object({
  note: z.string().max(500).optional(),
  /** Optional per-day allocation for the targeted (representative) row.
   *  Kept for backward compat with the single-request approve flow. */
  allocation: z.array(AllocationEntrySchema).min(1).max(60).optional(),
  /** For bundle approvals: map of itemId → per-day allocation. Rows in this
   *  map get approved with their custom allocation; rows omitted are
   *  approved with their as-submitted allocation. */
  bundleAllocations: z.record(
    z.string().min(1),
    z.array(AllocationEntrySchema).min(1).max(60),
  ).optional(),
});
export type AllocationEntry = z.infer<typeof AllocationEntrySchema>;

export const CreateExtraWorkSchema = z.object({
  workDate: z.iso.date(),
  workType: z.enum(['FULL_DAY', 'HALF_DAY_MORNING', 'HALF_DAY_AFTERNOON']),
  reason: z.string().min(2).max(200),
  description: z.string().max(500).optional(),
});
export type CreateExtraWorkInput = z.infer<typeof CreateExtraWorkSchema>;

/**
 * Payload for HR / Line Manager directly granting replacement leave to an employee.
 * Creates an APPROVED replacement LeaveRequest without going through the normal
 * request-then-approve flow. overtimeWorkDate is optional context (the day the
 * employee worked overtime that this leave compensates for).
 */
export const GrantReplacementLeaveSchema = z
  .object({
    employeeId: z.string().min(1, 'employeeId is required'),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    isHalfDay: z.boolean().default(false),
    halfDaySlot: z.enum(['MORNING', 'AFTERNOON']).optional(),
    reason: z.string().min(4, 'Please describe why you are granting this leave').max(100),
    description: z.string().max(500).optional(),
    overtimeWorkDate: z.iso.date().optional(),
  })
  .refine(
    (v) => new Date(v.endDate) >= new Date(v.startDate),
    { message: 'endDate must be on or after startDate', path: ['endDate'] }
  )
  .refine(
    (v) => !v.isHalfDay || v.startDate === v.endDate,
    { message: 'Half-day grants must be a single day', path: ['endDate'] }
  )
  .refine(
    (v) => !v.isHalfDay || !!v.halfDaySlot,
    { message: 'Pick morning or afternoon for a half-day grant', path: ['halfDaySlot'] }
  );
export type GrantReplacementLeaveInput = z.infer<typeof GrantReplacementLeaveSchema>;

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
  standardHoursPerDay: z.int().min(1).max(24).optional(),
  workStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm').optional(),
  workEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm').optional(),
  overtimeThresholdMinutes: z.int().min(0).max(24 * 60).optional(),
});
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

export const InviteEmployeeSchema = z.object({
  email: z.email(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional(),
  /** One or more roles to grant on creation. Must be non-empty. */
  roles: z
    .array(z.enum(['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE']))
    .min(1)
    .max(5),
  department: z.string().max(120).optional(),
  designation: z.string().min(1).max(120),
  employeeIdCode: z.string().min(1).max(50),
  password: z.string().min(8).max(100).optional(),
  /** Optional line manager assignment on invite. */
  lineManagerId: z.string().optional(),
  phone: z.string().max(30).optional(),
  /** ISO date string YYYY-MM-DD */
  dateOfBirth: z.iso.date().optional(),
  /**
   * ISO date string YYYY-MM-DD. Required — the leave cycle runs from this date
   * to one day before its anniversary each year.
   */
  joiningDate: z.iso.date(),
  avatarUrl: z.string().max(500).optional(),
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
  phone: z.string().max(30).optional(),
  /** ISO date string YYYY-MM-DD */
  dateOfBirth: z.iso.date().optional(),
  /** ISO date string YYYY-MM-DD */
  joiningDate: z.iso.date().optional(),
  avatarUrl: z.string().max(500).optional(),
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

