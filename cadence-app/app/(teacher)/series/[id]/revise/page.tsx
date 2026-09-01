import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Card, PageHead } from '@/components/ui';
import { reviseSeriesAction } from '../../../actions';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function ReviseSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await prisma.series.findUnique({ where: { id } });
  if (!series) notFound();

  return (
    <>
      <PageHead title="Revise series" />
      <Card>
        <form action={reviseSeriesAction}>
          <input type="hidden" name="id" value={series.id} />
          <div className="row">
            <div className="field">
              <label htmlFor="dayOfWeek">Day</label>
              <select id="dayOfWeek" name="dayOfWeek" defaultValue={series.dayOfWeek}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="time">Time</label>
              <input id="time" name="time" type="time" defaultValue={series.time} />
            </div>
            <div className="field">
              <label htmlFor="durationMin">Duration (min)</label>
              <input id="durationMin" name="durationMin" type="number" defaultValue={series.durationMin} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="boundaryType">Boundary</label>
            <select id="boundaryType" name="boundaryType" defaultValue={series.boundaryType}>
              <option value="ONGOING">Ongoing — 12-week horizon</option>
              <option value="END_DATE">Fixed end date</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="endDate">End date</label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              defaultValue={series.endDate ? new Date(series.endDate).toISOString().slice(0, 10) : ''}
            />
          </div>
          <div className="note">
            Only occurrences dated after this save and still in Scheduled state are touched. Completed, no-show and
            cancelled occurrences are never modified, and identifiers are retained.
          </div>
          <button className="btn primary" type="submit">
            Save revision
          </button>
        </form>
      </Card>
    </>
  );
}
