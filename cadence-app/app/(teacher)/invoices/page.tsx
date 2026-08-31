import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { fmtDate, money } from '@/lib/format';
import { Card, InvoiceBadge, PageHead, Uid } from '@/components/ui';

export default async function InvoicesPage() {
  const invoices = await prisma.invoice.findMany({
    orderBy: { issuedAt: 'desc' },
    include: { student: true, lines: true },
  });

  return (
    <>
      <PageHead
        title="Invoices"
        lede="Every invoice is composed of explicit lines. Each line records the rate and policy note in force when the invoice was issued."
        actions={
          <Link className="btn primary" href="/invoices/new">
            Create invoice
          </Link>
        }
      />
      <Card tight>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Student</th>
              <th>Composition</th>
              <th>Issued</th>
              <th>Status</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} className="rowlink">
                <td>
                  <Link href={`/invoices/${i.id}`}>
                    <Uid id={i.publicId} />
                  </Link>
                </td>
                <td>{i.student.name}</td>
                <td className="tiny">{i.type === 'MONTHLY' ? 'Monthly' : `${i.lines.length} lesson line(s)`}</td>
                <td className="tiny mono">{fmtDate(i.issuedAt)}</td>
                <td>
                  <InvoiceBadge status={i.status} flagged={i.flaggedForReview} />
                </td>
                <td className="num">{money(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
