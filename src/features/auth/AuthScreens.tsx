import { useState } from "react";
import { supabase, isConfigured } from "../../lib/supabase";
import { authRedirectUrl } from "../../lib/platform";
import { Button, Field } from "../../components/ui";
import { useAuth } from "./AuthProvider";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="auth__card">
        <p className="auth__brand">Sam Tech Builds</p>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function NotConfigured() {
  return (
    <Shell title="Connect STB Core">
      <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> for this build, then reload. See docs/DEPLOY.md in stb-core.</p>
    </Shell>
  );
}

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    // One message for every failure: no hint about which accounts exist.
    if (error) setError("That email and password don't match an STB account.");
  };

  const reset = async () => {
    if (!email.trim()) { setError("Enter your email first, then choose Reset password."); return; }
    const redirectTo = authRedirectUrl("/settings");
    if (!redirectTo) { setError("Password reset isn't set up for this app build. Reset it on the STB Website."); return; }
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    setResetSent(true);
    setError(null);
  };

  if (!isConfigured) return <NotConfigured />;
  return (
    <Shell title="Sign in">
      <form onSubmit={submit} className="stack" noValidate>
        <Field label="Email">
          {(p) => <input {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}
        </Field>
        <Field label="Password">
          {(p) => <input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        {resetSent && <p className="form-note" role="status">If that address has an account, a reset link is on its way.</p>}
        <Button type="submit" variant="primary" busy={busy}>Sign in</Button>
        <button type="button" className="link-btn" onClick={reset}>Reset password</button>
      </form>
    </Shell>
  );
}

export function MfaScreen({ email }: { email: string }) {
  const { refresh, signOut } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const factors = await supabase.auth.mfa.listFactors();
      const totp = factors.data?.totp.find((f) => f.status === "verified");
      if (!totp) throw new Error("no factor");
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.replace(/\s/g, "") });
      if (error) throw error;
      await refresh();
    } catch {
      setError("That code didn't work. Codes change every 30 seconds; enter the current one.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Enter your authenticator code">
      <p className="muted">Signed in as {email}.</p>
      <form onSubmit={submit} className="stack">
        <Field label="6-digit code">
          {(p) => <input {...p} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7}
            value={code} onChange={(e) => setCode(e.target.value)} autoFocus />}
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" busy={busy}>Verify</Button>
        <button type="button" className="link-btn" onClick={signOut}>Sign out</button>
      </form>
    </Shell>
  );
}

export function UnauthorizedScreen({ email }: { email: string }) {
  const { signOut } = useAuth();
  return (
    <Shell title="This account can't use STB App">
      <p>{email} is signed in but isn't an active owner. Ask the owner to add it, or sign in with the owner account.</p>
      <Button onClick={signOut}>Sign out</Button>
    </Shell>
  );
}

export function AuthErrorScreen({ message }: { message: string }) {
  return (
    <Shell title="Couldn't verify your account">
      <p>{message}</p>
      <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
    </Shell>
  );
}
