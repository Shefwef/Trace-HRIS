import type {
  User,
  LeaveBalance,
  LeaveRequest,
  Holiday,
  AttendanceRecord,
  Notification,
} from './types';

const AVATAR_COLORS = [
  '#805AD5',
  '#DD6B20',
  '#319795',
  '#3182CE',
  '#D69E2E',
  '#E53E3E',
  '#38A169',
];

const initials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const users: User[] = [
  {
    id: 'u-nazmul',
    fullName: 'Nazmul Hasan',
    email: 'nazmul@company.com',
    role: 'EMPLOYEE',
    department: 'Engineering',
    designation: 'Software Engineer',
    employeeIdCode: 'EMP-2041',
    avatarColor: AVATAR_COLORS[0],
    initials: initials('Nazmul Hasan'),
    cycleStartMonth: 1,
    cycleStartDay: 1,
  },
  {
    id: 'u-fatima',
    fullName: 'Fatima Khan',
    email: 'fatima@company.com',
    role: 'ADMIN',
    department: 'People Operations',
    designation: 'HR Manager',
    employeeIdCode: 'EMP-1002',
    avatarColor: AVATAR_COLORS[2],
    initials: initials('Fatima Khan'),
    cycleStartMonth: 1,
    cycleStartDay: 1,
  },
  {
    id: 'u-rafiq',
    fullName: 'Rafiq Ahmed',
    email: 'rafiq@company.com',
    role: 'ADMIN',
    department: 'Executive',
    designation: 'CEO',
    employeeIdCode: 'EMP-1001',
    avatarColor: AVATAR_COLORS[3],
    initials: initials('Rafiq Ahmed'),
    cycleStartMonth: 1,
    cycleStartDay: 1,
  },
  {
    id: 'u-priya',
    fullName: 'Priya Sharma',
    email: 'priya@company.com',
    role: 'EMPLOYEE',
    department: 'Design',
    designation: 'Product Designer',
    employeeIdCode: 'EMP-2103',
    avatarColor: AVATAR_COLORS[1],
    initials: initials('Priya Sharma'),
    cycleStartMonth: 7,
    cycleStartDay: 1,
  },
  {
    id: 'u-arif',
    fullName: 'Arif Chowdhury',
    email: 'arif@company.com',
    role: 'EMPLOYEE',
    department: 'Sales',
    designation: 'Account Executive',
    employeeIdCode: 'EMP-2110',
    avatarColor: AVATAR_COLORS[4],
    initials: initials('Arif Chowdhury'),
    cycleStartMonth: 1,
    cycleStartDay: 1,
  },
  {
    id: 'u-mira',
    fullName: 'Mira Rahman',
    email: 'mira@company.com',
    role: 'EMPLOYEE',
    department: 'Engineering',
    designation: 'Backend Engineer',
    employeeIdCode: 'EMP-2077',
    avatarColor: AVATAR_COLORS[5],
    initials: initials('Mira Rahman'),
    cycleStartMonth: 2,
    cycleStartDay: 1,
  },
  {
    id: 'u-tahmid',
    fullName: 'Tahmid Islam',
    email: 'tahmid@company.com',
    role: 'EMPLOYEE',
    department: 'Marketing',
    designation: 'Marketing Lead',
    employeeIdCode: 'EMP-2125',
    avatarColor: AVATAR_COLORS[6],
    initials: initials('Tahmid Islam'),
    cycleStartMonth: 1,
    cycleStartDay: 1,
  },
];

export const initialBalances: LeaveBalance[] = users
  .filter((u) => u.role === 'EMPLOYEE' || u.role === 'ADMIN')
  .map((u) => ({
    employeeId: u.id,
    cycleYear: 2026,
    cycleStartDate: '2026-01-01',
    cycleEndDate: '2026-12-31',
    casualTotal: 12,
    casualUsed:
      u.id === 'u-nazmul' ? 4 : u.id === 'u-priya' ? 2 : u.id === 'u-arif' ? 7 : 3,
    casualPending: u.id === 'u-nazmul' ? 3 : 0,
    sickTotal: 12,
    sickUsed:
      u.id === 'u-nazmul' ? 0 : u.id === 'u-mira' ? 5 : u.id === 'u-arif' ? 2 : 1,
    sickPending: 0,
    replacementBalance: u.id === 'u-nazmul' ? 2 : u.id === 'u-mira' ? 1 : 0,
    overtimeHoursBank: u.id === 'u-nazmul' ? 3 : 0,
  }));

