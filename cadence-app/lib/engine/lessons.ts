import type { Lesson, Prisma, PrismaClient } from '@/lib/generated/prisma/client';
import { InvoiceStatus, LessonState, NotificationType } from '@/lib/generated/prisma/client';
import { ALLOWED_FROM_SCHEDULED, LESSON_STATE_META } from '../lessonStates';
import { entryForLesson, syncBillingEntry } from './billing';
import { logActivity } from './activity';
import { notify } from './notifications';
import { fail, ok, type Result } from './result';

type Tx = PrismaClient | Prisma.TransactionClient;
export type Role = 'TEACHER' | 'STUDENT';

// ============================================================
// LESSON LIFECYCLE — I02-R01, amended by I08
// Ported from cadence-prototype/js/engine.js.
// ============================================================
export function allowedTransitions(state: LessonState, role: Role): LessonState[] {
  if (role !== 'TEACHER') {
    // a student may only cancel their own scheduled lesson (I02-R04)
    return state === LessonState.SCHEDULED ? [LessonState.CANCELLED_STUDENT] : [];
  }
  if (state === LessonState.SCHEDULED) return ALLOWED_FROM_SCHEDULED;
  return []; // terminal: no forward transition
}

export function isLateCancel(start: Date | string, at: Date, windowHours: number): boolean {
  const hrs = (new Date(start).getTime() - at.getTime()) / 3600000;
  // "a cancellation submitted at or after the window boundary is a late
  // cancellation" — the boundary itself is inclusive, so <= not <
  return hrs <= windowHours;
}

export async function transition(
  tx: Tx,
  lessonId: string,
  toState: LessonState,
  actor: string,
  role: Role,
): Promise<Result<Lesson>> {
  const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, include: { student: true } });
  if (!lesson) return fail('That lesson could not be found.');

  if (!allowedTransitions(lesson.state, role).includes(toState)) {
    return fail(
      lesson.state === LessonState.SCHEDULED
        ? 'That transition is not permitted from Scheduled.'
        : `This lesson is ${LESSON_STATE_META[lesson.state].label}. Terminal states admit no further transition — revert it first.`,
    );
  }

  const studio = await tx.studio.findFirstOrThrow();
  const from = lesson.state;
  const now = new Date();

  const data: Prisma.LessonUpdateInput = { state: toState, stateSetAt: now };
  let lateCancel = false;
  if (toState === LessonState.CANCELLED_STUDENT || toState === LessonState.CANCELLED_TEACHER) {
    lateCancel = isLateCancel(lesson.start, now, studio.lateCancelWindowHours);
    data.cancelledAt = now;
    data.lateCancel = lateCancel;
  }

  const updated = await tx.lesson.update({ where: { id: lessonId }, data });
  await syncBillingEntry(tx, updated, lesson.student.rate, studio.lateCancelChargePct);

  // email effect (I02): cancellation notifies both parties; completed / no-show sends nothing
  if (toState === LessonState.CANCELLED_STUDENT || toState === LessonState.CANCELLED_TEACHER) {
    await notify(tx, NotificationType.CANCELLATION, lesson.student.email, { lessonId: lesson.id, studentId: lesson.studentId });
    await notify(tx, NotificationType.CANCELLATION, studio.teacherEmail, { lessonId: lesson.id, studentId: lesson.studentId });
  }

  await logActivity(
    tx,
    actor,
    `Lesson ${lesson.publicId} moved from ${LESSON_STATE_META[from].label} to ${LESSON_STATE_META[toState].label}` +
      (lateCancel ? ` — late cancellation, billable at ${studio.lateCancelChargePct}%` : ''),
    { lessonId: lesson.id, studentId: lesson.studentId, kind: 'transition' },
  );

  return ok(updated);
}

// ============================================================
// REVERSION — I08-R01..R04
// Terminal → Scheduled, teacher only, blocked when the lesson is
// covered by a PAID invoice. Nothing is ever deleted.
// ============================================================
export async function reversionBlockReason(tx: Tx, lesson: Lesson): Promise<string | null> {
  if (!LESSON_STATE_META[lesson.state].terminal) return 'Only a lesson in a terminal state can be reverted.';
  const entry = await entryForLesson(tx, lesson.id);
  if (entry?.invoiceId) {
    const invoice = await tx.invoice.findUnique({ where: { id: entry.invoiceId } });
    if (invoice?.status === InvoiceStatus.PAID) {
      return `This lesson is covered by paid invoice ${invoice.publicId}. A paid invoice cannot be unwound here — issue a credit instead.`;
    }
  }
  return null;
}

export async function revert(tx: Tx, lessonId: string, actor: string) {
  const lesson = await tx.lesson.findUniqueOrThrow({ where: { id: lessonId } });
  const block = await reversionBlockReason(tx, lesson);
  if (block) return fail(block);

  const from = lesson.state;
  const entry = await entryForLesson(tx, lesson.id);
  let voidedInvoiceId: string | null = null;

  if (entry?.invoiceId) {
    const invoice = await tx.invoice.findUnique({ where: { id: entry.invoiceId } });
    if (invoice && invoice.status === InvoiceStatus.ISSUED) {
      // void in full, keeping identifier, lines and captured rates (I08-R02)
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.VOID, voidReason: `Voided when lesson ${lesson.publicId} was reverted to Scheduled` },
      });
      voidedInvoiceId = invoice.id;
      // co-billed lessons return to Unbilled Lessons (I08-R02)
      await tx.billingEntry.updateMany({
        where: { invoiceId: invoice.id, lessonId: { not: lesson.id } },
        data: { invoiceId: null },
      });
    }
  }

  if (entry) {
    // withdraw the charge, keep traceability (I08-R02)
    await tx.billingEntry.update({
      where: { id: entry.id },
      data: { voided: true, invoiceId: null, voidReason: `Withdrawn on reversion of ${lesson.publicId}` },
    });
  }

  const reverted = await tx.lesson.update({
    where: { id: lessonId },
    data: {
      state: LessonState.SCHEDULED,
      lateCancel: false,
      cancelledAt: null,
      stateSetAt: new Date(),
      revertedFrom: from,
    },
  });

  const voidedInvoice = voidedInvoiceId ? await tx.invoice.findUnique({ where: { id: voidedInvoiceId } }) : null;

  await logActivity(
    tx,
    actor,
    `Lesson ${lesson.publicId} reverted from ${LESSON_STATE_META[from].label} to Scheduled` +
      (voidedInvoice ? `. Invoice ${voidedInvoice.publicId} voided in full.` : '.'),
    { lessonId: lesson.id, studentId: lesson.studentId, kind: 'reversion' },
  );

  return ok({ lesson: reverted, voidedInvoice });
}
