import { useState } from "react";
import { QrCode, KeyRound, CheckCircle2 } from "lucide-react";

type Props = { onComplete: () => void; onCancel: () => void };

export function TotpEnrollment({ onComplete, onCancel }: Props) {
  const [step, setStep] = useState<"code" | "qr" | "confirm" | "done">("code");
  const [email, setEmail] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requestCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/local/complete-enrollment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, enrollment_code: enrollmentCode, otp: "000000" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Code invalide.");
      setTotpSecret(result.secret);
      setOtpauthUri(result.otpauth_uri);
      setStep("qr");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  };

  const confirmTotp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      // Use the existing enroll/confirm endpoint
      const response = await fetch("/api/auth/local/enroll/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Code TOTP invalide.");
      setStep("done");
      setTimeout(onComplete, 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  };

  // Generate a simple QR placeholder (in production, use a QR library)
  const qrPlaceholder = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUri)}`;

  if (step === "done") {
    return (
      <div className="totp-enrollment-done" role="status">
        <CheckCircle2 size={32} className="text-emerald-600 mx-auto" />
        <h3 className="text-lg font-bold mt-3 text-center">Inscription terminée</h3>
        <p className="text-sm text-slate-500 mt-2 text-center">
          Votre compte est maintenant actif. Vous pouvez vous connecter avec votre mot de passe et le code TOTP de votre application d'authentification.
        </p>
      </div>
    );
  }

  return (
    <div className="totp-enrollment">
      {step === "code" && (
        <form onSubmit={requestCode} aria-label="Compléter l'inscription TOTP">
          <p className="totp-intro">
            <QrCode size={14} /> Saisissez le code d'inscription fourni par le super-admin
          </p>
          <label>Adresse e-mail
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label>Code d'inscription (format AER-xxxxx)
            <input type="text" required value={enrollmentCode} onChange={e => setEnrollmentCode(e.target.value)}
              placeholder="AER-..." />
          </label>
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Annuler
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Vérification..." : "Obtenir le QR code"}
            </button>
          </div>
        </form>
      )}
      {step === "qr" && (
        <div className="qr-display">
          <p className="qr-instruction">Scannez ce QR code avec votre application d'authentification (Google Authenticator, Authy, 1Password, etc.)</p>
          <div className="qr-image-container">
            <img src={qrPlaceholder} alt="QR code TOTP" width={200} height={200} />
          </div>
          <details className="manual-secret">
            <summary className="cursor-pointer text-xs text-slate-500">Saisie manuelle du secret</summary>
            <code className="block mt-2 p-2 bg-slate-100 rounded text-xs break-all">{totpSecret}</code>
          </details>
          <button onClick={() => setStep("confirm")}
            className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
            J'ai scanné le QR code
          </button>
        </div>
      )}
      {step === "confirm" && (
        <form onSubmit={confirmTotp} aria-label="Confirmer le code TOTP">
          <p className="confirm-intro">Saisissez le code à 6 chiffres affiché par votre application d'authentification</p>
          <label>Code TOTP
            <input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6}
              value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000" className="totp-input" />
          </label>
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => setStep("qr")}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Retour
            </button>
            <button type="submit" disabled={busy || otp.length !== 6}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              <KeyRound size={15} /> {busy ? "Vérification..." : "Confirmer"}
            </button>
          </div>
        </form>
      )}
      {error && <p className="totp-error" role="alert">{error}</p>}
    </div>
  );
}
