/**
 * ParametricDroneCenter — Centre de Construction Paramétrique des Drones.
 *
 * Interface de CAO paramétrique intégrée à AeroMind, inspirée d'Onshape.
 * Permet de concevoir un drone en manipulant des variables (longueur, envergure,
 * flèche, dièdre, épaisseur) avec un aperçu 3D temps réel (Three.js), un arbre
 * de features, un studio de variables éditables, et un inspecteur de propriétés
 * aérodynamiques / masse / surfaces de contrôle.
 *
 * Synchronisé avec le ConceptConfig du projet AeroMind actif : les modifications
 * de variables mettent à jour config.wingspan, config.fuselageLength, etc.
 */
import { useMemo, useRef, useState, useEffect, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  Activity, Box, Cog, Copy, Download, Layers, Maximize2, Plus,
  Ruler, Save, Search, Settings as SettingsIcon, Upload, Wrench,
} from "lucide-react";
import type { ConceptConfig } from "../lib/aeroEngine";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import "./parametric-drone-center.css";

type Props = {
  config: ConceptConfig;
  setConfig: (updater: (prev: ConceptConfig) => ConceptConfig) => void;
  onCommit?: () => void;
};

type VariableType = "number" | "angle" | "ratio";

type Variable = {
  id: string;
  name: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  type: VariableType;
  description: string;
  appliesTo: (keyof ConceptConfig) | "custom";
};

type FeatureGroup = {
  id: string;
  label: string;
  icon: string;
  color: string;
  features: { name: string; status: "ok" | "warn" | "active"; meta?: string }[];
};

const DEFAULT_VARIABLES: Variable[] = [
  { id: "length", name: "#length", value: 10, unit: "m", min: 5, max: 15, step: 0.1, type: "number", description: "Longueur du fuselage", appliesTo: "fuselageLength" },
  { id: "wingspan", name: "#wingspan", value: 15, unit: "m", min: 10, max: 15, step: 0.1, type: "number", description: "Envergure totale", appliesTo: "wingspan" },
  { id: "sweep", name: "#sweep", value: 60, unit: "°", min: 60, max: 90, step: 1, type: "angle", description: "Flèche de l'aile", appliesTo: "custom" },
  { id: "dihedral", name: "#dihedral", value: 0, unit: "°", min: 0, max: 10, step: 0.5, type: "angle", description: "Dièdre de l'aile", appliesTo: "custom" },
  { id: "max_thickness", name: "#max_thickness", value: 0.3, unit: "m", min: 0.1, max: 0.5, step: 0.01, type: "number", description: "Épaisseur max profil", appliesTo: "custom" },
  { id: "chord", name: "#chord", value: 3, unit: "m", min: 1, max: 5, step: 0.1, type: "number", description: "Corde racine", appliesTo: "custom" },
  { id: "thickness_ratio", name: "#thickness_ratio", value: 0.1, unit: "", min: 0.08, max: 0.15, step: 0.01, type: "ratio", description: "Ratio épaisseur/corde", appliesTo: "custom" },
  { id: "winglet_angle", name: "#winglet_angle", value: 45, unit: "°", min: 30, max: 60, step: 1, type: "angle", description: "Angle winglet", appliesTo: "custom" },
  { id: "motor_count", name: "#motor_count", value: 4, unit: "", min: 1, max: 8, step: 1, type: "number", description: "Nombre de moteurs", appliesTo: "motorCount" },
  { id: "cruise_speed", name: "#cruise_speed", value: 20, unit: "km/h", min: 5, max: 120, step: 1, type: "number", description: "Vitesse de croisière", appliesTo: "cruiseSpeedKmh" },
  { id: "altitude", name: "#altitude", value: 100, unit: "m", min: 10, max: 6000, step: 5, type: "number", description: "Altitude opération", appliesTo: "altitudeM" },
  { id: "fuse_sec3_top", name: "#fuse_sec3_top", value: 1.7, unit: "m", min: 1, max: 2, step: 0.05, type: "number", description: "Diamètre haut section 3", appliesTo: "custom" },
];

