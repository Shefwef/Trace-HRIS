import type { Role } from '@prisma/client';

export interface SeedUser {
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  /** Full set of granted roles. First entry is the display primary. */
  roles: Role[];
  department: string;
  designation: string;
  employeeIdCode: string;
  avatarPath: string;
  password: string;
}

/**
 * Source of truth for who exists in the system. `prisma/seed.ts` uses this
 * list for full re-seeds (destructive — resets passwords, prunes strays).
 * `scripts/add-employee.ts` uses it for targeted, non-destructive additions.
 *
 * Role sets under the multi-role model:
 *   Shefayat  → [SUPER_ADMIN]           technical owner
 *   Fuad      → [ADMIN]                 CEO, max non-technical power, no HR notifications
 *   Saifullah → [ADMIN, HR]             COO, gets HR notifications + admin power
 *   Tama      → [HR]                    People Operations
 *   Tanvir    → [EMPLOYEE]              general staff
 *   Rubayat   → [EMPLOYEE]              general staff
 *
 * When adding a new hire: append them here, commit, then run
 *   TARGET_EMAIL=<their-email> npx tsx scripts/add-employee.ts
 * to sync just them into Clerk + Postgres without touching anyone else.
 */
export const SEED_USERS: SeedUser[] = [
  {
    email: 'shefadib@gmail.com',
    fullName: 'Shefadib (Super Admin)',
    firstName: 'Shefadib',
    lastName: 'Admin',
    roles: ['SUPER_ADMIN'],
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
    roles: ['ADMIN'],
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
    roles: ['ADMIN', 'HR'],
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
    roles: ['HR'],
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
    roles: ['EMPLOYEE'],
    department: 'Communications',
    designation: 'Digital Content and Multimedia Specialist',
    employeeIdCode: 'TRACE-101',
    avatarPath: '/Tanvir_Kabir.jpg',
    password: 'Trace-HRIS-Tanvir-2026!',
  },
  {
    email: 'res.anik@traceconsultingltd.com',
    fullName: 'Rubayat E Shams Anik',
    firstName: 'Rubayat',
    lastName: 'Anik',
    roles: ['EMPLOYEE'],
    department: 'Policy & Research',
    designation: 'Policy, Research and Business Development Specialist',
    employeeIdCode: 'TRACE-102',
    avatarPath: '/Rubayat_E_Shams_Anik.jpg',
    password: 'Trace-HRIS-Anik-2026!',
  },
];
