-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'LINE_MANAGER';

-- AlterTable
ALTER TABLE "system_settings" ALTER COLUMN "workDaysBitmask" SET DEFAULT 31;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT,
ADD COLUMN     "lineManagerId" TEXT;

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permission" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permission_key" ON "role_permissions"("role", "permission");

-- CreateIndex
CREATE INDEX "users_lineManagerId_idx" ON "users"("lineManagerId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_lineManagerId_fkey" FOREIGN KEY ("lineManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
