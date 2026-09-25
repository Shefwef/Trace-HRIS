import { StyleSheet, View, Text, Image } from '@react-pdf/renderer';
import type { ReactNode } from 'react';

// Brand palette mirrored from the app's design tokens.
export const brand = {
  primary: '#2C5282',
  secondary: '#3182CE',
  accent: '#319795',
  text: '#1A202C',
  muted: '#4A5568',
  soft: '#718096',
  border: '#E2E8F0',
  bg: '#F7F9FC',
  bgSoft: '#EDF2F7',
  success: '#38A169',
  danger: '#E53E3E',
  warning: '#DD6B20',
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 60,
    paddingHorizontal: 0,
    fontSize: 10,
    color: brand.text,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  headerBar: {
    backgroundColor: brand.primary,
    color: '#ffffff',
    paddingVertical: 20,
    paddingHorizontal: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 42,
    height: 42,
    objectFit: 'contain',
  },
  headerWordmark: {
    color: '#ffffff',
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
  },
  headerMeta: {
    alignItems: 'flex-end',
  },
  headerMetaLabel: {
    color: '#ffffff',
    opacity: 0.75,
    fontSize: 8,
    letterSpacing: 1,
    marginBottom: 2,
  },
  headerMetaValue: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  accentStripe: {
    height: 4,
    backgroundColor: brand.secondary,
  },
  body: {
    paddingHorizontal: 36,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: brand.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 6,
  },
  intro: {
    fontSize: 10,
    color: brand.muted,
    lineHeight: 1.5,
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 12,
    backgroundColor: brand.bg,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3,
  },
  kvLabel: {
    color: brand.muted,
    fontSize: 9,
  },
  kvValue: {
    color: brand.text,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 6,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  statLabel: {
    fontSize: 8,
    color: brand.soft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: brand.primary,
  },
  statHint: {
    fontSize: 8,
    color: brand.muted,
    marginTop: 3,
  },
  table: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 4,
    marginBottom: 12,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: brand.bgSoft,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: brand.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRowAlt: {
    backgroundColor: '#FAFBFC',
  },
  th: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: brand.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  td: {
    fontSize: 9,
    color: brand.text,
  },
  tdMuted: {
    fontSize: 9,
    color: brand.soft,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    alignSelf: 'flex-start',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderTopWidth: 1,
    borderTopColor: brand.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: brand.soft,
  },
  emptyState: {
    padding: 24,
    textAlign: 'center',
    color: brand.soft,
    fontSize: 10,
    borderWidth: 1,
    borderColor: brand.border,
    borderStyle: 'dashed',
    borderRadius: 6,
  },
});

export function statusBadgeStyle(status: string): { color: string; backgroundColor: string } {
  switch (status.toUpperCase()) {
    case 'APPROVED':
    case 'PRESENT':
      return { color: '#166534', backgroundColor: '#DCFCE7' };
    case 'REJECTED':
    case 'ABSENT':
      return { color: '#991B1B', backgroundColor: '#FEE2E2' };
    case 'PENDING':
      return { color: '#92400E', backgroundColor: '#FEF3C7' };
    case 'CANCELLED':
    case 'WEEKEND':
    case 'HOLIDAY':
      return { color: '#475569', backgroundColor: '#E2E8F0' };
    default:
      return { color: brand.muted, backgroundColor: brand.bgSoft };
  }
}

export function BrandHeader(props: {
  title: string;
  metaLabel: string;
  metaValue: string;
  logoDataUrl: string;
}) {
  return (
    <>
      <View style={styles.headerBar} fixed>
        <View style={styles.headerLeft}>
          {props.logoDataUrl ? <Image src={props.logoDataUrl} style={styles.logo} /> : null}
          <View>
            <Text style={styles.headerWordmark}>TRACE HRMS</Text>
            <Text style={styles.headerTitle}>{props.title}</Text>
          </View>
        </View>
        <View style={styles.headerMeta}>
          <Text style={styles.headerMetaLabel}>{props.metaLabel}</Text>
          <Text style={styles.headerMetaValue}>{props.metaValue}</Text>
        </View>
      </View>
      <View style={styles.accentStripe} fixed />
    </>
  );
}

export function BrandFooter(props: { generatedAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>TRACE Consulting · Confidential · Generated {props.generatedAt}</Text>
      <Text
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

export function Kv({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </>
  );
}
