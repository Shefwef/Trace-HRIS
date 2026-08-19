/**
 * Add a single employee to Clerk + Postgres without touching any existing user.
 *
 * Unlike `npm run db:seed`, this script:
 *   - Does NOT reset passwords for the other users
 *   - Does NOT prune anyone
 *   - Only touches the specific email passed via TARGET_EMAIL env var
 *
 * The employee's profile fields are read from SEED_USERS in prisma/seed.ts —
 * so the source of truth stays in one place. Update seed.ts first, then run
 * this script to sync the new entry into Clerk + Postgres.
 *
 * Usage:
 *   TARGET_EMAIL=res.anik@traceconsultingltd.com npx tsx scripts/add-employee.ts
 */
import { createClerkClient } from '@clerk/backend';
import { PrismaClient } from '@prisma/client';
import { SEED_USERS } from '../prisma/seed-users';

const target = process.env.TARGET_EMAIL?.toLowerCase();
if (!target) {
  console.error('❌ Set TARGET_EMAIL=<email> and re-run.');
  process.exit(1);
}

async function main() {
  const u = SEED_USERS.find((x) => x.email.toLowerCase() === target);
  if (!u) {
    console.error(`❌ ${target} is not in SEED_USERS. Add it to prisma/seed-users.ts first.`);
    process.exit(1);
  }

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const prisma = new PrismaClient();

  try {
    console.log(`\n→ Syncing ${u.fullName} (${u.email})...`);

    const existing = await clerk.users.getUserList({ emailAddress: [u.email] });
    const clerkUser =
      existing.data[0] ??
      (await clerk.users.createUser({
        emailAddress: [u.email],
        firstName: u.firstName,
        lastName: u.lastName,
        password: u.password,
        skipPasswordChecks: true,
        publicMetadata: {
          role: u.role,
          department: u.department,
          designation: u.designation,
          employeeIdCode: u.employeeIdCode,
        },
      }));

    if (existing.data.length > 0) {
      await clerk.users.updateUser(clerkUser.id, {
        firstName: u.firstName,
        lastName: u.lastName,
        publicMetadata: {
          role: u.role,
          department: u.department,
          designation: u.designation,
          employeeIdCode: u.employeeIdCode,
        },
      });
      console.log('  ✓ Clerk user already existed — metadata refreshed (password NOT reset)');
    } else {
      console.log('  ✓ Clerk user created with initial password');
    }

    const year = new Date().getFullYear();
    await prisma.user.upsert({
      where: { id: clerkUser.id },
      create: {
        id: clerkUser.id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        department: u.department,
        designation: u.designation,
        employeeIdCode: u.employeeIdCode,
        avatarUrl: u.avatarPath || null,
      },
      update: {
        fullName: u.fullName,
        role: u.role,
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
    console.log('  ✓ Postgres user + leave balance upserted');

    console.log('\n═══════════════════════════════════════════════');
    console.log('  Login credentials');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Name:       ${u.fullName}`);
    console.log(`  Role:       ${u.role}`);
    console.log(`  Email:      ${u.email}`);
    console.log(`  Password:   ${u.password}`);
    console.log('═══════════════════════════════════════════════\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
