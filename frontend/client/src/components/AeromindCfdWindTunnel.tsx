import { useEffect, useMemo, useRef, useState } from "react";
import { Wind } from "lucide-react";
import type { ConceptConfig } from "../lib/aeroEngine";

type Props = { config?: ConceptConfig; projectName?: string; airframe?: string };

export function AeromindCfdWindTunnel({ config, projectName, airframe }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [aoaDeg, setAoaDeg] = useState<number>(4.5);
  const [airspeedMs, setAirspeedMs] = useState<number>(() => {
    const kmh = Number(config?.cruiseSpeedKmh);
    return Number.isFinite(kmh) && kmh > 0 ? Math.round(kmh / 3.6) : 22;
  });

  const aero = useMemo(() => {
    const span = Number(config?.wingspan) || 1.65;
    const chord = Number(config?.chord) || 0.24;
    const area = span * chord;
    const rho = 1.225;
    const reynolds = (rho * airspeedMs * chord) / 1.81e-5;
    const mach = airspeedMs / 340.3;
    const qPa = 0.5 * rho * airspeedMs * airspeedMs;
    const alphaRad = (aoaDeg * Math.PI) / 180;
    const ar = span / chord;
    const cl = Math.min(1.55, Math.max(-0.6, 0.28 + ((2 * Math.PI * ar) / (ar + 2)) * alphaRad));
    const cd = 0.024 + (cl * cl) / (Math.PI * ar * 0.82);
    const ld = cd > 0 ? cl / cd : 0;
    const liftN = qPa * area * cl;
    const dragN = qPa * area * cd;
    return { area, reynolds, mach, qPa, cl, cd, ld, liftN, dragN };
  }, [config, aoaDeg, airspeedMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    let frameId = 0;
    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#060d18";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.09)";
      for (let gx = 0; gx < w; gx += 32) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (let gy = 0; gy < h; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
      const cx = w * 0.44;
      const cy = h * 0.52;
      const chordPx = Math.min(230, w * 0.34);
      for (let i = 0; i < 13; i++) {
        const offset = (i - 6) * 20;
        const baseY = cy + offset;
        const isUpper = offset <= 0;
        ctx.beginPath();
        ctx.strokeStyle = isUpper ? "rgba(56, 189, 248, 0.78)" : "rgba(148, 163, 184, 0.55)";
        for (let x = 20; x <= w - 20; x += 12) {
          const dx = (x - cx) / (chordPx * 0.65);
          const defl = Math.exp(-dx * dx * 1.6) * Math.exp(-Math.abs(offset) / 68) * (isUpper ? -22 - aoaDeg * 1.4 : 11 + aoaDeg * 0.7);
          if (x === 20) ctx.moveTo(x, baseY + defl); else ctx.lineTo(x, baseY + defl);
        }
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((-aoaDeg * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(-chordPx * 0.5, 0);
      ctx.bezierCurveTo(-chordPx * 0.45, -24, -chordPx * 0.1, -26, chordPx * 0.5, 0);
      ctx.bezierCurveTo(-chordPx * 0.1, 11, -chordPx * 0.45, 10, -chordPx * 0.5, 0);
      ctx.closePath();
      ctx.fillStyle = "#1e293b";
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 11px monospace";
      ctx.fillText("PORTANCE L = " + aero.liftN.toFixed(1) + " N (CL=" + aero.cl.toFixed(2) + ")", cx - 10, cy - 52);
      ctx.fillStyle = "#fbbf24";
      ctx.fillText("TRAINEE D = " + aero.dragN.toFixed(2) + " N (CD=" + aero.cd.toFixed(3) + ")", cx + 40, cy + 18);
      frameId = window.requestAnimationFrame(render);
    };
    frameId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(frameId);
  }, [airspeedMs, aoaDeg, aero]);

  return (
    <div className="aero-wind-tunnel-box">
      <div className="aero-panel-heading">
        <strong><Wind size={15} /> SOUFFLERIE NUMERIQUE CFD - {projectName || "CELLULE ACTIVE"} ({airframe || config?.airframe || "AILE FIXE"})</strong>
        <span>SOLVEUR AEROMIND RANS-2D ACTIF</span>
      </div>
      <canvas ref={canvasRef} width={760} height={280} className="w-full rounded-md border border-slate-800" />
      <div className="grid grid-cols-2 gap-3 my-2 text-xs text-slate-300">
        <label>Incidence (AoA): <strong>{aoaDeg.toFixed(1)} deg</strong> <input type="range" min={-4} max={16} step={0.5} value={aoaDeg} onChange={(e) => setAoaDeg(Number(e.target.value))} className="w-full" /></label>
        <label>Vitesse veine: <strong>{airspeedMs} m/s</strong> <input type="range" min={8} max={65} step={1} value={airspeedMs} onChange={(e) => setAirspeedMs(Number(e.target.value))} className="w-full" /></label>
      </div>
      <div className="grid grid-cols-5 gap-2 font-mono text-xs text-slate-200">
        <div>FINESSE L/D: <strong>{aero.ld.toFixed(1)}</strong></div>
        <div>REYNOLDS: <strong>{(aero.reynolds / 1000).toFixed(0)}k</strong></div>
        <div>MACH: <strong>{aero.mach.toFixed(3)}</strong></div>
        <div>PRESSION q: <strong>{aero.qPa.toFixed(0)} Pa</strong></div>
        <div>SURFACE: <strong>{aero.area.toFixed(2)} m2</strong></div>
      </div>
    </div>
  );
}
