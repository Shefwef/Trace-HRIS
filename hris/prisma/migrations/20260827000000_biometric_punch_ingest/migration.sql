-- Add MOCK to AttendanceSource enum
ALTER TYPE "AttendanceSource" ADD VALUE IF NOT EXISTS 'MOCK';

-- Add biometricUserId to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "biometricUserId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_biometricUserId_key" ON "users"("biometricUserId");

-- CreateTable: biometric_devices
CREATE TABLE IF NOT EXISTS "biometric_devices" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable: biometric_punches
CREATE TABLE IF NOT EXISTS "biometric_punches" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceUserId" TEXT NOT NULL,
    "punchedAt" TIMESTAMP(3) NOT NULL,
    "punchState" TEXT NOT NULL,
    "verifyType" INTEGER,
    "employeeId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable: biometric_sync_logs
CREATE TABLE IF NOT EXISTS "biometric_sync_logs" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received" INTEGER NOT NULL DEFAULT 0,
    "applied" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "unmapped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "biometric_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "biometric_devices_serial_key" ON "biometric_devices"("serial");
CREATE UNIQUE INDEX IF NOT EXISTS "biometric_punches_deviceId_deviceUserId_punchedAt_key" ON "biometric_punches"("deviceId", "deviceUserId", "punchedAt");
CREATE INDEX IF NOT EXISTS "biometric_punches_employeeId_punchedAt_idx" ON "biometric_punches"("employeeId", "punchedAt");

-- AddForeignKey
ALTER TABLE "biometric_punches"
    ADD CONSTRAINT "biometric_punches_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "biometric_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
