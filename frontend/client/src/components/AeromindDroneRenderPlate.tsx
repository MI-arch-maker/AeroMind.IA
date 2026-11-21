import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Compass, Magnet, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { defaultConcept, type ConceptConfig } from "../lib/aeroEngine";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import { buildMechanicalModel } from "../lib/mechanicalTwinGeometry";
import { prepareMechanicalPreview, projectMechanicalPreview } from "./ParametricDronePreview";

export type DroneRenderPreset = "studio-pbr" | "xray-hybrid" | "night-ops" | "studio-blueprint";

export function AeromindDroneRenderPlate({ design, preset, wingspanM, lengthM, motorCount }: { design: DroneCatalogDesign; preset: DroneRenderPreset; wingspanM: number; lengthM: number; motorCount: number }) {
  const [orbit, setOrbit] = useState({ yaw: 38, pitch: 26 });
  const [zoom, setZoom] = useState(1);
  const [magneticCam, setMagneticCam] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!magneticCam || dragging) return;
    const timer = window.setInterval(() => setOrbit(prev => ({ ...prev, yaw: (prev.yaw + 1.4) % 360 })), 30);
    return () => window.clearInterval(timer);
  }, [magneticCam, dragging]);

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, yaw: orbit.yaw, pitch: orbit.pitch };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStart.current) return;
    setOrbit({
      yaw: (dragStart.current.yaw + (e.clientX - dragStart.current.x) * 0.65 + 360) % 360,
      pitch: Math.max(-85, Math.min(85, dragStart.current.pitch + (e.clientY - dragStart.current.y) * 0.55)),
    });
  };
  const onPointerUp = () => { setDragging(false); dragStart.current = null; };
  const aspectRatio = ((wingspanM * wingspanM) / Math.max(0.18, wingspanM * lengthM * 0.24)).toFixed(1);
  const { pbrPaths, bpPaths } = useMemo(() => {
    const cfg: ConceptConfig = { ...defaultConcept, ...design.configuration, wingspan: wingspanM, fuselageLength: lengthM, motorCount, airframe: design.key, modelType: design.modelType as ConceptConfig["modelType"], designName: design.label };
    const prepared = prepareMechanicalPreview(buildMechanicalModel(design, cfg));
    return {
      pbrPaths: projectMechanicalPreview(prepared, orbit, "perspective"),
      bpPaths: projectMechanicalPreview(prepared, { yaw: 35, pitch: 32 }, "blueprint"),
    };
  }, [design, wingspanM, lengthM, motorCount, orbit]);

  const exportPng = () => {
    if (!svgRef.current) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 1840; c.height = 860;
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `${design.id}_${preset}.png`; a.click();
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svgRef.current));
  };

  const cBtn = (active = false) => ({ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "4px", fontSize: "10px", fontFamily: "monospace", fontWeight: 600, cursor: "pointer", background: active ? "rgba(14,165,233,0.28)" : "rgba(15,23,42,0.88)", color: active ? "#ffffff" : "#94a3b8", border: active ? "1px solid #38bdf8" : "1px solid #1e293b" });
  const scaleVal = 3.05 * zoom, tx = 460 - 160 * scaleVal, ty = 215 - 84 * scaleVal;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "6px", padding: "5px 8px", background: "#07101f", border: "1px solid #1e293b", borderRadius: "4px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          <button type="button" style={cBtn(magneticCam)} onClick={() => setMagneticCam(v => !v)}><Magnet size={12} /> {magneticCam ? "CAMÉRA MAGNÉTIQUE : ON" : "CAMÉRA MAGNÉTIQUE"}</button>
          <button type="button" style={cBtn()} onClick={() => setOrbit({ yaw: 38, pitch: 26 })}>ISO 3/4</button>
          <button type="button" style={cBtn()} onClick={() => setOrbit({ yaw: 0, pitch: 85 })}>DESSUS</button>
          <button type="button" style={cBtn()} onClick={() => setOrbit({ yaw: 0, pitch: 0 })}>FACE</button>
          <button type="button" style={cBtn()} onClick={() => setOrbit({ yaw: 90, pitch: 0 })}>PROFIL</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#38bdf8", marginRight: "4px" }}><Compass size={11} style={{ display: "inline" }} /> YAW {Math.round(orbit.yaw)}° · PITCH {Math.round(orbit.pitch)}°</span>
          <button type="button" style={cBtn()} onClick={() => setZoom(z => Math.min(1.8, +(z + 0.15).toFixed(2)))}><ZoomIn size={12} /></button>
          <button type="button" style={cBtn()} onClick={() => setZoom(z => Math.max(0.65, +(z - 0.15).toFixed(2)))}><ZoomOut size={12} /></button>
          <button type="button" style={cBtn()} onClick={() => { setOrbit({ yaw: 38, pitch: 26 }); setZoom(1); setMagneticCam(false); }}><RotateCcw size={12} /></button>
          <button type="button" style={cBtn()} onClick={exportPng}><Camera size={12} /> PNG</button>
        </div>
      </div>
      <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={(e) => { e.preventDefault(); setZoom(z => Math.max(0.65, Math.min(1.8, +(z + (e.deltaY < 0 ? 0.08 : -0.08)).toFixed(2)))); }} style={{ cursor: dragging ? "grabbing" : "grab", userSelect: "none", touchAction: "none" }}>
        {preset === "xray-hybrid" ? (
          <svg ref={svgRef} viewBox="0 0 920 430" preserveAspectRatio="none" style={{ width: "100%", height: "100%", minHeight: "100%", display: "block" }}>
            <rect width="920" height="430" fill="#030913" />
            <g transform={`translate(${tx},${ty}) scale(${scaleVal})`}>
              <line x1="95" y1="84" x2="225" y2="84" stroke="#0284c7" strokeWidth="2.2" />
              <rect x="153" y="64" width="14" height="16" rx="1.5" fill="#06b6d4" fillOpacity="0.85" stroke="#a5f3fc" strokeWidth="0.6" />
              <rect x="152" y="83" width="16" height="18" rx="1.5" fill="#10b981" fillOpacity="0.8" stroke="#6ee7b7" strokeWidth="0.6" />
              <line x1="160" y1="54" x2="160" y2="116" stroke="#f97316" strokeWidth="1.4" />
              {pbrPaths.map((p, i) => (<path key={i} d={p.d} fill="#0ea5e9" fillOpacity={0.22} stroke="#38bdf8" strokeWidth="0.45" />))}
              <circle cx="160" cy="84" r="4" fill="#ffffff" stroke="#0284c7" strokeWidth="1.4" />
            </g>
            <text x="24" y="28" fill="#38bdf8" fontFamily="monospace" fontSize="12" fontWeight="bold">NATO / STANAG-4586 · COUPE X-RAY INTERACTIVE — {design.label.toUpperCase()}</text>
            <text x="24" y="408" fill="#94a3b8" fontFamily="monospace" fontSize="10">ROTATION SOURIS 360° | SPAN: {wingspanM.toFixed(2)} m | LENGTH: {lengthM.toFixed(2)} m | {motorCount} MOTEUR(S)</text>
          </svg>
        ) : preset === "night-ops" ? (
          <svg ref={svgRef} viewBox="0 0 920 430" preserveAspectRatio="none" style={{ width: "100%", height: "100%", minHeight: "100%", display: "block" }}>
            <rect width="920" height="430" fill="#020907" />
            <circle cx="460" cy="215" r="180" fill="none" stroke="rgba(16,185,129,0.28)" strokeWidth="1.2" />
            <circle cx="460" cy="215" r="125" fill="none" stroke="rgba(16,185,129,0.22)" strokeDasharray="6 4" />
            <line x1="250" y1="215" x2="670" y2="215" stroke="rgba(16,185,129,0.25)" /><line x1="460" y1="22" x2="460" y2="408" stroke="rgba(16,185,129,0.25)" />
            <g transform={`translate(${tx},${ty}) scale(${scaleVal})`}>{pbrPaths.map((p, i) => (<path key={i} d={p.d} fill="#064e3b" fillOpacity={0.62} stroke="#34d399" strokeWidth="0.5" />))}</g>
            <text x="24" y="28" fill="#34d399" fontFamily="monospace" fontSize="12" fontWeight="bold">TACTICAL NIGHT-OPS · EO/IR &amp; RADAR 360° — {design.label.toUpperCase()}</text>
            <text x="24" y="408" fill="#6ee7b7" fontFamily="monospace" fontSize="10">CAMÉRA MAGNÉTIQUE &amp; ROTATION 360° | SPAN {wingspanM.toFixed(2)} m | {motorCount} PROPULSEUR(S)</text>
          </svg>
        ) : preset === "studio-blueprint" ? (
          <svg ref={svgRef} viewBox="0 0 920 430" preserveAspectRatio="none" style={{ width: "100%", height: "100%", minHeight: "100%", display: "block" }}>
            <rect width="460" height="430" fill="#060c16" /><rect x="460" width="460" height="430" fill="#072642" /><line x1="460" y1="0" x2="460" y2="430" stroke="#38bdf8" strokeWidth="1.5" />
            <g transform={`translate(${230 - 160 * (1.38 * zoom)},${215 - 84 * (1.38 * zoom)}) scale(${1.38 * zoom})`}>{pbrPaths.map((p, i) => (<path key={i} d={p.d} fill={p.color} fillOpacity={p.opacity} stroke="rgba(226,232,240,0.45)" strokeWidth="0.3" />))}</g>
            <g transform="translate(468,88) scale(1.38)">{bpPaths.map((p, i) => (<path key={i} d={p.d} fill="rgba(56,189,248,0.16)" stroke="#7dd3fc" strokeWidth="0.45" />))}</g>
            <text x="686" y="368" textAnchor="middle" fill="#e0f2fe" fontFamily="monospace" fontSize="11" fontWeight="bold">SPAN : {wingspanM.toFixed(2)} m · LENGTH : {lengthM.toFixed(2)} m · AR : {aspectRatio}</text>
            <text x="24" y="28" fill="#38bdf8" fontFamily="monospace" fontSize="11" fontWeight="bold">RENDU STUDIO PBR (ROTATIF) · {design.label.toUpperCase()}</text>
            <text x="480" y="28" fill="#7dd3fc" fontFamily="monospace" fontSize="11" fontWeight="bold">PLAN COTÉ ISO-128 · STANAG</text>
          </svg>
        ) : (
          <svg ref={svgRef} viewBox="0 0 920 430" preserveAspectRatio="none" style={{ width: "100%", height: "100%", minHeight: "100%", display: "block" }}>
            <rect width="920" height="430" fill="#060c16" /><ellipse cx="460" cy="346" rx="310" ry="42" fill="rgba(56,189,248,0.08)" stroke="rgba(148,163,184,0.28)" />
            <g transform={`translate(${tx},${ty}) scale(${scaleVal})`}>{pbrPaths.map((p, i) => (<path key={i} d={p.d} fill={p.color} fillOpacity={p.opacity} stroke="rgba(241,245,249,0.38)" strokeWidth="0.28" />))}</g>
            <text x="24" y="28" fill="#38bdf8" fontFamily="monospace" fontSize="12" fontWeight="bold">STUDIO PBR · CARBONE T700S &amp; TITANE — {design.label.toUpperCase()}</text>
            <text x="24" y="408" fill="#94a3b8" fontFamily="monospace" fontSize="10">ROTATION SOURIS 360° &amp; ZOOM | SPAN: {wingspanM.toFixed(2)} m | LENGTH: {lengthM.toFixed(2)} m | AR: {aspectRatio} | {motorCount}x</text>
          </svg>
        )}
      </div>
    </div>
  );
}
