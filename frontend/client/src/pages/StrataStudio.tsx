import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { RotateCcw } from "lucide-react";
import type { ConceptConfig } from "../lib/aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "../lib/droneCatalog";
import { buildMechanicalModel, type MechanicalPart } from "../lib/mechanicalTwinGeometry";
import { MechanicalTwinViewport, type MechanicalView } from "../components/MechanicalTwinViewport";
import "./StrataStudio.css";

type StrataStudioProps = {
  embedded?: boolean;
  config?: ConceptConfig;
  setConfig?: Dispatch<SetStateAction<ConceptConfig>>;
  activeProfile?: DroneCatalogDesign;
  onSelectProfile?: (design: DroneCatalogDesign) => void;
};

const colors = [
  { name: "Graphite", hex: "#26323b" },
  { name: "Aluminium", hex: "#a9b7bf" },
  { name: "Blanc technique", hex: "#e6edf0" },
  { name: "Olive", hex: "#5d6a45" },
  { name: "Orange", hex: "#e66b27" },
  { name: "Bleu", hex: "#1b7eaa" },
];
const materials = ["Composite sombre", "Aluminium brossé", "Fibre de carbone", "Plastique technique", "Surface mate", "Surface satinée"];
const supportedModelTypes = new Set([
  "aile-volante", "voilure-conventionnelle", "tiltrotor", "tilt-wing", "tail-sitter", "coaxial-x8", "octocoptère", "ducted-fan", "multirotor", "aérostat", "effet-de-sol", "tandem-wing", "canard", "tricoptère", "hexacoptère", "biplan", "double-poutre", "parapente", "ornithoptère", "cyclocoptère", "planeur", "hale-voilure", "male-voilure", "stealth-wing", "blended-pusher",
]);
const componentLabels = {
  arms: "Bras et supports",
  motors: "Moteurs",
  rotors: "Hélices / rotors",
  landing: "Train d’atterrissage",
  camera: "Nacelle caméra",
  sensors: "Capteurs visibles",
} as const;
type ComponentKey = keyof typeof componentLabels;
type Appearance = { color: string; material: string; technical: boolean; visible: Record<ComponentKey, boolean> };
const defaultVisible: Record<ComponentKey, boolean> = { arms: true, motors: true, rotors: true, landing: true, camera: true, sensors: true };
const materialSurface: Record<string, { metalness: number; roughness: number }> = {
  "Composite sombre": { metalness: 0.28, roughness: 0.58 },
  "Aluminium brossé": { metalness: 0.75, roughness: 0.32 },
  "Fibre de carbone": { metalness: 0.52, roughness: 0.3 },
  "Plastique technique": { metalness: 0.05, roughness: 0.62 },
  "Surface mate": { metalness: 0.12, roughness: 0.85 },
  "Surface satinée": { metalness: 0.28, roughness: 0.22 },
};

function appearanceFromConfig(config?: ConceptConfig): Appearance {
  const stored = config?.physicalAppearance;
  return {
    color: stored?.color ?? colors[0].hex,
    material: stored?.material ?? config?.materialFamily ?? materials[0],
    technical: stored?.technical ?? false,
    visible: { ...defaultVisible, ...stored?.visible },
  };
}

// Ces associations portent uniquement sur des identifiants connus du générateur ;
// une pièce non identifiée n'est jamais inventée ni arbitrairement masquée.
function componentForPart(part: MechanicalPart): ComponentKey | undefined {
  const id = part.id.toLowerCase();
  if (/^(arm-|cyclo-support-|ornitho-drive-mount-)/.test(id)) return "arms";
  if (/^(motor-|ornitho-motor-)/.test(id)) return "motors";
  if (/^(propeller-|rotor-blade-|cyclo-blade-|cyclo-cage-|cyclo-hub-)/.test(id)) return "rotors";
  if (part.category === "landing-gear") return "landing";
  if (/^(camera(?:-|$)|gimbal(?:-|$)|nacelle-camera(?:-|$))/.test(id)) return "camera";
  if (/^(sensor-|male-sensor-bay(?:-|$))/.test(id)) return "sensors";
  return undefined;
}

