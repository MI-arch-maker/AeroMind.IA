import { useEffect, useRef, useState } from "react";
import { AlertOctagon, ArrowLeft, CheckCircle2, Radio, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { Link } from "wouter";
import "./gcs-simulation.css";

type Telemetry = {
protocol: string;
vehicle_id: string;
position: number[];
velocity: number[];
heading_deg: number;
link_quality: number;
roll?: number;
pitch?: number;
yaw?: number;
system_metrics?: Record<string, number>;
};

type State = { emergency_stop: boolean; telemetry?: Telemetry };

const fixture = {
protocol: "MAVLink2",
vehicle_id: "AEROMIND-HIL-01",
timestamp_ms: Date.now(),
position: [46.52, 6.63, 120],
velocity: [12.4, 0.4, -0.1],
heading_deg: 87.2,
link_quality: 0.98,
source: "sitl",
};

export default function GcsSimulation() {
const [state, setState] = useState<State>({ emergency_stop: false });
const [connection, setConnection] = useState("EN ATTENTE DE FLUX LOCAL");
const [level, setLevel] = useState("GO1");
const [approved, setApproved] = useState(false);
const [log, setLog] = useState<string[]>(["Mode opérationnel HIL initialisé · bridge prêt"]);
const [busy, setBusy] = useState(false);
const socketRef = useRef<WebSocket | null>(null);

useEffect(() => {
let socket: WebSocket | undefined;
try {
socket = new WebSocket("ws://127.0.0.1:8765");
socketRef.current = socket;

socket.onopen = () => setConnection("BRIDGE CONNECTÉ · BIDIRECTIONNEL ACTIF");
socket.onclose = () => {
setConnection("EN ATTENTE DE FLUX LOCAL");
socketRef.current = null;
};
socket.onerror = () => setConnection("EN ATTENTE DE FLUX LOCAL");

socket.onmessage = (event) => {
try {
const frame = JSON.parse(event.data) as Telemetry;
if (frame.position && frame.velocity) {
setState((s) => ({ ...s, telemetry: frame }));
setLog((l) => [`WS télémétrie reçue · ${frame.vehicle_id || "matériel local"}`, ...l].slice(0, 8));
}
} catch {
setLog((l) => ["Trame WS ignorée · JSON invalide", ...l].slice(0, 8));
}
};
} catch {
setConnection("EN ATTENTE DE FLUX LOCAL");
}
return () => socket?.close();
}, []);

const transmitToBridge = (payload: unknown): boolean => {
if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
socketRef.current.send(JSON.stringify(payload));
return true;
}
return false;
};

const post = async (path: string, body?: unknown) => {
setBusy(true);
try {
const r = await fetch(`/api/gcs${path}`, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: body ? JSON.stringify(body) : undefined,
credentials: "include",
});
const d = await r.json();

if (path.includes("telemetry")) {
setState((s) => ({ ...s, telemetry: d.normalized }));
setLog((l) => [`Télémétrie ${d.normalized.protocol} normalisée`, ...l].slice(0, 8));
} else if (path.includes("command")) {
if (d.accepted && d.outgoing_frame) {
const sent = transmitToBridge(d.outgoing_frame);
setLog((l) => [
`${d.status} · ${sent ? "TRANSMIS AU HARDWARE BRIDGE" : "VALIDÉ (BRIDGE WS DÉCONNECTÉ)"}`,
...l,
].slice(0, 8));
} else {
setLog((l) => [`${d.status}${d.reasons?.length ? ` · ${d.reasons.join(", ")}` : ""}`, ...l].slice(0, 8));
}
} else {
setState((s) => ({ ...s, emergency_stop: d.latched }));
const sent = transmitToBridge({
schema_version: "aeromind.gcs-emergency.v1",
emergency_stop: d.latched,
timestamp_ms: Date.now(),
});
setLog((l) => [
d.latched
? `ARRÊT D'URGENCE · ${sent ? "SIGNAL PHYSIQUE TRANSMIS" : "VERROU LOCAL ACTIF"}`
: "Arrêt d'urgence réarmé",
...l,
].slice(0, 8));
}
} finally {
setBusy(false);
}
};

