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
    designation: 'Chief Operating Officer (COO)',
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
    designation: 'Digital Content & Multimedia Specialist',
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
  {
    email: 'mimma.afrin@traceconsultingltd.com',
    fullName: 'Mimma Afrin',
    firstName: 'Mimma',
    lastName: 'Afrin',
    roles: ['EMPLOYEE'],
    department: 'Laboratory Operations',
    designation: 'Technical Lead — Laboratory Operations',
    employeeIdCode: 'TRACE-103',
    avatarPath: '/Mimma_Afrin.png',
    password: 'Trace-HRIS-Mimma-2026!',
  },
  {
    email: 'recardo.halder@traceconsultingltd.com',
    fullName: 'Recardo Saurav Antor Halder',
    firstName: 'Recardo',
    lastName: 'Halder',
    roles: ['EMPLOYEE'],
    department: 'Business Development',
    designation: 'Manager, Business Development',
    employeeIdCode: 'TRACE-104',
    avatarPath: '/Recardo_Saurav_Antor_Haider.png',
    password: 'Trace-HRIS-Recardo-2026!',
  },
  {
    email: 'nabeel.khan@traceconsultingltd.com',
    fullName: 'Nabeel Khan',
    firstName: 'Nabeel',
    lastName: 'Khan',
    roles: ['EMPLOYEE'],
    department: 'Partnerships & Strategic Growth',
    designation: 'Head of Partnerships & Strategic Growth',
    employeeIdCode: 'TRACE-105',
    avatarPath: '/Nabeel_Khan.png',
    password: 'Trace-HRIS-Nabeel-2026!',
  },
  {
    email: 'moudud.sujan@traceconsultingltd.com',
    fullName: 'Moudud Ahmmed Sujan',
    firstName: 'Moudud',
    lastName: 'Sujan',
    roles: ['EMPLOYEE'],
    department: 'External Affairs',
    designation: 'Head of External Affairs',
    employeeIdCode: 'TRACE-106',
    avatarPath: '/Moudud_Ahmmed_Sujan.png',
    password: 'Trace-HRIS-Moudud-2026!',
  },
  {
    email: 'ahmed.nine@traceconsultingltd.com',
    fullName: 'Ahmed Julker Nine',
    firstName: 'Ahmed',
    lastName: 'Nine',
    roles: ['EMPLOYEE'],
    department: 'Policy & Research',
    designation: 'Research and Policy Analyst',
    employeeIdCode: 'TRACE-107',
    avatarPath: '/Ahmed_Julker_Nine.png',
    password: 'Trace-HRIS-Ahmed-2026!',
  },
];
