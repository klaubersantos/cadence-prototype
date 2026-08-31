/* Cadence — dev seed.
   Ported narrative from cadence-prototype/js/data.js's seed(), simplified:
   identifiers are assigned at creation (no migration reenactment — see
   the plan's "Data model" note), and real passwords replace the
   prototype's persona picker. Idempotent: wipes and recreates every time.
   Run with: npm run db:seed
*/
import bcrypt from 'bcryptjs';
import { PrismaClient, BillingMode, BoundaryType, LessonState, PortalStatus } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { addDays, addWeeks, atTime } from '../lib/format';
import { syncBillingEntry } from '../lib/engine/billing';
import { materializeSeries } from '../lib/engine/series';
import { createInvoice, pay } from '../lib/engine/invoices';
import { nextId } from '../lib/engine/identifiers';
import { logActivity } from '../lib/engine/activity';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function wipe() {
  await prisma.notificationEvent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.invoiceSnapshot.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.billingEntry.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.seriesRevision.deleteMany();
  await prisma.note.deleteMany();
  await prisma.accessLogEntry.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.series.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.studio.deleteMany();
  await prisma.sequence.deleteMany();
}

async function main() {
  await wipe();

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const studio = await prisma.studio.create({
    data: {
      name: 'Rowan Street Music',
      teacherName: 'Marta Alves',
      teacherEmail: 'teacher@studio.dev',
      timezone: 'America/New_York',
      defaultDuration: 45,
      defaultLocation: 'Studio A — 118 Rowan St',
      lateCancelWindowHours: 24,
      lateCancelChargePct: 50,
      policyNote: 'Cancellations inside 24 hours are billed at 50% of the lesson rate.',
    },
  });

  await prisma.teacher.create({
    data: {
      studioId: studio.id,
      name: studio.teacherName,
      email: studio.teacherEmail,
      passwordHash: bcrypt.hashSync('teacher123', 10),
    },
  });

  const ava = await prisma.$transaction((tx) =>
    tx.student.create({
      data: {
        publicId: '', // placeholder — nextId needs the row's own transaction below
        studioId: studio.id,
        name: 'Ava Thompson',
        email: 'ava.thompson@example.com',
        passwordHash: bcrypt.hashSync('student123', 10),
        rate: 6000,
        billingMode: BillingMode.PER_LESSON,
        reminderHours: 24,
        portalStatus: PortalStatus.ACTIVE,
      },
    }).then(async (s) => tx.student.update({ where: { id: s.id }, data: { publicId: await nextId(tx, 'STU') } })),
  );

  const ben = await prisma.$transaction((tx) =>
    tx.student
      .create({
        data: {
          publicId: '',
          studioId: studio.id,
          name: 'Ben Carter',
          email: 'ben.carter@example.com',
          rate: 5500,
          billingMode: BillingMode.PER_LESSON,
          reminderHours: 12,
          portalStatus: PortalStatus.INVITED,
        },
      })
      .then(async (s) => tx.student.update({ where: { id: s.id }, data: { publicId: await nextId(tx, 'STU') } })),
  );

  const noor = await prisma.$transaction((tx) =>
    tx.student
      .create({
        data: {
          publicId: '',
          studioId: studio.id,
          name: 'Noor Haddad',
          email: 'noor.haddad@example.com',
          passwordHash: bcrypt.hashSync('student123', 10),
          rate: 22000,
          monthlyAmount: 22000,
          billingMode: BillingMode.MONTHLY,
          reminderHours: 24,
          portalStatus: PortalStatus.ACTIVE,
        },
      })
      .then(async (s) => tx.student.update({ where: { id: s.id }, data: { publicId: await nextId(tx, 'STU') } })),
  );

  // Ben's open invitation (unconsumed) — visit /invite/<token> to activate.
  const benToken = `inv_${ben.id.slice(0, 8)}_demo`;
  await prisma.invitation.create({ data: { token: benToken, studentId: ben.id } });

  // --- Ava: a recurring Tuesday series, 9 weeks back through 2 weeks ahead ---
  const avaSeries = await prisma.series.create({
    data: {
      studentId: ava.id,
      dayOfWeek: 2,
      time: '16:00',
      durationMin: 45,
      startDate: addWeeks(today, -9),
      boundaryType: BoundaryType.ONGOING,
      horizonWeeks: 2,
    },
  });
  await prisma.$transaction((tx) => materializeSeries(tx, avaSeries, today, studio.defaultLocation));

  // historical states for Ava's past occurrences: mostly completed, one
  // no-show, one late cancellation (I07)
  const avaPast = await prisma.lesson.findMany({
    where: { studentId: ava.id, start: { lt: now } },
    orderBy: { start: 'asc' },
  });
  await prisma.$transaction(async (tx) => {
    for (const [i, lesson] of avaPast.entries()) {
      let updated;
      if (i === avaPast.length - 2) {
        // most recent-but-one: a late cancellation
        const cancelledAt = new Date(new Date(lesson.start).getTime() - 4 * 3600 * 1000);
        updated = await tx.lesson.update({
          where: { id: lesson.id },
          data: { state: LessonState.CANCELLED_STUDENT, cancelledAt, lateCancel: true, stateSetAt: cancelledAt },
        });
      } else if (i === 1) {
        updated = await tx.lesson.update({
          where: { id: lesson.id },
          data: { state: LessonState.NO_SHOW, stateSetAt: lesson.start },
        });
      } else {
        updated = await tx.lesson.update({
          where: { id: lesson.id },
          data: { state: LessonState.COMPLETED, stateSetAt: lesson.start },
        });
      }
      await syncBillingEntry(tx, updated, ava.rate, studio.lateCancelChargePct);
    }
  });

  // --- Ben: one past one-off lesson, completed, plus one upcoming ---
  await prisma.$transaction(async (tx) => {
    const past = await tx.lesson.create({
      data: {
        publicId: await nextId(tx, 'LSN'),
        studentId: ben.id,
        start: addDays(today, -14),
        durationMin: 45,
        location: studio.defaultLocation,
        state: LessonState.COMPLETED,
        stateSetAt: addDays(today, -14),
      },
    });
    await syncBillingEntry(tx, past, ben.rate, studio.lateCancelChargePct);
    await tx.lesson.create({
      data: {
        publicId: await nextId(tx, 'LSN'),
        studentId: ben.id,
        start: atTime(addDays(today, 5), '15:00'),
        durationMin: 45,
        location: studio.defaultLocation,
      },
    });
  });

  // --- Noor: a Thursday series with a fixed end date, monthly billing ---
  const noorSeries = await prisma.series.create({
    data: {
      studentId: noor.id,
      dayOfWeek: 4,
      time: '17:30',
      durationMin: 60,
      startDate: addWeeks(today, -3),
      boundaryType: BoundaryType.END_DATE,
      endDate: addWeeks(today, 6),
    },
  });
  await prisma.$transaction((tx) => materializeSeries(tx, noorSeries, today, studio.defaultLocation));
  const noorPast = await prisma.lesson.findMany({ where: { studentId: noor.id, start: { lt: now } } });
  await prisma.$transaction(async (tx) => {
    for (const lesson of noorPast) {
      const updated = await tx.lesson.update({
        where: { id: lesson.id },
        data: { state: LessonState.COMPLETED, stateSetAt: lesson.start },
      });
      await syncBillingEntry(tx, updated, noor.rate, studio.lateCancelChargePct);
    }
  });

  // --- invoicing: give Ava one paid (historical) and one open invoice ---
  const firstInvoice = await prisma.$transaction((tx) => createInvoice(tx, ava.id, 'PER_LESSON', studio.teacherName));
  if (firstInvoice.ok) {
    await prisma.$transaction((tx) => pay(tx, firstInvoice.value.id, studio.teacherName));
  }

  await prisma.$transaction(async (tx) => {
    const extra = await tx.lesson.create({
      data: {
        publicId: await nextId(tx, 'LSN'),
        studentId: ava.id,
        start: addDays(today, -2),
        durationMin: 45,
        location: studio.defaultLocation,
        state: LessonState.COMPLETED,
        stateSetAt: addDays(today, -2),
      },
    });
    await syncBillingEntry(tx, extra, ava.rate, studio.lateCancelChargePct);
  });
  await prisma.$transaction((tx) => createInvoice(tx, ava.id, 'PER_LESSON', studio.teacherName));

  // Noor's monthly tuition invoice, left open
  await prisma.$transaction((tx) => createInvoice(tx, noor.id, 'MONTHLY', studio.teacherName));

  await prisma.$transaction((tx) =>
    logActivity(tx, 'system', 'Studio seeded for local development.', { kind: 'system' }),
  );

  console.log('Seed complete.');
  console.log(`Teacher login:  ${studio.teacherEmail} / teacher123`);
  console.log(`Ava login:      ${ava.email} / student123`);
  console.log(`Noor login:     ${noor.email} / student123`);
  console.log(`Ben's invite:   /invite/${benToken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
