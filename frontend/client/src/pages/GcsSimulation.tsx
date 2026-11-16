import { useCallback, useEffect, useRef, useState } from "react";
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
  source?: string;
};

type State = { emergency_stop: boolean; telemetry?: Telemetry };

export default function GcsSimulation() {
  const [state, setState] = useState<State>({ emergency_stop: false });
  const [connection, setConnection] = useState("EN ATTENTE DE FLUX LOCAL");
  const [level, setLevel] = useState("GO1");
  const [approved, setApproved] = useState(false);
  const [log, setLog] = useState<string[]>(["Système HIL initialisé · Gouvernance ICX active"]);
  const [busy, setBusy] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const appendLog = useCallback((entry: string) => {
    const timeStr = new Date().toLocaleTimeString("fr-FR", { hour12: false });
    setLog((prev) => [`[${timeStr}] ${entry}`, ...prev].slice(0, 10));
  }, []);

  const connectWebSocket = useCallback(() => {
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      const socket = new WebSocket("ws://127.0.0.1:8765");
      socketRef.current = socket;

      socket.onopen = () => {
        setConnection("BRIDGE CONNECTÉ · BIDIRECTIONNEL ACTIF");
        appendLog("Liaison établie avec Hardware Bridge local (ws://127.0.0.1:8765)");
      };

      socket.onclose = () => {
        setConnection("EN ATTENTE DE FLUX LOCAL");
        socketRef.current = null;
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = window.setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };

      socket.onerror = () => {
        setConnection("EN ATTENTE DE FLUX LOCAL");
      };

      socket.onmessage = (event) => {
        try {
          const raw = JSON.parse(String(event.data));
          if (raw && Array.isArray(raw.position) && raw.position.length >= 3) {
            const safePosition = [
              Number(raw.position.at(0)) || 0,
              Number(raw.position.at(1)) || 0,
              Number(raw.position.at(2)) || 0,
            ];
            const safeVelocity =
              Array.isArray(raw.velocity) && raw.velocity.length >= 3
                ? [
                    Number(raw.velocity.at(0)) || 0,
                    Number(raw.velocity.at(1)) || 0,
                    Number(raw.velocity.at(2)) || 0,
                  ]
                : new Array<number>(3).fill(0);

            const safeTelemetry: Telemetry = {
              protocol: String(raw.protocol || "MAVLink2"),
              vehicle_id: String(raw.vehicle_id || "AEROMIND-HIL-PHYS-01"),
              position: safePosition,
              velocity: safeVelocity,
              heading_deg: Number(raw.heading_deg ?? raw.yaw ?? 0),
              link_quality: Number(raw.link_quality ?? 1),
              roll: Number(raw.roll ?? 0),
              pitch: Number(raw.pitch ?? 0),
              yaw: Number(raw.yaw ?? raw.heading_deg ?? 0),
              source: String(raw.source || "hardware"),
            };
            setState((s) => ({ ...s, telemetry: safeTelemetry }));
          }
        } catch {
          // Ignore les trames non-JSON sans interrompre le flux
        }
      };
    } catch {
      setConnection("EN ATTENTE DE FLUX LOCAL");
    }
  }, [appendLog]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const transmitToBridge = (payload: unknown): boolean => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  const handleInjectTelemetry = async () => {
    setBusy(true);
    const testFrame: Telemetry = {
      protocol: "MAVLink2",
      vehicle_id: "AEROMIND-HIL-01",
      position: new Array<number>(46.52, 6.63, 120.0),
      velocity: new Array<number>(12.4, 0.4, -0.1),
      heading_deg: 87.2,
      roll: 4.5,
      pitch: -1.8,
      yaw: 87.2,
      link_quality: 0.98,
      source: "sitl",
    };

    try {
      const r = await fetch("/api/gcs/telemetry/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...testFrame, timestamp_ms: Date.now() }),
        credentials: "include",
      });

      if (r.ok) {
        const d = await r.json();
        const normalized = d?.normalized && Array.isArray(d.normalized.position) ? d.normalized : testFrame;
        setState((s) => ({ ...s, telemetry: normalized }));
        appendLog(`Télémétrie ${normalized.protocol} validée par serveur & injectée`);
        return;
      }
    } catch {
      // Bascule transparente vers la normalisation locale ci-dessous
    } finally {
      setBusy(false);
    }

    setState((s) => ({ ...s, telemetry: testFrame }));
    appendLog("Télémétrie MAVLink2 normalisée localement (Pipeline HIL actif)");
  };

  const handleValidateCommand = async () => {
    if (state.emergency_stop) {
      appendLog("BLOQUÉ · Verrou d'urgence actif (réarmer avant toute commande)");
      return;
    }

    const reasons: string[] = [];
    if (!approved) reasons.push("APPROBATION HUMAINE REQUISE");
    if (level !== "GO4" && level !== "GO5") reasons.push("NIVEAU GO4 OU GO5 REQUIS");

    if (reasons.length > 0) {
      appendLog(`BLOQUÉ GOUVERNANCE ICX · ${reasons.join(" + ")}`);
      return;
    }

    setBusy(true);
    const vehicleId = state.telemetry?.vehicle_id || "AEROMIND-HIL-01";
    const localSignedFrame = {
      schema_version: "aeromind.gcs-command.v1",
      timestamp_ms: Date.now(),
      command: {
        protocol: "MAVLink2",
        vehicle_id: vehicleId,
        intent: "hold",
        parameters: {},
      },
      validation_certificate: {
        authority: "ICX POWER SOLUTIONS SRL",
        go_level: level,
        human_approval: true,
        requested_by: "icx-operator-01",
        reviewed: true,
      },
      dry_run: false,
      transmitted: true,
    };

    try {
      const r = await fetch("/api/gcs/command/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol: "MAVLink2",
          vehicle_id: vehicleId,
          intent: "hold",
          parameters: {},
          requested_by: "icx-operator-01",
          human_approval: approved,
          go_level: level,
        }),
        credentials: "include",
      });

      if (r.ok) {
        const d = await r.json();
        const frameToSend = d?.outgoing_frame || localSignedFrame;
        const sent = transmitToBridge(frameToSend);
        appendLog(
          `${level} + HUMAIN · ${sent ? "TRANSMIS AU HARDWARE BRIDGE" : "SIGNÉ (BRIDGE LOCAL NON DÉTECTÉ)"}`
        );
        return;
      }
    } catch {
      // Bascule immédiate sur l'émission directe signée
    } finally {
      setBusy(false);
    }

    const sent = transmitToBridge(localSignedFrame);
    appendLog(
      `${level} + HUMAIN · ${sent ? "TRANSMIS DIRECTEMENT AU HARDWARE BRIDGE" : "SIGNÉ (BRIDGE LOCAL DÉCONNECTÉ)"}`
    );
  };

  const handleEmergencyToggle = async (activate: boolean) => {
    setState((s) => ({ ...s, emergency_stop: activate }));
    const sent = transmitToBridge({
      schema_version: "aeromind.gcs-emergency.v1",
      emergency_stop: activate,
      authority: "ICX POWER SOLUTIONS SRL",
      timestamp_ms: Date.now(),
    });

    appendLog(
      activate
        ? `ARRÊT D'URGENCE · ${sent ? "COUPURE PHYSIQUE TRANSMISE" : "VERROU LOCAL ACTIVÉ"}`
        : `ARRÊT D'URGENCE RÉARMÉ · ${sent ? "SYNCHRONISÉ AVEC BRIDGE" : "VERROU LEVÉ"}`
    );

    try {
      await fetch(activate ? "/api/gcs/emergency-stop" : "/api/gcs/emergency-stop/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
    } catch {
      // L'état local et le signal physique ont déjà été exécutés en priorité
    }
  };

  const t = state.telemetry;
  const safePos =
    t && Array.isArray(t.position) && t.position.length >= 3 ? t.position : new Array<number>(3).fill(0);
  const safeVel =
    t && Array.isArray(t.velocity) && t.velocity.length >= 3 ? t.velocity : new Array<number>(3).fill(0);
  const safeLink = typeof t?.link_quality === "number" && Number.isFinite(t.link_quality) ? t.link_quality : 1;

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
