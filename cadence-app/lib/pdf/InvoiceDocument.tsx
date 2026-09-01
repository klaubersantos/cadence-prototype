import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import { fmtDate } from '@/lib/format';

// Reproduces cadence-prototype/js/app.js's pdfModal (lines 236-257) as an
// actual rendered PDF instead of an on-screen mockup. Colors match the
// design tokens in app/globals.css (ink/graphite/brass/hair).

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#17202B' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  studioName: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  studioLocation: { fontSize: 9, color: '#7B8697', marginTop: 2 },
  docTypeBlock: { marginLeft: 'auto', alignItems: 'flex-end' },
  docType: { fontSize: 13 },
  publicId: { fontSize: 10, color: '#A87B2E', fontFamily: 'Helvetica-Bold', marginTop: 2 },
  hr: { borderBottomWidth: 1, borderBottomColor: '#D8DDE4', marginVertical: 14 },
  metaRow: { flexDirection: 'row', marginBottom: 14 },
  metaCol: { flex: 1 },
  metaLabel: { fontSize: 8, color: '#7B8697', textTransform: 'uppercase', marginBottom: 3 },
  metaValue: { fontSize: 10 },
  metaSub: { fontSize: 8, color: '#7B8697', marginTop: 1 },
  table: { borderTopWidth: 1, borderTopColor: '#D8DDE4' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E8ECF1', paddingVertical: 6 },
  thRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#D8DDE4' },
  th: { fontSize: 8, color: '#7B8697', textTransform: 'uppercase' },
  colCovers: { flex: 3 },
  colDate: { flex: 2 },
  colAmount: { flex: 2, textAlign: 'right' },
  totalRow: { flexDirection: 'row', paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: '#17202B' },
  totalLabel: { flex: 5, textAlign: 'right', fontFamily: 'Helvetica-Bold', paddingRight: 8 },
  totalValue: { flex: 2, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  note: { marginTop: 20, fontSize: 8.5, color: '#4A5567', lineHeight: 1.4 },
});

type SnapshotLine = {
  lessonPublicId?: string | null;
  periodLabel?: string | null;
  date?: string | Date | null;
  total: number;
  policyNote?: string;
};

export function InvoiceDocument({
  studioName,
  studioLocation,
  publicId,
  isPaid,
  studentName,
  studentEmail,
  issuedAt,
  dueAt,
  lines,
  total,
  policyNote,
}: {
  studioName: string;
  studioLocation: string;
  publicId: string;
  isPaid: boolean;
  studentName: string;
  studentEmail: string;
  issuedAt: string | Date;
  dueAt: string | Date;
  lines: SnapshotLine[];
  total: number;
  policyNote: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.studioName}>{studioName}</Text>
            <Text style={styles.studioLocation}>{studioLocation}</Text>
          </View>
          <View style={styles.docTypeBlock}>
            <Text style={styles.docType}>{isPaid ? 'Receipt' : 'Invoice'}</Text>
            <Text style={styles.publicId}>{publicId}</Text>
          </View>
        </View>

        <View style={styles.hr} />

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Billed to</Text>
            <Text style={styles.metaValue}>{studentName}</Text>
            <Text style={styles.metaSub}>{studentEmail}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Issued</Text>
            <Text style={styles.metaValue}>{fmtDate(issuedAt)}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Due</Text>
            <Text style={styles.metaValue}>{fmtDate(dueAt)}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thRow}>
            <Text style={[styles.th, styles.colCovers]}>Covers</Text>
            <Text style={[styles.th, styles.colDate]}>Date</Text>
            <Text style={[styles.th, styles.colAmount]}>Amount</Text>
          </View>
          {lines.map((ln, i) => (
            <View style={styles.tr} key={i}>
              <Text style={styles.colCovers}>{ln.lessonPublicId ?? ln.periodLabel ?? '—'}</Text>
              <Text style={styles.colDate}>{ln.date ? fmtDate(ln.date) : '—'}</Text>
              <Text style={styles.colAmount}>${(ln.total / 100).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>${(total / 100).toFixed(2)}</Text>
        </View>

        <Text style={styles.note}>{policyNote}</Text>
      </Page>
    </Document>
  );
}
