import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { entryForLesson } from '@/lib/engine/billing';
import { isLateCancel } from '@/lib/engine/lessons';
import { LessonState } from '@/lib/generated/prisma/client';
import { fmtStamp, money } from '@/lib/format';
import { Card, PageHead, StateBadge, Uid } from '@/components/ui';
import { cancelLessonAction } from '../actions';

export default async function PortalLessonsPage() {
  const session = await auth();
  const studentId = session!.user.id;
  const now = new Date();

  const [studio, upcoming, past] = await Promise.all([
    prisma.studio.findFirstOrThrow(),
    prisma.lesson.findMany({ where: { studentId, start: { gte: now } }, orderBy: { start: 'asc' } }),
    prisma.lesson.findMany({ where: { studentId, start: { lt: now } }, orderBy: { start: 'desc' }, take: 20 }),
  ]);
  const pastEntries = await Promise.all(past.map((l) => entryForLesson(prisma, l.id)));

  return (
    <>
      <PageHead
        title="My lessons"
        lede={`Cancelling inside ${studio.lateCancelWindowHours} hours of the start time is billed at ${studio.lateCancelChargePct}% of your rate.`}
      />
      <div className="note">{studio.policyNote}</div>

      <Card title="Upcoming" tight>
        <table>
          <thead>
            <tr>
              <th>Lesson</th>
              <th>When</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {upcoming.length ? (
              upcoming.map((l) => {
                const late = isLateCancel(l.start, now, studio.lateCancelWindowHours);
                return (
                  <tr key={l.id}>
                    <td>
                      <Uid id={l.publicId} />
                    </td>
                    <td className="tiny mono">{fmtStamp(l.start)}</td>
                    <td>
                      <StateBadge state={l.state} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {l.state === LessonState.SCHEDULED ? (
                        <form action={cancelLessonAction}>
                          <input type="hidden" name="id" value={l.id} />
                          <button className={`btn sm${late ? ' danger' : ''}`} type="submit">
                            {late ? 'Cancel (billable)' : 'Cancel'}
                          </button>
                        </form>
                      ) : (
                        <span className="tiny muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="muted tiny" style={{ padding: 16 }}>
                  No upcoming lessons.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="History" tight>
        <table>
          <thead>
            <tr>
              <th>Lesson</th>
              <th>When</th>
              <th>State</th>
              <th className="num">Charged</th>
            </tr>
          </thead>
          <tbody>
            {past.map((l, i) => (
              <tr key={l.id}>
                <td>
                  <Uid id={l.publicId} />
                </td>
                <td className="tiny mono">{fmtStamp(l.start)}</td>
                <td>
                  <StateBadge state={l.state} />
                </td>
                <td className="num tiny">{pastEntries[i] && !pastEntries[i]!.voided ? money(pastEntries[i]!.amount) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
