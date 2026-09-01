import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { notesFor } from '@/lib/engine/notes';
import { LessonState, InvoiceStatus } from '@/lib/generated/prisma/client';
import { fmtDate, fmtStamp, fmtTime, money } from '@/lib/format';
import { Card, EmptyState, PageHead, StateBadge, Uid } from '@/components/ui';
import { payInvoiceAction } from '../actions';

export default async function PortalOverviewPage() {
  const session = await auth();
  const studentId = session!.user.id;
  const now = new Date();

  const [student, next, due, notes] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: studentId } }),
    prisma.lesson.findFirst({
      where: { studentId, state: LessonState.SCHEDULED, start: { gte: now } },
      orderBy: { start: 'asc' },
    }),
    prisma.invoice.findMany({ where: { studentId, status: InvoiceStatus.ISSUED }, orderBy: { dueAt: 'asc' } }),
    notesFor(prisma, 'STUDENT', studentId, 'STUDENT'),
  ]);

  return (
    <>
      <PageHead title={`Hello, ${student.name.split(' ')[0]}`} />
      <div className="split">
        <Card title="Next lesson">
          {next ? (
            <>
              <div className="stat" style={{ padding: 0 }}>
                <div className="k">{fmtDate(next.start)}</div>
                <div className="v" style={{ fontSize: 20 }}>
                  {fmtTime(next.start)}
                </div>
                <div className="n">
                  {next.durationMin} minutes · {next.location}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Uid id={next.publicId} /> <StateBadge state={next.state} />
              </div>
            </>
          ) : (
            <EmptyState title="Nothing scheduled" message="Your teacher will book your next lesson." />
          )}
        </Card>

        <Card title="Invoices due">
          {due.length ? (
            due.map((i) => (
              <div
                key={i.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--hair-soft)' }}
              >
                <div>
                  <Uid id={i.publicId} />
                  <div className="tiny muted">due {fmtDate(i.dueAt)}</div>
                </div>
                <div className="money" style={{ marginLeft: 'auto', fontSize: 15 }}>
                  {money(i.total)}
                </div>
                <form action={payInvoiceAction}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="btn brass sm" type="submit">
                    Pay now
                  </button>
                </form>
              </div>
            ))
          ) : (
            <EmptyState title="Nothing due" message="You are all settled up." />
          )}
        </Card>
      </div>

      {notes.length > 0 && (
        <Card title="Notes from your teacher">
          {notes.map((n) => (
            <div key={n.id} className="note">
              <Uid id={n.publicId} sm />
              <br />
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
