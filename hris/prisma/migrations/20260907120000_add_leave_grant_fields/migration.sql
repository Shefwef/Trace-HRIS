-- Add HR / Line Manager direct-grant fields to leave_requests.
-- When these are set, the record represents a replacement leave day
-- granted by a manager (not a normal employee request).

ALTER TABLE "leave_requests"
  ADD COLUMN "grantedById" TEXT,
  ADD COLUMN "overtimeWorkDate" DATE;

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_grantedById_fkey"
  FOREIGN KEY ("grantedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "leave_requests_grantedById_idx" ON "leave_requests"("grantedById");
