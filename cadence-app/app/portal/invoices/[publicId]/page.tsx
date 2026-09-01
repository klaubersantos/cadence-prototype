import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { portalFetch } from '@/lib/engine/access';
import { notesFor } from '@/lib/engine/notes';
import { fmtDate, fmtStamp, money } from '@/lib/format';
import { Card, PageHead, StateBadge, Uid } from '@/components/ui';
import { payInvoiceAction } from '../../actions';

export default async function PortalInvoiceDetailPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const session = await auth();
  const studentId = session!.user.id;

  const result = await prisma.$transaction((tx) => portalFetch(tx, 'invoice', publicId, studentId));

  if (!result.ok) {
    return (
      <>
        <PageHead title="Invoice" />
        <div className="refusal">
          <b>{result.error}</b>
        </div>
        <Link className="btn primary" href="/portal/invoices">
          Back to invoices
        </Link>
      </>
    );
  }

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: result.value.id },
    include: { lines: true, receipts: true, snapshots: { orderBy: { seq: 'desc' } } },
  });
  const notes = await notesFor(prisma, 'INVOICE', invoice.id, 'STUDENT');

  return (
    <>
      <PageHead
        title={`Invoice ${invoice.publicId}`}
        lede={`Issued ${fmtDate(invoice.issuedAt)} · due ${fmtDate(invoice.dueAt)}`}
        actions={
          <>
            {invoice.snapshots[0] && (
              <a className="btn" href={`/api/portal/invoices/${invoice.publicId}/pdf`} target="_blank" rel="noopener noreferrer">
                Download {invoice.status === 'PAID' ? 'receipt' : 'PDF'}
              </a>
            )}
            {invoice.status === 'ISSUED' && (
              <form action={payInvoiceAction}>
                <input type="hidden" name="id" value={invoice.id} />
                <button className="btn brass" type="submit">
                  Pay with Stripe
                </button>
              </form>
            )}
            <Link className="btn" href="/portal/invoices">
              Back
            </Link>
          </>
        }
      />

      <Card title="Lines" tight>
        <table>
          <thead>
            <tr>
              <th>Lesson</th>
              <th>Date</th>
              <th>State at issue</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((ln) => (
              <tr key={ln.id}>
                <td>{ln.lessonPublicId ? <Uid id={ln.lessonPublicId} /> : <span className="tiny">{ln.periodLabel}</span>}</td>
                <td className="tiny mono">{ln.date ? fmtDate(ln.date) : '—'}</td>
                <td>{ln.stateAtIssue ? <StateBadge state={ln.stateAtIssue} /> : <span className="badge b-neutral">Period</span>}</td>
                <td className="num">{money(ln.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600, padding: '10px 16px' }}>
                Total
              </td>
              <td className="num" style={{ fontWeight: 600, padding: '10px 16px' }}>
                {money(invoice.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {invoice.receipts[0] && (
        <Card title="Receipt">
          <Uid id={invoice.receipts[0].publicId} />
        </Card>
      )}

      {invoice.snapshots.length > 0 && (
        <Card title="PDF history" tight>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Generated</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoice.snapshots.map((sn) => (
                <tr key={sn.id}>
                  <td className="mono">{sn.seq}</td>
                  <td className="tiny mono">{fmtStamp(sn.at)}</td>
                  <td className="num">{money(sn.total)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <a
                      className="btn sm"
                      href={`/api/portal/invoices/${invoice.publicId}/pdf?seq=${sn.seq}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {notes.length > 0 && (
        <Card title="Notes from your teacher">
          {notes.map((n) => (
            <div key={n.id} className="note">
              {n.content}
              <div className="tiny muted" style={{ marginTop: 4 }}>
                {fmtStamp(n.createdAt)}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
