import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { syncBillingEntry } from '@/lib/engine/billing';
import { createInvoice } from '@/lib/engine/invoices';
import { REFUSAL, portalFetch } from '@/lib/engine/access';
import { LessonState } from '@/lib/generated/prisma/client';
import { cleanupStudio, makeLesson, makeStudent, makeStudio } from '../helpers';

// I10-R04: a record that doesn't exist and a record owned by someone else
// must be refused with the exact same message — no leak either way.
describe('portalFetch refusal', () => {
  let studioId: string;

  beforeAll(async () => {
    const studio = await makeStudio('Access');
    studioId = studio.id;
  });

  afterAll(async () => {
    await cleanupStudio(studioId);
  });

  it('answers identically for "does not exist" and "not yours"', async () => {
    const owner = await makeStudent(studioId, 'Owner');
    const intruder = await makeStudent(studioId, 'Intruder');
    const lesson = await makeLesson(owner.id, new Date(Date.now() - 86400000));

    const invoice = await prisma.$transaction(async (tx) => {
      const l = await tx.lesson.update({ where: { id: lesson.id }, data: { state: LessonState.COMPLETED } });
      await syncBillingEntry(tx, l, owner.rate, 50);
      return createInvoice(tx, owner.id, 'PER_LESSON', 'Test Teacher');
    });
    if (!invoice.ok) throw new Error(invoice.error);

    const notOwned = await prisma.$transaction((tx) => portalFetch(tx, 'invoice', invoice.value.publicId, intruder.id));
    const notFound = await prisma.$transaction((tx) => portalFetch(tx, 'invoice', 'INV-999999', intruder.id));

    expect(notOwned.ok).toBe(false);
    expect(notFound.ok).toBe(false);
    if (notOwned.ok || notFound.ok) return;
    expect(notOwned.error).toBe(REFUSAL);
    expect(notFound.error).toBe(REFUSAL);
    expect(notOwned.error).toBe(notFound.error);

    const owned = await prisma.$transaction((tx) => portalFetch(tx, 'invoice', invoice.value.publicId, owner.id));
    expect(owned.ok).toBe(true);
  });
});
