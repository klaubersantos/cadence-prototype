import type { Prisma, PrismaClient } from '@/lib/generated/prisma/client';
import { NotificationType, PortalStatus } from '@/lib/generated/prisma/client';
import { logActivity } from './activity';
import { notify } from './notifications';
import { fail, ok } from './result';

type Tx = PrismaClient | Prisma.TransactionClient;

// ============================================================
// PORTAL ACCESS SCOPE — I10-R01..R04
// Every portal read is scoped server-side to the authenticated
// student. A record owned by someone else is refused with the SAME
// message as a record that does not exist — no identifier, owner,
// amount or state is disclosed. Ported from cadence-prototype/js/engine.js.
// ============================================================
export const REFUSAL = 'That link is not valid. Check the address, or ask your teacher to send it again.';

type PortalKind = 'lesson' | 'invoice' | 'payment' | 'receipt';

export async function portalFetch(tx: Tx, kind: PortalKind, publicId: string, authStudentId: string) {
  let record: { id: string } | null = null;
  let ownerStudentId: string | null = null;

  if (kind === 'lesson') {
    const r = await tx.lesson.findUnique({ where: { publicId } });
    record = r;
    ownerStudentId = r?.studentId ?? null;
  } else if (kind === 'invoice') {
    const r = await tx.invoice.findUnique({ where: { publicId } });
    record = r;
    ownerStudentId = r?.studentId ?? null;
  } else if (kind === 'payment') {
    const r = await tx.payment.findUnique({ where: { publicId }, include: { invoice: true } });
    record = r;
    ownerStudentId = r?.invoice.studentId ?? null;
  } else {
    const r = await tx.receipt.findUnique({ where: { publicId }, include: { invoice: true } });
    record = r;
    ownerStudentId = r?.invoice.studentId ?? null;
  }

  const granted = !!record && ownerStudentId === authStudentId;
  await tx.accessLogEntry.create({
    data: {
      kind,
      publicId,
      by: authStudentId,
      granted,
      reason: !record ? 'no such record' : granted ? 'owner' : 'owned by another student',
    },
  });

  if (!granted) return fail(REFUSAL); // identical message either way (I10-R04)
  return ok(record!);
}

function randomToken(seed: string): string {
  return `inv_${seed.toLowerCase().replace('-', '')}_${Math.random().toString(16).slice(2, 6)}`;
}

export async function consumeInvitation(tx: Tx, token: string, passwordHash: string) {
  const invitation = await tx.invitation.findUnique({ where: { token } });
  if (!invitation || invitation.consumed) {
    await tx.accessLogEntry.create({
      data: {
        kind: 'invitation',
        publicId: token,
        by: null,
        granted: false,
        reason: !invitation ? 'no such token' : 'token already consumed',
      },
    });
    return fail(REFUSAL); // I10-R01: single use
  }

  await tx.invitation.update({ where: { id: invitation.id }, data: { consumed: true, consumedAt: new Date() } });
  const student = await tx.student.update({
    where: { id: invitation.studentId },
    data: { portalStatus: PortalStatus.ACTIVE, passwordHash },
  });

  await tx.accessLogEntry.create({
    data: { kind: 'invitation', publicId: token, by: student.email, granted: true, reason: 'first use by intended recipient' },
  });
  await logActivity(tx, student.name, 'Portal invitation consumed. Password set on first access.', {
    studentId: student.id,
    kind: 'access',
  });
  return ok(student);
}

export async function sendInvite(tx: Tx, studentId: string, teacherName: string) {
  const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
  const token = randomToken(student.publicId);
  await tx.invitation.create({ data: { token, studentId: student.id } });
  if (student.portalStatus === PortalStatus.NONE) {
    await tx.student.update({ where: { id: student.id }, data: { portalStatus: PortalStatus.INVITED } });
  }
  await notify(tx, NotificationType.INVITE, student.email, { studentId: student.id });
  await logActivity(tx, teacherName, `Portal invitation sent to ${student.email}.`, { studentId: student.id, kind: 'access' });
  return ok(token);
}
