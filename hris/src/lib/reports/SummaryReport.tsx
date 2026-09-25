import { Document, Page, View, Text } from '@react-pdf/renderer';
import { BrandHeader, BrandFooter, Section, Stat, styles } from './theme';

export interface SummaryReportInput {
  employeeName: string;
  employeeEmail: string;
  employeeIdCode: string | null;
  role: string;
  department: string | null;
  designation: string | null;
  cycleYear: number;
  balance: {
    casualTotal: number;
    casualUsed: number;
    casualPending: number;
    sickTotal: number;
    sickUsed: number;
    sickPending: number;
    replacementBalance: number;
  };
  attendance: {
    monthLabel: string;
    presentDays: number;
    workDays: number;
    workedMinutes: number;
    overtimeMinutes: number;
    absentDays: number;
  };
  leaves: {
    approved: number;
    pending: number;
    rejected: number;
    totalDaysUsed: number;
  };
  logoDataUrl: string;
  generatedAt: string;
}

function fmtMinutes(m: number): string {
  if (!m) return '0h';
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export function SummaryReport(input: SummaryReportInput) {
  const b = input.balance;
  const casualLeft = b.casualTotal - b.casualUsed - b.casualPending;
  const sickLeft = b.sickTotal - b.sickUsed - b.sickPending;
  const a = input.attendance;
  const rate = a.workDays === 0 ? 0 : Math.round((a.presentDays / a.workDays) * 100);
  const utilization = b.casualTotal + b.sickTotal === 0 ? 0 : Math.round((input.leaves.totalDaysUsed / (b.casualTotal + b.sickTotal)) * 100);

  return (
    <Document
      title={`Performance Summary — ${input.employeeName} — Cycle ${input.cycleYear}`}
      author="TRACE HRMS"
      subject={`Cycle performance summary for ${input.employeeName}`}
    >
      <Page size="A4" style={styles.page}>
        <BrandHeader
          title="Performance Summary"
          metaLabel="Cycle"
          metaValue={String(input.cycleYear)}
          logoDataUrl={input.logoDataUrl}
        />

        <View style={styles.body}>
          <Section title="Employee profile">
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
              {input.designation ? (
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Designation</Text>
                  <Text style={styles.kvValue}>{input.designation}</Text>
                </View>
              ) : null}
              {input.department ? (
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Department</Text>
                  <Text style={styles.kvValue}>{input.department}</Text>
                </View>
              ) : null}
            </View>
          </Section>

          <Section title="Headline metrics">
            <View style={styles.statsRow}>
              <Stat label="Attendance rate" value={`${rate}%`} hint={`${a.presentDays}/${a.workDays} working days in ${a.monthLabel}`} />
              <Stat label="Leave utilization" value={`${utilization}%`} hint={`${input.leaves.totalDaysUsed} of ${b.casualTotal + b.sickTotal} annual days`} />
              <Stat label="Overtime" value={fmtMinutes(a.overtimeMinutes)} hint={`In ${a.monthLabel}`} />
              <Stat label="Absences" value={a.absentDays} hint={`Unexcused in ${a.monthLabel}`} />
            </View>
          </Section>

          <Section title="Leave balance">
            <View style={styles.statsRow}>
              <Stat label="Casual" value={`${casualLeft}/${b.casualTotal}`} hint={`${b.casualUsed} used · ${b.casualPending} pending`} />
              <Stat label="Sick" value={`${sickLeft}/${b.sickTotal}`} hint={`${b.sickUsed} used · ${b.sickPending} pending`} />
              <Stat label="Replacement" value={String(b.replacementBalance)} hint="Earned via extra work" />
            </View>
          </Section>

          <Section title="Leave activity this cycle">
            <View style={styles.card}>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Approved requests</Text>
                <Text style={styles.kvValue}>{input.leaves.approved}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Pending review</Text>
                <Text style={styles.kvValue}>{input.leaves.pending}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Rejected</Text>
                <Text style={styles.kvValue}>{input.leaves.rejected}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Total days consumed</Text>
                <Text style={styles.kvValue}>{input.leaves.totalDaysUsed}</Text>
              </View>
            </View>
          </Section>
        </View>

        <BrandFooter generatedAt={input.generatedAt} />
      </Page>
    </Document>
  );
}
