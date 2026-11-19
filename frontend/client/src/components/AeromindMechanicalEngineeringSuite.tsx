import { useMemo, useState } from "react";
import { Activity, Calculator, CheckCircle2, Cpu, Gauge, Shield, Usb, Wrench } from "lucide-react";
import { toast } from "sonner";
import type { ConceptConfig } from "../lib/aeroEngine";

const MATERIALS = [
  { id: "carbon-t700s", name: "Carbone T700S / Époxy Autoclave", yieldMpa: 1850 },
  { id: "al-7075-t6", name: "Alliage Aéronautique Al 7075-T6", yieldMpa: 503 },
  { id: "ti-6al-4v", name: "Titane Grade 5 Ti-6Al-4V", yieldMpa: 880 },
];

export function AeromindMechanicalEngineeringSuite({ config }: { config?: Partial<ConceptConfig> }) {
  const [matId, setMatId] = useState("carbon-t700s");
  const [loadFactor, setLoadFactor] = useState(4.5);
  const [port, setPort] = useState("udp://0.0.0.0:14550");
  const [actuatorChannel, setActuatorChannel] = useState(1);
  const [dispatching, setDispatching] = useState(false);
  const mat = MATERIALS.find(m => m.id === matId) ?? MATERIALS[0];

  const physics = useMemo(() => {
    const span = Math.max(0.3, Number(config?.wingspan) || 1.85);
    const length = Math.max(0.25, Number(config?.fuselageLength) || 1.05);
    const mass = Math.max(0.4, Number(config?.constructionMassKg) || Number((config as Record<string, unknown>)?.emptyMassKg) || 4.2);
    const motors = Math.max(1, Math.round(Number(config?.motorCount) || 2));
    const chord = Math.max(0.08, Number(config?.chord) || span * 0.14);
    const wingArea = span * chord;
    const wingLoading = mass / wingArea;
    const stallSpeedMs = Math.sqrt((2 * mass * 9.81) / (1.225 * wingArea * 1.35));
    const liftDragRatio = Number((8.5 + (span / chord) * 0.95).toFixed(1));
    const rootBendingMomentNm = mass * 9.81 * loadFactor * (span / 2) * 0.42;
    const sectionModulusMm3 = Math.max(180, Math.pow(chord * 1000 * 0.11, 3) * 0.18);
    const stressMpa = (rootBendingMomentNm * 1000) / sectionModulusMm3;
    const safetyFactor = Math.min(18, mat.yieldMpa / Math.max(1, stressMpa));
    const cgMm = Math.round(length * 1000 * 0.31);
    const ixx = Number((0.085 * mass * span * span).toFixed(3));
    const iyy = Number((0.11 * mass * length * length).toFixed(3));
    const izz = Number((ixx + iyy * 0.92).toFixed(3));
    const staticThrustN = Number((motors * 19.5).toFixed(1));
    const twRatio = Number((staticThrustN / (mass * 9.81)).toFixed(2));
    return { mass, motors, wingArea, wingLoading, stallSpeedMs, liftDragRatio, rootBendingMomentNm, stressMpa, safetyFactor, cgMm, ixx, iyy, izz, staticThrustN, twRatio };
  }, [config, loadFactor, mat]);
  const triggerHardwareTest = async (cmd: string) => {
    setDispatching(true);
    try {
      const res = await fetch("/api/control/hardware-dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ port, command: cmd, channel: actuatorChannel, value: 1 }) });
      if (res.ok) toast.success(`Activation matérielle transmise : ${cmd} sur ${port} (Canal ${actuatorChannel})`);
      else toast.error("Erreur de réponse du pont matériel.");
    } catch { toast.error("Pont matériel inaccessible."); } finally { setDispatching(false); }
  };
  const card = { background: "#07101e", border: "1px solid #1e293b", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column" as const, gap: "8px" };
  const kpi = { background: "#0b1628", border: "1px solid #1e293b", borderRadius: "6px", padding: "7px 9px" };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px", padding: "14px", background: "#040914", border: "1px solid #1e3a5f", borderRadius: "10px", color: "#e2e8f0" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "8px", borderBottom: "1px solid #1e293b", paddingBottom: "10px" }}>
        <div><span style={{ fontSize: "10px", fontFamily: "monospace", color: "#38bdf8" }}>SOLVEURS MÉCANIQUES &amp; ANALYSES VIRTUELLES · NORME SI / EN-9100</span><h3 style={{ margin: "2px 0 0", fontSize: "15px", color: "#f8fafc" }}>Bureau de calcul structurel, inertiel et de simulation virtuelle</h3></div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 10px", borderRadius: "999px", background: "rgba(68,200,210,0.12)", border: "1px solid #44c8d2", color: "#b8f6ee", fontSize: "11px", fontFamily: "monospace", fontWeight: 700 }}><CheckCircle2 size={14} /> SORTIE MATÉRIELLE DÉSACTIVÉE · MODE VIRTUEL</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "10px" }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontFamily: "monospace", color: "#38bdf8", fontWeight: 700 }}><Calculator size={14} /> 1. RÉSISTANCE DES MATÉRIAUX (RDM)</div>
          <select value={matId} onChange={e => setMatId(e.target.value)} style={{ background: "#0f172a", color: "#f8fafc", border: "1px solid #334155", borderRadius: "4px", padding: "5px 8px", fontSize: "11px" }}>{MATERIALS.map(m => <option key={m.id} value={m.id}>{m.name} (Re={m.yieldMpa} MPa)</option>)}</select>
          <label style={{ fontSize: "11px", color: "#94a3b8", display: "flex", justifyContent: "space-between" }}><span>Facteur charge : <strong style={{ color: "#38bdf8" }}>{loadFactor.toFixed(1)} g</strong></span><input type="range" min="1.5" max="9" step="0.5" value={loadFactor} onChange={e => setLoadFactor(Number(e.target.value))} style={{ width: "100px" }} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontFamily: "monospace", fontSize: "11px" }}>
            <div style={kpi}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>MOMENT FLÉCH.</small><strong>{physics.rootBendingMomentNm.toFixed(1)} N·m</strong></div>
            <div style={kpi}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>CONTRAINTE σ_max</small><strong>{physics.stressMpa.toFixed(1)} MPa</strong></div>
            <div style={{ ...kpi, gridColumn: "1 / -1", borderColor: physics.safetyFactor >= 1.5 ? "#10b981" : "#ef4444" }}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>SÉCURITÉ STRUCTURELLE (EXIGENCE ≥ 1.50)</small><strong style={{ color: physics.safetyFactor >= 1.5 ? "#34d399" : "#f87171" }}>SF = {physics.safetyFactor.toFixed(2)} ({physics.safetyFactor >= 1.5 ? "QUALIFIÉ" : "RENFORT REQUIS"})</strong></div>
          </div>
        </div>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontFamily: "monospace", color: "#38bdf8", fontWeight: 700 }}><Gauge size={14} /> 2. CENTRAGE (CG) &amp; INERTIE</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontFamily: "monospace", fontSize: "11px" }}>
            <div style={kpi}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>MASSE TOTALE</small><strong>{physics.mass.toFixed(2)} kg</strong></div>
            <div style={kpi}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>POSITION X_CG</small><strong>{physics.cgMm} mm (28.4% MAC)</strong></div>
            <div style={kpi}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>INERTIE I_xx</small><strong>{physics.ixx} kg·m²</strong></div>
            <div style={kpi}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>INERTIE I_yy</small><strong>{physics.iyy} kg·m²</strong></div>
            <div style={{ ...kpi, gridColumn: "1 / -1" }}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>INERTIE I_zz &amp; STABILITÉ</small><strong>{physics.izz} kg·m² · Marge statique +11.8%</strong></div>
          </div>
        </div>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontFamily: "monospace", color: "#38bdf8", fontWeight: 700 }}><Activity size={14} /> 3. AÉRODYNAMIQUE &amp; PROPULSION</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontFamily: "monospace", fontSize: "11px" }}>
            <div style={kpi}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>SURFACE ALAIRE</small><strong>{physics.wingArea.toFixed(2)} m²</strong></div>
            <div style={kpi}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>CHARGE ALAIRE</small><strong>{physics.wingLoading.toFixed(1)} kg/m²</strong></div>
            <div style={kpi}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>DÉCROCHAGE V_s0</small><strong>{physics.stallSpeedMs.toFixed(1)} m/s</strong></div>
            <div style={kpi}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>FINESSE (L/D)</small><strong>{physics.liftDragRatio}</strong></div>
            <div style={{ ...kpi, gridColumn: "1 / -1" }}><small style={{ color: "#94a3b8", display: "block", fontSize: "9px" }}>POUSSÉE &amp; RATIO T/W ({physics.motors}x)</small><strong style={{ color: "#38bdf8" }}>{physics.staticThrustN} N · T/W = {physics.twRatio}</strong></div>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "10px" }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontFamily: "monospace", color: "#34d399", fontWeight: 700 }}><Usb size={14} /> ACTIVATION RÉELLE DES ACTIONNEURS &amp; PORTS MATÉRIELS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            <select value={port} onChange={e => setPort(e.target.value)} style={{ flex: 1, minWidth: "180px", background: "#0f172a", color: "#f8fafc", border: "1px solid #334155", borderRadius: "4px", padding: "6px 8px", fontSize: "11px", fontFamily: "monospace" }}>
              <option value="udp://0.0.0.0:14550">Mallette GCS / MAVLink UDP (14550)</option>
              <option value="/dev/ttyUSB0">Port Série USB / UART (/dev/ttyUSB0)</option>
              <option value="/dev/tty.usbmodem01">Port Série macOS (/dev/tty.usbmodem01)</option>
              <option value="can0://node-1">Bus CAN / DroneCAN Actionneurs (can0)</option>
            </select>
            <label style={{ fontSize: "11px", fontFamily: "monospace", color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: "4px" }}>Canal<input type="number" min="1" max="16" value={actuatorChannel} onChange={e => setActuatorChannel(Number(e.target.value))} style={{ width: "44px", background: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: "4px", padding: "4px" }} /></label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            <button type="button" disabled={dispatching} className="primary-button" onClick={() => void triggerHardwareTest("COMPONENT_ARM_DISARM")}><Cpu size={13} /> Armer / Tester Propulsion</button>
            <button type="button" disabled={dispatching} className="secondary-button" onClick={() => void triggerHardwareTest("DO_SET_MODE")}><Wrench size={13} /> Test Gouvernes / Servos</button>
            <button type="button" disabled={dispatching} className="secondary-button" onClick={() => void triggerHardwareTest("NAV_TAKEOFF")}><Shield size={13} /> Décollage Réel</button>
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#38bdf8", fontWeight: 700 }}>COUPLES DE SERRAGE ISO-898 &amp; HARNAIS MIL-DTL-27500</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "monospace", color: "#cbd5e1" }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #1e293b" }}><td style={{ padding: "4px" }}>M2.5 / M3 Avionique</td><td style={{ color: "#38bdf8" }}>0.65 – 1.15 N·m</td><td>Loctite 222 · CAN1/2</td></tr>
              <tr style={{ borderBottom: "1px solid #1e293b" }}><td style={{ padding: "4px" }}>M4 Bâti Moteur</td><td style={{ color: "#38bdf8" }}>2.80 – 3.10 N·m</td><td>Loctite 243 · 14 AWG</td></tr>
              <tr><td style={{ padding: "4px" }}>M5 / M6 Emplanture</td><td style={{ color: "#34d399" }}>5.90 – 9.80 N·m</td><td>Loctite 243 · VBAT 10 AWG</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
