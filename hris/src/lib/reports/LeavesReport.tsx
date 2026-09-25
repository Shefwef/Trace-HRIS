import { Document, Page, View, Text } from '@react-pdf/renderer';
import { BrandHeader, BrandFooter, Section, Stat, styles, statusBadgeStyle } from './theme';

export interface LeaveRecord {
  leaveType: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  isHalfDay: boolean;
  halfDaySlot: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  reason: string;
  status: string;
  adminNote: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface LeavesReportInput {
  employeeName: string;
  employeeEmail: string;
  employeeIdCode: string | null;
  role: string;
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
  records: LeaveRecord[];
  logoDataUrl: string;
  generatedAt: string;
}

const COLS = [
  { key: 'type', label: 'Type', width: '13%' },
  { key: 'range', label: 'Dates', width: '20%' },
  { key: 'dur', label: 'Days', width: '8%' },
  { key: 'reason', label: 'Reason', width: '25%' },
  { key: 'reviewer', label: 'Reviewer', width: '18%' },
  { key: 'status', label: 'Status', width: '16%' },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function fmtRange(r: LeaveRecord): string {
  if (r.startDate === r.endDate) {
    if (r.timeFrom && r.timeTo) return `${fmtDate(r.startDate)} ${r.timeFrom}–${r.timeTo}`;
    if (r.isHalfDay) return `${fmtDate(r.startDate)} (½ ${r.halfDaySlot?.replace('_', ' ').toLowerCase()})`;
    return fmtDate(r.startDate);
  }
  return `${fmtDate(r.startDate)} → ${fmtDate(r.endDate)}`;
}

function fmtType(t: string): string {
  return t.charAt(0) + t.slice(1).toLowerCase();
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function LeavesReport(input: LeavesReportInput) {
  const b = input.balance;
  const casualLeft = b.casualTotal - b.casualUsed - b.casualPending;
  const sickLeft = b.sickTotal - b.sickUsed - b.sickPending;

  const approved = input.records.filter((r) => r.status === 'APPROVED').length;
  const rejected = input.records.filter((r) => r.status === 'REJECTED').length;
  const pending = input.records.filter((r) => r.status === 'PENDING').length;

  return (
    <Document
      title={`Leave History — ${input.employeeName} — Cycle ${input.cycleYear}`}
      author="TRACE HRMS"
      subject={`Cycle leave history for ${input.employeeName}`}
    >
      <Page size="A4" style={styles.page}>
        <BrandHeader
          title="Leave History Report"
          metaLabel="Cycle"
          metaValue={String(input.cycleYear)}
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

          <Section title="Balance snapshot">
            <View style={styles.statsRow}>
              <Stat label="Casual" value={`${casualLeft}/${b.casualTotal}`} hint={`${b.casualUsed} used · ${b.casualPending} pending`} />
              <Stat label="Sick" value={`${sickLeft}/${b.sickTotal}`} hint={`${b.sickUsed} used · ${b.sickPending} pending`} />
              <Stat label="Replacement" value={String(b.replacementBalance)} hint="Earned via extra work" />
              <Stat label="Requests this cycle" value={input.records.length} hint={`${approved} approved · ${rejected} rejected · ${pending} pending`} />
            </View>
          </Section>

          <Section title="Requests">
            {input.records.length === 0 ? (
              <View style={styles.emptyState}>
                <Text>No leave requests submitted this cycle.</Text>
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
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((r, i) => {
                    const badge = statusBadgeStyle(r.status);
                    return (
                      <View
                        key={i}
                        style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
                        wrap={false}
                      >
                        <Text style={[styles.td, { width: COLS[0].width }]}>{fmtType(r.leaveType)}</Text>
                        <Text style={[styles.td, { width: COLS[1].width }]}>{fmtRange(r)}</Text>
                        <Text style={[styles.td, { width: COLS[2].width }]}>{r.durationDays}</Text>
                        <Text style={[styles.tdMuted, { width: COLS[3].width }]}>{truncate(r.reason, 40)}</Text>
                        <Text style={[styles.tdMuted, { width: COLS[4].width }]}>{r.reviewerName ?? '—'}</Text>
                        <View style={{ width: COLS[5].width }}>
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
