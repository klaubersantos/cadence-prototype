'use client';

import { useState, type ReactNode } from 'react';

// Client wrapper only for the mobile nav toggle (`.rail.open`) — everything
// else here is server-rendered content passed through as props/children.
export function Shell({ rail, topbarLeft, children }: { rail: ReactNode; topbarLeft: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="shell">
      <aside className={`rail${open ? ' open' : ''}`}>{rail}</aside>
      <main className="main">
        <div className="topbar">
          <button className="btn sm" type="button" onClick={() => setOpen((o) => !o)}>
            Menu
          </button>
          {topbarLeft}
        </div>
        <div className="canvas">{children}</div>
      </main>
    </div>
  );
}
