import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { unbilledEntries } from '@/lib/engine/billing';
import { InvoiceStatus } from '@/lib/generated/prisma/client';
import { NavLink } from '@/components/NavLink';
import { Shell } from '@/components/Shell';

const NAV: [string, [string, string][]][] = [
  ['Studio', [['/dashboard', 'Dashboard'], ['/calendar', 'Calendar'], ['/students', 'Students']]],
  ['Money', [['/unbilled', 'Unbilled lessons'], ['/invoices', 'Invoices']]],
  ['Records', [['/emails', 'Email activity'], ['/access', 'Portal access'], ['/settings', 'Settings']]],
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== 'TEACHER') redirect('/login');

  const [studio, unbilled, openInvoiceCount, studentCount] = await Promise.all([
    prisma.studio.findFirstOrThrow(),
    unbilledEntries(prisma),
    prisma.invoice.count({ where: { status: InvoiceStatus.ISSUED } }),
    prisma.student.count(),
  ]);
  const counts: Record<string, number> = {
    '/unbilled': unbilled.length,
    '/invoices': openInvoiceCount,
    '/students': studentCount,
  };

  const rail = (
    <>
      <div className="brand">
        <div className="word">Cadence</div>
        <div className="sub">{studio.name}</div>
      </div>
      <div className="staff">
        <i /><i /><i /><i /><i />
      </div>
      <nav className="nav">
        {NAV.map(([group, links]) => (
          <div key={group}>
            <div className="nav-group">{group}</div>
            {links.map(([href, label]) => (
              <NavLink key={href} href={href}>
                {label}
                {href in counts && <span className="count">{counts[href]}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="rail-foot">
        <b>{studio.teacherName}</b>Teacher · owner
      </div>
    </>
  );

  return (
    <Shell
      rail={rail}
      topbarLeft={
        <>
          <span className="tiny muted">Teacher view — full studio access</span>
          <span className="who">
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <button className="btn sm" type="submit">
                Switch user
              </button>
            </form>
          </span>
        </>
      }
    >
      {children}
    </Shell>
  );
}
