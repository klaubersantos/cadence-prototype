import type { ReactNode } from 'react';
import type { InvoiceStatus, LessonState } from '@/lib/generated/prisma/client';
import { LESSON_STATE_META } from '@/lib/lessonStates';

// Small presentational primitives mirroring cadence-prototype/js/ui.js's
// card()/btn()/stateBadge()/uid() helpers, as React components emitting the
// same class names so assets/styles.css applies unchanged.

export function Card({
  title,
  hint,
  head,
  tight,
  children,
}: {
  title?: string;
  hint?: string;
  head?: ReactNode;
  tight?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {title && (
        <header>
          <h3>{title}</h3>
          {hint && <span className="hint">{hint}</span>}
          {head}
        </header>
      )}
      <div className={`body${tight ? ' tight' : ''}`}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {message}
    </div>
  );
}

export function PageHead({ title, lede, actions }: { title: string; lede?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Uid({ id, sm }: { id?: string | null; sm?: boolean }) {
  if (!id) return <span className="muted tiny">—</span>;
  return (
    <span className={`uid${sm ? ' sm' : ''}`}>
      {id}
      <span className="lock">●</span>
    </span>
  );
}

export function StateBadge({ state }: { state: LessonState }) {
  const meta = LESSON_STATE_META[state];
  return <span className={`badge ${meta.badge}`}>{meta.label}</span>;
}

const INVOICE_BADGE: Record<InvoiceStatus, [string, string]> = {
  ISSUED: ['b-issued', 'Issued'],
  PAID: ['b-paid', 'Paid'],
  VOID: ['b-void', 'Void'],
};

export function InvoiceBadge({ status, flagged }: { status: InvoiceStatus; flagged?: boolean }) {
  const [cls, label] = INVOICE_BADGE[status];
  return (
    <>
      <span className={`badge ${cls}`}>{label}</span>
      {flagged && <span className="badge b-flag" style={{ marginLeft: 6 }}>Review</span>}
    </>
  );
}

export function StatCard({ k, v, n }: { k: string; v: string; n: string }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="stat">
        <div className="k">{k}</div>
        <div className="v">{v}</div>
        <div className="n">{n}</div>
      </div>
    </div>
  );
}
