import type { Prisma, PrismaClient } from '@/lib/generated/prisma/client';
import { NoteTargetType, NoteVisibility } from '@/lib/generated/prisma/client';
import { nextId } from './identifiers';
import { ok } from './result';

type Tx = PrismaClient | Prisma.TransactionClient;

// ============================================================
// NOTES — I09-R02, I09-R03
// Ported from cadence-prototype/js/engine.js. No dedicated UI ships in
// this iteration; kept here so student/lesson/invoice detail pages can
// grow a notes panel later without touching the rules.
// ============================================================
export async function addNote(
  tx: Tx,
  targetType: NoteTargetType,
  targetId: string,
  content: string,
  visibility: NoteVisibility,
  author: string,
) {
  const note = await tx.note.create({
    data: { publicId: await nextId(tx, 'NTE'), targetType, targetId, author, content, visibility },
  });
  return ok(note);
}

export async function editNote(tx: Tx, noteId: string, content: string, visibility: NoteVisibility) {
  const existing = await tx.note.findUniqueOrThrow({ where: { id: noteId } });
  const edits = Array.isArray(existing.edits) ? existing.edits : [];
  const note = await tx.note.update({
    where: { id: noteId },
    data: {
      content,
      visibility,
      edits: [...edits, { at: new Date().toISOString(), from: { content: existing.content, visibility: existing.visibility } }],
    },
  });
  return ok(note);
}

export async function deleteNote(tx: Tx, noteId: string) {
  // identifier is not released (I09-R02)
  const note = await tx.note.update({ where: { id: noteId }, data: { deleted: true } });
  return ok(note);
}

export async function notesFor(tx: Tx, targetType: NoteTargetType, targetId: string, role: 'TEACHER' | 'STUDENT') {
  return tx.note.findMany({
    where: {
      targetType,
      targetId,
      deleted: false,
      // I09-R03: a student portal view never sees a private note
      ...(role === 'STUDENT' ? { visibility: NoteVisibility.SHARED } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}
