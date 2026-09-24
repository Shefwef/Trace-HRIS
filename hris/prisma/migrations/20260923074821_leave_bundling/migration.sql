-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "bundleId" TEXT,
ADD COLUMN     "perDayAllocation" JSONB;

-- CreateIndex
CREATE INDEX "leave_requests_bundleId_idx" ON "leave_requests"("bundleId");
