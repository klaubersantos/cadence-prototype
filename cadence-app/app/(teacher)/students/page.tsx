import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { balance } from '@/lib/engine/billing';
import { money } from '@/lib/format';
import { Card, PageHead, Uid } from '@/components/ui';

const PORTAL_BADGE: Record<string, [string, string]> = {
  ACTIVE: ['b-completed', 'Portal active'],
  INVITED: ['b-scheduled', 'Invite pending'],
  NONE: ['b-neutral', 'Not invited'],
};

export default async function StudentsPage() {
  const students = await prisma.student.findMany({ orderBy: { publicId: 'asc' } });
  const balances = await Promise.all(students.map((s) => balance(prisma, s.id)));

  return (
    <>
      <PageHead
        title="Students"
        lede="Rates, billing mode, reminder preference and portal access."
        actions={
          <Link className="btn brass" href="/students/new">
            Add student
          </Link>
        }
      />
      <Card tight>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Student</th>
              <th>Rate</th>
              <th>Portal</th>
              <th className="num">Invoiced &amp; unpaid</th>
              <th className="num">Unbilled</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const b = balances[i];
              const [cls, label] = PORTAL_BADGE[s.portalStatus];
              return (
                <tr key={s.id} className="rowlink">
                  <td>
                    <Link href={`/students/${s.id}`}>
                      <Uid id={s.publicId} />
                    </Link>
                  </td>
                  <td>
                    <Link href={`/students/${s.id}`}>
                      <b>{s.name}</b>
                    </Link>
                    <br />
                    <span className="tiny muted mono">{s.email}</span>
                  </td>
                  <td className="tiny">
                    {s.billingMode === 'MONTHLY' ? `Monthly ${money(s.monthlyAmount)}` : `${money(s.rate)} per lesson`}
                  </td>
                  <td>
                    <span className={`badge ${cls}`}>{label}</span>
                  </td>
                  <td className="num">{money(b.openInvoiced)}</td>
                  <td className="num">{money(b.unbilled)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
