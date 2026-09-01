import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { notesFor } from '@/lib/engine/notes';
import { fmtDate, fmtStamp, money } from '@/lib/format';
import { Card, InvoiceBadge, PageHead, StateBadge, Uid } from '@/components/ui';
import { NoteList } from '@/components/NoteList';
import { alertInvoiceAction, regenerateInvoicePdfAction } from '../../actions';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { student: true, lines: true, payments: true, receipts: true, snapshots: { orderBy: { seq: 'desc' } } },
  });
  if (!invoice) notFound();
  const notes = await notesFor(prisma, 'INVOICE', invoice.id, 'TEACHER');

  const payment = invoice.payments[0];
  const receipt = invoice.receipts[0];

  return (
    <>
      <PageHead
        title={`Invoice ${invoice.publicId}`}
        lede={`${invoice.student.name} · issued ${fmtDate(invoice.issuedAt)} · due ${fmtDate(invoice.dueAt)}`}
        actions={
          <>
            {invoice.snapshots[0] && (
              <a className="btn brass" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">
                Download {invoice.status === 'PAID' ? 'receipt' : 'PDF'}
              </a>
            )}
            {invoice.status === 'ISSUED' && (
              <form action={alertInvoiceAction}>
                <input type="hidden" name="id" value={invoice.id} />
                <button className="btn" type="submit">
                  Send alert
                </button>
              </form>
            )}
            <Link className="btn" href="/invoices">
              Back
            </Link>
          </>
        }
      />

      {invoice.status === 'VOID' && (
        <div className="refusal">
          <b>This invoice is void.</b> {invoice.voidReason} Its identifier, lines and captured rates are retained and its
          number is never reused.
        </div>
      )}

      <div className="split">
        <Card title="Lines" tight hint="total equals the sum of the lines">
          <table>
            <thead>
              <tr>
                <th>Covers</th>
                <th>Date</th>
                <th>State at issue</th>
                <th className="num">Rate applied</th>
                <th className="num">Line total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((ln) => (
                <tr key={ln.id}>
                  <td>{ln.lessonPublicId ? <Uid id={ln.lessonPublicId} /> : <span className="tiny">{ln.periodLabel}</span>}</td>
                  <td className="tiny mono">{ln.date ? fmtDate(ln.date) : '—'}</td>
                  <td>{ln.stateAtIssue ? <StateBadge state={ln.stateAtIssue} /> : <span className="badge b-neutral">Period</span>}</td>
                  <td className="num">{money(ln.rate)}</td>
                  <td className="num">{money(ln.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600, padding: '10px 16px' }}>
                  Invoice total
                </td>
                <td className="num" style={{ fontWeight: 600, padding: '10px 16px' }}>
                  {money(invoice.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>

        <Card title="Status">
          <div style={{ marginBottom: 10 }}>
            <InvoiceBadge status={invoice.status} flagged={invoice.flaggedForReview} />
          </div>
          {payment ? (
            <>
              <div className="tiny muted">Payment</div>
              <div>
                <Uid id={payment.publicId} /> <span className="mono">{money(payment.amount)}</span>
                <br />
                <span className="tiny muted">
                  {fmtStamp(payment.paidAt)} · {payment.method}
                </span>
              </div>
            </>
          ) : (
            <p className="muted tiny">Not paid.</p>
          )}
          {receipt && (
            <>
              <div className="tiny muted" style={{ marginTop: 10 }}>
                Receipt
              </div>
              <div>
                <Uid id={receipt.publicId} />
              </div>
            </>
          )}
        </Card>
      </div>

      <Card
        title="PDF snapshot history"
        tight
        hint="five most recent; numbering never reused"
        head={
          <form action={regenerateInvoicePdfAction} style={{ marginLeft: 'auto' }}>
            <input type="hidden" name="id" value={invoice.id} />
            <button className="btn sm brass" type="submit">
              Regenerate PDF
            </button>
          </form>
        }
      >
        {invoice.snapshots.length ? (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Generated</th>
                <th>By</th>
                <th className="num">Lines</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoice.snapshots.map((sn) => (
                <tr key={sn.id}>
                  <td className="mono">{sn.seq}</td>
                  <td className="tiny mono">{fmtStamp(sn.at)}</td>
                  <td className="tiny">{sn.by}</td>
                  <td className="num">{Array.isArray(sn.lines) ? sn.lines.length : 0}</td>
                  <td className="num">{money(sn.total)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <a className="btn sm" href={`/api/invoices/${invoice.id}/pdf?seq=${sn.seq}`} target="_blank" rel="noopener noreferrer">
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted tiny">No snapshot yet.</p>
        )}
      </Card>

      <NoteList
        notes={notes}
        addNoteHref={`/notes/new?targetType=INVOICE&targetId=${invoice.id}&returnTo=/invoices/${invoice.id}`}
        emptyMessage="No notes on this invoice yet."
      />
    </>
  );
}
