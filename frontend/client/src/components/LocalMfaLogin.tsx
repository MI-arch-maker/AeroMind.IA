import { useState } from "react";
import { KeyRound, ShieldCheck, UserPlus, QrCode } from "lucide-react";
import { SelfRegistration } from "./SelfRegistration";
import { TotpEnrollment } from "./TotpEnrollment";

type Props = { onAuthenticated: () => void };
type View = "login" | "register" | "enroll";

export function LocalMfaLogin({ onAuthenticated }: Props) {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/local/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, otp }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Connexion MFA refusée.");
      onAuthenticated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connexion MFA impossible. Réessayez.");
    } finally { setBusy(false); }
  };

  if (view === "register") {
    return (
      <div className="session-mfa-container">
        <SelfRegistration onSubmitted={() => setView("login")} onCancel={() => setView("login")} />
        <p className="text-center text-xs text-slate-400 mt-4">
          Déjà inscrit ? {" "}
          <button onClick={() => setView("login")} className="text-blue-600 hover:underline font-semibold">
            Se connecter
          </button>
        </p>
      </div>
    );
  }

  if (view === "enroll") {
    return (
      <div className="session-mfa-container">
        <TotpEnrollment onComplete={() => setView("login")} onCancel={() => setView("login")} />
        <p className="text-center text-xs text-slate-400 mt-4">
          <button onClick={() => setView("login")} className="text-blue-600 hover:underline font-semibold">
            Retour à la connexion
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="session-mfa-container">
      <form className="session-mfa-form" onSubmit={submit} aria-label="Connexion MFA AeroMind">
        <p className="session-mfa-intro">
          <ShieldCheck size={14} /> Accès local sécurisé · mot de passe et code TOTP requis
        </p>
        <label>Adresse e-mail
          <input type="email" autoComplete="username" required value={email}
            onChange={event => setEmail(event.target.value)} />
        </label>
        <label>Mot de passe
          <input type="password" autoComplete="current-password" required value={password}
            onChange={event => setPassword(event.target.value)} />
        </label>
        <label>Code d'authentification à 6 chiffres
          <input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6}
            value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000" />
        </label>
        <button className="secondary-button session-button" type="submit" disabled={busy || otp.length !== 6}>
          <KeyRound size={14} /> {busy ? "Vérification…" : "Se connecter avec MFA"}
        </button>
        {error && <p className="session-mfa-error" role="alert">{error}</p>}
      </form>
      <div className="mfa-actions mt-4 space-y-2">
        <button onClick={() => setView("enroll")}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          <QrCode size={14} /> Compléter mon inscription TOTP
        </button>
        <button onClick={() => setView("register")}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">
          <UserPlus size={14} /> Créer un compte
        </button>
      </div>
    </div>
  );
}
