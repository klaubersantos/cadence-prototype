import { prisma } from '@/lib/prisma';
import { Card, PageHead } from '@/components/ui';
import { createInvoiceAction } from '../../actions';

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ studentId?: string }> }) {
  const { studentId } = await searchParams;
  const students = await prisma.student.findMany({ orderBy: { name: 'asc' } });

  return (
    <>
      <PageHead title="Create invoice" />
      <Card>
        <form action={createInvoiceAction}>
          <div className="field">
            <label htmlFor="studentId">Student</label>
            <select id="studentId" name="studentId" defaultValue={studentId ?? students[0]?.id}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="mode">Billing mode</label>
            <select id="mode" name="mode" defaultValue="PER_LESSON">
              <option value="PER_LESSON">Per lesson — bill uninvoiced completed, no-show and late-cancelled lessons</option>
              <option value="MONTHLY">Monthly tuition — a single period line</option>
            </select>
          </div>
          <div className="note">
            Lessons already covered by an issued or paid invoice are not eligible and will not be included. If nothing
            eligible remains, no invoice is produced.
          </div>
          <button className="btn primary" type="submit">
            Create &amp; send email
          </button>
        </form>
      </Card>
    </>
  );
}
