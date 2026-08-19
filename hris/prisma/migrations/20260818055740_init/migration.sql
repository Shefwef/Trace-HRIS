-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('CASUAL', 'SICK', 'REPLACEMENT');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HalfDaySlot" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEKEND');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'BIOMETRIC');

-- CreateEnum
CREATE TYPE "ExtraWorkType" AS ENUM ('FULL_DAY', 'HALF_DAY_MORNING', 'HALF_DAY_AFTERNOON');

-- CreateEnum
CREATE TYPE "ExtraWorkStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HolidayRecipients" AS ENUM ('ALL', 'HR_ONLY', 'STAFF_ONLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LEAVE_APPROVED', 'LEAVE_REJECTED', 'LEAVE_PENDING', 'EXTRA_WORK_APPROVED', 'EXTRA_WORK_REJECTED', 'EXTRA_WORK_PENDING', 'REPLACEMENT_EARNED', 'HOLIDAY_NOTICE', 'ATTENDANCE_REMINDER', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "department" TEXT,
    "designation" TEXT,
    "employeeIdCode" TEXT,
    "avatarUrl" TEXT,
    "cycleStartMonth" INTEGER NOT NULL DEFAULT 1,
    "cycleStartDay" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "cycleStartDate" DATE NOT NULL,
    "cycleEndDate" DATE NOT NULL,
    "casualTotal" DECIMAL(4,1) NOT NULL DEFAULT 12.0,
    "casualUsed" DECIMAL(4,1) NOT NULL DEFAULT 0.0,
    "casualPending" DECIMAL(4,1) NOT NULL DEFAULT 0.0,
    "sickTotal" DECIMAL(4,1) NOT NULL DEFAULT 12.0,
    "sickUsed" DECIMAL(4,1) NOT NULL DEFAULT 0.0,
    "sickPending" DECIMAL(4,1) NOT NULL DEFAULT 0.0,
    "replacementBalance" DECIMAL(4,1) NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "halfDaySlot" "HalfDaySlot",
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "durationDays" DECIMAL(4,1) NOT NULL,
    "reason" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "attachmentUrl" TEXT,
    "channels" "NotificationChannel"[] DEFAULT ARRAY['EMAIL']::"NotificationChannel"[],
    "customMessage" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_work_logs" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "workType" "ExtraWorkType" NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "ExtraWorkStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extra_work_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clockInTime" TIMESTAMP(3),
    "clockOutTime" TIMESTAMP(3),
    "totalWorkedMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalBreakMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceStatus" NOT NULL,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "biometricDeviceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_sessions" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "breakStart" TIMESTAMP(3) NOT NULL,
    "breakEnd" TIMESTAMP(3),
    "durationMinutes" INTEGER,

    CONSTRAINT "break_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "notificationScheduled" BOOLEAN NOT NULL DEFAULT true,
    "notificationSendAt" TIMESTAMP(3),
    "recipients" "HolidayRecipients" NOT NULL DEFAULT 'ALL',
    "customRecipientIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notificationSentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" TEXT NOT NULL,
    "toAddresses" TEXT[],
    "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "bodyPreview" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "senderEmail" TEXT NOT NULL DEFAULT 'shefadib@gmail.com',
    "senderName" TEXT NOT NULL DEFAULT 'Trace HRIS',
    "fromEmail" TEXT NOT NULL DEFAULT 'onboarding@resend.dev',
    "standardHoursPerDay" INTEGER NOT NULL DEFAULT 8,
    "workStartTime" TEXT NOT NULL DEFAULT '09:00',
    "workEndTime" TEXT NOT NULL DEFAULT '17:00',
    "workDaysBitmask" INTEGER NOT NULL DEFAULT 62,
    "overtimeThresholdMinutes" INTEGER NOT NULL DEFAULT 480,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeIdCode_key" ON "users"("employeeIdCode");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "leave_balances_employeeId_idx" ON "leave_balances"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employeeId_cycleYear_key" ON "leave_balances"("employeeId", "cycleYear");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_status_idx" ON "leave_requests"("employeeId", "status");

-- CreateIndex
CREATE INDEX "leave_requests_status_createdAt_idx" ON "leave_requests"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "extra_work_logs_employeeId_status_idx" ON "extra_work_logs"("employeeId", "status");

-- CreateIndex
CREATE INDEX "extra_work_logs_status_createdAt_idx" ON "extra_work_logs"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "extra_work_logs_employeeId_workDate_key" ON "extra_work_logs"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "attendance_records_employeeId_date_idx" ON "attendance_records"("employeeId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employeeId_date_key" ON "attendance_records"("employeeId", "date");

-- CreateIndex
CREATE INDEX "break_sessions_attendanceId_idx" ON "break_sessions"("attendanceId");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- CreateIndex
CREATE INDEX "notifications_recipientId_isRead_createdAt_idx" ON "notifications"("recipientId", "isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "email_log_status_createdAt_idx" ON "email_log"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_log_actorId_createdAt_idx" ON "audit_log"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_log_targetType_targetId_idx" ON "audit_log"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_work_logs" ADD CONSTRAINT "extra_work_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_work_logs" ADD CONSTRAINT "extra_work_logs_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_sessions" ADD CONSTRAINT "break_sessions_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
