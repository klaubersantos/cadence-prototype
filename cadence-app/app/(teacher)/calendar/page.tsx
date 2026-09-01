import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { addDays, fmtDate, fmtShort, fmtTime, startOfWeek } from '@/lib/format';
import { Card, PageHead, Uid } from '@/components/ui';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  const offset = Number.parseInt(w ?? '0', 10) || 0;
  const weekStart = addDays(startOfWeek(new Date()), offset * 7);
  const weekEnd = addDays(weekStart, 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [lessons, series] = await Promise.all([
    prisma.lesson.findMany({
      where: { start: { gte: weekStart, lt: weekEnd } },
      include: { student: true },
      orderBy: { start: 'asc' },
    }),
    prisma.series.findMany({ include: { student: true, revisions: true, lessons: true }, orderBy: { createdAt: 'asc' } }),
  ]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const isToday = date.getTime() === today.getTime();
    const dayLessons = lessons.filter((l) => new Date(l.start).toDateString() === date.toDateString());
    return { date, isToday, dayLessons };
  });

  return (
    <>
      <PageHead
        title="Calendar"
        lede="Week view. Click a lesson to change its state."
        actions={
          <Link className="btn primary" href="/series/new">
            New lesson series
          </Link>
        }
      />

      <Card
        title={`${fmtShort(weekStart)} – ${fmtShort(addDays(weekStart, 6))}`}
        tight
        head={
          <span className="hint">
            <Link className="btn sm" href={`/calendar?w=${offset - 1}`}>
              &larr;
            </Link>{' '}
            <Link className="btn sm" href="/calendar?w=0">
              Today
            </Link>{' '}
            <Link className="btn sm" href={`/calendar?w=${offset + 1}`}>
              &rarr;
            </Link>
          </span>
        }
      >
        <div className="cal">
          {days.map(({ date, isToday, dayLessons }) => (
            <div className={`day${isToday ? ' today' : ''}`} key={date.toISOString()}>
              <div className="dh">
                {DAY_NAMES[date.getDay()]}
                <b>{date.getDate()}</b>
              </div>
              {dayLessons.map((l) => (
                <Link key={l.id} href={`/lessons/${l.id}`} className={`chip s-${l.state.toLowerCase()}`}>
                  <span className="ct">{fmtTime(l.start)}</span> {l.student.name.split(' ')[0]}
                  <br />
                  <Uid id={l.publicId} sm />
                </Link>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Recurring series" tight hint="A revision touches future Scheduled occurrences only">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Pattern</th>
              <th>Boundary</th>
              <th>Last materialized</th>
              <th className="num">Revisions</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.id} className="rowlink">
                <td>
                  <Link href={`/series/${s.id}`}>{s.student.name}</Link>
                </td>
                <td className="tiny">
                  {DAY_NAMES[s.dayOfWeek]} {s.time} · {s.durationMin} min
                </td>
                <td className="tiny">{s.boundaryType === 'ONGOING' ? 'Ongoing — 12-week horizon' : `Ends ${fmtDate(s.endDate!)}`}</td>
                <td className="tiny mono">{s.lastMaterialized ? fmtDate(s.lastMaterialized) : '—'}</td>
                <td className="num">{s.revisions.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
