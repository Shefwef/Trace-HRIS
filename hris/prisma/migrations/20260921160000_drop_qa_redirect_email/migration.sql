-- Drop the QA redirect column. All email now goes to the real recipient.
ALTER TABLE "system_settings" DROP COLUMN IF EXISTS "qaRedirectEmail";
