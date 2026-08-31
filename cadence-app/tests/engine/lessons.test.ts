import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { syncBillingEntry } from '@/lib/engine/billing';
import { createInvoice, pay } from '@/lib/engine/invoices';
import { revert, reversionBlockReason } from '@/lib/engine/lessons';
import { LessonState } from '@/lib/generated/prisma/client';
import { cleanupStudio, makeLesson, makeStudent, makeStudio } from '../helpers';

// I08-R01: reversion is blocked once the lesson is covered by a PAID
// invoice — a paid invoice must be unwound some other way, not by revert.
describe('lesson reversion', () => {
  let studioId: string;

  beforeAll(async () => {
    const studio = await makeStudio('Reversion');
    studioId = studio.id;
  });

  afterAll(async () => {
    await cleanupStudio(studioId);
  });

  it('is blocked once the covering invoice is paid', async () => {
    const student = await makeStudent(studioId, 'Reversion');
    const lesson = await makeLesson(student.id, new Date(Date.now() - 86400000));

    const completed = await prisma.$transaction(async (tx) => {
      const l = await tx.lesson.update({ where: { id: lesson.id }, data: { state: LessonState.COMPLETED } });
      await syncBillingEntry(tx, l, student.rate, 50);
      return l;
    });

    const invoice = await prisma.$transaction((tx) => createInvoice(tx, student.id, 'PER_LESSON', 'Test Teacher'));
    if (!invoice.ok) throw new Error(invoice.error);

    const paid = await prisma.$transaction((tx) => pay(tx, invoice.value.id, 'Test Teacher'));
    expect(paid.ok).toBe(true);

    const block = await reversionBlockReason(prisma, completed);
    expect(block).toMatch(/paid invoice/i);

    const attempt = await prisma.$transaction((tx) => revert(tx, lesson.id, 'Test Teacher'));
    expect(attempt.ok).toBe(false);
  });

  it('never duplicates a billing entry across a revert-then-recomplete cycle', async () => {
    const student = await makeStudent(studioId, 'ReversionCycle');
    const lesson = await makeLesson(student.id, new Date(Date.now() - 86400000));

    await prisma.$transaction(async (tx) => {
      const l = await tx.lesson.update({ where: { id: lesson.id }, data: { state: LessonState.COMPLETED } });
      await syncBillingEntry(tx, l, student.rate, 50);
    });

    await prisma.$transaction((tx) => revert(tx, lesson.id, 'Test Teacher'));

    await prisma.$transaction(async (tx) => {
      const l = await tx.lesson.update({ where: { id: lesson.id }, data: { state: LessonState.COMPLETED } });
      await syncBillingEntry(tx, l, student.rate, 50);
    });

    const entries = await prisma.billingEntry.findMany({ where: { lessonId: lesson.id } });
    const live = entries.filter((e) => !e.voided);
    expect(live).toHaveLength(1); // I08-R04: a fresh entry, the withdrawn one never reinstated
    expect(entries.length).toBeGreaterThan(1); // the withdrawn one is still there, for the audit trail
  });
});
