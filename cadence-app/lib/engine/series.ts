import type { Prisma, PrismaClient, Series } from '@/lib/generated/prisma/client';
import { BoundaryType, LessonState, NotificationType } from '@/lib/generated/prisma/client';
import { addDays, addWeeks, atTime } from '../format';
import { nextId } from './identifiers';
import { logActivity } from './activity';
import { notify } from './notifications';
import { ok } from './result';

type Tx = PrismaClient | Prisma.TransactionClient;

// ============================================================
// RECURRING SERIES — BASE-R06, I03
// Ported from cadence-prototype/js/data.js (materializeSeries) and
// js/engine.js (reviseSeries). No creation/revision UI ships in this
// iteration, but lesson seeding depends on materializeSeries, and the
// full rule is kept together rather than half-ported.
// ============================================================
export async function materializeSeries(tx: Tx, series: Series, today: Date, defaultLocation: string) {
  const horizonEnd = series.boundaryType === BoundaryType.ONGOING ? addWeeks(today, series.horizonWeeks) : new Date(series.endDate!);
  let cursor = new Date(series.startDate);
  while (cursor.getDay() !== series.dayOfWeek) cursor = addDays(cursor, 1);

  let guard = 0;
  while (cursor <= horizonEnd && guard++ < 400) {
    await tx.lesson.create({
      data: {
        publicId: await nextId(tx, 'LSN'),
        studentId: series.studentId,
        seriesId: series.id,
        start: atTime(cursor, series.time),
        durationMin: series.durationMin,
        location: defaultLocation,
      },
    });
    cursor = addWeeks(cursor, 1);
  }
  await tx.series.update({ where: { id: series.id }, data: { lastMaterialized: addDays(cursor, -7) } });
}

type SeriesChanges = {
  dayOfWeek?: number;
  time?: string;
  durationMin?: number;
  boundaryType?: 'ONGOING' | 'END_DATE';
  endDate?: Date | null;
};

// I03-R02/R03: applies only to future occurrences still Scheduled;
// identifiers are retained (rescheduled, not replaced); a save that
// changes no field creates no record and sends no notice.
export async function reviseSeries(tx: Tx, seriesId: string, changes: SeriesChanges, actor: string, defaultLocation: string) {
  const series = await tx.series.findUniqueOrThrow({ where: { id: seriesId } });
  const now = new Date();

  const changed: { field: string; from: unknown; to: unknown }[] = [];
  (['dayOfWeek', 'time', 'durationMin', 'boundaryType', 'endDate'] as const).forEach((field) => {
    const next = changes[field];
    if (next === undefined || next === null || next === '') return;
    const current = series[field];
    if (String(current ?? '') !== String(next)) changed.push({ field, from: current, to: next });
  });

  if (!changed.length) return ok({ noop: true as const, affected: 0 });

  const future = await tx.lesson.findMany({
    where: { seriesId: series.id, state: LessonState.SCHEDULED, start: { gt: now } },
  });

  const patch: Prisma.SeriesUpdateInput = {};
  changed.forEach((c) => {
    (patch as Record<string, unknown>)[c.field] = c.to;
  });
  const updatedSeries = await tx.series.update({ where: { id: series.id }, data: patch });

  const movesDateOrTime = changed.some((c) => c.field === 'dayOfWeek' || c.field === 'time');
  let affected = 0;
  for (const lesson of future) {
    let start = new Date(lesson.start);
    if (movesDateOrTime) {
      const delta = (updatedSeries.dayOfWeek - start.getDay() + 7) % 7;
      start = atTime(addDays(start, delta), updatedSeries.time);
    }
    await tx.lesson.update({ where: { id: lesson.id }, data: { start, durationMin: updatedSeries.durationMin } });
    affected++;
  }

  let added = 0;
  let removed = 0;
  if (changed.some((c) => c.field === 'boundaryType' || c.field === 'endDate')) {
    const horizon =
      updatedSeries.boundaryType === BoundaryType.ONGOING
        ? addWeeks(now, updatedSeries.horizonWeeks)
        : new Date(updatedSeries.endDate!);
    const all = await tx.lesson.findMany({ where: { seriesId: series.id }, orderBy: { start: 'desc' } });
    let cursor = addWeeks(all[0]?.start ?? now, 1);
    let guard = 0;
    while (cursor <= horizon && guard++ < 100) {
      await tx.lesson.create({
        data: {
          publicId: await nextId(tx, 'LSN'),
          studentId: updatedSeries.studentId,
          seriesId: updatedSeries.id,
          start: atTime(cursor, updatedSeries.time),
          durationMin: updatedSeries.durationMin,
          location: defaultLocation,
        },
      });
      added++;
      cursor = addWeeks(cursor, 1);
    }

    // shortening removes only Scheduled occurrences past the boundary; numbers are not reused
    const doomed = await tx.lesson.findMany({
      where: { seriesId: series.id, state: LessonState.SCHEDULED, start: { gt: horizon } },
    });
    removed = doomed.length;
    if (doomed.length) await tx.lesson.deleteMany({ where: { id: { in: doomed.map((l) => l.id) } } });
    await tx.series.update({ where: { id: series.id }, data: { lastMaterialized: horizon } });
  }

  const revisionCount = await tx.seriesRevision.count({ where: { seriesId: series.id } });
  const revision = await tx.seriesRevision.create({
    data: {
      seriesId: series.id,
      seq: revisionCount + 1,
      actor,
      fields: changed as unknown as Prisma.InputJsonValue,
      affected,
      added,
      removed,
    },
  });

  if (affected + added + removed > 0) {
    const student = await tx.student.findUniqueOrThrow({ where: { id: updatedSeries.studentId } });
    await notify(tx, NotificationType.RESCHEDULE, student.email, { studentId: student.id });
  }
  await logActivity(
    tx,
    actor,
    `Series revised — ${changed.map((c) => c.field).join(', ')}. ${affected} scheduled occurrence(s) moved, ${added} added, ${removed} removed.`,
    { studentId: updatedSeries.studentId, kind: 'revision' },
  );

  return ok(revision);
}
