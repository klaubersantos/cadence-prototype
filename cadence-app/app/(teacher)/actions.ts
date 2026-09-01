'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { nextId } from '@/lib/engine/identifiers';
import { transition, revert } from '@/lib/engine/lessons';
import { createInvoice } from '@/lib/engine/invoices';
import { sendInvite } from '@/lib/engine/access';
import { materializeSeries, reviseSeries } from '@/lib/engine/series';
import { addNote } from '@/lib/engine/notes';
import { logActivity } from '@/lib/engine/activity';
import { notify } from '@/lib/engine/notifications';
import { BillingMode, BoundaryType, LessonState, NotificationType, NoteTargetType, NoteVisibility } from '@/lib/generated/prisma/client';

async function requireTeacher() {
  const session = await auth();
  if (!session || session.user.role !== 'TEACHER') throw new Error('Unauthorized');
  return session;
}

export async function transitionLessonAction(formData: FormData) {
  const session = await requireTeacher();
  const id = String(formData.get('id'));
  const to = String(formData.get('to')) as LessonState;

  const result = await prisma.$transaction((tx) => transition(tx, id, to, session.user.name ?? 'Teacher', 'TEACHER'));
  if (!result.ok) throw new Error(result.error);
  revalidatePath('/', 'layout');
}

export async function revertLessonAction(formData: FormData) {
  const session = await requireTeacher();
  const id = String(formData.get('id'));

  const result = await prisma.$transaction((tx) => revert(tx, id, session.user.name ?? 'Teacher'));
  if (!result.ok) throw new Error(result.error);
  revalidatePath('/', 'layout');
}

const studentSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  rate: z.coerce.number().min(0),
  billingMode: z.enum(['PER_LESSON', 'MONTHLY']),
  reminderHours: z.coerce.number().min(1).max(48),
});

export async function createStudentAction(formData: FormData) {
  await requireTeacher();
  const parsed = studentSchema.parse({
    name: formData.get('name'),
    email: formData.get('email'),
    rate: formData.get('rate'),
    billingMode: formData.get('billingMode'),
    reminderHours: formData.get('reminderHours'),
  });
  const rateCents = Math.round(parsed.rate * 100);

  const studio = await prisma.studio.findFirstOrThrow();
  const student = await prisma.$transaction(async (tx) => {
    const s = await tx.student.create({
      data: {
        publicId: await nextId(tx, 'STU'),
        studioId: studio.id,
        name: parsed.name,
        email: parsed.email,
        rate: rateCents,
        billingMode: parsed.billingMode as BillingMode,
        monthlyAmount: parsed.billingMode === 'MONTHLY' ? rateCents * 4 : 0,
        reminderHours: parsed.reminderHours,
      },
    });
    await logActivity(tx, studio.teacherName, `Student ${s.publicId} added to the roster.`, { studentId: s.id, kind: 'student' });
    return s;
  });

  revalidatePath('/students');
  redirect(`/students/${student.id}`);
}

export async function sendInviteAction(formData: FormData) {
  await requireTeacher();
  const studentId = String(formData.get('studentId'));
  const studio = await prisma.studio.findFirstOrThrow();
  const result = await prisma.$transaction((tx) => sendInvite(tx, studentId, studio.teacherName));
  if (!result.ok) throw new Error(result.error);
  revalidatePath(`/students/${studentId}`);
}

const invoiceSchema = z.object({
  studentId: z.string().min(1),
  mode: z.enum(['PER_LESSON', 'MONTHLY']),
});

