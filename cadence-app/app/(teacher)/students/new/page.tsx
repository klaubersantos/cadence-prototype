import { Card, PageHead } from '@/components/ui';
import { createStudentAction } from '../../actions';

export default function NewStudentPage() {
  return (
    <>
      <PageHead title="Add student" lede="The new student receives the next identifier in the studio sequence. It cannot be edited afterwards." />
      <Card>
        <form action={createStudentAction}>
          <div className="row">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" placeholder="Harvey Specter" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" placeholder="harvey.specter@example.com" required />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="rate">Rate per lesson (USD)</label>
              <input id="rate" name="rate" type="number" step="0.01" defaultValue={60} required />
            </div>
            <div className="field">
              <label htmlFor="billingMode">Billing mode</label>
              <select id="billingMode" name="billingMode" defaultValue="PER_LESSON">
                <option value="PER_LESSON">Per lesson</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="reminderHours">Reminder (hours)</label>
              <input id="reminderHours" name="reminderHours" type="number" defaultValue={24} min={1} max={48} required />
            </div>
          </div>
          <button className="btn primary" type="submit">
            Add student
          </button>
        </form>
      </Card>
    </>
  );
}
