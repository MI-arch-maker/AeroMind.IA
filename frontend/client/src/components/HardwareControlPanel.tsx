import { useEffect, useState } from "react";
import { hardwareModeAllowed, isEmergencyStop } from "@/lib/hardwareControl";

type ControlMode = "SIMULATION" | "HARDWARE";

export function HardwareControlPanel() {
  const [enabled, setEnabled] = useState(false);
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  const [mode, setMode] = useState<ControlMode>("SIMULATION");
  const [message, setMessage] = useState("Contrôle matériel désactivé par le serveur.");

  useEffect(() => {
    let active = true;
    fetch("/api/capabilities", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        setEnabled(data.hardware_control === true);
        setMessage(data.hardware_control
          ? "Flag activé; le mode matériel et l’armement exigent deux validations."
          : "Simulation seule — HARDWARE_CONTROL est désactivé.");
      })
      .catch(() => {
        if (active) setMessage("État du feature flag indisponible; aucune commande matérielle autorisée.");
      });
    return () => { active = false; };
  }, []);

  const changeMode = async (requested: ControlMode) => {
    if (requested === "HARDWARE" && !hardwareModeAllowed(enabled, first, second)) {
      setMessage("Activez le flag et cochez les deux confirmations distinctes.");
      return;
    }
    try {
      const response = await fetch("/api/control/mode", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: requested, confirm_operator: first, confirm_safety: second }),
      });
      const result = await response.json();
      if (response.ok) setMode(result.mode as ControlMode);
      setMessage(response.ok ? `Mode ${result.mode} établi.` : (result.detail ?? "Bascule refusée"));
    } catch {
      setMessage("API indisponible; aucune commande envoyée.");
    }
  };

  const arm = async () => {
    if (mode !== "HARDWARE" || !hardwareModeAllowed(enabled, first, second)) {
      setMessage("Armement refusé côté interface : mode matériel et deux confirmations requis.");
      return;
    }
    try {
      const response = await fetch("/api/control/arm", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "HARDWARE", confirm_operator: first, confirm_safety: second }),
      });
      const result = await response.json();
      setMessage(response.ok ? "Armement confirmé par l’API." : (result.detail ?? "Armement refusé"));
    } catch {
      setMessage("API indisponible; armement non confirmé.");
    }
  };

  const emergency = async () => {
    try {
      const response = await fetch("/api/control/emergency-stop", { method: "POST", credentials: "include" });
      const result = await response.json();
      if (response.ok && isEmergencyStop(result)) setMode("SIMULATION");
      setMessage(response.ok && isEmergencyStop(result)
        ? result.hardware_called
          ? `Désarmement envoyé; file purgée (${result.queue_purged}).`
          : "Mode simulation : aucun lien matériel appelé; ne remplace pas l’E-stop physique."
        : (result.detail ?? "Arrêt indisponible"));
    } catch {
      setMessage("Arrêt API indisponible; vérifier immédiatement l’arrêt physique indépendant.");
    }
  };

  return (
    <section className="lb-panel" aria-label="Contrôle matériel encadré">
      <div className="lb-panel-title">
        <strong>Contrôle matériel — verrou de sûreté</strong>
        <small>{enabled ? `FLAG ACTIVÉ · ${mode}` : "SIMULATION SEULE"}</small>
      </div>
      <p role="status">{message}</p>
      <label><input type="checkbox" checked={first} onChange={(event) => setFirst(event.target.checked)} /> Je confirme explicitement l’intention de passer en mode matériel.</label>
      <label><input type="checkbox" checked={second} onChange={(event) => setSecond(event.target.checked)} /> J’ai vérifié la zone d’essai, l’E-stop et le périmètre geofence.</label>
      <div className="lb-config-actions">
        <button className="lb-primary" disabled={!hardwareModeAllowed(enabled, first, second)} onClick={() => void changeMode("HARDWARE")}>Confirmer les deux validations</button>
        <button className="lb-secondary" disabled={mode !== "HARDWARE" || !hardwareModeAllowed(enabled, first, second)} onClick={() => void arm()}>Armer (deux confirmations)</button>
        <button className="lb-secondary" onClick={() => void changeMode("SIMULATION")}>Revenir en simulation</button>
        <button className="lb-secondary" onClick={() => void emergency()}>Désarmement d’urgence — un clic</button>
      </div>
      <small>Flag inactif par défaut. L’arrêt d’urgence ne réarme jamais l’appareil; conservez un E-stop physique indépendant.</small>
    </section>
  );
}
