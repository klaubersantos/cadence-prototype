import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Uid } from '@/components/ui';
import { NavLink } from '@/components/NavLink';
import { Shell } from '@/components/Shell';

const NAV: [string, string][] = [
  ['/portal/overview', 'Overview'],
  ['/portal/lessons', 'My lessons'],
  ['/portal/invoices', 'Invoices & receipts'],
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== 'STUDENT') redirect('/login');

  const student = await prisma.student.findUniqueOrThrow({ where: { id: session.user.id } });

  const rail = (
    <>
      <div className="brand">
        <div className="word">Cadence</div>
        <div className="sub">Student portal</div>
      </div>
      <div className="staff">
        <i /><i /><i /><i /><i />
      </div>
      <nav className="nav">
        <div className="nav-group">Your studio</div>
        {NAV.map(([href, label]) => (
          <NavLink key={href} href={href}>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="rail-foot">
        <b>{student.name}</b>Student
      </div>
    </>
  );

  return (
    <Shell
      rail={rail}
      topbarLeft={
        <>
          <span className="tiny muted">Portal reads are scoped to you</span>
          <span className="who">
            <Uid id={student.publicId} sm />
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
