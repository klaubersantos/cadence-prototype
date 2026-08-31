import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fmtDate, money } from '@/lib/format';
import { Card, InvoiceBadge, PageHead, Uid } from '@/components/ui';
import { payInvoiceAction, probeInvoiceAction } from '../actions';

export default async function PortalInvoicesPage() {
  const session = await auth();
  const studentId = session!.user.id;

  const invoices = await prisma.invoice.findMany({
    where: { studentId, status: { not: 'VOID' } },
    orderBy: { issuedAt: 'desc' },
    include: { receipts: true },
  });

  return (
    <>
      <PageHead title="Invoices & receipts" lede="Paid invoices download as receipts. Payment here is simulated." />
      <Card tight>
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Issued</th>
              <th>Status</th>
              <th>Receipt</th>
              <th className="num">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length ? (
              invoices.map((i) => (
                <tr key={i.id} className="rowlink">
                  <td>
                    <Link href={`/portal/invoices/${i.publicId}`}>
                      <Uid id={i.publicId} />
                    </Link>
                  </td>
                  <td className="tiny mono">{fmtDate(i.issuedAt)}</td>
                  <td>
                    <InvoiceBadge status={i.status} flagged={i.flaggedForReview} />
                  </td>
                  <td>{i.receipts[0] ? <Uid id={i.receipts[0].publicId} /> : <span className="tiny muted">—</span>}</td>
                  <td className="num">{money(i.total)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {i.status === 'ISSUED' && (
                      <form action={payInvoiceAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <button className="btn brass sm" type="submit">
                          Pay now
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="muted tiny" style={{ padding: 16 }}>
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Try a direct link">
        <p className="tiny muted">
          Portal reads are scoped to you. Paste any invoice identifier — including one belonging to another student — and
          the portal answers the same way for a record you do not own and a record that does not exist.
        </p>
        <form action={probeInvoiceAction} className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="pid">Invoice identifier</label>
            <input id="pid" name="pid" placeholder="INV-000001" />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <button className="btn primary" type="submit">
              Open
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
