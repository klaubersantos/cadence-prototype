import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { syncBillingEntry, unbilledEntries } from '@/lib/engine/billing';
import { LessonState } from '@/lib/generated/prisma/client';
import { cleanupStudio, makeLesson, makeStudent, makeStudio } from '../helpers';

// I07-R01: a lesson carries AT MOST ONE live billing entry, no matter how
// many times syncBillingEntry runs for it.
describe('syncBillingEntry idempotency', () => {
  let studioId: string;

  beforeAll(async () => {
    const studio = await makeStudio('Billing');
    studioId = studio.id;
  });

  afterAll(async () => {
    await cleanupStudio(studioId);
  });

  it('never creates a second live entry for the same lesson', async () => {
    const student = await makeStudent(studioId, 'Billing');
    const lesson = await makeLesson(student.id, new Date(Date.now() - 86400000));

    await prisma.$transaction(async (tx) => {
      const completed = await tx.lesson.update({ where: { id: lesson.id }, data: { state: LessonState.COMPLETED } });
      await syncBillingEntry(tx, completed, student.rate, 50);
      await syncBillingEntry(tx, completed, student.rate, 50); // repeated submission
      await syncBillingEntry(tx, completed, student.rate, 50); // and again
    });

    const entries = await prisma.billingEntry.findMany({ where: { lessonId: lesson.id } });
    const live = entries.filter((e) => !e.voided);
    expect(live).toHaveLength(1);
    expect(live[0].amount).toBe(student.rate);

    const unbilled = await unbilledEntries(prisma, student.id);
    expect(unbilled).toHaveLength(1); // I07: never the same lesson twice
  });
});
