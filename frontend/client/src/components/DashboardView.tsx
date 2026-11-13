import { useEffect, useState, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  Battery,
  Cpu,
  FolderKanban,
  Radio,
  Wrench,
  Plane,
  Crosshair,
  Download,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ===========================================================================
// DashboardView — Multi-project aggregate dashboard (v11)
//
// Shows: total projects / drones / missions / active alerts / maintenance due /
// battery cycles. Per-project breakdown table. Recent alerts feed.
// ===========================================================================

type DashboardTotals = {
  projects: number;
  drones: number;
  missions: number;
  activeAlerts: number;
  maintenanceDue: number;
  batteryCycles: number;
};

type PerProject = {
  id: string;
  name: string;
  createdAt: string | null;
  dronesCount: number;
  missionsCount: number;
  activeAlerts: number;
  maintenanceRecords: number;
};

type RecentAlert = {
  id: string;
  alertType: string;
  severity: string;
  message: string;
  droneName: string;
  createdAt: string;
};

type DashboardResponse = {
  totals: DashboardTotals;
  perProject: PerProject[];
  recentAlerts: RecentAlert[];
  updatedAt: string;
};

export function DashboardView({ onSelectProject }: { onSelectProject?: (id: string) => void }) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/dashboard", { credentials: "include" });
      if (r.ok) setData(await r.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const totals = data?.totals;
  const projects = data?.perProject ?? [];
  const recentAlerts = data?.recentAlerts ?? [];

  return (
    <div className="lb-dashboard">
      <div className="lb-dashboard-toolbar">
        <span className="lb-radar-title">
          <Activity size={14} /> Dashboard multi-projets
        </span>
        <button className="lb-secondary" onClick={refresh} disabled={loading}>
          <Activity size={14} /> {loading ? "Chargement…" : "Rafraîchir"}
        </button>
      </div>

      {/* Stat cards */}
      <div className="lb-dashboard-stats">
        <div className="lb-stat-card">
          <FolderKanban size={18} />
          <strong>{totals?.projects ?? 0}</strong>
          <span>Projets</span>
        </div>
        <div className="lb-stat-card">
          <Cpu size={18} />
          <strong>{totals?.drones ?? 0}</strong>
          <span>Drones</span>
        </div>
        <div className="lb-stat-card">
          <Plane size={18} />
          <strong>{totals?.missions ?? 0}</strong>
          <span>Missions</span>
        </div>
        <div className="lb-stat-card lb-stat-alert">
          <AlertTriangle size={18} />
          <strong>{totals?.activeAlerts ?? 0}</strong>
          <span>Alertes actives</span>
        </div>
        <div className="lb-stat-card lb-stat-maintenance">
          <Wrench size={18} />
          <strong>{totals?.maintenanceDue ?? 0}</strong>
          <span>Maintenances dues</span>
        </div>
        <div className="lb-stat-card">
          <Battery size={18} />
          <strong>{totals?.batteryCycles ?? 0}</strong>
          <span>Cycles batterie</span>
        </div>
      </div>

      {/* Per-project table */}
      <section className="lb-panel">
        <div className="lb-panel-title">
          <FolderKanban size={17} />
          <span>Vue par projet</span>
          <small>{projects.length} projet(s)</small>
        </div>
        {projects.length === 0 ? (
          <p className="lb-empty-state">Aucun projet authentifié.</p>
        ) : (
          <div className="lb-dashboard-table">
            <div className="lb-dashboard-row lb-dashboard-head">
              <span>Projet</span>
              <span>Drones</span>
              <span>Missions</span>
              <span>Alertes</span>
              <span>Maintenances</span>
              <span></span>
            </div>
            {projects.map((p) => (
              <div key={p.id} className="lb-dashboard-row">
                <span><strong>{p.name}</strong><small>{p.createdAt?.slice(0, 19).replace("T", " ")}</small></span>
                <span>{p.dronesCount}</span>
                <span>{p.missionsCount}</span>
                <span className={p.activeAlerts > 0 ? "lb-text-danger" : "lb-text-good"}>{p.activeAlerts}</span>
                <span>{p.maintenanceRecords}</span>
                <button className="lb-secondary" onClick={() => onSelectProject?.(p.id)}>
                  Ouvrir
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent alerts feed */}
      <section className="lb-panel">
        <div className="lb-panel-title">
          <AlertTriangle size={17} />
          <span>Alertes récentes</span>
          <small>{recentAlerts.length}</small>
        </div>
        {recentAlerts.length === 0 ? (
          <p className="lb-empty-state">Aucune alerte récente.</p>
        ) : (
          <div className="lb-dashboard-alerts">
            {recentAlerts.map((a) => (
              <div key={a.id} className={`lb-dashboard-alert lb-severity-${a.severity}`}>
                <span className="lb-dashboard-alert-type">{a.alertType}</span>
                <span className="lb-dashboard-alert-msg">{a.message}</span>
                <span className="lb-dashboard-alert-drone">{a.droneName}</span>
                <span className="lb-dashboard-alert-time">{a.createdAt?.slice(11, 19)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