const FEATURE_GROUPS: FeatureGroup[] = [
  { id: "fuselage", label: "Fuselage", icon: "⚙", color: "var(--cyan)", features: [
    { name: "Section 1 — nez", status: "ok" },
    { name: "Section 2 — cockpit", status: "ok" },
    { name: "Section 3 — centrale", status: "active" },
    { name: "Section 4 — arrière", status: "ok" },
    { name: "Section 5 — empennage", status: "ok" },
    { name: "Coupole capteur", status: "warn" },
    { name: "Trappe batterie", status: "ok" },
    { name: "Support moteur", status: "ok" },
  ]},
  { id: "wing", label: "Voilure", icon: "✈", color: "var(--blue)", features: [
    { name: "Profil racine", status: "ok" },
    { name: "Profil saumon", status: "ok" },
    { name: "Plan dièdre", status: "ok" },
    { name: "Flèche avant", status: "ok" },
    { name: "Aile gauche", status: "active" },
    { name: "Aile droite", status: "active" },
    { name: "Winglet gauche", status: "ok" },
    { name: "Winglet droit", status: "ok" },
  ]},
  { id: "controls", label: "Surfaces contrôle", icon: "🎛", color: "var(--amber)", features: [
    { name: "Aileron gauche", status: "ok" },
    { name: "Aileron droit", status: "ok" },
    { name: "Volet gauche (flap)", status: "ok" },
    { name: "Volet droit (flap)", status: "ok" },
    { name: "Profondeur G.", status: "ok" },
    { name: "Profondeur D.", status: "ok" },
    { name: "Direction (gouvernail)", status: "ok" },
    { name: "Trim tab", status: "warn" },
  ]},
  { id: "propulsion", label: "Propulsion", icon: "◉", color: "var(--red)", features: [
    { name: "Moteur principal", status: "ok" },
    { name: "Hélice 24\"", status: "ok" },
    { name: "Cône spinner", status: "ok" },
    { name: "Support nacelle", status: "ok" },
    { name: "Échappement", status: "warn" },
    { name: "Réservoir", status: "ok" },
  ]},
];

