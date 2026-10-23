import { useEffect, useState } from "react";
import { Battery, Wrench, Plus, Trash2, Calendar, AlertTriangle } from "lucide-react";

// ===========================================================================
// MaintenanceView — maintenance records + battery cycles (v10)
//
// Two tabs: "Maintenance" (records with next-due dates) and "Batteries"
// (cycle tracking). Both persist in DB and have audit log.
// ===========================================================================

type MaintenanceRecord = {
  id: string;
  projectId: string | null;
  droneId: string | null;
  maintenanceType: string;
  description: string;
  performedAt: string;
  nextDueAt: string | null;
  flightHoursAtMaintenance: number | null;
  notes: string | null;
};

type BatteryCycle = {
  id: number;
  batteryLabel: string;
  eventType: string;
  voltageV: number | null;
  capacityMahUsed: number | null;
  occurredAt: string;
  notes: string | null;
};

type BatteryAggregate = {
  batteryLabel: string;
  cycleCount: number;
  lastDischargeAt: string | null;
};

type Props = {
  projectId: string | null;
};

export function MaintenanceView({ projectId }: Props) {
  const [tab, setTab] = useState<"maintenance" | "batteries">("maintenance");
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [cycles, setCycles] = useState<BatteryCycle[]>([]);
  const [aggregates, setAggregates] = useState<BatteryAggregate[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state — maintenance
  const [mType, setMType] = useState("inspection");
  const [mDescription, setMDescription] = useState("");
  const [mDroneId, setMDroneId] = useState("");
  const [mNextDueDays, setMNextDueDays] = useState(30);
  const [mFlightHours, setMFlightHours] = useState("");

  // Form state — battery
  const [bLabel, setBLabel] = useState("");
  const [bEventType, setBEventType] = useState<"charge" | "discharge" | "storage">("discharge");
  const [bVoltage, setBVoltage] = useState("");
  const [bCapacity, setBCapacity] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      if (tab === "maintenance") {
        const url = new URL("/api/maintenance/records", window.location.origin);
        if (projectId) url.searchParams.set("projectId", projectId);
        const r = await fetch(url.toString(), { credentials: "include" });
        if (r.ok) {
          const body = await r.json();
          setRecords(Array.isArray(body?.records) ? body.records : []);
        }
      } else {
        const url = new URL("/api/maintenance/batteries", window.location.origin);
        if (projectId) url.searchParams.set("projectId", projectId);
        const r = await fetch(url.toString(), { credentials: "include" });
        if (r.ok) {
          const body = await r.json();
          setCycles(Array.isArray(body?.cycles) ? body.cycles : []);
          setAggregates(Array.isArray(body?.aggregates) ? body.aggregates : []);
        }
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [tab, projectId]);

  const createMaintenance = async () => {
    if (!mType.trim()) return;
    const r = await fetch("/api/maintenance/records", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        droneId: mDroneId.trim() || null,
        maintenanceType: mType.trim(),
        description: mDescription.trim(),
        nextDueInDays: Number(mNextDueDays) || null,
        flightHoursAtMaintenance: mFlightHours ? Number(mFlightHours) : null,
      }),
    });
    if (r.ok) {
      setMDescription("");
      setMFlightHours("");
      void refresh();
    }
  };

  const deleteMaintenance = async (id: string) => {
    await fetch(`/api/maintenance/records/${id}`, { method: "DELETE", credentials: "include" });
    void refresh();
  };

  const recordBatteryCycle = async () => {
    if (!bLabel.trim()) return;
    const r = await fetch("/api/maintenance/batteries", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        batteryLabel: bLabel.trim(),
        eventType: bEventType,
        voltageV: bVoltage ? Number(bVoltage) : null,
        capacityMahUsed: bCapacity ? Number(bCapacity) : null,
      }),
    });
    if (r.ok) {
      setBLabel("");
      setBVoltage("");
      setBCapacity("");
      void refresh();
    }
  };

  return (
    <div className="lb-maintenance">
      <div className="lb-maintenance-toolbar">
        <button
          className={`lb-secondary ${tab === "maintenance" ? "is-active" : ""}`}
          onClick={() => setTab("maintenance")}
        >
          <Wrench size={14} /> Maintenance
        </button>
        <button
          className={`lb-secondary ${tab === "batteries" ? "is-active" : ""}`}
          onClick={() => setTab("batteries")}
        >
          <Battery size={14} /> Batteries
        </button>
      </div>

      {tab === "maintenance" ? (
        <>
          <section className="lb-panel">
            <div className="lb-panel-title">
              <Plus size={17} />
              <span>Enregistrer une maintenance</span>
            </div>
            <div className="lb-maintenance-form">
              <label>
                <span>Type</span>
                <select value={mType} onChange={(e) => setMType(e.target.value)}>
                  <option value="inspection">Inspection</option>
                  <option value="repair">Réparation</option>
                  <option value="replacement">Remplacement pièce</option>
                  <option value="calibration">Calibration</option>
                  <option value="firmware_update">MAJ firmware</option>
                  <option value="cleaning">Nettoyage</option>
                </select>
              </label>
              <label>
                <span>Drone ID (optionnel)</span>
                <input type="text" value={mDroneId} onChange={(e) => setMDroneId(e.target.value)} placeholder="UUID" />
              </label>
              <label>
                <span>Description</span>
                <input type="text" value={mDescription} onChange={(e) => setMDescription(e.target.value)} placeholder="Ex: Inspection visuelle + test moteurs" />
              </label>
              <label>
                <span>Prochaine échéance (jours)</span>
                <input type="number" min={1} max={365} value={mNextDueDays} onChange={(e) => setMNextDueDays(Number(e.target.value))} />
              </label>
              <label>
                <span>Heures de vol à la maintenance</span>
                <input type="number" step={0.1} value={mFlightHours} onChange={(e) => setMFlightHours(e.target.value)} placeholder="Ex: 12.5" />
              </label>
              <button className="lb-primary" onClick={createMaintenance}>Enregistrer</button>
            </div>
          </section>

          <section className="lb-panel">
            <div className="lb-panel-title">
              <Wrench size={17} />
              <span>Historique ({records.length})</span>
            </div>
            {records.length === 0 ? (
              <p className="lb-empty-state">Aucune maintenance enregistrée.</p>
            ) : (
              <div className="lb-maintenance-list">
                {records.map((r) => (
                  <div key={r.id} className={`lb-maintenance-row ${r.nextDueAt && new Date(r.nextDueAt) < new Date() ? "is-overdue" : ""}`}>
                    <div>
                      <strong>{r.maintenanceType}</strong>
                      <small>{r.description}</small>
                      <small>Effectuée: {r.performedAt?.slice(0, 10)}</small>
                      {r.nextDueAt && (
                        <small className={new Date(r.nextDueAt) < new Date() ? "lb-text-danger" : ""}>
                          <Calendar size={11} /> Prochaine: {r.nextDueAt.slice(0, 10)}
                          {new Date(r.nextDueAt) < new Date() && " · EN RETARD"}
                        </small>
                      )}
                      {r.flightHoursAtMaintenance != null && <small>{r.flightHoursAtMaintenance}h de vol</small>}
                    </div>
                    <button className="lb-secondary" onClick={() => deleteMaintenance(r.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="lb-panel">
            <div className="lb-panel-title">
              <Plus size={17} />
              <span>Enregistrer un cycle batterie</span>
            </div>
            <div className="lb-maintenance-form">
              <label>
                <span>Label batterie</span>
                <input type="text" value={bLabel} onChange={(e) => setBLabel(e.target.value)} placeholder="Ex: Tattu-6S-5000-001" />
              </label>
              <label>
                <span>Événement</span>
                <select value={bEventType} onChange={(e) => setBEventType(e.target.value as any)}>
                  <option value="discharge">Décharge (vol)</option>
                  <option value="charge">Charge</option>
                  <option value="storage">Stockage</option>
                </select>
              </label>
              <label>
                <span>Voltage (V)</span>
                <input type="number" step={0.1} value={bVoltage} onChange={(e) => setBVoltage(e.target.value)} placeholder="22.2" />
              </label>
              <label>
                <span>Capacité utilisée (mAh)</span>
                <input type="number" step={50} value={bCapacity} onChange={(e) => setBCapacity(e.target.value)} placeholder="4500" />
              </label>
              <button className="lb-primary" onClick={recordBatteryCycle}>Enregistrer cycle</button>
            </div>
          </section>

          {aggregates.length > 0 && (
            <section className="lb-panel">
              <div className="lb-panel-title">
                <Battery size={17} />
                <span>Cycles par batterie</span>
              </div>
              <div className="lb-battery-aggregates">
                {aggregates.map((a) => (
                  <div key={a.batteryLabel} className="lb-battery-agg">
                    <strong>{a.batteryLabel}</strong>
                    <span className={a.cycleCount > 100 ? "lb-text-danger" : a.cycleCount > 50 ? "lb-text-warning" : "lb-text-good"}>
                      {a.cycleCount} cycles
                    </span>
                    <small>Dernière décharge: {a.lastDischargeAt?.slice(0, 19).replace("T", " ") || "—"}</small>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="lb-panel">
            <div className="lb-panel-title">
              <Battery size={17} />
              <span>Cycles récents ({cycles.length})</span>
            </div>
            {cycles.length === 0 ? (
              <p className="lb-empty-state">Aucun cycle batterie enregistré.</p>
            ) : (
              <div className="lb-maintenance-list">
                {cycles.slice(0, 50).map((c) => (
                  <div key={c.id} className="lb-maintenance-row">
                    <div>
                      <strong>{c.batteryLabel} · {c.eventType}</strong>
                      <small>{c.occurredAt?.slice(0, 19).replace("T", " ")}</small>
                      {c.voltageV != null && <small>V: {c.voltageV}V</small>}
                      {c.capacityMahUsed != null && <small>Cap: {c.capacityMahUsed}mAh</small>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
