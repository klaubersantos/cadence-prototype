import { Card, PageHead } from '@/components/ui';
import { addNoteAction } from '../../actions';

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<{ targetType?: string; targetId?: string; returnTo?: string }>;
}) {
  const { targetType, targetId, returnTo } = await searchParams;

  return (
    <>
      <PageHead title="Add note" />
      <Card>
        <form action={addNoteAction}>
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="field">
            <label htmlFor="content">Note</label>
            <textarea id="content" name="content" rows={4} placeholder="What should be remembered about this?" required />
          </div>
          <div className="field">
            <label htmlFor="visibility">Visibility</label>
            <select id="visibility" name="visibility" defaultValue="PRIVATE">
              <option value="PRIVATE">Private — instructor only</option>
              <option value="SHARED">Shared — also visible in the student portal</option>
            </select>
          </div>
          <button className="btn primary" type="submit">
            Save note
          </button>
        </form>
      </Card>
    </>
  );
}
