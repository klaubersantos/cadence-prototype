import type { Prisma, PrismaClient } from '@/lib/generated/prisma/client';

// Ported from cadence-prototype/js/data.js — nextId(prefix).
// Fixed three-letter prefix + hyphen + six-digit zero-padded sequence.
// Sequences are per entity type, starting at 000001, and never reused,
// regenerated or reassigned (I01-R01). Must be called inside the same
// transaction as the record it names, so a rolled-back create never
// burns a number twice — but a burned number on a failed create is
// still acceptable per the prototype's own rule ("never reused" means
// never reused for a DIFFERENT record, not that gaps can't exist).
export const PREFIXES = ['STU', 'LSN', 'INV', 'PAY', 'RCP', 'NOT', 'NTE'] as const;
export type IdPrefix = (typeof PREFIXES)[number];

type Tx = PrismaClient | Prisma.TransactionClient;

export async function nextId(tx: Tx, prefix: IdPrefix): Promise<string> {
  const seq = await tx.sequence.upsert({
    where: { prefix },
    create: { prefix, counter: 1 },
    update: { counter: { increment: 1 } },
  });
  return `${prefix}-${String(seq.counter).padStart(6, '0')}`;
}