const iso = (date: string) => new Date(date).toISOString();

export const initialRequests: LeaveRequest[] = [
  {
    id: 'lr-01',
    employeeId: 'u-nazmul',
    leaveType: 'CASUAL',
    startDate: '2026-08-20',
    endDate: '2026-08-22',
    isHalfDay: false,
    durationDays: 3,
    reason: 'Family event',
    description:
      "My sister's wedding is scheduled that week and I need to travel to attend the ceremony and support family.",
    channels: ['EMAIL', 'IN_APP'],
    status: 'PENDING',
    createdAt: iso('2026-08-15T10:34:00'),
    updatedAt: iso('2026-08-15T10:34:00'),
  },
  {
    id: 'lr-02',
    employeeId: 'u-priya',
    leaveType: 'SICK',
    startDate: '2026-08-18',
    endDate: '2026-08-18',
    isHalfDay: false,
    durationDays: 1,
    reason: 'Migraine',
    description: 'Severe migraine — will consult a doctor and rest.',
    channels: ['EMAIL'],
    status: 'PENDING',
    createdAt: iso('2026-08-17T08:12:00'),
    updatedAt: iso('2026-08-17T08:12:00'),
  },
  {
    id: 'lr-03',
    employeeId: 'u-arif',
    leaveType: 'CASUAL',
    startDate: '2026-08-24',
    endDate: '2026-08-26',
    isHalfDay: false,
    durationDays: 3,
    reason: 'Personal travel',
    description: 'Family trip planned months in advance.',
    channels: ['EMAIL', 'IN_APP'],
    status: 'PENDING',
    createdAt: iso('2026-08-16T14:20:00'),
    updatedAt: iso('2026-08-16T14:20:00'),
  },
  {
    id: 'lr-04',
    employeeId: 'u-nazmul',
    leaveType: 'SICK',
    startDate: '2026-08-03',
    endDate: '2026-08-04',
    isHalfDay: false,
    durationDays: 2,
    reason: 'Fever',
    description: 'Down with fever, will rest and recover.',
    channels: ['EMAIL'],
    status: 'APPROVED',
    adminNote: 'Take care and rest well.',
    reviewedBy: 'u-fatima',
    reviewedAt: iso('2026-08-02T15:00:00'),
    createdAt: iso('2026-08-01T09:30:00'),
    updatedAt: iso('2026-08-02T15:00:00'),
  },
  {
    id: 'lr-05',
    employeeId: 'u-nazmul',
    leaveType: 'CASUAL',
    startDate: '2026-07-15',
    endDate: '2026-07-15',
    isHalfDay: true,
    halfDaySlot: 'AFTERNOON',
    durationDays: 0.5,
    reason: 'Dental appointment',
    channels: ['EMAIL'],
    status: 'APPROVED',
    reviewedBy: 'u-fatima',
    reviewedAt: iso('2026-07-14T11:00:00'),
    createdAt: iso('2026-07-13T16:00:00'),
    updatedAt: iso('2026-07-14T11:00:00'),
  },
  {
    id: 'lr-06',
    employeeId: 'u-nazmul',
    leaveType: 'CASUAL',
    startDate: '2026-06-10',
    endDate: '2026-06-12',
    isHalfDay: false,
    durationDays: 3,
    reason: 'Short vacation',
    channels: ['EMAIL'],
    status: 'REJECTED',
    adminNote:
      'Team release week — please reschedule to a period without a major delivery.',
    reviewedBy: 'u-fatima',
    reviewedAt: iso('2026-06-05T10:00:00'),
    createdAt: iso('2026-06-04T09:15:00'),
    updatedAt: iso('2026-06-05T10:00:00'),
  },
];

