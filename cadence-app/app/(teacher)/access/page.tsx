import { prisma } from '@/lib/prisma';
import { fmtDate, fmtStamp } from '@/lib/format';
import { Card, EmptyState, PageHead } from '@/components/ui';

export default async function AccessLogPage() {
  const [invitations, attempts] = await Promise.all([
    prisma.invitation.findMany({ include: { student: true }, orderBy: { sentAt: 'desc' } }),
    prisma.accessLogEntry.findMany({ orderBy: { at: 'desc' }, take: 60 }),
  ]);

  return (
    <>
      <PageHead
        title="Portal access"
        lede="Every portal read is scoped to the authenticated student. A record owned by someone else is refused with exactly the message shown for a record that does not exist."
      />

      <Card title="Invitation links" tight hint="single use">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Sent</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((i) => (
              <tr key={i.id}>
                <td>{i.student.name}</td>
                <td className="tiny mono">{fmtDate(i.sentAt)}</td>
                <td>
                  <span className={`badge ${i.consumed ? 'b-neutral' : 'b-completed'}`}>{i.consumed ? 'consumed' : 'open'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Access attempts" tight hint="teacher-only diagnostic">
        {attempts.length ? (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>Requested</th>
                <th>By</th>
                <th>Outcome</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td className="tiny mono">{fmtStamp(a.at)}</td>
                  <td className="tiny">{a.kind}</td>
                  <td className="tiny mono">{a.publicId}</td>
                  <td className="tiny">{a.by ?? '—'}</td>
                  <td>
                    <span className={`badge ${a.granted ? 'b-completed' : 'b-flag'}`}>{a.granted ? 'granted' : 'refused'}</span>
                  </td>
                  <td className="tiny muted">{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No attempts recorded" message="Use the portal to open a record that belongs to another student and it will be logged here." />
        )}
      </Card>
    </>
  );
}
