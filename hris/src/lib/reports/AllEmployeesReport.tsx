import { Document, Page, View, Text } from '@react-pdf/renderer';
import { BrandHeader, BrandFooter, Section, Stat, styles } from './theme';

export interface EmployeeRow {
  name: string;
  email: string;
  role: string;
  department: string | null;
  casualUsed: number;
  casualTotal: number;
  sickUsed: number;
  sickTotal: number;
  replacementBalance: number;
  approvedLeaves: number;
  pendingLeaves: number;
  attendanceRate: number | null;
  overtimeMinutes: number;
}

export interface AllEmployeesReportInput {
  cycleYear: number;
  monthLabel: string;
  totalEmployees: number;
  totalActiveLeaves: number;
  totalPendingRequests: number;
  rows: EmployeeRow[];
  logoDataUrl: string;
  generatedAt: string;
}

const COLS = [
  { key: 'name', label: 'Employee', width: '22%' },
  { key: 'role', label: 'Role', width: '11%' },
  { key: 'dept', label: 'Department', width: '15%' },
  { key: 'casual', label: 'Casual', width: '10%' },
  { key: 'sick', label: 'Sick', width: '10%' },
  { key: 'repl', label: 'Repl.', width: '7%' },
  { key: 'rate', label: 'Attn.', width: '9%' },
  { key: 'ot', label: 'OT', width: '8%' },
  { key: 'pend', label: 'Pend', width: '8%' },
];

function fmtHours(m: number): string {
  return `${(m / 60).toFixed(1)}h`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function AllEmployeesReport(input: AllEmployeesReportInput) {
  return (
    <Document
      title={`All Employees — Cycle ${input.cycleYear}`}
      author="TRACE HRMS"
      subject={`Company-wide cycle report`}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <BrandHeader
          title="Company Cycle Report"
          metaLabel="Cycle · Attendance month"
          metaValue={`${input.cycleYear} · ${input.monthLabel}`}
          logoDataUrl={input.logoDataUrl}
        />

        <View style={styles.body}>
          <Section title="Company summary">
            <View style={styles.statsRow}>
              <Stat label="Employees" value={input.totalEmployees} hint="Active accounts" />
              <Stat label="Approved leaves" value={input.totalActiveLeaves} hint={`This cycle (${input.cycleYear})`} />
              <Stat label="Pending review" value={input.totalPendingRequests} hint="Awaiting a decision" />
              <Stat label="Attendance month" value={input.monthLabel} hint="Rate and overtime scope" />
            </View>
          </Section>

          <Section title="Per-employee breakdown">
            {input.rows.length === 0 ? (
              <View style={styles.emptyState}>
                <Text>No employees in the system.</Text>
              </View>
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                  {COLS.map((c) => (
                    <Text key={c.key} style={[styles.th, { width: c.width }]}>{c.label}</Text>
                  ))}
                </View>
                {input.rows.map((r, i) => (
                  <View
                    key={r.email}
                    style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
                    wrap={false}
                  >
                    <View style={{ width: COLS[0].width }}>
                      <Text style={styles.td}>{truncate(r.name, 30)}</Text>
                      <Text style={styles.tdMuted}>{truncate(r.email, 32)}</Text>
                    </View>
                    <Text style={[styles.td, { width: COLS[1].width }]}>{r.role}</Text>
                    <Text style={[styles.tdMuted, { width: COLS[2].width }]}>{truncate(r.department ?? '—', 22)}</Text>
                    <Text style={[styles.td, { width: COLS[3].width }]}>{r.casualUsed}/{r.casualTotal}</Text>
                    <Text style={[styles.td, { width: COLS[4].width }]}>{r.sickUsed}/{r.sickTotal}</Text>
                    <Text style={[styles.td, { width: COLS[5].width }]}>{r.replacementBalance}</Text>
                    <Text style={[styles.td, { width: COLS[6].width }]}>{r.attendanceRate == null ? '—' : `${r.attendanceRate}%`}</Text>
                    <Text style={[styles.tdMuted, { width: COLS[7].width }]}>{fmtHours(r.overtimeMinutes)}</Text>
                    <Text style={[styles.td, { width: COLS[8].width }]}>{r.pendingLeaves}</Text>
                  </View>
                ))}
              </View>
            )}
          </Section>
        </View>

        <BrandFooter generatedAt={input.generatedAt} />
      </Page>
    </Document>
  );
}
