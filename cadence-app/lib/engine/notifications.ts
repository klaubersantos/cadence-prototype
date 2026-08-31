import type { Notification, Prisma, PrismaClient } from '@/lib/generated/prisma/client';
import { DeliveryState, NotificationType } from '@/lib/generated/prisma/client';
import { nextId } from './identifiers';
import { logActivity } from './activity';
import { ok, type Result } from './result';

type Tx = PrismaClient | Prisma.TransactionClient;

export type NotifyRefs = {
  lessonId?: string | null;
  invoiceId?: string | null;
  studentId?: string | null;
  receiptId?: string | null;
};

const SUBJECTS: Record<NotificationType, string> = {
  INVITE: 'Your student portal is ready',
  REMINDER: 'Lesson reminder',
  INVOICE: 'New invoice from your studio',
  RECEIPT: 'Payment receipt',
  CANCELLATION: 'Lesson cancelled',
  RESCHEDULE: 'Your lesson series changed',
  UNPAID_ALERT: 'Invoice still unpaid',
  PAYMENT_FAILED: 'Payment did not go through',
};

// ============================================================
// NOTIFICATIONS — I01, I05-R01..R03
// Ported from cadence-prototype/js/engine.js. No real email is sent in
// this iteration — creating the record (with its delivery-event
// history) is the observable effect the rest of the rules depend on.
// ============================================================
export async function notify(tx: Tx, type: NotificationType, recipient: string, refs: NotifyRefs): Promise<Notification | null> {
  // unsubscribe applies to reminders only; invoices and receipts always send (BASE-R08)
  if (type === NotificationType.REMINDER && refs.studentId) {
    const student = await tx.student.findUnique({ where: { id: refs.studentId } });
    if (student?.unsubscribed) return null;
  }

  const publicId = await nextId(tx, 'NOT');
  const notification = await tx.notification.create({
    data: {
      publicId,
      type,
      recipient,
      lessonId: refs.lessonId ?? null,
      invoiceId: refs.invoiceId ?? null,
      studentId: refs.studentId ?? null,
      receiptId: refs.receiptId ?? null,
      subject: SUBJECTS[type],
    },
  });

  await tx.notificationEvent.createMany({
    data: [
      { notificationId: notification.id, seq: 1, state: DeliveryState.QUEUED },
      { notificationId: notification.id, seq: 2, state: DeliveryState.SENT },
      { notificationId: notification.id, seq: 3, state: DeliveryState.DELIVERED },
    ],
  });

  return notification;
}

export async function resend(tx: Tx, notificationId: string): Promise<Result<Notification>> {
  const src = await tx.notification.findUniqueOrThrow({ where: { id: notificationId } });
  // I05-R03: resending creates a NEW notification record; existing events are never edited
  const n = await notify(tx, src.type, src.recipient, {
    lessonId: src.lessonId,
    invoiceId: src.invoiceId,
    studentId: src.studentId,
    receiptId: src.receiptId,
  });
  if (!n) throw new Error('resend produced no notification');
  await logActivity(tx, 'Studio', `Resent ${src.type.toLowerCase()} to ${src.recipient} as ${n.publicId}.`, { kind: 'email' });
  return ok(n);
}
