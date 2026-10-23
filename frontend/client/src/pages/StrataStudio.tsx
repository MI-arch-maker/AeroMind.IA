import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, Line, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { Camera, Contrast, Download, Expand, Grid3X3, Move3d, RotateCcw, RotateCw, Save, Sun, ZoomIn, ZoomOut } from "lucide-react";
import type { ConceptConfig } from "../lib/aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "../lib/droneCatalog";

type DisplayDrone = {
  id: string;
  name: string;
  family: string;
  type: string;
  rotors: number;
  span: number;
  mass: string;
  mission: string;
  tone: string;
  wing: boolean;
};

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
const referenceCardLabels = ["STRATA-02", "SKYFALCON X1", "TALON-7", "AERIAL-3", "RAVEN-5", "WORKER-8", "VIPER-S", "SHADOW-1"];
const referenceCardMeta = ["Multirole / Défense", "Reconnaissance / ISR", "Combat / Défense", "Surveillance / Sécurité", "Haute altitude / ISR", "Inspection industrielle", "Tactique / Reconnaissance", "Défense / Appui"];

function profileToDrone(profile: DroneCatalogDesign, config?: ConceptConfig): DisplayDrone {
  const values = { ...profile.configuration, ...(config ?? {}) };
  const type = profile.modelType ?? "Architecture paramétrique";
  return {
    id: profile.id,
    name: profile.label,
    family: profile.family,
    type,
    rotors: Math.max(0, Math.round(values.motorCount ?? 0)),
    span: values.wingspan ?? 0,
    mass: `${(config?.constructionMassKg ?? values.maxTakeoffKg ?? 0).toFixed(2)} kg`,
    mission: profile.mission,
    tone: profile.tone,
    wing: profile.key === "fixed-wing" || type.includes("wing") || type.includes("aile") || type.includes("voilure"),
  };
}

function emptyDrone(config?: ConceptConfig): DisplayDrone {
  return {
    id: "workspace-selection-required",
    name: config?.designName ?? "Aucune architecture sélectionnée",
    family: "Workspace AeroMind",
    type: "Sélection humaine requise",
    rotors: Math.max(0, Math.round(config?.motorCount ?? 0)),
    span: config?.wingspan ?? 0,
    mass: `${(config?.constructionMassKg ?? 0).toFixed(2)} kg`,
    mission: "Sélectionnez une architecture depuis la Bibliothèque drones.",
    tone: "cyan",
    wing: config?.airframe === "fixed-wing",
  };
}

function download(name: string, data: string) {
  const anchor = document.createElement("a");
  anchor.href = `data:application/json;charset=utf-8,${encodeURIComponent(data)}`;
  anchor.download = name;
  anchor.click();
}

function CaptureButton({ onCapture }: { onCapture: (canvas: HTMLCanvasElement) => void }) {
  return <button type="button" onClick={() => {
    const canvas = document.querySelector(".strata-canvas canvas") as HTMLCanvasElement | null;
    if (canvas) onCapture(canvas);
  }}><Camera size={14} /> PNG</button>;
}

function SketchVehicle({ strokes }: { strokes: NonNullable<ConceptConfig["customSketch"]>["strokes"] }) {
  return <group scale={[.004, .004, .004]} position={[-2, .05, 0]} rotation={[0, 0, 0]}>{strokes.filter(stroke => stroke.points.length > 1).map(stroke => <Line key={stroke.id} points={stroke.points.map(point => [(point.x - 500), 0, (point.y - 280)] as [number, number, number])} color={stroke.color} lineWidth={Math.max(1, stroke.width / 2)} />)}</group>;
}

