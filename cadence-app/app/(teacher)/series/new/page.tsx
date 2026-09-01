import { prisma } from '@/lib/prisma';
import { Card, PageHead } from '@/components/ui';
import { createSeriesAction } from '../../actions';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function NewSeriesPage({ searchParams }: { searchParams: Promise<{ studentId?: string }> }) {
  const { studentId } = await searchParams;
  const students = await prisma.student.findMany({ orderBy: { name: 'asc' } });

  return (
    <>
      <PageHead title="New lesson series" />
      <Card>
        <form action={createSeriesAction}>
          <div className="field">
            <label htmlFor="studentId">Student</label>
            <select id="studentId" name="studentId" defaultValue={studentId ?? students[0]?.id}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="dayOfWeek">Day</label>
              <select id="dayOfWeek" name="dayOfWeek" defaultValue={2}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="time">Time</label>
              <input id="time" name="time" type="time" defaultValue="16:00" required />
            </div>
            <div className="field">
              <label htmlFor="durationMin">Duration (min)</label>
              <input id="durationMin" name="durationMin" type="number" defaultValue={45} required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="boundaryType">Boundary</label>
            <select id="boundaryType" name="boundaryType" defaultValue="ONGOING">
              <option value="ONGOING">Ongoing — materialize 12 weeks ahead</option>
              <option value="END_DATE">Fixed end date</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="endDate">End date (used only with a fixed boundary)</label>
            <input id="endDate" name="endDate" type="date" />
          </div>
          <button className="btn primary" type="submit">
            Create series
          </button>
        </form>
      </Card>
    </>
  );
}
