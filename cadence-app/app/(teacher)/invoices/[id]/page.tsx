import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { fmtDate, fmtStamp, money } from '@/lib/format';
import { Card, InvoiceBadge, PageHead, StateBadge, Uid } from '@/components/ui';
import { alertInvoiceAction } from '../../actions';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { student: true, lines: true, payments: true, receipts: true },
  });
  if (!invoice) notFound();

  const payment = invoice.payments[0];
  const receipt = invoice.receipts[0];

  return (
    <>
      <PageHead
        title={`Invoice ${invoice.publicId}`}
        lede={`${invoice.student.name} · issued ${fmtDate(invoice.issuedAt)} · due ${fmtDate(invoice.dueAt)}`}
        actions={
          <>
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
          <div className="tiny muted" style={{ marginTop: 12 }}>
            PDF history
          </div>
          <div className="mono">{invoice.snapshotSeq} snapshot(s) generated</div>
        </Card>
      </div>
    </>
  );
}