function Vehicle({ drone, color, material, visible, technical, customSketch }: { drone: DisplayDrone; color: string; material: string; visible: Record<string, boolean>; technical: boolean; customSketch?: ConceptConfig["customSketch"] }) {
  if (customSketch?.strokes?.length) return <SketchVehicle strokes={customSketch.strokes} />;
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: material.includes("satin") ? .22 : .58, metalness: material.includes("Aluminium") ? .75 : .28, wireframe: technical }), [color, material, technical]);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#101820", roughness: .3, metalness: .7, wireframe: technical }), [technical]);
  const reference = drone.id === "aeromind-reference-multirotor-001";
  return <group rotation={[0, .15, 0]}>
    <mesh material={body} scale={drone.wing ? [1.55, .24, .38] : reference ? [1.12, .24, .68] : [1, .28, .55]}><capsuleGeometry args={[.62, reference ? .55 : .62, 8, 18]} /></mesh>
    {drone.wing ? <>
      <mesh material={body} position={[0, .02, 0]} scale={[1.8, .08, .12]}><boxGeometry args={[1, 1, 1]} /></mesh>
      <mesh material={body} position={[0, .18, 0]} scale={[.65, .12, .18]}><boxGeometry args={[1, 1, 1]} /></mesh>
    </> : <>
      {visible.arms && Array.from({ length: Math.max(0, drone.rotors) }, (_, index) => {
        const angle = index / Math.max(1, drone.rotors) * Math.PI * 2;
        return <group key={index} position={[Math.cos(angle) * .72, 0, Math.sin(angle) * .72]} rotation={[0, -angle, 0]}>
          <mesh material={body} scale={[reference ? .82 : .72, .09, .1]}><boxGeometry args={[1, 1, 1]} /></mesh>
          {visible.motors && <mesh material={dark} position={[.55, .08, 0]}><cylinderGeometry args={[.14, .14, .12, 16]} /></mesh>}
          {visible.rotors && <mesh material={dark} position={[.55, .16, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.22, .025, 8, 32]} /></mesh>}
        </group>;
      })}
    </>}
    {visible.landing && <group>{[-.42, .42].map(x => <mesh key={x} material={dark} position={[x, -.38, 0]} scale={[.08, .45, .08]}><boxGeometry args={[1, 1, 1]} /></mesh>)}</group>}
    {visible.camera && <mesh material={dark} position={[0, -.28, .18]}><sphereGeometry args={[.18, 20, 12]} /></mesh>}
    {visible.sensors && <mesh material={new THREE.MeshStandardMaterial({ color: "#19d7e8", emissive: "#087680", emissiveIntensity: 1 })} position={[0, .18, .3]}><sphereGeometry args={[reference ? .14 : .08, 16, 8]} /></mesh>}
    {reference && <mesh position={[0, .38, .02]}><sphereGeometry args={[.16, 20, 12]} /><meshStandardMaterial color="#19d7e8" emissive="#087680" emissiveIntensity={1.4} metalness={.35} roughness={.2} /></mesh>}
    {reference && <mesh position={[0, .12, .38]}><boxGeometry args={[.28, .16, .18]} /><meshStandardMaterial color="#e66b27" metalness={.25} roughness={.34} /></mesh>}
  </group>;
}

