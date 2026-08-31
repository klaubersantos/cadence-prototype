import { prisma } from '@/lib/prisma';
import { nextId } from '@/lib/engine/identifiers';
import { BillingMode, PortalStatus } from '@/lib/generated/prisma/client';

// Every test creates its own throwaway Studio (and cascades from there) so
// tests can run concurrently without colliding, then tears it down itself.
export async function makeStudio(namePrefix: string) {
  const studio = await prisma.studio.create({
    data: {
      name: `${namePrefix} Studio`,
      teacherName: 'Test Teacher',
      teacherEmail: `${namePrefix.toLowerCase()}-teacher@test.dev`,
      timezone: 'UTC',
      defaultDuration: 45,
      defaultLocation: 'Test Room',
      lateCancelWindowHours: 24,
      lateCancelChargePct: 50,
      policyNote: 'Test policy note.',
    },
  });
  return studio;
}

export async function makeStudent(studioId: string, namePrefix: string, rateCents = 6000) {
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        publicId: await nextId(tx, 'STU'),
        studioId,
        name: `${namePrefix} Student`,
        email: `${namePrefix.toLowerCase()}-${Date.now()}@test.dev`,
        rate: rateCents,
        billingMode: BillingMode.PER_LESSON,
        reminderHours: 24,
        portalStatus: PortalStatus.ACTIVE,
      },
    });
    return student;
  });
}

export async function makeLesson(studentId: string, start: Date) {
  return prisma.$transaction(async (tx) => {
    return tx.lesson.create({
      data: {
        publicId: await nextId(tx, 'LSN'),
        studentId,
        start,
        durationMin: 45,
        location: 'Test Room',
      },
    });
  });
}

export async function cleanupStudio(studioId: string) {
  const students = await prisma.student.findMany({ where: { studioId } });
  const studentIds = students.map((s) => s.id);
  const lessons = await prisma.lesson.findMany({ where: { studentId: { in: studentIds } } });
  const lessonIds = lessons.map((l) => l.id);
  const invoices = await prisma.invoice.findMany({ where: { studentId: { in: studentIds } } });
  const invoiceIds = invoices.map((i) => i.id);

  await prisma.notificationEvent.deleteMany({ where: { notification: { studentId: { in: studentIds } } } });
  await prisma.notification.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.invoiceSnapshot.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.receipt.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.billingEntry.deleteMany({ where: { lessonId: { in: lessonIds } } });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  // AccessLogEntry is intentionally left alone here — it has no studio/student
  // foreign key (it's a global audit log, like the prototype's), and other
  // test files may be asserting against it concurrently.
  await prisma.activityLog.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
  await prisma.invitation.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.studio.delete({ where: { id: studioId } });
}
