/**
 * Seed the 5 real users into Clerk + Postgres — each with a known initial
 * password so you can share credentials, and they can reset from Clerk's UI
 * later.
 *
 * Idempotent: existing Clerk users get their metadata refreshed and password
 * re-applied. Mock/demo users that don't match the allowlist are removed.
 *
 * Usage:
 *   npm run db:seed
 */
import { createClerkClient } from '@clerk/backend';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

interface SeedUser {
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  role: Role;
  department: string;
  designation: string;
  employeeIdCode: string;
  avatarPath: string;
  password: string;
}

// Fixed initial passwords. Each user should reset from Clerk on first sign-in
// via "Change password". Passwords are long + memorable but not guessable.
const SEED_USERS: SeedUser[] = [
  {
    email: 'shefadib@gmail.com',
    fullName: 'Shefadib (Super Admin)',
    firstName: 'Shefadib',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
    department: 'Engineering',
    designation: 'System Administrator',
    employeeIdCode: 'SUPER-001',
    avatarPath: '',
    password: 'Trace-HRIS-Super-2026!',
  },
  {
    email: 'fuad.khalid@traceconsultingltd.com',
    fullName: 'Fuad M Khalid Hossen',
    firstName: 'Fuad',
    lastName: 'Hossen',
    role: 'ADMIN',
    department: 'Executive',
    designation: 'Chief Executive Officer',
    employeeIdCode: 'TRACE-001',
    avatarPath: '/Fuad-M-Khalid-Hossen.png',
    password: 'Trace-HRIS-Fuad-2026!',
  },
  {
    email: 'asmsaifullah@traceconsultingltd.com',
    fullName: 'Abu Saleh Muhammad Saifullah',
    firstName: 'Abu Saleh',
    lastName: 'Saifullah',
    role: 'HR',
    department: 'People Operations',
    designation: 'Director & Chief Operating Officer',
    employeeIdCode: 'TRACE-002',
    avatarPath: '/Abu-Saleh_Muhammad-Saifullah.png',
    password: 'Trace-HRIS-Saifullah-2026!',
  },
  {
    email: 'umtama@traceconsultingltd.com',
    fullName: 'Umme Mahbuba Tama',
    firstName: 'Umme',
    lastName: 'Tama',
    role: 'HR',
    department: 'People Operations',
    designation: 'Research Associate',
    employeeIdCode: 'TRACE-003',
    avatarPath: '/Umme-Mahmuda-Tama.jpg',
    password: 'Trace-HRIS-Tama-2026!',
  },
  {
    email: 'tanvir.kabir@traceconsultingltd.com',
    fullName: 'Tanvir Kabir',
    firstName: 'Tanvir',
    lastName: 'Kabir',
    role: 'EMPLOYEE',
    department: 'Communications',
    designation: 'Digital Content and Multimedia Specialist',
    employeeIdCode: 'TRACE-101',
    avatarPath: '/Tanvir_Kabir.jpg',
    password: 'Trace-HRIS-Tanvir-2026!',
  },
];

async function findOrCreateClerkUser(u: SeedUser) {
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
        role: u.role,
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
      role: u.role,
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

  await prisma.user.upsert({
    where: { id: clerkId },
    create: {
      id: clerkId,
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
    console.log(`\n• ${u.fullName} (${u.role})`);
    const clerkUser = await findOrCreateClerkUser(u);
    await upsertDbUser(clerkUser.id, u);
    console.log(`  ✓ Postgres user upserted`);
  }

  console.log('\n✅ Seed complete!\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔐  INITIAL LOGIN CREDENTIALS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Sign-in URL:    http://localhost:3000/sign-in');
  console.log('  Sign-in URL:    <your-production-domain>/sign-in\n');
  for (const u of SEED_USERS) {
    console.log(`  ${u.role.padEnd(11)}  ${u.fullName}`);
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
