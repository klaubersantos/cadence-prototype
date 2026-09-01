import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { fmtDate, fmtStamp } from '@/lib/format';
import { Card, EmptyState, PageHead, StateBadge, Uid } from '@/components/ui';

export default async function SeriesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const { notice } = await searchParams;
  const series = await prisma.series.findUnique({
    where: { id },
    include: { student: true, revisions: { orderBy: { seq: 'asc' } }, lessons: { orderBy: { start: 'asc' } } },
  });
  if (!series) notFound();

  return (
    <>
      <PageHead
        title={`Series for ${series.student.name}`}
        lede="A revision applies only to occurrences scheduled after it is saved and still in Scheduled state. Identifiers are retained — occurrences are rescheduled, not replaced."
        actions={
          <>
            <Link className="btn primary" href={`/series/${series.id}/revise`}>
              Revise series
            </Link>
            <Link className="btn" href="/calendar">
              Back to calendar
            </Link>
          </>
        }
      />

      {notice === 'noop' && (
        <div className="note">Nothing changed, so no revision was recorded and no notice was sent.</div>
      )}

      <div className="split">
        <Card title="Revision history" hint="Immutable, ascending">
          {series.revisions.length ? (
            <ul className="timeline">
              {series.revisions.map((r) => (
                <li key={r.id}>
                  <span className="t">
                    #{r.seq} {fmtStamp(r.at)}
                  </span>
                  <span>
                    <b>{r.actor}</b> changed{' '}
                    {(r.fields as { field: string; from: unknown; to: unknown }[])
                      .map((f) => `${f.field} (${f.from} → ${f.to})`)
                      .join(', ')}
                    <br />
                    <span className="muted tiny">
                      {r.affected} scheduled occurrence(s) moved · {r.added} added · {r.removed} removed
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No revisions yet" message="Changing the day, time, duration or boundary records a revision here." />
          )}
        </Card>

        <Card title="Boundary">
          <div className="stat" style={{ padding: 0 }}>
            <div className="k">Type</div>
            <div className="v" style={{ fontSize: 16 }}>{series.boundaryType === 'ONGOING' ? 'Ongoing' : 'Fixed end date'}</div>
          </div>
          <hr style={{ border: 0, borderTop: '1px solid var(--hair-soft)', margin: '12px 0' }} />
          <div className="tiny muted">Horizon</div>
          <div className="mono">{series.boundaryType === 'ONGOING' ? '12 weeks rolling' : fmtDate(series.endDate!)}</div>
          <div className="tiny muted" style={{ marginTop: 10 }}>Last materialized lesson</div>
          <div className="mono">{series.lastMaterialized ? fmtDate(series.lastMaterialized) : '—'}</div>
          <div className="tiny muted" style={{ marginTop: 10 }}>Occurrences</div>
          <div className="mono">{series.lessons.length}</div>
        </Card>
      </div>

      <Card title="Occurrences" tight hint="first 40">
        <table>
          <thead>
            <tr>
              <th>Lesson</th>
              <th>When</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {series.lessons.slice(0, 40).map((l) => (
              <tr key={l.id} className="rowlink">
                <td>
                  <Link href={`/lessons/${l.id}`}>
                    <Uid id={l.publicId} />
                  </Link>
                </td>
                <td className="tiny mono">{fmtStamp(l.start)}</td>
                <td>
                  <StateBadge state={l.state} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