export default function StrataStudio({ embedded = false, config, setConfig, activeProfile, onSelectProfile }: StrataStudioProps) {
  const [color, setColor] = useState(config?.physicalAppearance?.color ?? colors[0].hex);
  const [material, setMaterial] = useState(config?.physicalAppearance?.material ?? config?.materialFamily ?? materials[0]);
  const [customName, setCustomName] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [visible, setVisible] = useState(config?.physicalAppearance?.visible ?? { arms: true, motors: true, rotors: true, landing: true, camera: true, sensors: true });
  const [technical, setTechnical] = useState(config?.physicalAppearance?.technical ?? false);
  const [auto, setAuto] = useState(false);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<string[]>(() => JSON.parse(localStorage.getItem("strata-variants") || "[]"));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [brightness, setBrightness] = useState(108);
  const [contrast, setContrast] = useState(112);
  const [saturation, setSaturation] = useState(112);
  const [showGrid, setShowGrid] = useState(true);
  const [drag, setDrag] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const resolvedProfile = activeProfile ?? (config?.platformProfile ? droneCatalog.find(item => item.id === config.platformProfile) : undefined) ?? (config?.airframe ? droneCatalog.find(item => item.key === config.airframe) : undefined);
  const referenceProfiles = useMemo(() => [droneCatalog.find(item => item.id === "aeromind-reference-multirotor-001"), ...droneCatalog.filter(item => item.id !== "aeromind-reference-multirotor-001").slice(0, 7)].filter((profile): profile is DroneCatalogDesign => Boolean(profile)), []);
  const referenceIndex = referenceProfiles.findIndex(profile => profile.id === resolvedProfile?.id);
  const referenceImage = referenceIndex >= 0 ? referenceIndex === 0 ? "/assets/strata-reference/hero-strata-02.webp" : `/assets/strata-reference/drone-${referenceIndex + 1}.webp` : null;
  const selected = useMemo(() => resolvedProfile ? profileToDrone(resolvedProfile, config) : emptyDrone(config), [resolvedProfile, config]);
  const activeName = customMode && customName.trim() ? customName.trim() : selected.name;
  const visibleName = referenceIndex >= 0 ? referenceCardLabels[referenceIndex] : activeName;
  const visualConfig = { schema: "aeromind-physical-studio-v2", projectConfig: config ?? null, selectedProfileId: resolvedProfile?.id ?? null, model: selected, appearance: { color, material }, visible, technical, updatedAt: new Date().toISOString() };

  useEffect(() => {
    const probe = document.createElement("canvas");
    let context: RenderingContext | null = null;
    try { context = probe.getContext("webgl2") || probe.getContext("webgl") || probe.getContext("experimental-webgl"); } catch { context = null; }
    setWebglAvailable(Boolean(context));
  }, []);
  useEffect(() => {
    if (config?.materialFamily && materials.includes(config.materialFamily)) setMaterial(config.materialFamily);
  }, [config?.materialFamily]);

  const persistAppearance = (next: Partial<NonNullable<ConceptConfig["physicalAppearance"]>>) => {
    setConfig?.(current => ({ ...current, physicalAppearance: { color, material, technical, visible, ...current.physicalAppearance, ...next } }));
  };
  const updateMaterial = (next: string) => {
    setMaterial(next);
    setConfig?.(current => ({ ...current, materialFamily: next, physicalAppearance: { color, material: next, technical, visible } }));
  };
  const toggle = (key: keyof typeof visible) => setVisible(current => { const next = { ...current, [key]: !current[key] }; persistAppearance({ visible: next }); return next; });
  const chooseColor = (next: string) => { setColor(next); persistAppearance({ color: next }); };
  const reset = () => { const nextVisible = { arms: true, motors: true, rotors: true, landing: true, camera: true, sensors: true }; setColor(colors[0].hex); setMaterial(materials[0]); setVisible(nextVisible); setTechnical(false); setAuto(false); persistAppearance({ color: colors[0].hex, material: materials[0], visible: nextVisible, technical: false }); };
  const save = () => { const next = [...saved, `${activeName} · ${new Date().toLocaleString("fr-FR")}`]; setSaved(next); localStorage.setItem("strata-variants", JSON.stringify(next)); };
  const resetStudio = () => { setZoom(1); setPan({ x: 0, y: 0 }); setBrightness(108); setContrast(112); setSaturation(112); setShowGrid(true); };
  const imageFilter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
  const imageTransform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return <section className={`strata-app ${embedded ? "strata-embedded" : ""}`} aria-label="Construction physique du drone actif">
    <header className="strata-top"><div className="strata-brand"><span>AEROMIND / STUDIO DE CONCEPTION</span><strong>{visibleName}</strong></div><div><b>CONSTRUCTION PHYSIQUE</b><small>JUMEAU VISUEL · DONNÉES INDICATIVES · REVUE HUMAINE REQUISE</small></div><span className="strata-status"><i /> {resolvedProfile ? "CONFIGURATION SYNCHRONISÉE" : "SÉLECTION REQUISE"}</span></header>
    <main className="strata-layout strata-reference-layout">
      <aside className="strata-library"><div className="strata-heading"><span>01 / BIBLIOTHÈQUE DRONES</span><span className="strata-heading-meta">CATALOGUE / 08</span><span className="orange-dot" /></div><p className="strata-library-note">Modèles reproduits depuis l’image de référence</p><div className="strata-library-grid">{referenceProfiles.map((profile, index) => <button type="button" key={profile.id} className={`strata-library-card ${resolvedProfile?.id === profile.id ? "active" : ""}`} onClick={() => onSelectProfile?.(profile)}><span className="strata-card-index">0{index + 1}</span><span className="strata-mini-drone"><img src={`/assets/strata-reference/drone-${index + 1}.webp`} alt="" /></span><strong>{referenceCardLabels[index]}</strong><small>{referenceCardMeta[index]}</small></button>)}</div><button type="button" className="strata-create-drone" onClick={() => setCustomMode(true)}>＋ Créer mon drone</button></aside>
      <section className="strata-view"><div className="strata-viewbar"><span className="strata-viewbar-title"><b>01</b> / JUMEAU NUMÉRIQUE · {visibleName}</span><span className="strata-live"><i /> RENDU DE RÉFÉRENCE <em>· PIXEL SOURCE</em></span></div><div className="strata-editor-toolbar"><div className="strata-editor-toolgroup"><span className="strata-editor-kicker"><Move3d size={12} /> STUDIO VISUEL</span><button type="button" title="Réduire le zoom" onClick={() => setZoom(value => Math.max(.5, Number((value - .1).toFixed(1))))}><ZoomOut size={14} /></button><strong>{Math.round(zoom * 100)}%</strong><button type="button" title="Augmenter le zoom" onClick={() => setZoom(value => Math.min(2.5, Number((value + .1).toFixed(1))))}><ZoomIn size={14} /></button><button type="button" className={showGrid ? "active" : ""} title="Afficher la grille" onClick={() => setShowGrid(value => !value)}><Grid3X3 size={14} /></button><button type="button" title="Réinitialiser la vue" onClick={resetStudio}><RotateCcw size={14} /></button></div><div className="strata-editor-sliders"><label title="Luminosité"><Sun size={13} /><input type="range" min="75" max="140" value={brightness} onChange={event => setBrightness(Number(event.target.value))} /></label><label title="Contraste"><Contrast size={13} /><input type="range" min="75" max="150" value={contrast} onChange={event => setContrast(Number(event.target.value))} /></label><label title="Saturation"><span className="strata-slider-label">SAT</span><input type="range" min="0" max="160" value={saturation} onChange={event => setSaturation(Number(event.target.value))} /></label></div><button type="button" className="strata-editor-fullscreen" title="Mode studio plein écran" onClick={() => stageRef.current?.requestFullscreen?.()}><Expand size={14} /> <span>PLEIN ÉCRAN</span></button></div><div ref={stageRef} className={`strata-canvas ${showGrid ? "has-grid" : ""}`} onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); setDrag({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }); }} onPointerMove={event => { if (!drag) return; setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y }); }} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>{referenceImage ? <img className="strata-reference-hero" style={{ filter: imageFilter, transform: imageTransform }} src={referenceImage} alt={`Modèle ${visibleName} extrait de l’image de référence`} /> : webglAvailable === false ? <Fallback drone={selected} color={color} technical={technical} customSketch={config?.customSketch} /> : <Canvas fallback={<Fallback drone={selected} color={color} technical={technical} customSketch={config?.customSketch} />} gl={{ preserveDrawingBuffer: true }}><PerspectiveCamera makeDefault position={[3.4, 2.5, 4.2]} /><color attach="background" args={["#07131d"]} /><ambientLight intensity={1.2} /><directionalLight position={[3, 5, 4]} intensity={3} color="#b9f8ff" /><pointLight position={[-3, 1, 2]} intensity={12} color="#1acde5" /><Grid args={[20, 20]} cellSize={.25} cellThickness={.35} cellColor="#174454" sectionSize={1} sectionThickness={.8} sectionColor="#21768a" fadeDistance={12} infiniteGrid /><Vehicle drone={selected} color={color} material={material} visible={visible} technical={technical} customSketch={config?.customSketch} /><OrbitControls autoRotate={auto} autoRotateSpeed={1.2} enableDamping /></Canvas>}<div className="strata-overlay"><b>{visibleName}</b><span>{config?.customSketch?.strokes?.length ? "Conception issue de Dessiner · géométrie synchronisée" : selected.mission}</span><small>RÉFÉRENCE VISUELLE · CONFIGURATION PROJET ACTIVE</small></div></div><div className="strata-actions"><button type="button" onClick={() => setAuto(current => !current)} className={auto ? "active" : ""}><RotateCw size={14} /> {auto ? "Arrêter rotation" : "Rotation auto"}</button><button type="button" onClick={reset}><RotateCcw size={14} /> Réinitialiser</button><button type="button" onClick={save}><Save size={14} /> Enregistrer variante</button><button type="button" onClick={() => download(`${selected.id}.json`, JSON.stringify(visualConfig, null, 2))}><Download size={14} /> JSON</button><CaptureButton onCapture={canvas => { const anchor = document.createElement("a"); anchor.href = canvas.toDataURL("image/png"); anchor.download = `${selected.id}.png`; anchor.click(); }} /></div></section>
      <aside className="strata-panel"><div className="strata-heading"><span>02 / CONSTRUCTION SYNCHRONISÉE</span><span className="strata-heading-meta">LIVE LINK / N2</span><span className="orange-dot" /></div><section><h4>DRONE ACTIF DU PROJET</h4><strong>{visibleName}</strong><p>{selected.type} · {selected.family}</p><button type="button" className="strata-inline-action" onClick={() => setCustomMode(current => !current)}>{customMode ? "Revenir au modèle actif" : "Créer un dessin personnalisé"}</button>{customMode && <input className="strata-name-input" value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Nom de votre variante…" aria-label="Nom de la variante" />}</section><section><h4>COULEUR / MATÉRIAU</h4><div className="strata-colors">{colors.map(item => <button type="button" title={item.name} key={item.hex} onClick={() => chooseColor(item.hex)} style={{ background: item.hex }} className={color === item.hex ? "active" : ""} />)}</div><select value={material} onChange={event => updateMaterial(event.target.value)} aria-label="Matériau de construction">{materials.map(item => <option key={item}>{item}</option>)}</select></section><section><h4>COMPOSANTS PHYSIQUES</h4>{Object.entries({ arms: "Bras et supports", motors: "Moteurs", rotors: "Hélices / rotors", landing: "Train d’atterrissage", camera: "Nacelle caméra", sensors: "Capteurs visibles" }).map(([key, label]) => <label className="strata-toggle" key={key}><span>{label}</span><input type="checkbox" checked={visible[key as keyof typeof visible]} onChange={() => toggle(key as keyof typeof visible)} /></label>)}</section><section><h4>PARAMÈTRES DE VISUALISATION</h4><label className="strata-toggle"><span>Vue technique filaire</span><input type="checkbox" checked={technical} onChange={event => { setTechnical(event.target.checked); persistAppearance({ technical: event.target.checked }); }} /></label><p className="strata-note">La vue est illustrative. Les modifications restent dans la configuration partagée du projet et ne constituent pas une validation de fabrication.</p></section><section><h4>FICHE PROJET ACTIVE</h4><dl className="strata-specs"><dt>Architecture</dt><dd>{config?.airframe ?? "—"}</dd><dt>Envergure</dt><dd>{selected.span.toFixed(2)} m</dd><dt>Moteurs</dt><dd>{config?.motorCount ?? selected.rotors}</dd><dt>Masse déclarée</dt><dd>{selected.mass}</dd><dt>État</dt><dd className="orange">{resolvedProfile ? "Synchronisé" : "À sélectionner"}</dd></dl></section><section><h4>VARIANTES LOCALES ({saved.length})</h4>{saved.slice(-3).map(item => <small className="saved-row" key={item}>{item}</small>)}{!saved.length && <p className="strata-note">Aucune variante enregistrée.</p>}</section></aside>
    </main>
  </section>;

  function Fallback({ drone, color, technical, customSketch }: { drone: DisplayDrone; color: string; technical: boolean; customSketch?: ConceptConfig["customSketch"] }) {
    const reference = drone.id === "aeromind-reference-multirotor-001";
    const count = Math.max(1, drone.rotors || 0);
    const hasSketch = Boolean(customSketch?.strokes?.length);
    const sketchView = hasSketch ? <svg className="fallback-sketch-render" viewBox="0 0 1000 560" aria-label="Dessin utilisateur synchronisé">{customSketch!.strokes.filter(stroke => stroke.points.length > 1).map(stroke => <polyline key={stroke.id} points={stroke.points.map(point => `${point.x},${point.y}`).join(" ")} fill={stroke.fill ?? "none"} stroke={stroke.color} strokeWidth={stroke.width} opacity={stroke.opacity ?? 1} />)}</svg> : null;
    const modelView = <div className={`fallback-drone-shape ${drone.wing ? "is-wing" : "is-multirotor"} ${reference ? "is-reference" : ""}`} style={{ borderColor: color, boxShadow: `0 0 28px ${color}55`, filter: technical ? "grayscale(1)" : "none" }}><span className="fallback-body" />{!drone.wing && Array.from({ length: count }, (_, index) => <i key={index} style={{ transform: `rotate(${index * 360 / count}deg) translateY(-86px)` }} />)}<b className="fallback-sensor" />{reference && <em className="fallback-payload" />}</div>;
    return <div className="strata-webgl-fallback"><div className="strata-fallback-grid">{sketchView ?? modelView}</div><div className="strata-fallback-copy"><strong>{hasSketch ? "DESSIN SYNCHRONISÉ · SOURCE DESSINER" : `${drone.name.toUpperCase()} · MODÈLE ACTIF`}</strong><span>Visualisation technique sans WebGL — géométrie du modèle sélectionné conservée.</span><small>{hasSketch ? `${customSketch!.strokes.length} composant(s) graphique(s) chargés depuis le projet.` : `${drone.rotors || 0} rotor(s) · ${drone.type} · sélection réelle du catalogue.`}</small></div></div>;
  }
}
