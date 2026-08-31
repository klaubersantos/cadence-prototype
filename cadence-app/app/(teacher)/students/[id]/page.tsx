import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { balance, entryForLesson } from '@/lib/engine/billing';
import { reversionBlockReason } from '@/lib/engine/lessons';
import { LessonState } from '@/lib/generated/prisma/client';
import { fmtDate, fmtStamp, money } from '@/lib/format';
import { Card, EmptyState, InvoiceBadge, PageHead, StatCard, StateBadge, Uid } from '@/components/ui';
import { revertLessonAction, sendInviteAction, transitionLessonAction } from '../../actions';

const TRANSITIONS: [LessonState, string][] = [
  [LessonState.COMPLETED, 'Completed'],
  [LessonState.NO_SHOW, 'No-show'],
  [LessonState.CANCELLED_STUDENT, 'Cancelled (student)'],
  [LessonState.CANCELLED_TEACHER, 'Cancelled (teacher)'],
];

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) notFound();

  const [b, lessons, invoices, activity, mails] = await Promise.all([
    balance(prisma, id),
    prisma.lesson.findMany({ where: { studentId: id }, orderBy: { start: 'desc' }, take: 14 }),
    prisma.invoice.findMany({ where: { studentId: id }, orderBy: { issuedAt: 'desc' } }),
    prisma.activityLog.findMany({ where: { studentId: id }, orderBy: { at: 'desc' }, take: 12 }),
    prisma.notification.findMany({ where: { studentId: id }, orderBy: { sentAt: 'desc' }, take: 8, include: { events: true } }),
  ]);

  const lessonRows = await Promise.all(
    lessons.map(async (l) => ({
      lesson: l,
      entry: await entryForLesson(prisma, l.id),
      blockReason: l.state !== LessonState.SCHEDULED ? await reversionBlockReason(prisma, l) : null,
    })),
  );

  return (
    <>
      <PageHead
        title={`${student.name}`}
        lede={student.email}
        actions={
          <>
            {student.portalStatus !== 'ACTIVE' && (
              <form action={sendInviteAction}>
                <input type="hidden" name="studentId" value={student.id} />
                <button className="btn brass" type="submit">
                  Send invite
                </button>
              </form>
            )}
            <Link className="btn primary" href={`/invoices/new?studentId=${student.id}`}>
              Create invoice
            </Link>
            <Link className="btn" href="/students">
              Back
            </Link>
          </>
        }
      />

      <div className="grid g4">
        <StatCard k="Invoiced &amp; unpaid" v={money(b.openInvoiced)} n={`${b.openCount} invoice(s)`} />
        <StatCard k="Unbilled" v={money(b.unbilled)} n={`${b.unbilledCount} lesson(s)`} />
        <StatCard
          k="Rate"
          v={student.billingMode === 'MONTHLY' ? `${money(student.monthlyAmount)}/mo` : money(student.rate)}
          n={student.billingMode === 'MONTHLY' ? 'monthly tuition' : 'per lesson'}
        />
        <StatCard k="Reminders" v={student.unsubscribed ? 'Off' : `${student.reminderHours} h`} n={student.unsubscribed ? 'unsubscribed' : 'before each lesson'} />
      </div>

      <div className="split">
        <Card title="Lessons" tight hint="latest 14">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>When</th>
                <th>State</th>
                <th className="num">Billable</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lessonRows.map(({ lesson: l, entry, blockReason }) => (
                <tr key={l.id}>
                  <td>
                    <Uid id={l.publicId} />
                  </td>
                  <td className="tiny mono">{fmtStamp(l.start)}</td>
                  <td>
                    <StateBadge state={l.state} />
                  </td>
                  <td className="num tiny">
                    {entry && !entry.voided ? (
                      <>
                        {money(entry.amount)}
                        {entry.kind === 'LATE_CANCEL' && <span className="badge b-billable"> late</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {l.state === LessonState.SCHEDULED ? (
                      TRANSITIONS.map(([to, label]) => (
                        <form key={to} action={transitionLessonAction} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="to" value={to} />
                          <button className="btn sm" type="submit" style={{ marginLeft: 4 }}>
                            {label}
                          </button>
                        </form>
                      ))
                    ) : blockReason ? (
                      <span className="tiny muted">locked</span>
                    ) : (
                      <form action={revertLessonAction} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={l.id} />
                        <button className="btn sm danger" type="submit">
                          Revert
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Activity">
          {activity.length ? (
            <ul className="timeline">
              {activity.map((a) => (
                <li key={a.id}>
                  <span className="t">{fmtStamp(a.at)}</span>
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted tiny">Nothing recorded yet.</p>
          )}
        </Card>
      </div>

      <div className="split">
        <Card title="Invoices" tight>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Issued</th>
                <th>Status</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length ? (
                invoices.map((i) => (
                  <tr key={i.id} className="rowlink">
                    <td>
                      <Link href={`/invoices/${i.id}`}>
                        <Uid id={i.publicId} />
                      </Link>
                    </td>
                    <td className="tiny mono">{fmtDate(i.issuedAt)}</td>
                    <td>
                      <InvoiceBadge status={i.status} flagged={i.flaggedForReview} />
                    </td>
                    <td className="num">{money(i.total)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="muted tiny" style={{ padding: 16 }}>
                    No invoices yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title="Email history" tight>
          {mails.length ? (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Sent</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {mails.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <Uid id={n.publicId} />
                    </td>
                    <td className="tiny">{n.type}</td>
                    <td className="tiny mono">{fmtStamp(n.sentAt)}</td>
                    <td>
                      <span className="badge b-neutral">{n.events[n.events.length - 1]?.state}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No email sent yet" message="Invites, invoices and receipts will show up here." />
          )}
        </Card>
      </div>
    </>
  );
}
