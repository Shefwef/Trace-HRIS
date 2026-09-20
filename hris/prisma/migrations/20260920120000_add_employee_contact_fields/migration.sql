-- Add phone, dateOfBirth, joiningDate to users table
ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(30);
ALTER TABLE "users" ADD COLUMN "dateOfBirth" DATE;
ALTER TABLE "users" ADD COLUMN "joiningDate" DATE;
