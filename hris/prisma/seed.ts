/**
 * Full re-seed: push every user in `prisma/seed-users.ts` into Clerk + Postgres,
 * each with a known initial password so credentials can be shared and reset from
 * Clerk's UI later. Also seeds SystemSettings and the RolePermission defaults.
 *
 * DESTRUCTIVE. Re-applies the hardcoded password to every existing account
 * (`skipPasswordChecks: true`) and deletes any Clerk/Postgres user whose email
 * is not in the allowlist. To refresh roles, photos and permissions WITHOUT
 * touching passwords or pruning anyone, run `npm run db:sync-roles` instead.
 *
 * Usage:
 *   npm run db:seed
 */
import { createClerkClient } from '@clerk/backend';
import { PrismaClient } from '@prisma/client';
import { SEED_USERS, type SeedUser } from './seed-users';
import { primaryRole } from '../src/lib/roles';
import { seedPermissionDefaults } from '../src/lib/permissions';

const prisma = new PrismaClient();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

async function findOrCreateClerkUser(u: SeedUser) {
  const primary = primaryRole(u.roles);
  const existing = await clerk.users.getUserList({ emailAddress: [u.email] });
  if (existing.data.length > 0) {
    const clerkUser = existing.data[0];
    console.log(`  ✓ Clerk user exists: ${u.email}`);
    // Refresh metadata + password
    await clerk.users.updateUser(clerkUser.id, {
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
    console.log('    metadata + password refreshed');
    return clerkUser;
  }
  console.log(`  → Creating Clerk user for ${u.email}...`);
  const created = await clerk.users.createUser({
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
  return created;
}

async function upsertDbUser(clerkId: string, u: SeedUser) {
  const year = new Date().getFullYear();
  const cycleStartDate = new Date(year, 0, 1);
  const cycleEndDate = new Date(year, 11, 31);
  const primary = primaryRole(u.roles);

  await prisma.user.upsert({
    where: { id: clerkId },
    create: {
      id: clerkId,
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
    where: { employeeId_cycleYear: { employeeId: clerkId, cycleYear: year } },
    create: {
      employeeId: clerkId,
      cycleYear: year,
      cycleStartDate,
      cycleEndDate,
    },
    update: {},
  });
}

async function pruneStrayUsers() {
  const allowedEmails = new Set(SEED_USERS.map((u) => u.email.toLowerCase()));
  const list = await clerk.users.getUserList({ limit: 100 });
  let removed = 0;
  for (const u of list.data) {
    const email = u.emailAddresses[0]?.emailAddress.toLowerCase();
    if (email && !allowedEmails.has(email)) {
      console.log(`  ✗ Deleting stray Clerk user ${email}`);
      await clerk.users.deleteUser(u.id);
      await prisma.user.deleteMany({ where: { id: u.id } });
      removed++;
    }
  }
  if (removed === 0) console.log('  ✓ No stray Clerk users');
  else console.log(`  ✓ Removed ${removed} stray Clerk user(s)`);
}

async function pruneStrayDbUsers() {
  const allowedEmails = SEED_USERS.map((u) => u.email.toLowerCase());
  const del = await prisma.user.deleteMany({
    where: { email: { notIn: allowedEmails } },
  });
  console.log(`  ✓ Removed ${del.count} stray Postgres user(s)`);
}

async function seedSystemSettings() {
  await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      senderEmail: 'shefadib@gmail.com',
      senderName: 'Trace HRIS',
      fromEmail: 'onboarding@resend.dev',
    },
    update: {},
  });
  console.log('  ✓ System settings ready');
}

async function main() {
  console.log('\n🌱 Seeding Trace HRIS...\n');

  console.log('System settings:');
  await seedSystemSettings();

  console.log('\nPruning stray users:');
  await pruneStrayUsers();
  await pruneStrayDbUsers();

  console.log('\nSeeding users:');
  for (const u of SEED_USERS) {
    const roleLabel = u.roles ? u.roles.join('+') : 'EMPLOYEE';
    console.log(`\n• ${u.fullName} (${roleLabel})`);
    const clerkUser = await findOrCreateClerkUser(u);
    await upsertDbUser(clerkUser.id, u);
    console.log(`  ✓ Postgres user upserted`);
  }

  // Role permission defaults — idempotent, only inserts combos that are missing.
  // Without this a fresh database has an empty role_permissions table and the
  // Permissions screen falls back to DEFAULT_MATRIX with nothing stored to edit.
  console.log('\nSeeding role permission defaults:');
  const seededPerms = await seedPermissionDefaults();
  console.log(`  ✓ ${seededPerms} new permission row(s) created`);

  console.log('\n✅ Seed complete!\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔐  INITIAL LOGIN CREDENTIALS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Sign-in URL:    http://localhost:3000/sign-in');
  console.log('  Sign-in URL:    <your-production-domain>/sign-in\n');
  for (const u of SEED_USERS) {
    const roleLabel = u.roles ? u.roles.join('+') : 'EMPLOYEE';
    console.log(`  ${roleLabel.padEnd(16)}  ${u.fullName}`);
    console.log(`               Email:     ${u.email}`);
    console.log(`               Password:  ${u.password}`);
    console.log('');
  }
  console.log('  Users can change their password after signing in via');
  console.log('  Clerk\'s "Manage account" screen (top-right avatar menu).');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
