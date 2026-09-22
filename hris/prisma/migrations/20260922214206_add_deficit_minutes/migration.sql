-- DropIndex
DROP INDEX "leave_requests_grantedById_idx";

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "deficitMinutes" INTEGER NOT NULL DEFAULT 0;
