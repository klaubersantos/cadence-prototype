import { LessonState } from '@/lib/generated/prisma/client';

// Ported from cadence-prototype/js/data.js — I02-R01 state vocabulary.
export const LESSON_STATE_META: Record<LessonState, { label: string; badge: string; terminal: boolean }> = {
  SCHEDULED: { label: 'Scheduled', badge: 'b-scheduled', terminal: false },
  COMPLETED: { label: 'Completed', badge: 'b-completed', terminal: true },
  NO_SHOW: { label: 'No-show', badge: 'b-noshow', terminal: true },
  CANCELLED_STUDENT: { label: 'Cancelled by student', badge: 'b-cxs', terminal: true },
  CANCELLED_TEACHER: { label: 'Cancelled by teacher', badge: 'b-cxt', terminal: true },
};

// Allowed transitions from Scheduled only (I02-R01). Reversion out of a
// terminal state is a separate, teacher-only operation (see engine/lessons.ts).
export const ALLOWED_FROM_SCHEDULED: LessonState[] = [
  LessonState.COMPLETED,
  LessonState.NO_SHOW,
  LessonState.CANCELLED_STUDENT,
  LessonState.CANCELLED_TEACHER,
];
