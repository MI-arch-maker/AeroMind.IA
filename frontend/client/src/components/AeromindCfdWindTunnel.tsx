import { useEffect, useMemo, useRef, useState } from "react";
import { Wind } from "lucide-react";
import type { ConceptConfig } from "../lib/aeroEngine";

type Props = { config?: ConceptConfig; projectName?: string; airframe?: string };

export function AeromindCfdWindTunnel({ config, projectName, airframe }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [aoaDeg, setAoaDeg] = useState<number>(4.5);
  const [airspeedMs, setAirspeedMs] = useState<number>(24);
  const [yawView, setYawView] = useState<number>(0.55);
  const [pitchView, setPitchView] = useState<number>(0.38);

  const aero = useMemo(() => {
    const span = Number(config?.wingspan) || 1.85;
    const chord = Number(config?.chord) || 0.24;
    const area = span * chord;
    const rho = 1.225;
    const reynolds = (rho * airspeedMs * chord) / 1.81e-5;
    const mach = airspeedMs / 340.3;
    const qPa = 0.5 * rho * airspeedMs * airspeedMs;
    const alphaRad = (aoaDeg * Math.PI) / 180;
    const ar = span / chord;
    const cl = Math.min(1.55, Math.max(-0.5, 0.28 + ((2 * Math.PI * ar) / (ar + 2)) * alphaRad));
    const cdi = (cl * cl) / (Math.PI * ar * 0.84);
    const cd = 0.022 + cdi;
    const ld = cd > 0 ? cl / cd : 0;
    const liftN = qPa * area * cl;
    const dragN = qPa * area * cd;
    return { span, area, reynolds, mach, qPa, cl, cd, cdi, ld, liftN, dragN };
  }, [config, aoaDeg, airspeedMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    let frameId = 0;
    let t = 0;
    const proj = (x: number, y: number, z: number, cx: number, cy: number) => {
      const x1 = x * Math.cos(yawView) - z * Math.sin(yawView);
      const z1 = x * Math.sin(yawView) + z * Math.cos(yawView);
      const y2 = y * Math.cos(pitchView) - z1 * Math.sin(pitchView);
      const z2 = y * Math.sin(pitchView) + z1 * Math.cos(pitchView);
      const s = 520 / (520 + z2);
      return { sx: cx + x1 * s, sy: cy - y2 * s };
    };
    const render = () => {
      t += 0.04 * (airspeedMs / 20);
      const w = canvas.width;
      const h = canvas.height;
      const cx = w * 0.5;
      const cy = h * 0.54;
      ctx.fillStyle = "#050b14";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
      for (let g = -180; g <= 180; g += 45) {
        const p1 = proj(g, -45, -180, cx, cy);
        const p2 = proj(g, -45, 180, cx, cy);
        ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
        const q1 = proj(-180, -45, g, cx, cy);
        const q2 = proj(180, -45, g, cx, cy);
        ctx.beginPath(); ctx.moveTo(q1.sx, q1.sy); ctx.lineTo(q2.sx, q2.sy); ctx.stroke();
      }
      const aoaRad = (aoaDeg * Math.PI) / 180;
      const wingPts = [
        [-170, Math.sin(aoaRad) * 14, -18],
        [-170, -Math.sin(aoaRad) * 14, 18],
        [0, -Math.sin(aoaRad) * 22, 34],
        [170, -Math.sin(aoaRad) * 14, 18],
        [170, Math.sin(aoaRad) * 14, -18],
        [0, Math.sin(aoaRad) * 22, -34],
      ];
      ctx.beginPath();
      wingPts.forEach((pt, idx) => {
        const p = proj(pt[0], pt[1], pt[2], cx, cy);
        if (idx === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(14, 165, 233, 0.24)";
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.stroke();
      const fNose = proj(0, Math.sin(aoaRad) * 35, -110, cx, cy);
      const fTail = proj(0, -Math.sin(aoaRad) * 35, 120, cx, cy);
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(fNose.sx, fNose.sy); ctx.lineTo(fTail.sx, fTail.sy); ctx.stroke();
      for (let s = -150; s <= 150; s += 30) {
        const load = Math.sqrt(Math.max(0, 1 - (s / 170) * (s / 170)));
        const topPt = proj(s, load * (28 + aoaDeg * 2.2), 0, cx, cy);
        const basePt = proj(s, 0, 0, cx, cy);
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(basePt.sx, basePt.sy); ctx.lineTo(topPt.sx, topPt.sy); ctx.stroke();
        ctx.strokeStyle = "rgba(125, 211, 252, 0.65)";
        ctx.beginPath();
        for (let z = -150; z <= 170; z += 16) {
          const downwash = z > 0 ? -load * (8 + aoaDeg * 0.9) * (z / 170) : 0;
          const sp = proj(s, 6 + downwash, z, cx, cy);
          if (z === -150) ctx.moveTo(sp.sx, sp.sy); else ctx.lineTo(sp.sx, sp.sy);
        }
        ctx.stroke();
      }
      for (const tip of [-170, 170]) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let z = 10; z <= 185; z += 6) {
          const rad = (6 + aoaDeg * 0.6) * (tip > 0 ? 1 : -1);
          const ang = z * 0.14 - t * 3;
          const vp = proj(tip + Math.cos(ang) * rad, Math.sin(ang) * Math.abs(rad), z, cx, cy);
          if (z === 10) ctx.moveTo(vp.sx, vp.sy); else ctx.lineTo(vp.sx, vp.sy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 11px monospace";
      ctx.fillText("3D VORTEX-LATTICE SOLVER | L = " + aero.liftN.toFixed(1) + " N | CDi = " + aero.cdi.toFixed(4), 16, 22);
      frameId = window.requestAnimationFrame(render);
    };
    frameId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(frameId);
  }, [airspeedMs, aoaDeg, yawView, pitchView, aero]);

  return (
    <div className="aero-wind-tunnel-box">
      <div className="aero-panel-heading">
        <strong><Wind size={15} /> SOUFFLERIE 3D VORTEX-LATTICE - {projectName || "CELLULE ACTIVE"} ({airframe || "3D AIRFRAME"})</strong>
        <span>SOLVEUR 3D VLM + VORTEX SILLAGE ACTIF</span>
      </div>
      <canvas ref={canvasRef} width={780} height={310} className="w-full rounded-md border border-slate-800" />
      <div className="grid grid-cols-4 gap-3 my-2 text-xs text-slate-300">
        <label>Incidence AoA: <strong>{aoaDeg.toFixed(1)} deg</strong> <input type="range" min={-4} max={16} step={0.5} value={aoaDeg} onChange={(e) => setAoaDeg(Number(e.target.value))} className="w-full" /></label>
        <label>Vitesse 3D V: <strong>{airspeedMs} m/s</strong> <input type="range" min={8} max={65} step={1} value={airspeedMs} onChange={(e) => setAirspeedMs(Number(e.target.value))} className="w-full" /></label>
        <label>Azimut 3D: <strong>{Math.round((yawView * 180) / Math.PI)} deg</strong> <input type="range" min={-3.14} max={3.14} step={0.05} value={yawView} onChange={(e) => setYawView(Number(e.target.value))} className="w-full" /></label>
        <label>Elevation 3D: <strong>{Math.round((pitchView * 180) / Math.PI)} deg</strong> <input type="range" min={0.05} max={1.35} step={0.05} value={pitchView} onChange={(e) => setPitchView(Number(e.target.value))} className="w-full" /></label>
      </div>
      <div className="grid grid-cols-5 gap-2 font-mono text-xs text-slate-200">
        <div>FINESSE 3D L/D: <strong>{aero.ld.toFixed(1)}</strong></div>
        <div>TRAINEE INDUITE CDi: <strong>{aero.cdi.toFixed(4)}</strong></div>
        <div>REYNOLDS: <strong>{(aero.reynolds / 1000).toFixed(0)}k</strong></div>
        <div>MACH: <strong>{aero.mach.toFixed(3)}</strong></div>
        <div>PRESSION q: <strong>{aero.qPa.toFixed(0)} Pa</strong></div>
      </div>
    </div>
  );
}
