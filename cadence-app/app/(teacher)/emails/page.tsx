import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { fmtStamp } from '@/lib/format';
import { Card, PageHead, Uid } from '@/components/ui';

const STATE_BADGE: Record<string, string> = {
  FAILED: 'b-flag',
  DELIVERED: 'b-completed',
  OPENED: 'b-completed',
};

export default async function EmailsPage() {
  const notifications = await prisma.notification.findMany({
    orderBy: { sentAt: 'desc' },
    include: { events: { orderBy: { seq: 'desc' }, take: 1 } },
  });

  return (
    <>
      <PageHead
        title="Email activity"
        lede="Every email the studio sends creates a notification record with its own identifier and an ordered delivery event history."
      />
      <Card tight>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Recipient</th>
              <th>Subject</th>
              <th>Sent</th>
              <th>Current state</th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((n) => {
              const state = n.events[0]?.state ?? 'QUEUED';
              return (
                <tr key={n.id} className="rowlink">
                  <td>
                    <Link href={`/notifications/${n.id}`}>
                      <Uid id={n.publicId} />
                    </Link>
                  </td>
                  <td className="tiny">{n.type}</td>
                  <td className="tiny mono">{n.recipient}</td>
                  <td className="tiny">{n.subject}</td>
                  <td className="tiny mono">{fmtStamp(n.sentAt)}</td>
                  <td>
                    <span className={`badge ${STATE_BADGE[state] ?? 'b-neutral'}`}>{state}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
