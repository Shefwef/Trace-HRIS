/**
 * Idempotent: sync every seeded user's role set, designation, department
 * and profile photo to Clerk + Postgres. Does not touch passwords, does
 * not prune. Safe to run any time the seed sets change.
 *
 * For each user in prisma/seed-users.ts we:
 *   - Ensure the Clerk account exists (create with password if new).
 *   - Refresh publicMetadata (role, roles, department, designation, id).
 *   - Upload the avatarPath image to Clerk as their profile picture.
 *   - Upsert the Postgres user + leave balance for the current cycle.
 *
 *   npx tsx --env-file=.env.local scripts/sync-roles.ts
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClerkClient } from '@clerk/backend';
import { PrismaClient } from '@prisma/client';
import { SEED_USERS } from '../prisma/seed-users';
import { primaryRole } from '../src/lib/roles';
import { seedPermissionDefaults } from '../src/lib/permissions';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
const prisma = new PrismaClient();

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function uploadClerkAvatar(clerkUserId: string, avatarPath: string): Promise<'uploaded' | 'skipped'> {
  if (!avatarPath) return 'skipped';
  const filePath = path.join(process.cwd(), 'public', avatarPath.replace(/^\/+/, ''));
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    console.log(`    ⚠ Photo not found on disk (${avatarPath}), skipping upload.`);
    return 'skipped';
  }
  const mime = mimeFor(filePath);
  const file = new File([buffer], path.basename(filePath), { type: mime });
  await clerk.users.updateUserProfileImage(clerkUserId, { file });
  return 'uploaded';
}

async function main() {
  const year = new Date().getFullYear();

  for (const u of SEED_USERS) {
    const primary = primaryRole(u.roles);
    process.stdout.write(`→ ${u.fullName.padEnd(34)} [${u.roles.join(', ')}]`);

    // 1. Clerk account
    const list = await clerk.users.getUserList({ emailAddress: [u.email] });
    let clerkUser = list.data[0];
    let clerkAction = 'existing';
    if (!clerkUser) {
      clerkUser = await clerk.users.createUser({
        emailAddress: [u.email],
        firstName: u.firstName,
        lastName: u.lastName,
        password: u.password,
        skipPasswordChecks: true,
        publicMetadata: {
          role: primary,
          roles: u.roles,
          department: u.department,
          designation: u.designation,
          employeeIdCode: u.employeeIdCode,
        },
      });
      clerkAction = 'created';
    } else {
      await clerk.users.updateUser(clerkUser.id, {
        firstName: u.firstName,
        lastName: u.lastName,
        publicMetadata: {
          role: primary,
          roles: u.roles,
          department: u.department,
          designation: u.designation,
          employeeIdCode: u.employeeIdCode,
        },
      });
    }
    process.stdout.write(` clerk(${clerkAction})`);

    // 2. Avatar upload — best effort; doesn't fail the sync
    try {
      const status = await uploadClerkAvatar(clerkUser.id, u.avatarPath);
      process.stdout.write(` avatar(${status})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      process.stdout.write(` avatar(FAILED: ${msg.slice(0, 40)})`);
    }

    // 3. Postgres user + balance
    await prisma.user.upsert({
      where: { id: clerkUser.id },
      create: {
        id: clerkUser.id,
        fullName: u.fullName,
        email: u.email,
        role: primary,
        roles: u.roles,
        department: u.department,
        designation: u.designation,
        employeeIdCode: u.employeeIdCode,
        avatarUrl: u.avatarPath || null,
      },
      update: {
        fullName: u.fullName,
        role: primary,
        roles: u.roles,
        department: u.department,
        designation: u.designation,
        employeeIdCode: u.employeeIdCode,
        avatarUrl: u.avatarPath || null,
      },
    });
    await prisma.leaveBalance.upsert({
      where: { employeeId_cycleYear: { employeeId: clerkUser.id, cycleYear: year } },
      create: {
        employeeId: clerkUser.id,
        cycleYear: year,
        cycleStartDate: new Date(year, 0, 1),
        cycleEndDate: new Date(year, 11, 31),
      },
      update: {},
    });
    console.log(' ✓');
  }

  // Seed RolePermission defaults (idempotent — only inserts missing combos)
  console.log('\n→ Seeding role permission defaults…');
  const seeded = await seedPermissionDefaults();
  console.log(`  ${seeded} new permission row(s) created.`);

  await prisma.$disconnect();
  console.log('\n✅ Sync complete.');
}

main().catch(async (e) => {
  console.error('❌ sync-roles failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
