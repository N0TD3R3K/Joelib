import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { login, register, requestPasswordReset, resendVerification, resetPassword } from "../../api";
import { TurnstileWidget, turnstileEnabled } from "./TurnstileWidget";

interface Props { onAuthenticated: () => Promise<void>; initialMessage?: string | null; }
type AuthMode = "login" | "register" | "verification" | "recovery" | "reset";

export function AuthScreen({ onAuthenticated, initialMessage }: Props) {
  const resetToken = new URLSearchParams(window.location.search).get("token") ?? "";
  const [mode, setMode] = useState<AuthMode>(window.location.pathname === "/reset-password" && resetToken ? "reset" : "login");
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
      } else if (mode === "register") {
        const result = await register({ email, username, password, inviteCode, turnstileToken });
        setMode("verification");
        setTurnstileToken("");
        setMessage(result.developmentVerificationToken ? `Development verification token: ${result.developmentVerificationToken}` : "Check your school email to verify the account.");
      } else if (mode === "verification") {
        const result = await resendVerification(email, turnstileToken);
        setTurnstileToken("");
        setMessage(result.developmentVerificationToken ? `Development verification token: ${result.developmentVerificationToken}` : result.message);
      } else if (mode === "recovery") {
        const result = await requestPasswordReset(email, turnstileToken);
        if (result.developmentResetToken) {
          window.history.replaceState({}, "", `/reset-password?token=${encodeURIComponent(result.developmentResetToken)}`);
          setMode("reset");
          setTurnstileToken("");
          setMessage("Development reset link opened. Choose a new password.");
        } else {
          setMessage(result.message);
        }
      } else {
        await resetPassword(resetToken, password, turnstileToken);
        window.history.replaceState({}, "", "/");
        setMode("login");
        setPassword("");
        setTurnstileToken("");
        setMessage("Password reset. Sign in with your new password.");
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
          <span className="eyebrow">MEMBER ACCESS</span><h2>{mode === "login" ? "Welcome back" : mode === "register" ? "Create one account" : mode === "verification" ? "Verify your account" : mode === "recovery" ? "Recover your account" : "Choose a new password"}</h2><p>{mode === "login" ? "Sign in to continue to the exchange." : mode === "register" ? "Use your eligible school email and invitation." : mode === "verification" ? "Request a fresh verification link if the first message is missing or expired." : mode === "recovery" ? "We will send a 15-minute, one-use link if the account exists." : "The reset link works once and signs out every existing session."}</p>
          <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setTurnstileToken(""); setMessage(""); }}>Sign in</button><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setTurnstileToken(""); setMessage(""); }}>Register</button></div>
          {mode === "register" && <label className="form-field"><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>}
          {mode !== "reset" && <label className="form-field"><span>School email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>}
          {mode !== "recovery" && mode !== "verification" && <label className="form-field"><span>{mode === "reset" ? "New password" : "Password"}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}
          {mode === "login" && <div className="auth-help-links"><button className="auth-link" onClick={() => { setMode("recovery"); setTurnstileToken(""); setMessage(""); }}>Forgot password?</button><button className="auth-link" onClick={() => { setMode("verification"); setTurnstileToken(""); setMessage(""); }}>Missing verification email?</button></div>}
          {mode === "register" && <label className="form-field"><span>Invitation code</span><input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Paste your JOESE invitation code" /></label>}
          <TurnstileWidget key={mode} action={mode === "login" || mode === "register" ? mode : "recovery"} onToken={setTurnstileToken} />
          {message && <div className="auth-message">{message}</div>}
          <button className="auth-submit" onClick={submit} disabled={busy || (turnstileEnabled && !turnstileToken)}>{busy ? "Working…" : mode === "login" ? "Enter exchange" : mode === "register" ? "Create account" : mode === "verification" ? "Send verification link" : mode === "recovery" ? "Send reset link" : "Reset password"}<ArrowRight size={18} /></button>
          <small className="auth-legal">JOESE is a fictional simulation. No real-money deposits, withdrawals, or cash-outs.</small>
        </div>
      </section>
    </div>
  );
}

