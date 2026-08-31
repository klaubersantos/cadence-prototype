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
import { logActivity } from '@/lib/engine/activity';
import { notify } from '@/lib/engine/notifications';
import { BillingMode, LessonState, NotificationType } from '@/lib/generated/prisma/client';

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
