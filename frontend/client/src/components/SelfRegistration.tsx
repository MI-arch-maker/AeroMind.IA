import { useState } from "react";
import { UserPlus, ShieldCheck, KeyRound, Eye, EyeOff } from "lucide-react";

type Props = { onSubmitted: () => void; onCancel: () => void };

export function SelfRegistration({ onSubmitted, onCancel }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requestedRole, setRequestedRole] = useState("user");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const passwordStrength = (() => {
    let score = 0;
    if (password.length >= 14) score++;
    if (password.length >= 20) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score++;
    return score;
  })();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (passwordStrength < 2) {
      setError("Le mot de passe doit contenir au moins 14 caractères avec majuscules, minuscules et chiffres.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/local/register-request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, requested_role: requestedRole }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Inscription refusée.");
      setSuccess(true);
      setTimeout(onSubmitted, 3000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inscription impossible.");
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="self-reg-success" role="status">
        <ShieldCheck size={32} className="text-emerald-600 mx-auto" />
        <h3 className="text-lg font-bold mt-3 text-center">Demande soumise</h3>
        <p className="text-sm text-slate-500 mt-2 text-center">
          Votre demande d'inscription a été enregistrée. Un super-admin l'examinera.
          Vous recevrez un code d'inscription par email une fois approuvée.
        </p>
      </div>
    );
  }

  return (
    <form className="self-reg-form" onSubmit={submit} aria-label="Création de compte AeroMind">
      <p className="self-reg-intro">
        <UserPlus size={14} /> Créer un compte · l'approbation du super-admin est requise
      </p>
      <label>Nom complet
        <input type="text" autoComplete="name" required value={name}
          onChange={e => setName(e.target.value)} placeholder="Jean Dupont" />
      </label>
      <label>Adresse e-mail
        <input type="email" autoComplete="email" required value={email}
          onChange={e => setEmail(e.target.value)} placeholder="jean@exemple.com" />
      </label>
      <label>Mot de passe (min. 14 caractères)
        <div className="relative">
          <input type={showPassword ? "text" : "password"} autoComplete="new-password"
            required minLength={14} value={password}
            onChange={e => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
      {password && (
        <div className="password-strength">
          <div className="strength-bar">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`strength-segment ${i < passwordStrength ? "filled" : ""}`} />
            ))}
          </div>
          <span className="strength-label">
            {passwordStrength < 2 ? "Faible" : passwordStrength < 3 ? "Correct" : passwordStrength < 4 ? "Bon" : "Excellent"}
          </span>
        </div>
      )}
      <label>Confirmer le mot de passe
        <input type={showPassword ? "text" : "password"} autoComplete="new-password"
          required minLength={14} value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)} />
      </label>
      <label>Rôle demandé
        <select value={requestedRole} onChange={e => setRequestedRole(e.target.value)}>
          <option value="user">Utilisateur</option>
          <option value="designer">Designer</option>
          <option value="analyst">Analyste</option>
          <option value="operator">Opérateur</option>
          <option value="approver">Approbateur</option>
          <option value="admin">Administrateur</option>
        </select>
      </label>
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          Annuler
        </button>
        <button type="submit" disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          <KeyRound size={15} /> {busy ? "Envoi..." : "Demander l'inscription"}
        </button>
      </div>
      {error && <p className="self-reg-error" role="alert">{error}</p>}
    </form>
  );
}
