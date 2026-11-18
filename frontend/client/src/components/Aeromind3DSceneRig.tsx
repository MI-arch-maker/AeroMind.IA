import { useEffect, useState } from "react";
import type { AeromindRenderStyle } from "./AeromindRenderStyleBar";
import type { MechanicalModel } from "../lib/mechanicalTwinGeometry";

export function useActiveAeromindRender(): AeromindRenderStyle {
  const [style, setStyle] = useState<AeromindRenderStyle>(() => (document.documentElement.dataset.aeromindRender as AeromindRenderStyle) || "studio-pbr");
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<AeromindRenderStyle>).detail; if (d) setStyle(d); };
    window.addEventListener("aeromind-render-changed", h);
    return () => window.removeEventListener("aeromind-render-changed", h);
  }, []);
  return style;
}
export function Aeromind3DSceneExtras({ model, renderStyle }: { model: MechanicalModel; renderStyle: AeromindRenderStyle }) {
  const span = Math.max(0.6, model.span || 1.6);
  const length = Math.max(0.4, model.length || 1.0);
  const floorY = -Math.max(0.18, model.extent * 0.24);
  return (
    <group>
      {(renderStyle === "studio-pbr" || renderStyle === "blueprint-cad") && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]}><circleGeometry args={[Math.max(2.5, model.extent * 2.2), 64]} /><meshStandardMaterial color="#0b111a" metalness={0.65} roughness={0.32} /></mesh>
      )}
      {renderStyle === "xray-hybrid" && (
        <group>
          {[-0.03, 0, 0.03].map((ox, ix) => [-0.04, 0, 0.04].map((oz, iz) => (
            <mesh key={`b-${ix}-${iz}`} position={[ox * length, 0.01, -length * 0.22 + oz * length]}><cylinderGeometry args={[0.012 * length, 0.012 * length, 0.065 * length, 14]} /><meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={1.3} /></mesh>
          )))}
          <mesh position={[0, 0.025 * length, 0]}><boxGeometry args={[0.09 * length, 0.018 * length, 0.14 * length]} /><meshStandardMaterial color="#10b981" emissive="#059669" emissiveIntensity={0.65} /></mesh>
          <mesh position={[0, 0.012 * length, -0.05 * length]}><boxGeometry args={[0.022 * length, 0.014 * length, 0.34 * length]} /><meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.85} /></mesh>
          <mesh position={[0, 0.02 * length, -0.02 * length]}><boxGeometry args={[span * 0.92, 0.014 * length, 0.028 * length]} /><meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.75} transparent opacity={0.85} /></mesh>
          <mesh position={[0, 0.055 * length, 0]}><sphereGeometry args={[0.022 * length, 16, 16]} /><meshStandardMaterial color="#ffffff" emissive="#38bdf8" emissiveIntensity={1.6} /></mesh>
        </group>
      )}
      {renderStyle === "night-ops" && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]}><ringGeometry args={[span * 0.45, span * 0.47, 64]} /><meshBasicMaterial color="#10b981" transparent opacity={0.85} /></mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]}><ringGeometry args={[span * 0.72, span * 0.735, 64]} /><meshBasicMaterial color="#34d399" transparent opacity={0.55} /></mesh>
          <mesh position={[span * 0.49, 0.02, 0]}><sphereGeometry args={[0.018 * span, 12, 12]} /><meshBasicMaterial color="#22c55e" /></mesh>
          <mesh position={[-span * 0.49, 0.02, 0]}><sphereGeometry args={[0.018 * span, 12, 12]} /><meshBasicMaterial color="#ef4444" /></mesh>
        </group>
      )}
    </group>
  );
}
export function AeromindBlueprintSplitOverlay({ model }: { model: MechanicalModel }) {
  return (
    <div style={{ width: "44%", minWidth: "230px", height: "100%", background: "#072846", borderLeft: "1px solid #38bdf8", padding: "12px", fontFamily: "monospace", color: "#bae6fd", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ fontSize: "10px" }}>BLUEPRINT COTÉ · ORTHO SI</div>
      <svg viewBox="0 0 260 220" style={{ width: "100%" }}>
        <path d="M 28 48 Q 70 30 135 38 L 222 36 L 232 20 L 238 20 L 234 44 L 145 48 Q 75 54 28 48 Z" fill="rgba(56,189,248,0.12)" stroke="#7dd3fc" strokeWidth="1.4" />
        <text x="133" y="81" textAnchor="middle" fill="#e0f2fe" fontSize="10" fontWeight="bold">SPAN : {(model.span || 1.6).toFixed(2)} m</text>
        <path d="M 130 102 Q 140 122 140 144 L 242 152 L 242 162 L 140 160 L 140 186 L 166 194 L 166 200 L 94 200 L 94 194 L 120 186 L 120 160 L 18 162 L 18 152 L 120 144 Q 120 122 130 102 Z" fill="rgba(56,189,248,0.12)" stroke="#7dd3fc" strokeWidth="1.4" />
        <text x="130" y="219" textAnchor="middle" fill="#e0f2fe" fontSize="10" fontWeight="bold">LENGTH : {(model.length || 1.0).toFixed(2)} m</text>
      </svg>
      <div style={{ fontSize: "10px" }}>ÉCHELLE 1:10 · {model.parts.length} PIÈCES</div>
    </div>
  );
}