function canPaintPart(part: MechanicalPart) {
  // Les traits du dessin utilisateur gardent leur couleur source.
  return part.category === "airframe" && !part.id.startsWith("sketch-");
}

function hasDrawingGeometry(config?: ConceptConfig) {
  return Boolean(config?.customSketch?.strokes?.some(stroke => stroke.points.length > 1 && stroke.tool !== "annotation" && stroke.tool !== "measure"));
}

function drawingProfile(config: ConceptConfig): DroneCatalogDesign {
  return {
    id: `custom-sketch-${config.engineeringSelection?.droneId ?? "active"}`,
    key: config.airframe ?? "fixed-wing",
    modelType: config.modelType,
    label: config.engineeringSelection?.droneLabel ?? config.designName ?? "Dessin personnalisé",
    family: "Dessin utilisateur",
    mission: "Géométrie issue des traits du projet",
    specs: "", disciplines: "", tone: "cyan", role: "civil", defenseUse: "", origin: "aeromind-parametric",
    configuration: config,
  };
}

function readSavedNames(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem("strata-variants") || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default function StrataStudio({ embedded = false, config, setConfig, activeProfile, onSelectProfile }: StrataStudioProps) {
  const [appearance, setAppearance] = useState(() => appearanceFromConfig(config));
  const [customName, setCustomName] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [localProfile, setLocalProfile] = useState<DroneCatalogDesign>();
  const [selectedPart, setSelectedPart] = useState<{ designId: string; id: string }>();
  const [view, setView] = useState<MechanicalView>("iso");
  const [resetKey, setResetKey] = useState(0);
  const [saved] = useState(readSavedNames);
  const previousMaterial = useRef({ appearance: config?.physicalAppearance?.material, family: config?.materialFamily });

  // Une modification externe de materialFamily est aussi reflétée quand le
  // matériau d'apparence n'a pas changé dans la même mise à jour.
  useEffect(() => {
    if (!config) return;
    const next = appearanceFromConfig(config);
    const previous = previousMaterial.current;
    if (config.materialFamily !== previous.family && config.physicalAppearance?.material === previous.appearance && config.materialFamily) {
      next.material = config.materialFamily;
    }
    previousMaterial.current = { appearance: config.physicalAppearance?.material, family: config.materialFamily };
    setAppearance(next);
  }, [config?.physicalAppearance?.color, config?.physicalAppearance?.material, config?.physicalAppearance?.technical, config?.physicalAppearance?.visible, config?.materialFamily]);

  const referenceProfiles = useMemo(() => [droneCatalog.find(item => item.id === "aeromind-reference-multirotor-001"), ...droneCatalog.filter(item => item.id !== "aeromind-reference-multirotor-001").slice(0, 7)].filter((profile): profile is DroneCatalogDesign => Boolean(profile)), []);
  const isCustomSource = config?.engineeringSelection?.source === "custom";
  const resolvedProfile = useMemo(() => {
    if (isCustomSource) return config && hasDrawingGeometry(config) ? drawingProfile(config) : undefined;
    if (activeProfile?.id.startsWith("custom-sketch-")) return config && hasDrawingGeometry(config) ? activeProfile : undefined;
    return activeProfile ?? (config?.platformProfile ? droneCatalog.find(item => item.id === config.platformProfile) : undefined) ?? (!config ? localProfile : undefined);
  }, [activeProfile, config, isCustomSource, localProfile]);
  const effectiveModelType = resolvedProfile?.modelType ?? config?.modelType;
  const unsupportedModelType = Boolean(resolvedProfile && !resolvedProfile.id.startsWith("custom-sketch-") && (effectiveModelType ? !supportedModelTypes.has(effectiveModelType) : !["fixed-wing", "vtol", "quadcopter"].includes(resolvedProfile.key)));
  const selectedMechanicalModel = useMemo(() => {
    if (!resolvedProfile || unsupportedModelType) return null;
    return buildMechanicalModel(resolvedProfile, (config ?? resolvedProfile.configuration) as ConceptConfig);
  }, [resolvedProfile, config, unsupportedModelType]);
  const componentCounts = useMemo(() => {
    const counts: Record<ComponentKey, number> = { arms: 0, motors: 0, rotors: 0, landing: 0, camera: 0, sensors: 0 };
    selectedMechanicalModel?.parts.forEach(part => { const key = componentForPart(part); if (key) counts[key] += 1; });
    return counts;
  }, [selectedMechanicalModel]);
  const displayModel = useMemo(() => {
    if (!selectedMechanicalModel) return null;
    const surface = materialSurface[appearance.material] ?? materialSurface[materials[0]];
    return {
      ...selectedMechanicalModel,
      parts: selectedMechanicalModel.parts.map(part => {
        const component = componentForPart(part);
        return {
          ...part,
          ...(canPaintPart(part) ? { color: appearance.color, ...surface } : {}),
          hidden: part.hidden || Boolean(component && !appearance.visible[component]),
        };
      }),
    };
  }, [selectedMechanicalModel, appearance]);
  const paintedPartCount = selectedMechanicalModel?.parts.filter(canPaintPart).length ?? 0;
  const activePart = displayModel && selectedPart && displayModel.designId === selectedPart.designId
    ? displayModel.parts.find(part => part.id === selectedPart.id && !part.hidden)
    : undefined;
  const visibleName = customMode && customName.trim() ? customName.trim() : resolvedProfile?.label ?? "Aucune architecture sélectionnée";
  const canChooseProfile = Boolean(onSelectProfile || (!activeProfile && (setConfig || !config)));

  useEffect(() => {
    setSelectedPart(current => current && displayModel?.designId === current.designId && displayModel.parts.some(part => part.id === current.id && !part.hidden) ? current : undefined);
  }, [displayModel]);

  const updateAppearance = (next: Appearance, updateFamily = false) => {
    setAppearance(next);
    setConfig?.(current => ({ ...current, ...(updateFamily ? { materialFamily: next.material } : {}), physicalAppearance: next }));
  };
  const chooseProfile = (profile: DroneCatalogDesign) => {
    if (onSelectProfile) {
      onSelectProfile(profile);
    } else if (!activeProfile && setConfig) {
      setConfig(current => ({
        ...current, ...profile.configuration, airframe: profile.key, modelType: profile.modelType,
        platformProfile: profile.id, designName: profile.label, customSketch: undefined,
        engineeringSelection: { source: "catalog", droneId: profile.id, droneLabel: profile.label, updatedAt: new Date().toISOString() },
      }));
    } else if (!config && !activeProfile) {
      setLocalProfile(profile);
    }
  };
  const resetAppearance = () => updateAppearance({ color: colors[0].hex, material: materials[0], visible: { ...appearance.visible, ...defaultVisible }, technical: false }, true);
  const resetView = () => { setView("iso"); setResetKey(key => key + 1); };
  const emptyReason = unsupportedModelType
    ? "La géométrie de cette architecture n’est pas prise en charge par le jumeau mécanique. Aucun modèle de substitution n’est affiché."
    : isCustomSource || activeProfile?.id.startsWith("custom-sketch-")
    ? "Le dessin ne contient aucun trait géométrique exploitable. Aucun modèle de substitution n’est affiché."
    : config?.platformProfile
      ? "Le profil actif n’est pas disponible dans ce catalogue. Aucun autre modèle n’est substitué."
      : "Sélectionnez une architecture dans la bibliothèque pour afficher son jumeau mécanique.";

  return <section className={`strata-app ${embedded ? "strata-embedded" : ""}`} aria-label="Construction physique du drone actif">
    <header className="strata-top"><div className="strata-brand"><span>AEROMIND / STUDIO DE CONCEPTION</span><strong>{visibleName}</strong></div><div><b>CONSTRUCTION PHYSIQUE</b><small>JUMEAU VISUEL · DONNÉES INDICATIVES · REVUE HUMAINE REQUISE</small></div><span className="strata-status"><i /> {displayModel ? "CONFIGURATION SYNCHRONISÉE" : resolvedProfile ? "GÉOMÉTRIE INDISPONIBLE" : "SÉLECTION REQUISE"}</span></header>
    <main className="strata-layout strata-reference-layout">
      <aside className="strata-library"><div className="strata-heading"><span>01 / BIBLIOTHÈQUE DRONES</span><span className="strata-heading-meta">CATALOGUE / 08</span><span className="orange-dot" /></div><p className="strata-library-note">Profils catalogue · géométrie paramétrique synchronisée</p><div className="strata-library-grid">{referenceProfiles.map((profile, index) => <button type="button" key={profile.id} className={`strata-library-card ${resolvedProfile?.id === profile.id ? "active" : ""}`} aria-pressed={resolvedProfile?.id === profile.id} disabled={!canChooseProfile} onClick={() => chooseProfile(profile)}><span className="strata-card-index">0{index + 1}</span><span className="strata-mini-drone"><img src={`/assets/strata-reference/drone-${index + 1}.webp`} alt="" /></span><strong>{profile.label}</strong><small>{profile.family}</small></button>)}</div>{!canChooseProfile && <p className="strata-note">La sélection est pilotée par le projet parent.</p>}<button type="button" className="strata-create-drone" onClick={() => setCustomMode(true)}>＋ Nommer une variante</button></aside>
      <section className="strata-view" aria-label="Vue du jumeau mécanique">
        <div className="strata-viewbar"><span>02 / JUMEAU MÉCANIQUE</span><span>{displayModel ? `${displayModel.parts.filter(part => !part.hidden).length} PIÈCES VISIBLES` : "AUCUN MODÈLE"}</span></div>
        <div className="strata-canvas strata-twin">
          {displayModel ? <MechanicalTwinViewport model={displayModel} selected={activePart?.id ?? ""} onSelect={id => setSelectedPart({ designId: displayModel.designId, id })} view={view} mode={appearance.technical ? "wireframe" : "solid"} explosion={0} resetKey={resetKey} xrayCut={1} xrayOpacity={{}} renderPreset="mechanical" /> : <div className="strata-empty" role="status"><strong>AUCUNE GÉOMÉTRIE CHARGÉE</strong><span>{emptyReason}</span></div>}
        </div>
        <div className="strata-actions" role="group" aria-label="Orientation de la vue mécanique">{([ ["iso", "Iso"], ["top", "Dessus"], ["front", "Face"], ["side", "Côté"] ] as const).map(([projection, label]) => <button type="button" key={projection} disabled={!displayModel} className={view === projection ? "active" : ""} aria-pressed={view === projection} onClick={() => setView(projection)}>{label}</button>)}<button type="button" disabled={!displayModel} onClick={resetView}><RotateCcw size={14} /> Réinitialiser la vue</button></div>
        <p className="strata-view-help">Glisser pour orbiter · molette pour zoomer · cliquer une pièce pour l’identifier. La projection de secours utilise le même maillage.</p>
        {activePart && <p className="strata-selected-part">Pièce sélectionnée : <strong>{activePart.name}</strong> <button type="button" onClick={() => setSelectedPart(undefined)}>Effacer la sélection</button></p>}
      </section>
      <aside className="strata-panel"><div className="strata-heading"><span>03 / CONSTRUCTION SYNCHRONISÉE</span><span className="strata-heading-meta">LIVE LINK / N2</span><span className="orange-dot" /></div>
        <section><h4>DRONE ACTIF DU PROJET</h4><strong>{visibleName}</strong><p>{resolvedProfile ? `${resolvedProfile.modelType ?? "Architecture paramétrique"} · ${resolvedProfile.family}` : "Sélection humaine requise"}</p><button type="button" className="strata-inline-action" onClick={() => setCustomMode(current => !current)}>{customMode ? "Revenir au nom du modèle actif" : "Nommer une variante"}</button>{customMode && <input className="strata-name-input" value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Nom de votre variante…" aria-label="Nom de la variante" />}</section>
        <section><h4>COULEUR / MATÉRIAU</h4><div className="strata-colors">{colors.map(item => <button type="button" title={item.name} aria-label={item.name} aria-pressed={appearance.color === item.hex} disabled={!paintedPartCount} key={item.hex} onClick={() => updateAppearance({ ...appearance, color: item.hex })} style={{ background: item.hex }} className={appearance.color === item.hex ? "active" : ""} />)}</div><select value={appearance.material} disabled={!paintedPartCount} onChange={event => updateAppearance({ ...appearance, material: event.target.value }, true)} aria-label="Matériau de construction">{!materials.includes(appearance.material) && <option value={appearance.material}>{appearance.material}</option>}{materials.map(item => <option key={item}>{item}</option>)}</select><p className="strata-note">Aspect indicatif des pièces de cellule ; les traits dessinés gardent leur couleur. Le relief matériau n’est pas rendu en secours vectoriel.</p></section>
        <section><h4>COMPOSANTS PHYSIQUES</h4>{(Object.entries(componentLabels) as [ComponentKey, string][]).map(([key, label]) => <label className="strata-toggle" key={key}><span>{label}{displayModel && !componentCounts[key] && <small> · non représenté</small>}</span><input type="checkbox" checked={appearance.visible[key]} disabled={!componentCounts[key]} onChange={event => updateAppearance({ ...appearance, visible: { ...appearance.visible, [key]: event.target.checked } })} /></label>)}<p className="strata-note">Les pièces masquées par le jumeau mécanique restent masquées ; les modules non identifiés ne sont pas modifiés.</p></section>
        <section><h4>PARAMÈTRES DE VISUALISATION</h4><label className="strata-toggle"><span>Vue technique filaire</span><input type="checkbox" checked={appearance.technical} disabled={!displayModel} onChange={event => updateAppearance({ ...appearance, technical: event.target.checked })} /></label><button type="button" className="strata-inline-action" onClick={resetAppearance}>Réinitialiser l’apparence</button><p className="strata-note">La vue est indicative et ne constitue pas une validation de fabrication.</p></section>
        <section><h4>FICHE PROJET ACTIVE</h4><dl className="strata-specs"><dt>Architecture</dt><dd>{resolvedProfile ? config?.airframe ?? resolvedProfile.key : "—"}</dd><dt>Envergure</dt><dd>{displayModel ? `${displayModel.span.toFixed(2)} m` : "—"}</dd><dt>Moteurs</dt><dd>{resolvedProfile ? config?.motorCount ?? resolvedProfile.configuration.motorCount ?? "—" : "—"}</dd><dt>Masse déclarée</dt><dd>{resolvedProfile && typeof config?.constructionMassKg === "number" ? `${config.constructionMassKg.toFixed(2)} kg` : "—"}</dd><dt>État</dt><dd className="orange">{displayModel ? "Synchronisé" : resolvedProfile ? "Géométrie indisponible" : "À sélectionner"}</dd></dl></section>
        <section><h4>VARIANTES LOCALES ({saved.length})</h4>{saved.slice(-3).map((item, index) => <small className="saved-row" key={`${item}-${index}`}>{item}</small>)}<p className="strata-note">{saved.length ? "Noms enregistrés localement, sans sauvegarde de géométrie." : "Aucune variante enregistrée."}</p></section>
      </aside>
    </main>
  </section>;
}