export const initialHolidays: Holiday[] = [
  {
    id: 'h-01',
    name: 'Independence Day',
    date: '2026-03-26',
    isRecurring: true,
    description: 'National Independence Day observance.',
    notificationScheduled: true,
    recipients: 'ALL',
    notificationSentAt: iso('2026-03-25T10:00:00'),
  },
  {
    id: 'h-02',
    name: 'Eid ul-Fitr',
    date: '2026-09-12',
    isRecurring: true,
    description: 'Eid ul-Fitr celebrations.',
    notificationScheduled: true,
    notificationSendAt: iso('2026-09-11T10:00:00'),
    recipients: 'ALL',
  },
  {
    id: 'h-03',
    name: 'Victory Day',
    date: '2026-12-16',
    isRecurring: true,
    notificationScheduled: true,
    recipients: 'ALL',
  },
  {
    id: 'h-04',
    name: "Company Founder's Day",
    date: '2026-11-04',
    isRecurring: false,
    description: 'Celebrating the company founding.',
    notificationScheduled: false,
    recipients: 'ALL',
  },
];

export const initialNotifications: Notification[] = [
  {
    id: 'n-01',
    recipientId: 'u-nazmul',
    type: 'LEAVE_APPROVED',
    title: 'Your sick leave was approved',
    body: 'Fatima Khan approved your Aug 3 – Aug 4 sick leave.',
    referenceType: 'leave_request',
    referenceId: 'lr-04',
    isRead: false,
    createdAt: iso('2026-08-02T15:00:00'),
  },
  {
    id: 'n-02',
    recipientId: 'u-nazmul',
    type: 'REPLACEMENT_EARNED',
    title: 'You earned 2 replacement leave days',
    body: 'Your overtime this cycle converted into 2 replacement leave days.',
    isRead: false,
    createdAt: iso('2026-08-10T18:00:00'),
  },
  {
    id: 'n-03',
    recipientId: 'u-nazmul',
    type: 'HOLIDAY_NOTICE',
    title: 'Upcoming holiday — Eid ul-Fitr',
    body: '12 Sep 2026 will be a public holiday. The office will be closed.',
    isRead: true,
    createdAt: iso('2026-08-14T10:00:00'),
  },
  {
    id: 'n-04',
    recipientId: 'u-fatima',
    type: 'LEAVE_PENDING',
    title: '3 leave requests awaiting review',
    body: 'Nazmul, Priya and Arif have submitted leave requests.',
    isRead: false,
    createdAt: iso('2026-08-17T08:15:00'),
  },
];

// Attendance seeds for current employee (Nazmul), covering August 2026
export const initialAttendance: AttendanceRecord[] = (() => {
  const records: AttendanceRecord[] = [];
  const year = 2026;
  const month = 8; // August
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dateISO = date.toISOString().slice(0, 10);
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    if (isWeekend) {
      records.push({
        id: `att-${d}`,
        employeeId: 'u-nazmul',
        date: dateISO,
        totalWorkedMinutes: 0,
        totalBreakMinutes: 0,
        overtimeMinutes: 0,
        status: 'WEEKEND',
        source: 'MANUAL',
        breaks: [],
      });
      continue;
    }
    // Leave days
    if (d === 3 || d === 4) {
      records.push({
        id: `att-${d}`,
        employeeId: 'u-nazmul',
        date: dateISO,
        totalWorkedMinutes: 0,
        totalBreakMinutes: 0,
        overtimeMinutes: 0,
        status: 'LEAVE',
        source: 'MANUAL',
        breaks: [],
      });
      continue;
    }
    if (d > 17) {
      // future days — no record yet
      continue;
    }
    // Otherwise, present with some variation
    const workedBase = 7 * 60 + 30 + ((d * 13) % 90);
    const overtime = d % 5 === 0 ? 45 : d % 7 === 0 ? 15 : 0;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const clockInMin = (d * 2) % 15;
    const clockOutHour = 17 + Math.floor(overtime / 60);
    const clockOutMin = overtime % 60;
    records.push({
      id: `att-${d}`,
      employeeId: 'u-nazmul',
      date: dateISO,
      clockInTime: iso(`${dateISO}T09:${pad(clockInMin)}:00`),
      clockOutTime: iso(`${dateISO}T${pad(clockOutHour)}:${pad(clockOutMin)}:00`),
      totalWorkedMinutes: workedBase,
      totalBreakMinutes: 55 + ((d * 3) % 15),
      overtimeMinutes: overtime,
      status: 'PRESENT',
      source: 'MANUAL',
      breaks: [],
    });
  }
  return records;
})();
