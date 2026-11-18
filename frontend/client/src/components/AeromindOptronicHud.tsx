import { useEffect, useRef } from "react";
import { Crosshair, Radio, ShieldCheck } from "lucide-react";
import { useAeromindHardwareStream } from "../hooks/useAeromindHardwareStream";

type Props = { modeLabel?: string; statusText?: string };

export function AeromindOptronicHud({ modeLabel = "EO / IR OPTRONIC", statusText }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { stream, sendHardwareCommand } = useAeromindHardwareStream(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    let frameId = 0;
    let scanY = 0;
    const render = () => {
      scanY = (scanY + 1.8) % canvas.height;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#030c12";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.10)";
      ctx.lineWidth = 1;
      for (let gx = 40; gx < w; gx += 48) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (let gy = 40; gy < h; gy += 48) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
      const cx = w * 0.5;
      const cy = h * 0.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((-stream.rollDeg * Math.PI) / 180);
      const pitchOffset = stream.pitchDeg * 3.5;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-130, pitchOffset); ctx.lineTo(-36, pitchOffset); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(36, pitchOffset); ctx.lineTo(130, pitchOffset); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 68, cy); ctx.lineTo(cx - 18, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 18, cy); ctx.lineTo(cx + 68, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - 68); ctx.lineTo(cx, cy - 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy + 18); ctx.lineTo(cx, cy + 68); ctx.stroke();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
      ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(w, scanY); ctx.stroke();
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "bold 11px monospace";
      ctx.fillText("SENSOR: " + modeLabel + " | BRIDGE: " + (stream.connected ? "20Hz LOCKED" : "READY"), 18, 24);
      ctx.fillText("ALT: " + stream.altitudeM.toFixed(1) + " m | GS: " + stream.speedKmh.toFixed(1) + " km/h | HDG: " + stream.yawDeg.toFixed(0) + " deg", 18, h - 18);
      ctx.fillText("GNSS: " + stream.lat.toFixed(5) + ", " + stream.lon.toFixed(5) + " | BAT: " + stream.batteryPct + "%", w - 310, h - 18);
      frameId = window.requestAnimationFrame(render);
    };
    frameId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(frameId);
  }, [stream, modeLabel]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-950/95 p-3">
      <canvas ref={canvasRef} width={860} height={340} className="w-full h-full rounded border border-cyan-900/50" />
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded bg-emerald-950/90 border border-emerald-500/40 px-2.5 py-1 text-[11px] font-mono text-emerald-300">
          <Radio size={12} /> {statusText || "HUD OPTRONIQUE ACTIF · 20Hz"}
        </span>
        <button type="button" onClick={() => sendHardwareCommand("sensor-gimbal-lock", { mode: modeLabel })} className="inline-flex items-center gap-1 rounded bg-sky-600 hover:bg-sky-500 px-2.5 py-1 text-[11px] font-semibold text-white">
          <Crosshair size={12} /> Verrouiller Gimbal EO/IR
        </button>
      </div>
      <div className="absolute bottom-3 left-4 text-[10px] font-mono text-cyan-300/80 flex items-center gap-1.5">
        <ShieldCheck size={12} /> PASSERELLE OPTRONIQUE & TÉLÉMÉTRIE MAVLINK2 (ws://127.0.0.1:8765)
      </div>
    </div>
  );
}
