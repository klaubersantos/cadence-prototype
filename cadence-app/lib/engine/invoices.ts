import type { Invoice, Prisma, PrismaClient, Student } from '@/lib/generated/prisma/client';
import { DeliveryState, InvoiceStatus, InvoiceType, NotificationType } from '@/lib/generated/prisma/client';
import { addDays } from '../format';
import { nextId } from './identifiers';
import { unbilledEntries } from './billing';
import { logActivity } from './activity';
import { notify } from './notifications';
import { fail, ok, type Result } from './result';

type Tx = PrismaClient | Prisma.TransactionClient;

// ============================================================
// INVOICING — I06-R01..R03
// Ported from cadence-prototype/js/engine.js. Lines capture the rate
// and the policy note in force at issue — never re-derived later.
// ============================================================
export async function createInvoice(
  tx: Tx,
  studentId: string,
  mode: 'PER_LESSON' | 'MONTHLY',
  actor: string,
): Promise<Result<Invoice>> {
  const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
  const studio = await tx.studio.findFirstOrThrow();
  const now = new Date();

  if (mode === 'MONTHLY') {
    const period = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const amount = student.monthlyAmount || student.rate;
    const invoice = await tx.invoice.create({
      data: {
        publicId: await nextId(tx, 'INV'),
        studentId: student.id,
        type: InvoiceType.MONTHLY,
        status: InvoiceStatus.ISSUED,
        issuedAt: now,
        dueAt: addDays(now, 14),
        total: amount,
        lines: {
          create: [
            {
              rate: amount,
              total: amount,
              policyNote: studio.policyNote,
              policyVerified: true,
              periodLabel: `Monthly tuition — ${period}`,
              kind: 'MONTHLY',
            },
          ],
        },
      },
    });
    await finishInvoice(tx, invoice, student, actor);
    return ok(invoice);
  }

  const eligible = await unbilledEntries(tx, studentId);
  if (!eligible.length) {
    // I04-R02: no eligible lesson remains → no invoice is produced
    return fail('No eligible lessons remain for this student. Nothing was invoiced.');
  }

  const total = eligible.reduce((a, e) => a + e.amount, 0);
  const invoice = await tx.invoice.create({
    data: {
      publicId: await nextId(tx, 'INV'),
      studentId: student.id,
      type: InvoiceType.PER_LESSON,
      status: InvoiceStatus.ISSUED,
      issuedAt: now,
      dueAt: addDays(now, 14),
      total,
      lines: {
        create: eligible.map((e) => ({
          lessonId: e.lessonId,
          lessonPublicId: e.lesson.publicId,
          date: e.lesson.start,
          stateAtIssue: e.lesson.state,
          rate: e.amount,
          total: e.amount,
          policyNote: studio.policyNote,
          policyVerified: true,
          kind: e.kind,
        })),
      },
    },
  });

  // I04-R01: each covered entry is no longer eligible
  await tx.billingEntry.updateMany({
    where: { id: { in: eligible.map((e) => e.id) } },
    data: { invoiceId: invoice.id },
  });

  await finishInvoice(tx, invoice, student, actor);
  return ok(invoice);
}

async function finishInvoice(tx: Tx, invoice: Invoice, student: Student, actor: string) {
  await snapshot(tx, invoice.id, actor);
  await notify(tx, NotificationType.INVOICE, student.email, { invoiceId: invoice.id, studentId: student.id });
  const lineCount = await tx.invoiceLine.count({ where: { invoiceId: invoice.id } });
  await logActivity(
    tx,
    actor,
    `Invoice ${invoice.publicId} issued for $${(invoice.total / 100).toFixed(2)} (${lineCount} line${lineCount === 1 ? '' : 's'}).`,
    { invoiceId: invoice.id, studentId: student.id, kind: 'invoice' },
  );
}

// ============================================================
// PDF SNAPSHOT HISTORY — I09-R01
// Bounded to the five most recent. Sequence numbers keep ascending
// regardless of discards; none is ever reused.
// ============================================================
export async function snapshot(tx: Tx, invoiceId: string, by: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true } });
  const seq = invoice.snapshotSeq + 1;
  await tx.invoice.update({ where: { id: invoiceId }, data: { snapshotSeq: seq } });
  await tx.invoiceSnapshot.create({
    data: { invoiceId, seq, by, total: invoice.total, lines: invoice.lines as unknown as Prisma.InputJsonValue },
  });

  const all = await tx.invoiceSnapshot.findMany({ where: { invoiceId }, orderBy: { seq: 'asc' } });
  let discarded: { seq: number } | null = null;
  if (all.length > 5) {
    const toDiscard = all.slice(0, all.length - 5);
    discarded = { seq: toDiscard[toDiscard.length - 1].seq };
    await tx.invoiceSnapshot.deleteMany({ where: { id: { in: toDiscard.map((s) => s.id) } } });
  }
  return { seq, discarded };
}

// ============================================================
// PAYMENT — BASE-R05, I01 — simulated: no real payment processor is
// called, this only records the effect exactly like the prototype's
// "Stripe Checkout" stand-in.
// ============================================================
export async function pay(tx: Tx, invoiceId: string, actor: string) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return fail('That invoice could not be found.');
  if (invoice.status === InvoiceStatus.PAID) return fail(`Invoice ${invoice.publicId} is already paid.`);
  if (invoice.status === InvoiceStatus.VOID) return fail(`Invoice ${invoice.publicId} is void and cannot be paid.`);

  const student = await tx.student.findUniqueOrThrow({ where: { id: invoice.studentId } });
  const studio = await tx.studio.findFirstOrThrow();

  const payment = await tx.payment.create({
    data: { publicId: await nextId(tx, 'PAY'), invoiceId: invoice.id, amount: invoice.total, method: 'Simulated checkout' },
  });
  const receipt = await tx.receipt.create({
    data: { publicId: await nextId(tx, 'RCP'), paymentId: payment.id, invoiceId: invoice.id, issuedAt: payment.paidAt },
  });
  await tx.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.PAID } });

  await notify(tx, NotificationType.RECEIPT, student.email, { invoiceId: invoice.id, receiptId: receipt.id, studentId: student.id });
  await notify(tx, NotificationType.RECEIPT, studio.teacherEmail, { invoiceId: invoice.id, receiptId: receipt.id, studentId: student.id });
  await logActivity(
    tx,
    actor,
    `Invoice ${invoice.publicId} paid — $${(invoice.total / 100).toFixed(2)}. Receipt ${receipt.publicId} issued.`,
    { invoiceId: invoice.id, studentId: student.id, kind: 'payment' },
  );

  return ok({ payment, receipt });
}

export async function failPayment(tx: Tx, invoiceId: string, actor: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const student = await tx.student.findUniqueOrThrow({ where: { id: invoice.studentId } });
  const n = await notify(tx, NotificationType.PAYMENT_FAILED, student.email, { invoiceId: invoice.id, studentId: student.id });
  if (n) {
    await tx.notificationEvent.create({ data: { notificationId: n.id, seq: 4, state: DeliveryState.FAILED } });
  }
  await logActivity(tx, actor, `Checkout cancelled for invoice ${invoice.publicId}. Failed-payment alert sent.`, {
    invoiceId: invoice.id,
    studentId: student.id,
    kind: 'payment',
  });
  return ok(n);
}
