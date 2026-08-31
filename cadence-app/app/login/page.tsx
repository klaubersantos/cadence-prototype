import { loginAction } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-head">
          <div className="word">Cadence</div>
          <p>Music lesson studio billing. Sign in to continue.</p>
        </div>
        <div className="gate-body">
          {error && <div className="refusal">{error}</div>}
          <form action={loginAction}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <button className="btn primary" type="submit" style={{ width: '100%' }}>
              Sign in
            </button>
          </form>
          <div className="note" style={{ marginTop: 16 }}>
            Students: use the invitation link your teacher sent you to set a password the first time.
          </div>
        </div>
      </div>
    </div>
  );
}
