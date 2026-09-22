-- Add phone, dateOfBirth, joiningDate to users table
ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(30);
ALTER TABLE "users" ADD COLUMN "date_of_birth" DATE;
ALTER TABLE "users" ADD COLUMN "joining_date" DATE;