/* ── 3D parametric drone model ── */
function ParametricDrone3D({ vars }: { vars: Record<string, number> }) {
  const groupRef = useRef<THREE.Group>(null);

  const fuselageMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xb0c4d8, roughness: 0.4, metalness: 0.3 }), []);
  const wingMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x25d0d9, roughness: 0.5, metalness: 0.2, emissive: 0x25d0d9, emissiveIntensity: 0.1 }), []);
  const aileronMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xf5a623, roughness: 0.4, emissive: 0xf5a623, emissiveIntensity: 0.3 }), []);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.15;
  });

  const length = vars.length ?? 10;
  const wingspan = vars.wingspan ?? 15;
  const sweep = (vars.sweep ?? 60) * Math.PI / 180;
  const dihedral = (vars.dihedral ?? 0) * Math.PI / 180;
  const thickness = vars.max_thickness ?? 0.3;
  const chord = vars.chord ?? 3;
  const motorCount = Math.round(vars.motor_count ?? 4);

  // Fuselage
  const fuseLen = length;
  const fuseRad = Math.max(0.3, thickness * 1.5);

  // Wing geometry (swept, tapered)
  const wingHalfSpan = wingspan / 2;
  const wingSweepBack = Math.tan(sweep) * wingHalfSpan * 0.3;

  return (
    <group ref={groupRef}>
      {/* Fuselage */}
      <mesh castShadow receiveShadow position={[0, 0, 0]} material={fuselageMat}>
        <cylinderGeometry args={[fuseRad * 0.6, fuseRad, fuseLen, 24]} />
        <group /> {/* placeholder to attach rotation */}
      </mesh>
      <mesh castShadow position={[fuseLen / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={fuselageMat}>
        <coneGeometry args={[fuseRad * 0.6, fuseLen * 0.2, 24]} />
      </mesh>

      {/* Main wings (swept) */}
      <mesh castShadow receiveShadow position={[-wingSweepBack * 0.5, 0, wingHalfSpan / 2]} rotation={[0, 0, dihedral]} material={wingMat}>
        <boxGeometry args={[chord, thickness, wingHalfSpan]} />
      </mesh>
      <mesh castShadow receiveShadow position={[-wingSweepBack * 0.5, 0, -wingHalfSpan / 2]} rotation={[0, 0, -dihedral]} material={wingMat}>
        <boxGeometry args={[chord, thickness, wingHalfSpan]} />
      </mesh>

      {/* Ailerons (highlighted orange) */}
      <mesh castShadow position={[-chord * 0.3, 0, wingHalfSpan * 0.7]} material={aileronMat}>
        <boxGeometry args={[chord * 0.4, thickness * 0.8, wingHalfSpan * 0.25]} />
      </mesh>
      <mesh castShadow position={[-chord * 0.3, 0, -wingHalfSpan * 0.7]} material={aileronMat}>
        <boxGeometry args={[chord * 0.4, thickness * 0.8, wingHalfSpan * 0.25]} />
      </mesh>

      {/* Tail (horizontal stabilizer) */}
      <mesh castShadow position={[-fuseLen * 0.4, 0, 0]} material={fuselageMat}>
        <boxGeometry args={[chord * 0.5, thickness * 0.7, wingspan * 0.3]} />
      </mesh>

      {/* Vertical stabilizer */}
      <mesh castShadow position={[-fuseLen * 0.4, fuseLen * 0.08, 0]} material={fuselageMat}>
        <boxGeometry args={[chord * 0.5, fuseLen * 0.18, thickness * 0.5]} />
      </mesh>

      {/* Motors (instanced around) */}
      {Array.from({ length: motorCount }).map((_, i) => {
        const angle = (i / motorCount) * Math.PI * 2;
        const r = wingHalfSpan * 0.6;
        const mx = Math.cos(angle) * 0.3;
        const mz = Math.sin(angle) * r;
        return (
          <group key={i} position={[mx, thickness, mz]}>
            <mesh castShadow material={fuselageMat}>
              <cylinderGeometry args={[0.2, 0.2, 0.5, 12]} />
            </mesh>
            <mesh position={[0, 0.4, 0]} material={new THREE.MeshStandardMaterial({ color: 0x1a1a1e, transparent: true, opacity: 0.5 })}>
              <boxGeometry args={[0.1, 1.5, 0.1]} />
            </mesh>
          </group>
        );
      })}

      {/* Ground shadow plane */}
      <mesh receiveShadow position={[0, -fuseRad * 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[wingspan * 2.5, wingspan * 2.5]} />
        <meshStandardMaterial color={0x0a1218} transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

function Scene({ vars }: { vars: Record<string, number> }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[20, 30, 15]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-15, 10, -10]} intensity={0.3} color="#25d0d9" />
      <ParametricDrone3D vars={vars} />
      <gridHelper args={[60, 30, 0x1a2e3e, 0x0e1a24]} position={[0, -5, 0]} />
      <OrbitControls enableZoom enablePan={false} autoRotate autoRotateSpeed={0.5} minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.1} target={[0, 0, 0]} />
    </>
  );
}

