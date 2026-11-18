import { useEffect, useState } from "react";
import { Eye, Layers, Cpu, Compass } from "lucide-react";

export type AeromindRenderStyle = "studio-pbr" | "xray-hybrid" | "night-ops" | "blueprint-cad";
const STORAGE_KEY = "aeromind-render-style";

const styles: Array<{ id: AeromindRenderStyle; label: string; badge: string; icon: typeof Eye }> = [
  { id: "studio-pbr", label: "1. Studio PBR Carbone & Métal", badge: "PBR", icon: Eye },
  { id: "xray-hybrid", label: "2. Hybride X-Ray Interne", badge: "X-RAY", icon: Layers },
  { id: "night-ops", label: "3. Tactique Night-Ops HUD", badge: "EO/IR", icon: Cpu },
  { id: "blueprint-cad", label: "4. Blueprint Bureau d’Études", badge: "CAD", icon: Compass },
];

export function AeromindRenderStyleBar() {
  const [active, setActive] = useState<AeromindRenderStyle>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as AeromindRenderStyle | null;
      return saved && styles.some(s => s.id === saved) ? saved : "studio-pbr";
    } catch { return "studio-pbr"; }
  });

  useEffect(() => {
    document.documentElement.dataset.aeromindRender = active;
    try { window.localStorage.setItem(STORAGE_KEY, active); } catch {}
  }, [active]);

  return (
    <div className="aeromind-render-style-bar" role="group" aria-label="Sélecteur libre de rendu 3D / CAO">
      <span className="render-bar-title">RENDU VISUEL LIBRE (PROFIL) :</span>
      <div className="render-bar-options">
        {styles.map((item) => {
          const Icon = item.icon;
          const selected = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setActive(item.id)}
              className={`render-style-chip ${selected ? "is-active" : ""}`}
            >
              <Icon size={13} />
              <span>{item.label}</span>
              <b>{item.badge}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}