const t = state.telemetry;
return (
<main className="gcs-page">
<header className="gcs-top">
<Link href="/" className="gcs-back">
<ArrowLeft size={16} /> AeroMind
</Link>
<span>SPRINT 4 · GCS & COUPLAGE MATÉRIEL</span>
<b>HIL BRIDGE READY</b>
</header>
<section className="gcs-hero">
<div>
<small>ICX POWER SOLUTIONS SRL · MATRICE DE GOUVERNANCE INDÉPENDANTE</small>
<h1>Ground Control Station</h1>
<p>
Liaison télémétrique et commande bidirectionnelle via Hardware Bridge local (ws://127.0.0.1:8765) sous
gouvernance GO1–GO5 et verrouillage humain.
</p>
</div>
<Radio size={50} />
</section>
<section className="gcs-grid">
<div className="gcs-panel">
<header>
<span>TÉLÉMÉTRIE WS · RÉCEPTION LOCALE</span>
{connection.startsWith("BRIDGE") ? <Wifi size={16} /> : <WifiOff size={16} />}
</header>
<div className="gcs-connection">{connection}</div>
<div className="gcs-protocols">
<i>
MAVLink v2
<br />
<b>actif</b>
</i>
<i>
STANAG 4586
<br />
<b>enveloppe</b>
</i>
<i>
ROS 2
<br />
<b>bridge</b>
</i>
</div>
<button className="gcs-button" disabled={busy} onClick={() => void post("/telemetry/ingest", fixture)}>
Injecter télémétrie test
</button>
{t ? (
<div className="gcs-telemetry">
<strong>{t.vehicle_id}</strong>
<span>
PROTOCOLE <b>{t.protocol}</b>
</span>
<span>
ATTITUDE{" "}
<b>
R {Number(t.roll ?? 0).toFixed(2)}° · P {Number(t.pitch ?? 0).toFixed(2)}° · Y{" "}
{Number(t.yaw ?? t.heading_deg).toFixed(2)}°
</b>
</span>
<span>
POSITION <b>{t.position.map((n) => n.toFixed(3)).join(" / ")}</b>
</span>
<span>
VITESSE <b>{t.velocity.map((n) => n.toFixed(2)).join(" / ")}</b> · LINK{" "}
<b>{(t.link_quality * 100).toFixed(0)}%</b>
</span>
</div>
) : (
<div className="gcs-empty">En attente d’une trame JSON locale ou matériel HIL</div>
)}
</div>
<div className="gcs-panel">
<header>
<span>GO1–GO5 · VALIDATION D’INTENTION</span>
<ShieldCheck size={16} />
</header>
<div className="gcs-gates">
{["GO1", "GO2", "GO3", "GO4", "GO5"].map((g) => (
<button className={level === g ? "selected" : ""} key={g} onClick={() => setLevel(g)}>
<b>{g}</b>
<small>{g === "GO1" ? "opérateur" : g === "GO5" ? "direction" : "revue"}</small>
</button>
))}
</div>
<label className="gcs-check">
<input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> Approbation
humaine explicite pour exécution physique
</label>
<button
className="gcs-button"
disabled={busy}
onClick={() =>
void post("/command/validate", {
protocol: "MAVLink2",
vehicle_id: t?.vehicle_id || "AEROMIND-HIL-01",
intent: "hold",
parameters: {},
requested_by: "icx-operator-01",
human_approval: approved,
go_level: level,
})
}
>
Valider & Transmettre intention HOLD
</button>
<p className="gcs-note">
Après validation GO4/GO5 + signature humaine, la trame signée est émise vers le Hardware Bridge local.
</p>
</div>
<div className={`gcs-panel gcs-stop ${state.emergency_stop ? "latched" : ""}`}>
<header>
<span>CANAL PRIORITAIRE · ARRÊT D’URGENCE</span>
<AlertOctagon size={16} />
</header>
<h2>{state.emergency_stop ? "VERROU D'URGENCE ACTIF" : "Canal prioritaire armé"}</h2>
<p>
Transmet immédiatement l'ordre d'arrêt d'urgence au Hardware Bridge local et bloque toute nouvelle commande.
</p>
{state.emergency_stop ? (
<button className="gcs-button" onClick={() => void post("/emergency-stop/reset")}>
Réarmer le verrou
</button>
) : (
<button className="gcs-stop-button" onClick={() => void post("/emergency-stop")}>
Déclencher arrêt d'urgence
</button>
)}
</div>
<div className="gcs-panel">
<header>
<span>JOURNAL DE GOUVERNANCE</span>
<CheckCircle2 size={16} />
</header>
<div className="gcs-log">
{log.map((x, i) => (
<div key={i}>
<b>{String(i + 1).padStart(2, "0")}</b>
{x}
</div>
))}
</div>
</div>
</section>
<footer>
Contrat : WS local bidirectionnel (ws://127.0.0.1:8765) · physical_output=true · Gouvernance ICX GO1–GO5 active.
</footer>
</main>
);
}
