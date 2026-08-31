'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { transition } from '@/lib/engine/lessons';
import { pay } from '@/lib/engine/invoices';
import { LessonState } from '@/lib/generated/prisma/client';

async function requireStudent() {
  const session = await auth();
  if (!session || session.user.role !== 'STUDENT') throw new Error('Unauthorized');
  return session;
}

// Every write here re-checks ownership server-side — the portal UI only
// ever renders controls for the signed-in student's own records, but a
// Server Function is reachable directly, so that can't be the only guard.
export async function cancelLessonAction(formData: FormData) {
  const session = await requireStudent();
  const id = String(formData.get('id'));

  const lesson = await prisma.lesson.findUnique({ where: { id } });
  if (!lesson || lesson.studentId !== session.user.id) throw new Error('That lesson could not be found.');

  const result = await prisma.$transaction((tx) => transition(tx, id, LessonState.CANCELLED_STUDENT, session.user.name ?? 'Student', 'STUDENT'));
  if (!result.ok) throw new Error(result.error);
  revalidatePath('/portal/lessons');
  revalidatePath('/portal/overview');
}

export async function payInvoiceAction(formData: FormData) {
  const session = await requireStudent();
  const id = String(formData.get('id'));

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice || invoice.studentId !== session.user.id) throw new Error('That invoice could not be found.');

  const result = await prisma.$transaction((tx) => pay(tx, id, session.user.name ?? 'Student'));
  if (!result.ok) throw new Error(result.error);
  revalidatePath('/portal/invoices');
  revalidatePath('/portal/overview');
}

export async function probeInvoiceAction(formData: FormData) {
  await requireStudent();
  const pid = String(formData.get('pid') || '').trim().toUpperCase();
  if (!pid) redirect('/portal/invoices');
  redirect(`/portal/invoices/${pid}`);
}
