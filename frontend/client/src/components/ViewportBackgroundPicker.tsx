import { useEffect, useState } from "react";
import { Paintbrush, RotateCcw } from "lucide-react";

const swatches = [
  { name: "Graphite profond", value: "#071218" },
  { name: "Bleu pétrole", value: "#0b2630" },
  { name: "AeroMind nuit", value: "#102b3a" },
  { name: "Ardoise", value: "#293746" },
  { name: "Bleu atelier", value: "#173d5b" },
  { name: "Vert pétrole", value: "#123d38" },
  { name: "Prune sombre", value: "#382c48" },
  { name: "Terre cuite", value: "#55382f" },
  { name: "Gris clair", value: "#cbd5d8" },
  { name: "Ivoire", value: "#f0ede3" },
  { name: "Blanc", value: "#ffffff" },
  { name: "Noir", value: "#000000" },
] as const;

export function loadViewportBackground(scope: string | undefined): string {
  if (!scope || typeof window === "undefined") return swatches[0].value;
  try {
    const saved = window.localStorage.getItem(`aeromind-viewport-background:${scope}`);
    return saved && /^#[\da-f]{6}$/i.test(saved) ? saved : swatches[0].value;
  } catch {
    return swatches[0].value;
  }
}

export function ViewportBackgroundPicker({
  scope,
  value,
  onChange,
}: {
  scope: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());
  useEffect(() => setHexDraft(value.toUpperCase()), [value]);

  const applyColor = (color: string) => {
    if (!/^#[\da-f]{6}$/i.test(color)) return;
    const normalized = color.toUpperCase();
    setHexDraft(normalized);
    onChange(normalized);
    try {
      window.localStorage.setItem(`aeromind-viewport-background:${scope}`, normalized);
    } catch {
      // The visible choice still works when browser storage is unavailable.
    }
  };

  return (
    <div className="mt-background-picker" data-testid="viewport-background-picker">
      <button
        type="button"
        className="mt-background-trigger"
        aria-expanded={open}
        aria-controls={`mt-background-panel-${scope}`}
        onClick={() => setOpen(current => !current)}
        title="Changer la couleur de fond du viewport"
      >
        <Paintbrush size={14} />
        <span>Fond</span>
        <i style={{ backgroundColor: value }} aria-hidden="true" />
      </button>
      <section id={`mt-background-panel-${scope}`} className="mt-background-panel" aria-label="Panneau de couleur du fond" hidden={!open}>
          <header>
            <div><strong>Couleur du fond</strong><small>Affichage local · non destructif</small></div>
            <button type="button" className="mt-background-close" onClick={() => setOpen(false)} aria-label="Fermer le panneau de couleur">×</button>
          </header>
          <div className="mt-background-swatches" role="group" aria-label="Couleurs prédéfinies">
            {swatches.map(color => (
              <button
                type="button"
                key={color.value}
                className={value.toUpperCase() === color.value.toUpperCase() ? "is-selected" : ""}
                style={{ backgroundColor: color.value }}
                aria-label={color.name}
                aria-pressed={value.toUpperCase() === color.value.toUpperCase()}
                title={`${color.name} · ${color.value}`}
                onClick={() => applyColor(color.value)}
              />
            ))}
          </div>
          <div className="mt-background-custom">
            <label><span>Personnaliser</span><input type="color" value={value} onChange={event => applyColor(event.target.value)} aria-label="Choisir une couleur personnalisée" /></label>
            <input
              type="text"
              value={hexDraft}
              aria-label="Code hexadécimal de la couleur de fond"
              pattern="#[0-9A-Fa-f]{6}"
              maxLength={7}
              onChange={event => {
                const next = event.target.value;
                setHexDraft(next);
                if (/^#[\da-f]{6}$/i.test(next)) applyColor(next);
              }}
              onBlur={() => {
                if (!/^#[\da-f]{6}$/i.test(hexDraft)) setHexDraft(value.toUpperCase());
              }}
            />
            <button type="button" onClick={() => applyColor(swatches[0].value)} title="Rétablir le fond AeroMind par défaut" aria-label="Rétablir le fond AeroMind par défaut"><RotateCcw size={13} /></button>
          </div>
          <small className="mt-background-note">Le choix ne modifie ni le modèle ni les données du projet.</small>
      </section>
    </div>
  );
}
