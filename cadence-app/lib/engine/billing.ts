import type { BillingEntry, LessonState, Prisma, PrismaClient } from '@/lib/generated/prisma/client';
import { BillingKind, InvoiceStatus } from '@/lib/generated/prisma/client';

type Tx = PrismaClient | Prisma.TransactionClient;

// ============================================================
// BILLING ENTRIES — the single source of "what is owed"
// Ported from cadence-prototype/js/engine.js.
// I07-R01/R02: a lesson carries AT MOST ONE *live* billing entry,
// determined from its lesson id. Because syncBillingEntry always looks
// up the existing entry by lessonId first, no later transition, series
// revision or repeated submission can create a second live one.
// ============================================================

export function billableAmount(
  lesson: { state: LessonState; lateCancel: boolean },
  studentRateCents: number,
  lateCancelChargePct: number,
): { amount: number; kind: BillingKind } | null {
  if (lesson.state === 'COMPLETED' || lesson.state === 'NO_SHOW') {
    return { amount: studentRateCents, kind: BillingKind.LESSON }; // full rate
  }
  if ((lesson.state === 'CANCELLED_STUDENT' || lesson.state === 'CANCELLED_TEACHER') && lesson.lateCancel) {
    return { amount: Math.round((studentRateCents * lateCancelChargePct) / 100), kind: BillingKind.LATE_CANCEL };
  }
  return null; // standard cancel, or still scheduled
}

// the live entry for a lesson, if any; a withdrawn entry is kept for the
// audit trail but is never the one a caller acts on
export async function entryForLesson(tx: Tx, lessonId: string): Promise<BillingEntry | null> {
  const all = await tx.billingEntry.findMany({ where: { lessonId }, orderBy: { createdAt: 'asc' } });
  if (!all.length) return null;
  const live = all.filter((e) => !e.voided);
  return live.length ? live[live.length - 1] : all[all.length - 1];
}

export async function syncBillingEntry(
  tx: Tx,
  lesson: { id: string; state: LessonState; lateCancel: boolean },
  studentRateCents: number,
  lateCancelChargePct: number,
): Promise<BillingEntry | null> {
  const existing = await entryForLesson(tx, lesson.id);
  const due = billableAmount(lesson, studentRateCents, lateCancelChargePct);

  if (!due) {
    // not billable — withdraw any open entry, never delete it (I08-R02)
    if (existing && !existing.invoiceId && !existing.voided) {
      return tx.billingEntry.update({
        where: { id: existing.id },
        data: { voided: true, voidReason: 'Lesson is no longer billable' },
      });
    }
    return existing;
  }

  if (existing && !existing.voided) {
    // idempotent: keyed by lesson, so a repeated submission, later
    // transition or series revision can never add a second one
    if (!existing.invoiceId) {
      return tx.billingEntry.update({
        where: { id: existing.id },
        data: { amount: due.amount, kind: due.kind },
      });
    }
    return existing;
  }

  // a withdrawn entry is kept for the audit trail; re-terminalisation
  // after a reversion creates a fresh entry, never reinstates the old (I08-R04)
  return tx.billingEntry.create({
    data: { lessonId: lesson.id, kind: due.kind, amount: due.amount, voided: false },
  });
}

// ============================================================
// UNBILLED LESSONS — I04-R01, I07-R01
// A lesson already covered by a non-voided invoice is never listed,
// and never appears twice.
// ============================================================
export async function unbilledEntries(tx: Tx, studentId?: string) {
  const entries = await tx.billingEntry.findMany({
    where: {
      voided: false,
      ...(studentId ? { lesson: { studentId } } : {}),
    },
    include: { invoice: true, lesson: { include: { student: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const seen = new Set<string>();
  return entries.filter((e) => {
    if (e.invoice && e.invoice.status !== InvoiceStatus.VOID) return false; // covered by an issued or paid invoice
    if (seen.has(e.lessonId)) return false; // never the same lesson twice
    seen.add(e.lessonId);
    return true;
  });
}

// ============================================================
// BALANCES — voided entries never appear (I07-R04)
// ============================================================
export async function balance(tx: Tx, studentId: string) {
  const open = await tx.invoice.findMany({ where: { studentId, status: InvoiceStatus.ISSUED } });
  const unbilled = await unbilledEntries(tx, studentId);
  return {
    openInvoiced: open.reduce((a, i) => a + i.total, 0),
    openCount: open.length,
    unbilled: unbilled.reduce((a, e) => a + e.amount, 0),
    unbilledCount: unbilled.length,
  };
}
