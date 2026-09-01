import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { entryForLesson } from '@/lib/engine/billing';
import { reversionBlockReason } from '@/lib/engine/lessons';
import { LESSON_STATE_META } from '@/lib/lessonStates';
import { LessonState } from '@/lib/generated/prisma/client';
import { fmtStamp, money } from '@/lib/format';
import { Card, PageHead, StateBadge, Uid } from '@/components/ui';
import { revertLessonAction, transitionLessonAction } from '../../actions';

const TRANSITIONS: [LessonState, string][] = [
  [LessonState.COMPLETED, 'Completed'],
  [LessonState.NO_SHOW, 'No-show'],
  [LessonState.CANCELLED_STUDENT, 'Cancelled (student)'],
  [LessonState.CANCELLED_TEACHER, 'Cancelled (teacher)'],
];

export default async function LessonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({ where: { id }, include: { student: true } });
  if (!lesson) notFound();

  const [entry, blockReason] = await Promise.all([
    entryForLesson(prisma, lesson.id),
    lesson.state !== LessonState.SCHEDULED ? reversionBlockReason(prisma, lesson) : Promise.resolve(null),
  ]);

  const meta = LESSON_STATE_META[lesson.state];

  return (
    <>
      <PageHead
        title="Lesson"
        lede={`${lesson.student.name} · ${fmtStamp(lesson.start)}`}
        actions={
          <Link className="btn" href="/calendar">
            Back to calendar
          </Link>
        }
      />

      <div className="split">
        <Card title="Details">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <Uid id={lesson.publicId} />
            <StateBadge state={lesson.state} />
            {lesson.lateCancel && <span className="badge b-billable">Late cancellation</span>}
          </div>
          <div className="row">
            <div>
              <div className="tiny muted">Student</div>
              <div>
                {lesson.student.name} <Uid id={lesson.student.publicId} sm />
              </div>
            </div>
            <div>
              <div className="tiny muted">When</div>
              <div className="mono">{fmtStamp(lesson.start)}</div>
            </div>
            <div>
              <div className="tiny muted">Duration</div>
              <div className="mono">{lesson.durationMin} min</div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="tiny muted">Billing</div>
            <div>
              {entry && !entry.voided ? (
                <>
                  {money(entry.amount)} · {entry.kind === 'LATE_CANCEL' ? 'late-cancel charge' : 'full rate'}
                  {entry.invoiceId ? ' · invoiced' : ' · not yet invoiced'}
                </>
              ) : entry?.voided ? (
                <span className="muted">Charge withdrawn — {entry.voidReason}</span>
              ) : (
                <span className="muted">Not billable in this state</span>
              )}
            </div>
          </div>
          {blockReason && <div className="refusal" style={{ marginTop: 12 }}>{blockReason}</div>}
          {meta.terminal && !blockReason && (
            <div className="note" style={{ marginTop: 12 }}>
              This lesson is in a terminal state. Reverting it returns it to Scheduled, withdraws its charge and voids
              any unpaid invoice covering it — nothing is deleted.
            </div>
          )}
        </Card>

        <Card title="Actions">
          {lesson.state === LessonState.SCHEDULED ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TRANSITIONS.map(([to, label]) => (
                <form key={to} action={transitionLessonAction}>
                  <input type="hidden" name="id" value={lesson.id} />
                  <input type="hidden" name="to" value={to} />
                  <button className={`btn${to === 'COMPLETED' ? ' brass' : ''}`} type="submit">
                    {label}
                  </button>
                </form>
              ))}
            </div>
          ) : blockReason ? (
            <p className="muted tiny">No further action is available.</p>
          ) : (
            <form action={revertLessonAction}>
              <input type="hidden" name="id" value={lesson.id} />
              <button className="btn danger" type="submit">
                Revert to Scheduled
              </button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
