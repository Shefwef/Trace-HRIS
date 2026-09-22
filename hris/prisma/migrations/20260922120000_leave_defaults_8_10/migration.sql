-- New annual entitlements: 8 casual, 10 sick.
-- Change the column defaults for future rows.
ALTER TABLE "leave_balances" ALTER COLUMN "casualTotal" SET DEFAULT 8.0;
ALTER TABLE "leave_balances" ALTER COLUMN "sickTotal"   SET DEFAULT 10.0;

-- Backfill: apply the new totals to every existing cycle so current employees
-- see the corrected balance immediately. Used/pending days are preserved.
UPDATE "leave_balances" SET "casualTotal" = 8.0  WHERE "casualTotal" = 12.0;
UPDATE "leave_balances" SET "sickTotal"   = 10.0 WHERE "sickTotal"   = 12.0;