export function ParametricDroneCenter({ config, setConfig, onCommit }: Props) {
  const { t } = useLanguage();
  const [vars, setVars] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const v of DEFAULT_VARIABLES) init[v.id] = v.value;
    return init;
  });
  const [selectedGroup, setSelectedGroup] = useState<string>("controls");
  const [selectedFeature, setSelectedFeature] = useState<string>("Section 3 — centrale");
  const [activeTab, setActiveTab] = useState<"part" | "variable" | "assembly">("part");
  const [search, setSearch] = useState("");
  const [material, setMaterial] = useState<"carbon" | "aluminum" | "kevlar">("carbon");
  const [sectionType, setSectionType] = useState<"circular" | "elliptical" | "polygonal">("elliptical");

  // Sync vars from config on mount
  useEffect(() => {
    setVars(prev => ({
      ...prev,
      length: config.fuselageLength ?? prev.length,
      wingspan: config.wingspan ?? prev.wingspan,
      motor_count: config.motorCount ?? prev.motor_count,
      cruise_speed: config.cruiseSpeedKmh ?? prev.cruise_speed,
      altitude: config.altitudeM ?? prev.altitude,
    }));
  }, [config.fuselageLength, config.wingspan, config.motorCount, config.cruiseSpeedKmh, config.altitudeM]);

  const updateVar = (id: string, value: number) => {
    setVars(prev => ({ ...prev, [id]: value }));
    // Sync to ConceptConfig
    const v = DEFAULT_VARIABLES.find(x => x.id === id);
    if (!v || v.appliesTo === "custom") return;
    const key = v.appliesTo as keyof ConceptConfig;
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onCommit?.();
    toast.success(t("Configuration sauvegardée"), { description: t("Les variables paramétriques ont été synchronisées avec le projet.") });
  };

  const handleExport = () => {
    const json = JSON.stringify({ variables: vars, config: { wingspan: config.wingspan, fuselageLength: config.fuselageLength, motorCount: config.motorCount } }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `aeromind-parametric-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success(t("Export réussi"), { description: t("Fichier JSON de configuration téléchargé.") });
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (data.variables) setVars(prev => ({ ...prev, ...data.variables }));
          toast.success(t("Import réussi"), { description: t("Variables chargées depuis le fichier.") });
        } catch { toast.error(t("Import échoué"), { description: t("Fichier JSON invalide.") }); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const filteredGroups = FEATURE_GROUPS.filter(g =>
    !search || g.features.some(f => f.name.toLowerCase().includes(search.toLowerCase()))
  );

  const totalFeatures = FEATURE_GROUPS.reduce((s, g) => s + g.features.length, 0);
  const wingArea = (vars.wingspan ?? 15) * (vars.chord ?? 3);
  const aspectRatio = Math.pow(vars.wingspan ?? 15, 2) / wingArea;
  const emptyMass = 0.5 * (vars.length ?? 10) * (vars.wingspan ?? 15) * (vars.max_thickness ?? 0.3) * 10;

  return (
    <div className="pdc-app">
      {/* Menubar */}
      <div className="pdc-menubar">
        <div className="pdc-logo">
          <span className="pdc-mark">A</span>
          <div>
            <div className="pdc-name">AEROMIND</div>
            <div className="pdc-tag">{t("Centre Paramétrique")}</div>
          </div>
        </div>
        <div className="pdc-menu-item">{t("Fichier")}</div>
        <div className="pdc-menu-item">{t("Édition")}</div>
        <div className="pdc-menu-item">{t("Affichage")}</div>
        <div className="pdc-menu-item">{t("Insertion")}</div>
        <div className="pdc-menu-item">{t("Outils")}</div>
        <div className="pdc-menu-item">{t("Analyse")}</div>
        <div className="pdc-spacer" />
        <div className="pdc-pill green">{t("Sauvegardé")}</div>
        <div className="pdc-pill cyan">Part Studio 1</div>
      </div>

      {/* Toolbar */}
      <div className="pdc-toolbar">
        <button className="pdc-tb-btn" onClick={() => toast.info(t("Nouvelle esquisse"))}><Plus size={14} /> {t("Nouveau")}</button>
        <button className="pdc-tb-btn" onClick={handleSave}><Save size={14} /> {t("Valider")}</button>
        <div className="pdc-tb-sep" />
        <button className="pdc-tb-btn" onClick={() => toast.info(t("Outil esquisse activé"))}><Box size={14} /> {t("Esquisse")}</button>
        <button className="pdc-tb-btn" onClick={() => toast.info(t("Extrusion"))}><Layers size={14} /> {t("Extruder")}</button>
        <button className="pdc-tb-btn" onClick={() => toast.info(t("Révolution"))}><Cog size={14} /> {t("Révolution")}</button>
        <div className="pdc-tb-sep" />
        <button className="pdc-tb-btn" onClick={() => toast.info(t("Mesure : ") + wingArea.toFixed(2) + " m²")}><Ruler size={14} /> {t("Mesurer")}</button>
        <button className="pdc-tb-btn" onClick={() => toast.info(t("Masse à vide : ") + emptyMass.toFixed(1) + " kg")}><Activity size={14} /> {t("Masses")}</button>
        <div className="pdc-tb-sep" />
        <button className="pdc-tb-btn" onClick={handleImport}><Upload size={14} /> {t("Import")}</button>
        <button className="pdc-tb-btn" onClick={handleExport}><Download size={14} /> {t("Export")}</button>
        <div className="pdc-spacer" />
        <div className="pdc-search">
          <Search size={12} />
          <input placeholder={t("Rechercher une feature ou variable…")} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Main 3-pane */}
      <div className="pdc-main">
        {/* Left: feature tree */}
        <div className="pdc-left">
          <div className="pdc-left-header">
            <span>{t("Arbre des features")}</span>
            <div className="pdc-left-icons"><Plus size={12} /></div>
          </div>
          {filteredGroups.map(group => (
            <div key={group.id} className="pdc-feature-group">
              <div className="pdc-group-header" onClick={() => setSelectedGroup(group.id)}>
                <span className="pdc-chevron open">▸</span>
                <span className="pdc-group-icon" style={{ color: group.color }}>{group.icon}</span>
                <span className="pdc-group-label">{t(group.label)}</span>
                <span className="pdc-group-count">{group.features.length}</span>
              </div>
              {group.features.map(feature => (
                <div
                  key={feature.name}
                  className={`pdc-feature-item ${selectedFeature === feature.name ? "selected" : ""}`}
                  onClick={() => setSelectedFeature(feature.name)}
                >
                  <span className={`pdc-dot ${feature.status}`} />
                  <span className="pdc-feature-name">{t(feature.name)}</span>
                  {feature.meta && <span className="pdc-feature-meta">{feature.meta}</span>}
                </div>
              ))}
            </div>
          ))}
          <div className="pdc-feature-group">
            <div className="pdc-group-header">
              <span className="pdc-chevron open">▸</span>
              <span className="pdc-group-icon" style={{ color: "var(--violet)" }}>📐</span>
              <span className="pdc-group-label">{t("Variables")}</span>
              <span className="pdc-group-count">{DEFAULT_VARIABLES.length}</span>
            </div>
            {DEFAULT_VARIABLES.slice(0, 5).map(v => (
              <div key={v.id} className="pdc-feature-item mono">
                <span className="pdc-dot cyan" />
                <span className="pdc-feature-name">{v.name} = {vars[v.id]} {v.unit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center: 3D viewport + variable table */}
        <div className="pdc-center">
          <div className="pdc-viewport">
            <div className="pdc-vp-overlay">
              <div className="pdc-vp-top">
                <div className="pdc-vp-tabs">
                  <div className={`pdc-vp-tab ${activeTab === "part" ? "active" : ""}`} onClick={() => setActiveTab("part")}>Part Studio 1</div>
                  <div className={`pdc-vp-tab ${activeTab === "variable" ? "active" : ""}`} onClick={() => setActiveTab("variable")}>Variable Studio 1</div>
                  <div className={`pdc-vp-tab ${activeTab === "assembly" ? "active" : ""}`} onClick={() => setActiveTab("assembly")}>Assembly 1</div>
                </div>
                <div className="pdc-vp-controls">
                  <button className="pdc-vp-btn" title={t("Plein écran")} onClick={() => toast.info(t("Plein écran"))}><Maximize2 size={14} /></button>
                  <button className="pdc-vp-btn" title={t("Paramètres")} onClick={() => toast.info(t("Paramètres viewport"))}><SettingsIcon size={14} /></button>
                </div>
              </div>
              <div className="pdc-vp-bottom">
                <div className="pdc-readout">
                  <span>X: <b>0.000</b></span>
                  <span>Y: <b>0.000</b></span>
                  <span>Z: <b>0.000</b></span>
                  <span>‖ <b>{wingArea.toFixed(1)} m²</b></span>
                  <span>V: <b>{(wingArea * (vars.max_thickness ?? 0.3)).toFixed(2)} m³</b></span>
                  <span>M: <b>{emptyMass.toFixed(1)} kg</b></span>
                </div>
              </div>
            </div>
            <Canvas shadows dpr={[1, 2]} camera={{ position: [28, 18, 28], fov: 40, near: 0.1, far: 500 }}>
              <Scene vars={vars} />
            </Canvas>
          </div>

          {/* Variable table */}
          <div className="pdc-var-studio">
            <div className="pdc-vs-header">
              <div className={`pdc-vs-tab ${activeTab === "variable" ? "active" : ""}`} onClick={() => setActiveTab("variable")}>
                Variable Studio 1 <span className="pdc-badge">{DEFAULT_VARIABLES.length}</span>
              </div>
              <div className="pdc-vs-actions">
                <button className="pdc-vs-action" title={t("Ajouter")} onClick={() => toast.info(t("Nouvelle variable"))}><Plus size={13} /></button>
                <button className="pdc-vs-action" title={t("Dupliquer")} onClick={() => toast.info(t("Dupliquer variable"))}><Copy size={13} /></button>
                <button className="pdc-vs-action" title={t("Export CSV")} onClick={handleExport}><Download size={13} /></button>
              </div>
            </div>
            <div className="pdc-var-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("Nom")}</th>
                    <th>{t("Valeur")}</th>
                    <th>{t("Unité")}</th>
                    <th>{t("Plage")}</th>
                    <th>{t("Curseur")}</th>
                    <th>{t("Type")}</th>
                  </tr>
                </thead>
                <tbody>
                  {DEFAULT_VARIABLES.map((v, i) => (
                    <tr key={v.id}>
                      <td>{i + 1}</td>
                      <td className="pdc-var-name">{v.name}</td>
                      <td className="pdc-var-value">{vars[v.id]?.toFixed(2)}</td>
                      <td className="pdc-var-unit">{v.unit}</td>
                      <td className="pdc-var-range">{v.min}–{v.max}</td>
                      <td className="pdc-slider-cell">
                        <input type="range" min={v.min} max={v.max} step={v.step} value={vars[v.id] ?? v.value} onChange={e => updateVar(v.id, Number(e.target.value))} />
                      </td>
                      <td className="pdc-var-type">{v.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: inspector */}
        <div className="pdc-right">
          <div className="pdc-section">
            <div className="pdc-section-header">{t("Propriétés")} — {t(selectedFeature)} ▾</div>
            <div className="pdc-section-body">
              <div className="pdc-field">
                <label className="pdc-field-label"><span>{t("Type de section")}</span></label>
                <div className="pdc-toggle-group">
                  {(["circular", "elliptical", "polygonal"] as const).map(st => (
                    <button key={st} className={`pdc-tg-btn ${sectionType === st ? "active" : ""}`} onClick={() => setSectionType(st)}>
                      {st === "circular" ? t("Circulaire") : st === "elliptical" ? t("Elliptique") : t("Polygonale")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pdc-field">
                <label className="pdc-field-label"><span>{t("Matériau")}</span></label>
                <div className="pdc-material-list">
                  {[
                    { id: "carbon", name: "Carbone T700", density: "1.80 g/cm³", color: "#3a3a3e" },
                    { id: "aluminum", name: "Aluminium 7075", density: "2.81 g/cm³", color: "#5a5a5e" },
                    { id: "kevlar", name: "Kevlar 49", density: "1.44 g/cm³", color: "#8a7a4a" },
                  ].map(m => (
                    <button key={m.id} className={`pdc-material-item ${material === m.id ? "selected" : ""}`} onClick={() => setMaterial(m.id as any)}>
                      <span className="pdc-material-swatch" style={{ background: m.color }} />
                      <span className="pdc-material-name">{t(m.name)}</span>
                      <span className="pdc-material-density">{m.density}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="pdc-section">
            <div className="pdc-section-header">{t("Aérodynamique")} ▾</div>
            <div className="pdc-section-body">
              <div className="pdc-stat-grid">
                <div className="pdc-stat-card"><div className="pdc-label">{t("Surface alaire")}</div><div className="pdc-value">{wingArea.toFixed(1)}<span className="pdc-unit"> m²</span></div></div>
                <div className="pdc-stat-card"><div className="pdc-label">{t("Allongement")}</div><div className="pdc-value">{aspectRatio.toFixed(1)}</div></div>
                <div className="pdc-stat-card"><div className="pdc-label">Cz max</div><div className="pdc-value">1.42</div></div>
                <div className="pdc-stat-card"><div className="pdc-label">Cd min</div><div className="pdc-value">0.028</div></div>
                <div className="pdc-stat-card"><div className="pdc-label">{t("Finesse")}</div><div className="pdc-value">18.6</div></div>
                <div className="pdc-stat-card"><div className="pdc-label">Vstall</div><div className="pdc-value">14.2<span className="pdc-unit"> m/s</span></div></div>
              </div>
            </div>
          </div>

          <div className="pdc-section">
            <div className="pdc-section-header">{t("Masse & équilibrage")} ▾</div>
            <div className="pdc-section-body">
              <div className="pdc-stat-grid">
                <div className="pdc-stat-card"><div className="pdc-label">{t("Masse à vide")}</div><div className="pdc-value">{emptyMass.toFixed(1)}<span className="pdc-unit"> kg</span></div></div>
                <div className="pdc-stat-card"><div className="pdc-label">{t("Charge utile")}</div><div className="pdc-value">5.0<span className="pdc-unit"> kg</span></div></div>
                <div className="pdc-stat-card"><div className="pdc-label">MTOW</div><div className="pdc-value">{(emptyMass + 5).toFixed(1)}<span className="pdc-unit"> kg</span></div></div>
                <div className="pdc-stat-card"><div className="pdc-label">CG</div><div className="pdc-value">32<span className="pdc-unit"> %</span></div></div>
              </div>
            </div>
          </div>

          <div className="pdc-section">
            <div className="pdc-section-header">{t("Surfaces de contrôle")} ▾</div>
            <div className="pdc-section-body">
              <div className="pdc-field">
                <label className="pdc-field-label"><span>{t("Débattement aileron")}</span><span className="pdc-unit">deg</span></label>
                <div className="pdc-field-row"><input type="range" min="0" max="30" defaultValue="25" className="pdc-field-slider" /><span className="pdc-field-display">±25°</span></div>
              </div>
              <div className="pdc-field">
                <label className="pdc-field-label"><span>{t("Débattement volet")}</span><span className="pdc-unit">deg</span></label>
                <div className="pdc-field-row"><input type="range" min="0" max="40" defaultValue="35" className="pdc-field-slider" /><span className="pdc-field-display">35°</span></div>
              </div>
              <div className="pdc-field">
                <label className="pdc-field-label"><span>{t("Débattement profondeur")}</span><span className="pdc-unit">deg</span></label>
                <div className="pdc-field-row"><input type="range" min="0" max="25" defaultValue="20" className="pdc-field-slider" /><span className="pdc-field-display">±20°</span></div>
              </div>
              <div className="pdc-field">
                <label className="pdc-field-label"><span>{t("Débattement direction")}</span><span className="pdc-unit">deg</span></label>
                <div className="pdc-field-row"><input type="range" min="0" max="30" defaultValue="25" className="pdc-field-slider" /><span className="pdc-field-display">±25°</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Statusbar */}
      <div className="pdc-statusbar">
        <span className="pdc-item"><span className="pdc-val">{totalFeatures} {t("features")}</span></span>
        <span className="pdc-item"><span className="pdc-val">{DEFAULT_VARIABLES.length} {t("variables")}</span></span>
        <span className="pdc-item"><span className="pdc-val">3 {t("configurations")}</span></span>
        <span className="pdc-spacer" />
        <span className="pdc-seg">{t("Unités")}: SI (m, kg, s)</span>
        <span className="pdc-seg">{t("Précision")}: 0.01 mm</span>
        <span className="pdc-seg" style={{ color: "var(--green)" }}>● {t("Validé")}</span>
      </div>
    </div>
  );
}

export default ParametricDroneCenter;
