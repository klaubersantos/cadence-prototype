import Link from 'next/link';
import type { Note } from '@/lib/generated/prisma/client';
import { fmtStamp } from '@/lib/format';
import { Card, Uid } from './ui';

// Renders the notes attached to a student/lesson/invoice, mirroring
// cadence-prototype/js/ui.js's noteHtml — private notes get a muted,
// graphite-toned card so they read as visually distinct from shared ones.
export function NoteList({
  notes,
  addNoteHref,
  emptyMessage,
}: {
  notes: Note[];
  addNoteHref: string;
  emptyMessage: string;
}) {
  return (
    <Card
      title="Notes"
      hint="Private notes never reach the portal"
      head={
        <Link className="btn sm" href={addNoteHref} style={{ marginLeft: 'auto' }}>
          Add note
        </Link>
      }
    >
      {notes.length ? (
        notes.map((n) => (
          <div
            key={n.id}
            className="note"
            style={
              n.visibility === 'PRIVATE'
                ? { borderLeftColor: 'var(--graphite)', background: '#F3F5F8', color: 'var(--graphite)' }
                : undefined
            }
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <Uid id={n.publicId} sm />
              <span className={`badge ${n.visibility === 'SHARED' ? 'b-completed' : 'b-neutral'}`}>
                {n.visibility === 'SHARED' ? 'Shared with student' : 'Private'}
              </span>
              <span className="tiny muted" style={{ marginLeft: 'auto' }}>
                {fmtStamp(n.createdAt)}
                {Array.isArray(n.edits) && n.edits.length > 0 ? ' · edited' : ''}
              </span>
            </div>
            {n.content}
          </div>
        ))
      ) : (
        <p className="muted tiny">{emptyMessage}</p>
      )}
    </Card>
  );
}
