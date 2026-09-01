import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { fmtStamp } from '@/lib/format';
import { Card, PageHead, Uid } from '@/components/ui';
import { resendNotificationAction } from '../../actions';

export default async function NotificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notification = await prisma.notification.findUnique({
    where: { id },
    include: { events: { orderBy: { seq: 'asc' } } },
  });
  if (!notification) notFound();

  const [lesson, invoice, student] = await Promise.all([
    notification.lessonId ? prisma.lesson.findUnique({ where: { id: notification.lessonId } }) : null,
    notification.invoiceId ? prisma.invoice.findUnique({ where: { id: notification.invoiceId } }) : null,
    notification.studentId ? prisma.student.findUnique({ where: { id: notification.studentId } }) : null,
  ]);

  return (
    <>
      <PageHead
        title={`Notification ${notification.publicId}`}
        lede={`${notification.subject} → ${notification.recipient}`}
        actions={
          <>
            <form action={resendNotificationAction}>
              <input type="hidden" name="id" value={notification.id} />
              <button className="btn brass" type="submit">
                Resend
              </button>
            </form>
            <Link className="btn" href="/emails">
              Back
            </Link>
          </>
        }
      />

      <div className="split">
        <Card title="Delivery events" hint="never edited; resending creates a new record">
          <ul className="timeline">
            {notification.events.map((e) => (
              <li key={e.id}>
                <span className="t">
                  #{e.seq} {fmtStamp(e.at)}
                </span>
                <span>
                  <b>{e.state}</b>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="References">
          <div className="tiny muted">Type</div>
          <div>{notification.type}</div>
          {lesson && (
            <>
              <div className="tiny muted" style={{ marginTop: 8 }}>
                Lesson
              </div>
              <Link href={`/lessons/${lesson.id}`}>
                <Uid id={lesson.publicId} />
              </Link>
            </>
          )}
          {invoice && (
            <>
              <div className="tiny muted" style={{ marginTop: 8 }}>
                Invoice
              </div>
              <Link href={`/invoices/${invoice.id}`}>
                <Uid id={invoice.publicId} />
              </Link>
            </>
          )}
          {student && (
            <>
              <div className="tiny muted" style={{ marginTop: 8 }}>
                Student
              </div>
              <Link href={`/students/${student.id}`}>
                <Uid id={student.publicId} />
              </Link>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
