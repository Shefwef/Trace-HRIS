/**
 * Idempotent: sync every seeded user's `role` + `roles` fields to match
 * prisma/seed-users.ts. Does not touch passwords, does not prune. Safe
 * to run any time the role sets change.
 *
 *   npx tsx --env-file=.env.local scripts/sync-roles.ts
 */
import { createClerkClient } from '@clerk/backend';
import { PrismaClient } from '@prisma/client';
import { SEED_USERS } from '../prisma/seed-users';
import { primaryRole } from '../src/lib/roles';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
const prisma = new PrismaClient();

async function main() {
  for (const u of SEED_USERS) {
    const primary = primaryRole(u.roles);
    process.stdout.write(`→ ${u.fullName.padEnd(32)} roles=[${u.roles.join(', ')}] primary=${primary}\n`);

    const list = await clerk.users.getUserList({ emailAddress: [u.email] });
    if (list.data.length === 0) {
      console.log('  ✗ Not in Clerk — skipping.');
      continue;
    }
    const clerkUser = list.data[0];

    await clerk.users.updateUser(clerkUser.id, {
      publicMetadata: {
        role: primary,
        roles: u.roles,
        department: u.department,
        designation: u.designation,
        employeeIdCode: u.employeeIdCode,
      },
    });

    await prisma.user.update({
      where: { id: clerkUser.id },
      data: {
        role: primary,
        roles: u.roles,
        department: u.department,
        designation: u.designation,
        employeeIdCode: u.employeeIdCode,
      },
    });

    console.log('  ✓ Clerk + Postgres synced');
  }
  await prisma.$disconnect();
  console.log('\n✅ Done.');
}

main().catch(async (e) => {
  console.error('❌ sync-roles failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
