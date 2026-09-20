-- Rename columns from snake_case to camelCase to match Prisma schema field names
ALTER TABLE "users" RENAME COLUMN "date_of_birth" TO "dateOfBirth";
ALTER TABLE "users" RENAME COLUMN "joining_date" TO "joiningDate";
