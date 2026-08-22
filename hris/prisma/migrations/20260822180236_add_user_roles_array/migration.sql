-- Add multi-role column. Each user can hold more than one Role at once
-- (e.g. a COO who is both ADMIN and HR). Reads should treat `roles` as
-- the source of truth for permissions; the older `role` column is kept
-- denormalized to the highest-ranked entry for display purposes.

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "roles" "Role"[] DEFAULT ARRAY[]::"Role"[];

-- Backfill: seed every existing row's `roles` from its single `role`.
UPDATE "users"
SET "roles" = ARRAY["role"]::"Role"[]
WHERE cardinality("roles") = 0;
