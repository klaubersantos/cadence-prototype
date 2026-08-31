import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { syncBillingEntry } from '@/lib/engine/billing';
import { createInvoice } from '@/lib/engine/invoices';
import { LessonState } from '@/lib/generated/prisma/client';
import { cleanupStudio, makeLesson, makeStudent, makeStudio } from '../helpers';

// I04-R02: once nothing eligible remains, createInvoice refuses rather
// than producing an empty or duplicate invoice.
describe('createInvoice double-invoicing refusal', () => {
  let studioId: string;

  beforeAll(async () => {
    const studio = await makeStudio('Invoices');
    studioId = studio.id;
  });

  afterAll(async () => {
    await cleanupStudio(studioId);
  });

  it('refuses a second invoice once everything is billed', async () => {
    const student = await makeStudent(studioId, 'Invoices');
    const lesson = await makeLesson(student.id, new Date(Date.now() - 86400000));

    await prisma.$transaction(async (tx) => {
      const completed = await tx.lesson.update({ where: { id: lesson.id }, data: { state: LessonState.COMPLETED } });
      await syncBillingEntry(tx, completed, student.rate, 50);
    });

    const first = await prisma.$transaction((tx) => createInvoice(tx, student.id, 'PER_LESSON', 'Test Teacher'));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.total).toBe(student.rate);

    const second = await prisma.$transaction((tx) => createInvoice(tx, student.id, 'PER_LESSON', 'Test Teacher'));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toMatch(/no eligible lessons/i);
  });
});
