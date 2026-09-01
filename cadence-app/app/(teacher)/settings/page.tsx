import { prisma } from '@/lib/prisma';
import { PREFIXES } from '@/lib/engine/identifiers';
import { Card, PageHead, Uid } from '@/components/ui';
import { saveStudioProfileAction, savePolicyAction } from '../actions';

const PREFIX_LABELS: Record<(typeof PREFIXES)[number], string> = {
  STU: 'Students',
  LSN: 'Lessons',
  INV: 'Invoices',
  PAY: 'Payments',
  RCP: 'Receipts',
  NOT: 'Notifications',
  NTE: 'Notes',
};

export default async function SettingsPage() {
  const [studio, sequences] = await Promise.all([
    prisma.studio.findFirstOrThrow(),
    prisma.sequence.findMany(),
  ]);
  const counters = Object.fromEntries(sequences.map((s) => [s.prefix, s.counter]));

  return (
    <>
      <PageHead title="Settings" lede="Studio profile and the cancellation policy that drives late-cancel billing." />

      <div className="split">
        <Card title="Studio profile">
          <form action={saveStudioProfileAction}>
            <div className="field">
              <label htmlFor="name">Studio name</label>
              <input id="name" name="name" defaultValue={studio.name} required />
            </div>
            <div className="field">
              <label htmlFor="teacherName">Teacher</label>
              <input id="teacherName" name="teacherName" defaultValue={studio.teacherName} required />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="timezone">Timezone</label>
                <input id="timezone" name="timezone" defaultValue={studio.timezone} required />
              </div>
              <div className="field">
                <label htmlFor="defaultDuration">Default duration (min)</label>
                <input id="defaultDuration" name="defaultDuration" type="number" defaultValue={studio.defaultDuration} required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="defaultLocation">Default location</label>
              <input id="defaultLocation" name="defaultLocation" defaultValue={studio.defaultLocation} required />
            </div>
            <button className="btn primary" type="submit">
              Save studio profile
            </button>
          </form>
        </Card>

        <Card title="Cancellation policy">
          <form action={savePolicyAction}>
            <div className="row">
              <div className="field">
                <label htmlFor="lateCancelWindowHours">Late window (hours before start)</label>
                <input
                  id="lateCancelWindowHours"
                  name="lateCancelWindowHours"
                  type="number"
                  defaultValue={studio.lateCancelWindowHours}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="lateCancelChargePct">Late charge (% of rate)</label>
                <input
                  id="lateCancelChargePct"
                  name="lateCancelChargePct"
                  type="number"
                  defaultValue={studio.lateCancelChargePct}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="policyNote">Policy note shown to students</label>
              <textarea id="policyNote" name="policyNote" rows={3} defaultValue={studio.policyNote} required />
            </div>
            <button className="btn primary" type="submit">
              Save policy
            </button>
            <div className="note" style={{ marginTop: 12 }}>
              Changing this note never alters a line on an invoice already issued. Each line keeps the note in force at
              its own issue time.
            </div>
          </form>
        </Card>
      </div>

      <Card title="Identifier sequences" tight hint="per studio, never reused, no edit control anywhere">
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Prefix</th>
              <th className="num">Next number</th>
            </tr>
          </thead>
          <tbody>
            {PREFIXES.map((prefix) => {
              const counter = counters[prefix] ?? 0;
              return (
                <tr key={prefix}>
                  <td>{PREFIX_LABELS[prefix]}</td>
                  <td>
                    <Uid id={`${prefix}-${String(counter).padStart(6, '0')}`} />
                  </td>
                  <td className="num mono">{String(counter + 1).padStart(6, '0')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
