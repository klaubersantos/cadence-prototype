import type { Prisma, PrismaClient } from '@/lib/generated/prisma/client';

type Tx = PrismaClient | Prisma.TransactionClient;

export async function logActivity(
  tx: Tx,
  actor: string,
  text: string,
  refs: { lessonId?: string | null; studentId?: string | null; invoiceId?: string | null; kind: string },
) {
  return tx.activityLog.create({
    data: {
      actor,
      text,
      lessonId: refs.lessonId ?? null,
      studentId: refs.studentId ?? null,
      invoiceId: refs.invoiceId ?? null,
      kind: refs.kind,
    },
  });
}
