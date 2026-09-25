import { Document, Page, View, Text } from '@react-pdf/renderer';
import { BrandHeader, BrandFooter, Section, Stat, styles, statusBadgeStyle } from './theme';

export interface AttendanceRecord {
  date: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  totalWorkedMinutes: number;
  totalBreakMinutes: number;
  overtimeMinutes: number;
  status: string;
}

export interface AttendanceReportInput {
  employeeName: string;
  employeeEmail: string;
  employeeIdCode: string | null;
  role: string;
  year: number;
  month: number; // 1-12
  records: AttendanceRecord[];
  logoDataUrl: string;
  generatedAt: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtMinutes(m: number): string {
  if (!m) return '0h';
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

const COLS = [
  { key: 'date', label: 'Date', width: '18%' },
  { key: 'day', label: 'Day', width: '12%' },
  { key: 'in', label: 'Clock in', width: '14%' },
  { key: 'out', label: 'Clock out', width: '14%' },
  { key: 'break', label: 'Break', width: '10%' },
  { key: 'worked', label: 'Worked', width: '10%' },
  { key: 'ot', label: 'Overtime', width: '10%' },
  { key: 'status', label: 'Status', width: '12%' },
];

export function AttendanceReport(input: AttendanceReportInput) {
  const monthName = MONTH_NAMES[input.month - 1];
  const period = `${monthName} ${input.year}`;

  const worked = input.records.reduce((s, r) => s + r.totalWorkedMinutes, 0);
  const breaks = input.records.reduce((s, r) => s + r.totalBreakMinutes, 0);
  const overtime = input.records.reduce((s, r) => s + r.overtimeMinutes, 0);
  const present = input.records.filter((r) => r.status === 'PRESENT').length;
  const workDays = input.records.filter((r) => r.status !== 'WEEKEND' && r.status !== 'HOLIDAY').length;
  const rate = workDays === 0 ? 0 : Math.round((present / workDays) * 100);

  return (
    <Document
      title={`Attendance Report — ${input.employeeName} — ${period}`}
      author="TRACE HRMS"
      subject={`Monthly attendance for ${input.employeeName}`}
    >
      <Page size="A4" style={styles.page}>
        <BrandHeader
          title="Monthly Attendance Report"
          metaLabel="Period"
          metaValue={period}
          logoDataUrl={input.logoDataUrl}
        />

        <View style={styles.body}>
          <Section title="Employee">
            <View style={styles.card}>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Name</Text>
                <Text style={styles.kvValue}>{input.employeeName}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Email</Text>
                <Text style={styles.kvValue}>{input.employeeEmail}</Text>
              </View>
              {input.employeeIdCode ? (
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Employee ID</Text>
                  <Text style={styles.kvValue}>{input.employeeIdCode}</Text>
                </View>
              ) : null}
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Role</Text>
                <Text style={styles.kvValue}>{input.role}</Text>
              </View>
            </View>
          </Section>

          <Section title="Summary">
            <View style={styles.statsRow}>
              <Stat label="Attendance rate" value={`${rate}%`} hint={`${present} of ${workDays} working days`} />
              <Stat label="Total worked" value={fmtMinutes(worked)} hint="This month" />
              <Stat label="Total breaks" value={fmtMinutes(breaks)} hint="Included above" />
              <Stat label="Overtime" value={fmtMinutes(overtime)} hint="Beyond standard hours" />
            </View>
          </Section>

          <Section title="Daily breakdown">
            {input.records.length === 0 ? (
              <View style={styles.emptyState}>
                <Text>No clocked-in sessions recorded for {period}.</Text>
              </View>
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                  {COLS.map((c) => (
                    <Text key={c.key} style={[styles.th, { width: c.width }]}>{c.label}</Text>
                  ))}
                </View>
                {input.records
                  .slice()
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((r, i) => {
                    const d = new Date(r.date);
                    const badge = statusBadgeStyle(r.status);
                    return (
                      <View
                        key={r.date}
                        style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
                        wrap={false}
                      >
                        <Text style={[styles.td, { width: COLS[0].width }]}>
                          {d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
                        </Text>
                        <Text style={[styles.tdMuted, { width: COLS[1].width }]}>
                          {d.toLocaleDateString('en-US', { weekday: 'short' })}
                        </Text>
                        <Text style={[styles.td, { width: COLS[2].width }]}>{fmtTime(r.clockInTime)}</Text>
                        <Text style={[styles.td, { width: COLS[3].width }]}>{fmtTime(r.clockOutTime)}</Text>
                        <Text style={[styles.tdMuted, { width: COLS[4].width }]}>{fmtMinutes(r.totalBreakMinutes)}</Text>
                        <Text style={[styles.td, { width: COLS[5].width }]}>{fmtMinutes(r.totalWorkedMinutes)}</Text>
                        <Text style={[styles.td, { width: COLS[6].width }]}>{fmtMinutes(r.overtimeMinutes)}</Text>
                        <View style={{ width: COLS[7].width }}>
                          <Text style={[styles.badge, badge]}>{r.status}</Text>
                        </View>
                      </View>
                    );
                  })}
              </View>
            )}
          </Section>
        </View>

        <BrandFooter generatedAt={input.generatedAt} />
      </Page>
    </Document>
  );
}
