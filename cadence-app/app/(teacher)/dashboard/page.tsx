import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { unbilledEntries } from '@/lib/engine/billing';
import { InvoiceStatus, LessonState, PortalStatus } from '@/lib/generated/prisma/client';
import { fmtStamp, money } from '@/lib/format';
import { Card, EmptyState, PageHead, StatCard, StateBadge, Uid } from '@/components/ui';
import { alertInvoiceAction } from '../actions';

export default async function DashboardPage() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [studio, upcoming, openInvoices, unbilled, activeStudents, totalStudents, weekLessons, activity] = await Promise.all([
    prisma.studio.findFirstOrThrow(),
    prisma.lesson.findMany({
      where: { state: LessonState.SCHEDULED, start: { gte: now } },
      orderBy: { start: 'asc' },
      take: 6,
      include: { student: true },
    }),
    prisma.invoice.findMany({ where: { status: InvoiceStatus.ISSUED }, include: { student: true }, orderBy: { dueAt: 'asc' } }),
    unbilledEntries(prisma),
    prisma.student.count({ where: { portalStatus: PortalStatus.ACTIVE } }),
    prisma.student.count(),
    prisma.lesson.count({ where: { start: { gte: weekStart, lt: weekEnd } } }),
    prisma.activityLog.findMany({ orderBy: { at: 'desc' }, take: 8 }),
  ]);

  const openTotal = openInvoices.reduce((a, i) => a + i.total, 0);
  const unbilledTotal = unbilled.reduce((a, e) => a + e.amount, 0);

  return (
    <>
      <PageHead title="Dashboard" lede={`${studio.name} — everything owed, taught and sent, in one place.`} />

      <div className="grid g4">
        <StatCard k="Unpaid invoices" v={money(openTotal)} n={`${openInvoices.length} open`} />
        <StatCard
          k="Ready to invoice"
          v={money(unbilledTotal)}
          n={`${unbilled.length} unbilled lesson${unbilled.length === 1 ? '' : 's'}`}
        />
        <StatCard k="Active students" v={String(activeStudents)} n={`${totalStudents} on the roster`} />
        <StatCard k="Lessons this week" v={String(weekLessons)} n="scheduled and past" />
      </div>

      <div className="split">
        <Card title="Next lessons" tight>
          {upcoming.length ? (
            <table>
              <thead>
                <tr>
                  <th>Lesson</th>
                  <th>Student</th>
                  <th>When</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((l) => (
                  <tr key={l.id} className="rowlink">
                    <td>
                      <Link href={`/students/${l.studentId}`}>
                        <Uid id={l.publicId} />
                      </Link>
                    </td>
                    <td>{l.student.name}</td>
                    <td className="mono tiny">{fmtStamp(l.start)}</td>
                    <td>
                      <StateBadge state={l.state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No lessons scheduled" message="Open a student to book a lesson or start a series." />
          )}
        </Card>

        <Card title="Recent activity">
          <ul className="timeline">
            {activity.map((a) => (
              <li key={a.id}>
                <span className="t">{fmtStamp(a.at)}</span>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Unpaid invoices" tight hint="Alerts create a notification record">
        {openInvoices.length ? (
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Student</th>
                <th>Due</th>
                <th className="num">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {openInvoices.map((i) => (
                <tr key={i.id} className="rowlink">
                  <td>
                    <Link href={`/invoices/${i.id}`}>
                      <Uid id={i.publicId} />
                    </Link>
                  </td>
                  <td>{i.student.name}</td>
                  <td className="tiny mono">{fmtStamp(i.dueAt)}</td>
                  <td className="num">{money(i.total)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <form action={alertInvoiceAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <button className="btn sm" type="submit">
                        Send alert
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="Nothing outstanding" message="Every issued invoice has been paid." />
        )}
      </Card>
    </>
  );
}
