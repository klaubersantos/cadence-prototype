import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { unbilledEntries } from '@/lib/engine/billing';
import { fmtStamp, money } from '@/lib/format';
import { Card, EmptyState, PageHead, StateBadge, Uid } from '@/components/ui';

export default async function UnbilledPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [entries, studio] = await Promise.all([unbilledEntries(prisma), prisma.studio.findFirstOrThrow()]);
  const total = entries.reduce((a, e) => a + e.amount, 0);

  return (
    <>
      <PageHead
        title="Unbilled lessons"
        lede="A lesson already covered by an issued or paid invoice never appears here, and no lesson appears twice."
        actions={
          <Link className="btn primary" href="/invoices/new">
            Create invoice
          </Link>
        }
      />
      {error && <div className="refusal">{error}</div>}
      {entries.length ? (
        <Card tight>
          <table>
            <thead>
              <tr>
                <th>Lesson</th>
                <th>Student</th>
                <th>When</th>
                <th>State</th>
                <th>Charge</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Uid id={e.lesson.publicId} />
                  </td>
                  <td>{e.lesson.student.name}</td>
                  <td className="tiny mono">{fmtStamp(e.lesson.start)}</td>
                  <td>
                    <StateBadge state={e.lesson.state} />
                  </td>
                  <td>
                    {e.kind === 'LATE_CANCEL' ? (
                      <span className="badge b-billable">Late cancel · {studio.lateCancelChargePct}%</span>
                    ) : (
                      <span className="badge b-neutral">Full rate</span>
                    )}
                  </td>
                  <td className="num">{money(e.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 600, padding: '10px 16px' }}>
                  Total ready to invoice
                </td>
                <td className="num" style={{ fontWeight: 600, padding: '10px 16px' }}>
                  {money(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="Everything is invoiced"
            message={`Completed and no-show lessons appear here, along with late cancellations at ${studio.lateCancelChargePct}% of the rate.`}
          />
        </Card>
      )}
    </>
  );
}
