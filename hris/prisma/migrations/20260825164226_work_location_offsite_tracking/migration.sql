-- CreateEnum
CREATE TYPE "WorkLocationType" AS ENUM ('OFFICE', 'OFFSITE');

-- CreateEnum
CREATE TYPE "WorkLocationEventType" AS ENUM ('OFFICE_CLOCK_IN', 'OFFSITE_STARTED', 'RETURNED_TO_OFFICE', 'OFFSITE_LOCATION_CHANGED', 'ADMIN_CORRECTION');

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "workLocation" "WorkLocationType" NOT NULL DEFAULT 'OFFICE';

-- CreateTable
CREATE TABLE "work_location_events" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "eventType" "WorkLocationEventType" NOT NULL,
    "previousLocationType" "WorkLocationType",
    "newLocationType" "WorkLocationType" NOT NULL,
    "placeId" TEXT,
    "placeName" TEXT,
    "formattedAddress" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "purpose" VARCHAR(200),
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "autoClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_location_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_location_events_employeeId_startedAt_idx" ON "work_location_events"("employeeId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "work_location_events_attendanceId_idx" ON "work_location_events"("attendanceId");

-- CreateIndex
CREATE INDEX "work_location_events_startedAt_idx" ON "work_location_events"("startedAt");

-- AddForeignKey
ALTER TABLE "work_location_events" ADD CONSTRAINT "work_location_events_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_location_events" ADD CONSTRAINT "work_location_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_location_events" ADD CONSTRAINT "work_location_events_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rule 3: an employee has exactly ONE current work location at any moment.
--
-- Hand-written because Prisma cannot express a partial unique index. This is
-- the real guarantee: a double-submitted "Start Off-site Work" (impatient
-- double-click, retried request, two browser tabs) cannot open two concurrent
-- periods, because the second INSERT violates the constraint rather than
-- racing a SELECT-then-INSERT check in application code.
--
-- Closed periods (endedAt IS NOT NULL) are unconstrained, so history grows
-- freely.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "work_location_events_one_open_period_per_employee"
  ON "work_location_events" ("employeeId")
  WHERE "endedAt" IS NULL;
