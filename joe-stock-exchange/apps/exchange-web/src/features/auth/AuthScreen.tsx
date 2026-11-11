import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { login, register } from "../../api";
import { TurnstileWidget, turnstileEnabled } from "./TurnstileWidget";

interface Props { onAuthenticated: () => Promise<void>; initialMessage?: string | null; }

export function AuthScreen({ onAuthenticated, initialMessage }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState(initialMessage ?? "");
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const submit = async () => {
    setBusy(true); setMessage("");
    try {
      if (mode === "login") {
        await login(email, password, turnstileToken);
        await onAuthenticated();
      } else {
        const result = await register({ email, username, password, inviteCode, turnstileToken });
        setMessage(result.developmentVerificationToken ? `Development verification token: ${result.developmentVerificationToken}` : "Check your school email to verify the account.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally { setBusy(false); }
  };
  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="brand-lockup light"><span className="brand-gem">J</span><strong>JOESE</strong></div>
        <div><span className="eyebrow">JOE STOCK EXCHANGE</span><h1>The market of the Joe Universe.</h1><p>Follow fictional companies, react to The Joe Wire, and build a simulated portfolio in Joellars.</p></div>
        <div className="auth-principles"><span><ShieldCheck size={18} /> School-email verified</span><span><LockKeyhole size={18} /> Closed simulation</span><span><KeyRound size={18} /> J$ has no cash value</span></div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">
          <span className="eyebrow">MEMBER ACCESS</span><h2>{mode === "login" ? "Welcome back" : "Create one account"}</h2><p>{mode === "login" ? "Sign in to continue to the exchange." : "Use your eligible school email and invitation."}</p>
          <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setTurnstileToken(""); }}>Sign in</button><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setTurnstileToken(""); }}>Register</button></div>
          {mode === "register" && <label className="form-field"><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>}
          <label className="form-field"><span>School email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label className="form-field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
          {mode === "register" && <label className="form-field"><span>6-Digit Invite Code</span><input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Paste your Joe invitation phrase" /></label>}
          <TurnstileWidget key={mode} action={mode} onToken={setTurnstileToken} />
          {message && <div className="auth-message">{message}</div>}
          <button className="auth-submit" onClick={submit} disabled={busy || (turnstileEnabled && !turnstileToken)}>{busy ? "Working…" : mode === "login" ? "Enter exchange" : "Create account"}<ArrowRight size={18} /></button>
          <small className="auth-legal">JOESE is a fictional simulation. No real-money deposits, withdrawals, or cash-outs.</small>
        </div>
      </section>
    </div>
  );
}