export async function createInvoiceAction(formData: FormData) {
  const session = await requireTeacher();
  const parsed = invoiceSchema.parse({ studentId: formData.get('studentId'), mode: formData.get('mode') });

  const result = await prisma.$transaction((tx) =>
    createInvoice(tx, parsed.studentId, parsed.mode, session.user.name ?? 'Teacher'),
  );
  revalidatePath('/unbilled');
  revalidatePath('/invoices');
  revalidatePath(`/students/${parsed.studentId}`);
  if (!result.ok) {
    redirect(`/unbilled?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/invoices/${result.value.id}`);
}

export async function alertInvoiceAction(formData: FormData) {
  const session = await requireTeacher();
  const id = String(formData.get('id'));
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  const student = await prisma.student.findUniqueOrThrow({ where: { id: invoice.studentId } });

  await prisma.$transaction(async (tx) => {
    await notify(tx, NotificationType.UNPAID_ALERT, student.email, { invoiceId: invoice.id, studentId: student.id });
    await logActivity(tx, session.user.name ?? 'Teacher', `Unpaid-invoice alert sent for ${invoice.publicId}.`, {
      invoiceId: invoice.id,
      studentId: student.id,
      kind: 'email',
    });
  });
  revalidatePath('/dashboard');
  revalidatePath(`/invoices/${id}`);
}

const seriesSchema = z
  .object({
    studentId: z.string().min(1),
    dayOfWeek: z.coerce.number().min(0).max(6),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    durationMin: z.coerce.number().min(1),
    boundaryType: z.enum(['ONGOING', 'END_DATE']),
    endDate: z.string().optional(),
  })
  .refine((v) => v.boundaryType !== 'END_DATE' || !!v.endDate, {
    message: 'A fixed boundary needs an end date.',
    path: ['endDate'],
  });

export async function createSeriesAction(formData: FormData) {
  const session = await requireTeacher();
  const parsed = seriesSchema.parse({
    studentId: formData.get('studentId'),
    dayOfWeek: formData.get('dayOfWeek'),
    time: formData.get('time'),
    durationMin: formData.get('durationMin'),
    boundaryType: formData.get('boundaryType'),
    endDate: formData.get('endDate') || undefined,
  });

  const studio = await prisma.studio.findFirstOrThrow();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const series = await prisma.$transaction(async (tx) => {
    const s = await tx.series.create({
      data: {
        studentId: parsed.studentId,
        dayOfWeek: parsed.dayOfWeek,
        time: parsed.time,
        durationMin: parsed.durationMin,
        startDate: today,
        boundaryType: parsed.boundaryType as BoundaryType,
        endDate: parsed.endDate ? new Date(`${parsed.endDate}T00:00`) : null,
      },
    });
    await materializeSeries(tx, s, today, studio.defaultLocation);
    const student = await tx.student.findUniqueOrThrow({ where: { id: parsed.studentId } });
    await notify(tx, NotificationType.RESCHEDULE, student.email, { studentId: student.id });
    const occurrenceCount = await tx.lesson.count({ where: { seriesId: s.id } });
    await logActivity(tx, session.user.name ?? 'Teacher', `Series created — ${occurrenceCount} occurrences materialized.`, {
      studentId: student.id,
      kind: 'series',
    });
    return s;
  });

  revalidatePath('/calendar');
  redirect(`/series/${series.id}`);
}

const reviseSchema = z.object({
  id: z.string().min(1),
  dayOfWeek: z.coerce.number().min(0).max(6).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMin: z.coerce.number().min(1).optional(),
  boundaryType: z.enum(['ONGOING', 'END_DATE']).optional(),
  endDate: z.string().optional(),
});

export async function reviseSeriesAction(formData: FormData) {
  const session = await requireTeacher();
  const parsed = reviseSchema.parse({
    id: formData.get('id'),
    dayOfWeek: formData.get('dayOfWeek'),
    time: formData.get('time'),
    durationMin: formData.get('durationMin'),
    boundaryType: formData.get('boundaryType'),
    endDate: formData.get('endDate') || undefined,
  });

  const studio = await prisma.studio.findFirstOrThrow();
  const result = await prisma.$transaction((tx) =>
    reviseSeries(
      tx,
      parsed.id,
      {
        dayOfWeek: parsed.dayOfWeek,
        time: parsed.time,
        durationMin: parsed.durationMin,
        boundaryType: parsed.boundaryType,
        endDate: parsed.endDate ? new Date(`${parsed.endDate}T00:00`) : undefined,
      },
      session.user.name ?? 'Teacher',
      studio.defaultLocation,
    ),
  );

  revalidatePath('/calendar');
  revalidatePath(`/series/${parsed.id}`);
  if (result.ok && 'noop' in result.value) {
    redirect(`/series/${parsed.id}?notice=noop`);
  }
  redirect(`/series/${parsed.id}`);
}

const studioProfileSchema = z.object({
  name: z.string().min(1),
  teacherName: z.string().min(1),
  timezone: z.string().min(1),
  defaultDuration: z.coerce.number().min(1),
  defaultLocation: z.string().min(1),
});

export async function saveStudioProfileAction(formData: FormData) {
  await requireTeacher();
  const parsed = studioProfileSchema.parse({
    name: formData.get('name'),
    teacherName: formData.get('teacherName'),
    timezone: formData.get('timezone'),
    defaultDuration: formData.get('defaultDuration'),
    defaultLocation: formData.get('defaultLocation'),
  });
  const studio = await prisma.studio.findFirstOrThrow();
  await prisma.studio.update({ where: { id: studio.id }, data: parsed });
  revalidatePath('/settings');
  revalidatePath('/', 'layout');
}

const policySchema = z.object({
  lateCancelWindowHours: z.coerce.number().min(1),
  lateCancelChargePct: z.coerce.number().min(0).max(100),
  policyNote: z.string().min(1),
});

export async function savePolicyAction(formData: FormData) {
  await requireTeacher();
  const parsed = policySchema.parse({
    lateCancelWindowHours: formData.get('lateCancelWindowHours'),
    lateCancelChargePct: formData.get('lateCancelChargePct'),
    policyNote: formData.get('policyNote'),
  });
  const studio = await prisma.studio.findFirstOrThrow();
  await prisma.studio.update({ where: { id: studio.id }, data: parsed });
  revalidatePath('/settings');
}

const noteSchema = z.object({
  targetType: z.enum(['STUDENT', 'LESSON', 'INVOICE']),
  targetId: z.string().min(1),
  content: z.string().min(1),
  visibility: z.enum(['PRIVATE', 'SHARED']),
  returnTo: z.string().startsWith('/'),
});

export async function addNoteAction(formData: FormData) {
  const session = await requireTeacher();
  const parsed = noteSchema.parse({
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    content: formData.get('content'),
    visibility: formData.get('visibility'),
    returnTo: formData.get('returnTo'),
  });

  await prisma.$transaction((tx) =>
    addNote(
      tx,
      parsed.targetType as NoteTargetType,
      parsed.targetId,
      parsed.content,
      parsed.visibility as NoteVisibility,
      session.user.name ?? 'Teacher',
    ),
  );

  revalidatePath(parsed.returnTo);
  redirect(parsed.returnTo);
}
