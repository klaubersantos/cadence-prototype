import { prisma } from '@/lib/prisma';
import { acceptInviteAction } from './actions';

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const invitation = await prisma.invitation.findUnique({ where: { token }, include: { student: true } });

  const invalid = !invitation || invitation.consumed;

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-head">
          <div className="word">Cadence</div>
          <p>
            {invalid
              ? 'That link is not valid. Check the address, or ask your teacher to send it again.'
              : `Welcome, ${invitation!.student.name.split(' ')[0]} — set a password to activate your student portal.`}
          </p>
        </div>
        {!invalid && (
          <div className="gate-body">
            {error && <div className="refusal">{error}</div>}
            <form action={acceptInviteAction}>
              <input type="hidden" name="token" value={token} />
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" minLength={8} required />
              </div>
              <div className="field">
                <label htmlFor="confirm">Confirm password</label>
                <input id="confirm" name="confirm" type="password" minLength={8} required />
              </div>
              <button className="btn primary" type="submit" style={{ width: '100%' }}>
                Activate my portal
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
