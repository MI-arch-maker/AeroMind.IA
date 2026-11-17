import { useCallback, useEffect, useRef, useState } from "react";

export type AeromindTelemetryStream = {
  connected: boolean;
  source: "hardware-bridge" | "hil-physics-engine";
  vehicleId: string;
  protocol: string;
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
  headingDeg: number;
  altitudeM: number;
  speedKmh: number;
  verticalSpeedMs: number;
  lat: number;
  lon: number;
  batteryPct: number;
  voltageV: number;
  currentA: number;
  motorRpm: number[];
  escTempC: number;
  linkQuality: number;
  timestampMs: number;
};

const INITIAL_STREAM: AeromindTelemetryStream = {
  connected: false,
  source: "hil-physics-engine",
  vehicleId: "AEROMIND-HIL-01",
  protocol: "MAVLink2",
  rollDeg: 0,
  pitchDeg: 0,
  yawDeg: 0,
  headingDeg: 0,
  altitudeM: 120,
  speedKmh: 45,
  verticalSpeedMs: 0,
  lat: 46.52,
  lon: 6.63,
  batteryPct: 96,
  voltageV: 24.8,
  currentA: 14.2,
  motorRpm: new Array<number>(4).fill(4850),
  escTempC: 41.5,
  linkQuality: 0.99,
  timestampMs: Date.now(),
};

export function useAeromindHardwareStream(active = true) {
  const [stream, setStream] = useState<AeromindTelemetryStream>(INITIAL_STREAM);
  const wsRef = useRef<WebSocket | null>(null);
  const bridgeLiveRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (cancelled) return;
      try {
        const ws = new WebSocket("ws://127.0.0.1:8765");
        wsRef.current = ws;

        ws.onopen = () => {
          bridgeLiveRef.current = true;
          setStream((prev) => ({ ...prev, connected: true, source: "hardware-bridge" }));
        };

        ws.onmessage = (ev) => {
          try {
            const raw = JSON.parse(String(ev.data));
            if (raw && (typeof raw.roll === "number" || Array.isArray(raw.position))) {
              const pos = Array.isArray(raw.position) ? raw.position : [46.52, 6.63, 120];
              const vel = Array.isArray(raw.velocity) ? raw.velocity : new Array<number>(3).fill(0);
              const speedMs = Math.hypot(Number(vel.at(0) ?? 0), Number(vel.at(1) ?? 0));
              setStream((prev) => ({
                ...prev,
                connected: true,
                source: "hardware-bridge",
                vehicleId: String(raw.vehicle_id || prev.vehicleId),
                protocol: String(raw.protocol || "MAVLink2"),
                rollDeg: Number(raw.roll ?? prev.rollDeg),
                pitchDeg: Number(raw.pitch ?? prev.pitchDeg),
                yawDeg: Number(raw.yaw ?? raw.heading_deg ?? prev.yawDeg),
                headingDeg: Number(raw.heading_deg ?? raw.yaw ?? prev.headingDeg),
                altitudeM: Number(pos.at(2) ?? prev.altitudeM),
                speedKmh: Number((speedMs * 3.6).toFixed(1)),
                verticalSpeedMs: Number((-Number(vel.at(2) ?? 0)).toFixed(2)),
                lat: Number(pos.at(0) ?? prev.lat),
                lon: Number(pos.at(1) ?? prev.lon),
                linkQuality: Number(raw.link_quality ?? 0.99),
                timestampMs: Date.now(),
              }));
            }
          } catch {
            // Ignore malformed frame
          }
        };

        ws.onclose = () => {
          bridgeLiveRef.current = false;
          wsRef.current = null;
          setStream((prev) => ({ ...prev, connected: false, source: "hil-physics-engine" }));
          if (!cancelled) {
            reconnectTimer = window.setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          bridgeLiveRef.current = false;
        };
      } catch {
        bridgeLiveRef.current = false;
      }
    };

    connect();

    // Moteur physique HIL dynamique (20 Hz) lorsque le bridge local est en veille
    const t0 = Date.now();
    const physicsTimer = window.setInterval(() => {
      if (bridgeLiveRef.current) return;
      const elapsed = (Date.now() - t0) / 1000;
      const angle = elapsed * 0.25;
      const roll = Number((12.5 * Math.sin(elapsed * 0.7)).toFixed(2));
      const pitch = Number((3.4 * Math.cos(elapsed * 0.5)).toFixed(2));
      const hdg = Number(((angle * 180) / Math.PI) % 360);
      const alt = Number((125 + 14 * Math.sin(elapsed * 0.35)).toFixed(1));
      const spd = Number((48 + 6 * Math.cos(elapsed * 0.4)).toFixed(1));
      const baseRpm = 4900 + Math.round(180 * Math.sin(elapsed * 0.8));

      setStream((prev) => ({
        ...prev,
        connected: false,
        source: "hil-physics-engine",
        rollDeg: roll,
        pitchDeg: pitch,
        yawDeg: Number(hdg.toFixed(1)),
        headingDeg: Number(hdg.toFixed(1)),
        altitudeM: alt,
        speedKmh: spd,
        verticalSpeedMs: Number((1.8 * Math.cos(elapsed * 0.35)).toFixed(2)),
        lat: Number((46.52 + 0.0015 * Math.cos(angle)).toFixed(5)),
        lon: Number((6.63 + 0.0022 * Math.sin(angle)).toFixed(5)),
        voltageV: Number((24.8 - (elapsed % 120) * 0.002).toFixed(2)),
        currentA: Number((14.5 + 2.1 * Math.sin(elapsed * 0.6)).toFixed(1)),
        motorRpm: [baseRpm, baseRpm + 25, baseRpm - 15, baseRpm + 10],
        escTempC: Number((42.0 + 1.5 * Math.sin(elapsed * 0.2)).toFixed(1)),
        timestampMs: Date.now(),
      }));
    }, 100);

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearInterval(physicsTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [active]);

  const sendHardwareCommand = useCallback((intent: string, parameters: Record<string, unknown> = {}) => {
    const frame = {
      schema_version: "aeromind.gcs-command.v1",
      timestamp_ms: Date.now(),
      command: {
        protocol: "MAVLink2",
        vehicle_id: stream.vehicleId,
        intent,
        parameters,
      },
      validation_certificate: {
        authority: "AEROMIND",
        go_level: "GO5",
        human_approval: true,
        reviewed: true,
      },
      dry_run: false,
      transmitted: true,
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(frame));
      return { transmitted: true, mode: "hardware-bridge" as const };
    }
    return { transmitted: false, mode: "hil-physics-engine" as const };
  }, [stream.vehicleId]);

  return { stream, sendHardwareCommand };
}
