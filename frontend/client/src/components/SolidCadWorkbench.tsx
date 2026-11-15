import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Html, Lightformer, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  cadBounds, cadGdtSymbol, cadModelIsInstalled, cadNumber, cadPmiIsVisible, cadPmiTolerance, cadPointText, createCadFaceGeometry, createCarbonTextures,
  isCadAbort, LatestCadRequest, parsePmiNumbers, preserveCadSource, solidCadApi,
  type CadCapabilities, type CadDocument, type CadFace, type CadMaterial, type CadPart,
  type CadPoint, type CadSelection,
} from "../lib/solidCad";
import "./solid-cad-workbench.css";

type Props = {
  /** Public validation only exposes the fixed kernel fixture; no model ID from a URL. */
  publicDemoOnly?: boolean;
  modelId?: string | null;
  onModelIdChange?: (id: string | null) => void;
  projectLabel?: string;
};
type Status = "idle" | "waiting" | "calculating" | "valid" | "error";
const axes: Record<string, CadPoint> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], "−X": [-1, 0, 0], "−Y": [0, -1, 0], "−Z": [0, 0, -1] };
const views: Record<string, CadPoint> = { ISO: [1.3, -1.7, 1.2], FACE: [0, -2.4, 0], DESSUS: [0, 0, 2.4] };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Erreur du service CAO.";

class CadViewportBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    return this.state.error ? <div className="sc-empty sc-failure" role="alert"><strong>Affichage WebGL indisponible</strong><p>{this.state.error}</p><p>Les données natives restent consultables dans l’inspecteur. Utilisez « Recentrer » pour réessayer.</p></div> : this.props.children;
  }
}

function ContextGuard({ onLost }: { onLost: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);
  return null;
}

function NativeFace({ face, part, material, selected, carbon, onSelect }: {
  face: CadFace; part: CadPart; material?: CadMaterial; selected: boolean;
  carbon: ReturnType<typeof createCarbonTextures>; onSelect: (selection: CadSelection) => void;
}) {
  const geometry = useMemo(() => createCadFaceGeometry(face), [face]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const isCarbon = material?.id === "cfrp";
  const pbr = material?.pbr;
  return <mesh geometry={geometry} userData={{ partId: part.id, faceId: face.id }} onClick={event => {
    event.stopPropagation(); onSelect({ partId: part.id, faceId: face.id });
  }}>
    <meshPhysicalMaterial color={pbr?.color ?? "#89939e"} metalness={pbr?.metalness ?? 0}
      roughness={pbr?.roughness ?? 0.7} anisotropy={pbr ? (pbr.anisotropy ?? (isCarbon ? 0.25 : 0.4)) : 0}
      anisotropyRotation={isCarbon ? Math.PI / 4 : 0} map={isCarbon ? carbon.map : null}
      bumpMap={isCarbon ? carbon.bump : null} bumpScale={isCarbon ? 0.025 : 0}
      clearcoat={isCarbon ? 0.28 : 0} clearcoatRoughness={0.3}
      emissive={selected ? "#bc6f13" : "#000000"} emissiveIntensity={selected ? 0.12 : 0}
      side={THREE.FrontSide} />
  </mesh>;
}

function NativeScene({ document, source, materials, selected, onSelect, annotations, span, center, onLost }: {
  document: CadDocument; source: CadDocument; materials: CadMaterial[]; selected: CadSelection | null;
  onSelect: (selection: CadSelection) => void; annotations: boolean; span: number; center: CadPoint; onLost: () => void;
}) {
  const carbon = useMemo(() => createCarbonTextures(), []);
  useEffect(() => () => { carbon.map.dispose(); carbon.bump.dispose(); }, [carbon]);
  const selectedFace = document.parts.find(part => part.id === selected?.partId)?.faces.find(face => face.id === selected?.faceId);
  const visiblePmi = source.pmi.filter(pmi => cadPmiIsVisible(document, pmi));
  return <>
    <ContextGuard onLost={onLost} />
    <color attach="background" args={["#0a111b"]} />
    {/* Procedural studio: no HDR download, no third-party image, no claimed BRDF calibration. */}
    <Environment resolution={128} frames={1}>
      <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 5, -4]} rotation={[Math.PI / 4, 0, 0]} scale={[8, 4, 1]} />
      <Lightformer form="rect" intensity={2} color="#d8e7ff" position={[-5, 1, 1]} rotation={[0, Math.PI / 2, 0]} scale={[5, 7, 1]} />
      <Lightformer form="rect" intensity={3} color="#fff1de" position={[4, 2, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[4, 6, 1]} />
    </Environment>
    <ambientLight intensity={0.15} />
    <directionalLight position={[center[0] + span, center[1] - span, center[2] + span * 2]} intensity={2} />
    {document.parts.map(part => part.faces.map(face => <NativeFace key={`${part.id}:${face.id}`} face={face} part={part}
      material={materials.find(item => item.id === part.material_id)} carbon={carbon}
      selected={selected?.partId === part.id && selected?.faceId === face.id} onSelect={onSelect} />))}
    {annotations && visiblePmi.map((pmi, index) => {
      // Both points are world CAD coordinates; the HTML projects this actual anchor, never a screen-fixed fake point.
      const end: CadPoint = [pmi.anchor_mm[0] + span * 0.13, pmi.anchor_mm[1], pmi.anchor_mm[2] + span * (0.12 + index % 3 * 0.04)];
      return <group key={pmi.id}>
        <Line points={[pmi.anchor_mm, end]} color="#e6c37b" lineWidth={1} />
        <Html position={end} center zIndexRange={[40, 0]}><div className="sc-pmi-label"><b>{pmi.kind}</b> {pmi.text}
          <small>[ {cadGdtSymbol(pmi)} | {cadPmiTolerance(pmi)}{pmi.datum ? ` | ${pmi.datum}` : ""} ]</small></div></Html>
      </group>;
    })}
    {selectedFace && <Html position={selectedFace.anchor_mm} center zIndexRange={[45, 0]}><div className="sc-face-anchor">{selectedFace.id}<small>{cadPointText(selectedFace.anchor_mm)} mm</small></div></Html>}
    {document.properties.center_of_gravity_mm && <Html position={document.properties.center_of_gravity_mm} center zIndexRange={[30, 0]}><div className="sc-cog" title="Centre de gravité calculé par le noyau">⊕ <span>COG</span></div></Html>}
    <OrbitControls target={center} makeDefault enableDamping={false} autoRotate={false} minDistance={span * 0.05} maxDistance={span * 12} />
  </>;
}

function PhysicalProperties({ title, properties }: { title: string; properties: CadDocument["properties"] }) {
  return <section className="sc-properties"><h4>{title}</h4><dl>
    <div><dt>Volume solide</dt><dd>{cadNumber(properties.volume_mm3)} <small>mm³</small></dd></div>
    <div><dt>Masse</dt><dd>{cadNumber(properties.mass_kg, 6)} {properties.mass_kg !== null && <small>kg</small>}</dd></div>
    <div><dt>COG · X / Y / Z</dt><dd>{cadPointText(properties.center_of_gravity_mm)} <small>mm</small></dd></div>
    {properties.center_of_volume_mm !== undefined && <div><dt>Barycentre volumique · X / Y / Z</dt><dd>{cadPointText(properties.center_of_volume_mm)} <small>mm</small></dd></div>}
  </dl>{properties.mass_kg === null && <p>Masse inconnue : densité non attribuée. Aucun zéro ni estimation substitué.</p>}</section>;
}

export default function SolidCadWorkbench({ publicDemoOnly = false, modelId, onModelIdChange, projectLabel }: Props) {
  const [capabilities, setCapabilities] = useState<CadCapabilities | null>(null);
  const [materials, setMaterials] = useState<CadMaterial[]>([]);
  const [source, setSource] = useState<CadDocument | null>(null);
  const [solid, setSolid] = useState<CadDocument | null>(null);
  const [isDemo, setIsDemo] = useState(publicDemoOnly || !modelId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [selected, setSelected] = useState<CadSelection | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [axis, setAxis] = useState("X");
  const [offset, setOffset] = useState(0);
  const [sectionStatus, setSectionStatus] = useState<Status>("idle");
  const [sectionError, setSectionError] = useState("");
  const [annotations, setAnnotations] = useState(true);
  const [view, setView] = useState("ISO");
  const [viewRevision, setViewRevision] = useState(0);
  const [webglLost, setWebglLost] = useState(false);
  const [kind, setKind] = useState("position");
  const [nominal, setNominal] = useState("");
  const [tolerance, setTolerance] = useState("10");
  const [datum, setDatum] = useState("");
  const [pmiText, setPmiText] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);
  const loadRequests = useRef(new LatestCadRequest());
  const sectionRequests = useRef(new LatestCadRequest());
  const mutationRequests = useRef(new LatestCadRequest());
  const sourceRef = useRef<CadDocument | null>(null);
  const callbackRef = useRef(onModelIdChange);
  callbackRef.current = onModelIdChange;
  const installedModelId = useRef<string | null>(null);

  const install = (doc: CadDocument, demo: boolean) => {
    sectionRequests.current.cancel(); mutationRequests.current.cancel();
    sourceRef.current = doc; installedModelId.current = demo ? null : doc.model_id;
    setSource(doc); setSolid(doc); setIsDemo(demo); setSelected(null);
    setSelectedPartId(doc.parts[0]?.id ?? null); setSectionEnabled(false); setSectionStatus("idle"); setSectionError("");
    setMutationBusy(false); setAxis("X"); setOffset(cadBounds(doc)?.center[0] ?? 0);
    setWebglLost(false); setViewRevision(value => value + 1); setError("");
  };

  useEffect(() => {
    const controller = new AbortController();
    solidCadApi.capabilities(controller.signal).then(setCapabilities).catch(error => { if (!isCadAbort(error)) setError(errorText(error)); });
    solidCadApi.materials(controller.signal).then(setMaterials).catch(error => { if (!isCadAbort(error)) setCatalogError(errorText(error)); });
    return () => { controller.abort(); loadRequests.current.cancel(); sectionRequests.current.cancel(); mutationRequests.current.cancel(); };
  }, []);

  // Only a project-provided model ID can fetch private imports. The public route ignores it entirely.
  useEffect(() => {
    if (publicDemoOnly || cadModelIsInstalled(sourceRef.current, installedModelId.current, modelId ?? null)) return;
    const ticket = loadRequests.current.start();
    sectionRequests.current.cancel(); mutationRequests.current.cancel();
    installedModelId.current = null;
    sourceRef.current = null; setSource(null); setSolid(null); setSelected(null); setSelectedPartId(null);
    setSectionEnabled(false); setSectionStatus("idle"); setSectionError(""); setMutationBusy(false); setError("");
    if (!modelId) { installedModelId.current = null; setBusy(false); setIsDemo(true); return; }
    setBusy(true); setIsDemo(false);
    solidCadApi.model(modelId, ticket.signal).then(doc => { if (ticket.isCurrent()) install(doc, false); })
      .catch(error => { if (ticket.isCurrent() && !isCadAbort(error)) setError(errorText(error)); })
      .finally(() => { if (ticket.isCurrent()) setBusy(false); });
    return () => loadRequests.current.cancel();
  }, [modelId, publicDemoOnly]);

  useEffect(() => {
    const ticket = sectionRequests.current.start();
    if (!source || !sectionEnabled) {
      setSolid(source); setSectionStatus("idle"); setSectionError("");
      return () => sectionRequests.current.cancel();
    }
    setSectionStatus("waiting"); setSectionError("");
    // Retain the last real B-Rep while the new Boolean is pending; never render a clipped shell.
    const timer = window.setTimeout(() => {
      if (!ticket.isCurrent()) return;
      setSectionStatus("calculating");
      solidCadApi.section(source.model_id, isDemo, { normal: axes[axis], offset_mm: offset }, ticket.signal)
        .then(doc => {
          if (!ticket.isCurrent() || sourceRef.current !== source) return;
          setSolid(preserveCadSource(source, doc)); setSectionStatus("valid");
        }).catch(error => {
          if (ticket.isCurrent() && !isCadAbort(error)) { setSectionError(errorText(error)); setSectionStatus("error"); }
        });
    }, 320);
    return () => { window.clearTimeout(timer); sectionRequests.current.cancel(); };
  }, [source, sectionEnabled, axis, offset, isDemo]);

  const loadDemo = async () => {
    const ticket = loadRequests.current.start();
    clearSection(); mutationRequests.current.cancel(); setBusy(true); setError("");
    try {
      const doc = await solidCadApi.demo(ticket.signal);
      if (ticket.isCurrent()) { install(doc, true); callbackRef.current?.(null); }
    } catch (error) { if (ticket.isCurrent() && !isCadAbort(error)) setError(errorText(error)); }
    finally { if (ticket.isCurrent()) setBusy(false); }
  };
  const importFile = async (file?: File) => {
    if (!file || publicDemoOnly) return;
    const ticket = loadRequests.current.start();
    clearSection(); mutationRequests.current.cancel(); setBusy(true); setError("");
    try {
      const doc = await solidCadApi.import(file, ticket.signal);
      if (ticket.isCurrent()) { install(doc, false); callbackRef.current?.(doc.model_id); }
    } catch (error) { if (ticket.isCurrent() && !isCadAbort(error)) setError(errorText(error)); }
    finally { if (ticket.isCurrent()) setBusy(false); }
  };

  const mutate = async (operation: (doc: CadDocument, signal: AbortSignal) => Promise<CadDocument>) => {
    const original = sourceRef.current;
    if (!original || isDemo || publicDemoOnly) return;
    const ticket = mutationRequests.current.start();
    clearSection(); setMutationBusy(true); setError("");
    try {
      const next = await operation(original, ticket.signal);
      if (ticket.isCurrent() && sourceRef.current === original) {
        if (next.model_id !== original.model_id || next.source.sha256 !== original.source.sha256) throw new Error("Réponse de modification rattachée à une autre source.");
        sourceRef.current = next; setSource(next); setSolid(next);
      }
    } catch (error) { if (ticket.isCurrent() && !isCadAbort(error)) setError(errorText(error)); }
    finally { if (ticket.isCurrent()) setMutationBusy(false); }
  };

  const bounds = useMemo(() => source ? cadBounds(source) : null, [source]);
  const currentPart = solid?.parts.find(part => part.id === (selected?.partId ?? selectedPartId));
  const originalPart = source?.parts.find(part => part.id === currentPart?.id);
  const currentFace = currentPart?.faces.find(face => face.id === selected?.faceId);
  const sourceFace = originalPart?.faces.find(face => face.id === selected?.faceId);
  const material = materials.find(item => item.id === originalPart?.material_id);
  const normal = axes[axis];
  const axisIndex = normal.findIndex(value => value !== 0);
  const offsetMin = bounds ? Math.min(bounds.min[axisIndex] * normal[axisIndex], bounds.max[axisIndex] * normal[axisIndex]) : -1;
  const offsetMax = bounds ? Math.max(bounds.min[axisIndex] * normal[axisIndex], bounds.max[axisIndex] * normal[axisIndex]) : 1;
  const unavailable = capabilities?.available === false || capabilities?.kernel_available === false || capabilities?.solid_brep === false;
  const pending = sectionStatus === "waiting" || sectionStatus === "calculating";
  const hasFaces = !!solid?.parts.some(part => part.faces.length > 0);
  const selectFace = (selection: CadSelection) => { setSelected(selection); setSelectedPartId(selection.partId); };
  const sourceLabel = source?.source;
  const visiblePmiIds = new Set(source?.pmi.filter(pmi => solid && cadPmiIsVisible(solid, pmi)).map(pmi => pmi.id) ?? []);
  const selectAxis = (value: string) => {
    if (value === axis) return;
    sectionRequests.current.cancel(); setAxis(value);
    const n = axes[value], i = n.findIndex(component => component !== 0);
    setOffset((bounds?.center[i] ?? 0) * n[i]);
  };
  const clearSection = () => { sectionRequests.current.cancel(); setSectionEnabled(false); setSolid(sourceRef.current); setSectionStatus("idle"); setSectionError(""); };
  const changeOffset = (value: number) => {
    if (!Number.isFinite(value) || value === offset) return;
    sectionRequests.current.cancel(); setOffset(value);
  };
  const mutationDisabled = isDemo || publicDemoOnly || mutationBusy || busy;

  return <section className="solid-cad" aria-label="Atelier CAO volumique et définition MBD">
    <header className="sc-header"><div><p className="sc-eyebrow">AEROMIND / ENGINEERING · CAD–01</p><h2>CAO volumique <span>/ MBD</span></h2>
      <p>{publicDemoOnly ? "Validation publique · assemblage fixe, calculé par le noyau" : `${projectLabel ?? "Projet actif"} · source B-Rep, propriétés physiques et PMI`}</p></div>
      <span className={`sc-kernel ${unavailable ? "is-unavailable" : ""}`}>{unavailable ? "NOYAU INDISPONIBLE" : source ? "B-REP NATIF" : "EN ATTENTE DU NOYAU"}<small>mm · kg · µm</small></span>
    </header>
    <div className="sc-toolbar">
      <button className="sc-primary" onClick={loadDemo} disabled={busy || mutationBusy || unavailable}>{busy ? "Chargement du solide…" : "Charger la démo du noyau"}</button>
      {!publicDemoOnly && <label className={`sc-upload ${busy || mutationBusy || unavailable ? "is-disabled" : ""}`}>Importer STEP / BREP<input type="file" accept=".step,.stp,.brep" disabled={busy || mutationBusy || unavailable} aria-label="Importer un fichier STEP ou BREP authentifié" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void importFile(file); }} /></label>}
      <a href={solidCadApi.demoStepUrl} download>STEP AP242 de la démo ↗</a>
      <span className="sc-scope">{isDemo ? "DÉMO · PMI EN LECTURE SEULE" : "IMPORT PRIVÉ · SESSION AUTHENTIFIÉE"}</span>
    </div>
    {error && <div className="sc-alert" role="alert">{error}</div>}
    {unavailable && <div className="sc-alert" role="status"><strong>Le noyau B-Rep n’est pas disponible.</strong> {capabilities?.reason ?? capabilities?.message ?? "Vérifiez l’installation du service CAO."} Aucun maillage fictif ou coque découpée ne sera affiché.</div>}
    {catalogError && <div className="sc-alert sc-warning" role="status">Catalogue de matériaux indisponible : {catalogError} Rendu neutre, sans prétendre appliquer un matériau calibré.</div>}
    <div className="sc-workspace">
      <aside className="sc-panel sc-tree"><div className="sc-panel-title"><h3>Assemblage natif</h3><span>{source?.parts.length ?? 0} pièces</span></div>
        {source ? <><p className="sc-model-name">{source.name}</p><ul aria-label="Arbre de l’assemblage">{source.assembly.map(node => {
          const visited = new Set([node.id]); let parent = node.parent_id; let depth = 0;
          while (parent && depth < 12 && !visited.has(parent)) { visited.add(parent); depth++; parent = source.assembly.find(item => item.id === parent)?.parent_id ?? null; }
          return <li key={node.id} style={{ paddingLeft: depth * 12 }}><button disabled={!node.part_id} aria-pressed={!!node.part_id && selectedPartId === node.part_id} onClick={() => { setSelectedPartId(node.part_id ?? null); setSelected(null); }}><span>{node.part_id ? "◇" : "▸"}</span>{node.name}</button></li>;
        })}{source.parts.filter(part => !source.assembly.some(node => node.part_id === part.id)).map(part => <li key={part.id}><button aria-pressed={selectedPartId === part.id} onClick={() => { setSelectedPartId(part.id); setSelected(null); }}>◇ {part.name}</button></li>)}</ul>
          <p className="sc-footnote">Coordonnées monde du noyau. Transformations d’assemblage non réappliquées.</p>
          <PhysicalProperties title="Source entière" properties={source.properties} />
          {solid?.section && <PhysicalProperties title="Solide conservé après coupe" properties={solid.properties} />}
        </> : <div className="sc-empty"><strong>Aucune source chargée</strong><p>Chargez la démo native ou importez votre solide avec une session autorisée.</p></div>}
      </aside>
      <div className="sc-view-column">
        <div className="sc-viewport-toolbar"><span>{solid?.section ? "COUPE BOOLÉENNE VOLUMIQUE" : "SOLIDE SOURCE"}</span><div>{Object.keys(views).map(name => <button key={name} aria-pressed={view === name} onClick={() => { setView(name); setViewRevision(value => value + 1); }}>{name}</button>)}<button onClick={() => { setWebglLost(false); setViewRevision(value => value + 1); }}>Recentrer</button></div></div>
        <div className="sc-viewport" aria-label="Vue du solide natif : sélectionner une face au pointeur ou avec l’inspecteur clavier">
          {source && solid && bounds && hasFaces && !webglLost ? <CadViewportBoundary key={`${source.model_id}:${viewRevision}`}><Suspense fallback={<div className="sc-empty" role="status">Initialisation du rendu…</div>}>
            <Canvas frameloop="demand" fallback={<div className="sc-empty sc-failure" role="alert">WebGL 2 indisponible. Propriétés natives accessibles dans l’inspecteur.</div>}
              camera={{ position: bounds.center.map((value, i) => value + views[view][i] * bounds.span) as CadPoint, near: bounds.span / 1000, far: bounds.span * 100, fov: 38, up: [0, 0, 1] }}
              gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }} onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1; }}>
              <NativeScene document={solid} source={source} materials={materials} selected={selected} onSelect={selectFace} annotations={annotations} span={bounds.span} center={bounds.center} onLost={() => setWebglLost(true)} />
            </Canvas>
          </Suspense></CadViewportBoundary> : <div className="sc-empty" role={webglLost ? "alert" : "status"}><span className="sc-empty-mark" aria-hidden="true">⊞</span><strong>{webglLost ? "Contexte WebGL perdu" : source && !hasFaces ? "Aucun volume conservé dans cette coupe" : "Une source réelle, ou rien."}</strong><p>{webglLost ? "Utilisez Recentrer pour recréer le contexte. Aucune donnée native n’a été remplacée." : source && !hasFaces ? "Toutes les pièces ont été exclues par le plan. Déplacez le plan ou rétablissez la source entière." : "La géométrie s’affiche uniquement après une réponse valide du noyau B-Rep."}</p></div>}
          {pending && <div className="sc-calculation" role="status">{sectionStatus === "waiting" ? "Plan modifié · calcul temporisé" : "Calcul booléen serveur…"}<small>Dernier solide réel conservé — résultat demandé non encore validé</small></div>}
          {busy && source && <div className="sc-calculation" role="status">Chargement…<small>Dernière source valide conservée</small></div>}
          <div className="sc-viewport-caption">PBR nominal · lumière linéaire / ACES / sRGB · aucune calibration BRDF mesurée</div>
        </div>
        <div className="sc-view-options"><label><input type="checkbox" checked={annotations} onChange={event => setAnnotations(event.target.checked)} /> PMI ancrées aux faces</label><p>Rotation : glisser · zoom : molette · vues et faces accessibles au clavier · aucun mouvement automatique</p></div>
        <section className="sc-panel sc-section-controls"><div className="sc-panel-title"><h3>Coupe pleine matière</h3><label><input type="checkbox" checked={sectionEnabled} disabled={!source || busy || mutationBusy || unavailable} onChange={event => { sectionRequests.current.cancel(); event.target.checked ? setSectionEnabled(true) : clearSection(); }} /> Activer le plan</label></div>
          <div className="sc-cut-grid"><label>Normale<select value={axis} disabled={!source || busy || mutationBusy} onChange={event => selectAxis(event.target.value)}>{Object.keys(axes).map(name => <option key={name}>{name}</option>)}</select></label>
            <label>Offset signé (mm)<input type="number" step="0.01" min={offsetMin - 1} max={offsetMax + 1} value={offset} disabled={!source || busy || mutationBusy} onChange={event => changeOffset(event.target.valueAsNumber)} /></label>
            <label className="sc-slider">Position du plan<input type="range" aria-label="Position du plan de coupe en millimètres" min={offsetMin - 0.01} max={offsetMax + 0.01} step="0.01" value={Math.max(offsetMin - 0.01, Math.min(offsetMax + 0.01, offset))} disabled={!source || busy || mutationBusy} onChange={event => changeOffset(Number(event.target.value))} /></label>
            <button disabled={!source || busy || mutationBusy} onClick={clearSection}>Rétablir le volume</button></div>
          <p className="sc-footnote">Conservation : n · p ≤ offset. Faces de fermeture créées par opération booléenne native — pas un simple clipping de visualisation.</p>
          <p className="sc-cut-status" role="status">{sectionStatus === "error" ? "ÉCHEC · dernier solide valide conservé" : pending ? "CALCUL EN COURS" : solid?.section ? `VALIDÉ · ${cadNumber(solid.section.elapsed_ms, 1)} ms côté serveur · n = ${cadPointText(solid.section.normal)} · offset ${cadNumber(solid.section.offset_mm)} mm` : "SOURCE ENTIÈRE · aucune coupe"}</p>
          {sectionError && <p className="sc-alert" role="alert">{sectionError}</p>}
        </section>
      </div>
      <aside className="sc-panel sc-inspector"><div className="sc-panel-title"><h3>Propriétés / MBD</h3><span>SI</span></div>
        {currentPart && originalPart ? <>
          <h4 className="sc-part-name">{currentPart.name}</h4><code>{currentPart.id}</code>
          <PhysicalProperties title={solid?.section ? "Pièce après coupe" : "Pièce source"} properties={currentPart.properties} />
          <label className="sc-field">Matériau attribué<select value={originalPart.material_id ?? ""} disabled={mutationDisabled || !materials.length} onChange={event => { const id = event.target.value; if (id) void mutate((doc, signal) => solidCadApi.assignMaterials(doc.model_id, { [originalPart.id]: id }, signal)); }}><option value="">Inconnu / non attribué</option>{materials.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {material && <p className="sc-footnote">ρ = {cadNumber(material.density_kg_m3)} kg/m³ · {material.source}<br />{material.calibration_status}<br />{material.id === "cfrp" ? "Twill procédural : répétition 4 mm, relief nominal 25 µm, projection planaire métrique (pas un drapage matière)." : "Anisotropie d’usinage illustrative, paramètres PBR nominaux."}</p>}
          {!isDemo && <p className="sc-footnote">Modifier le matériau ou ajouter une PMI rétablit d’abord le solide entier, sans écraser la source.</p>}
          {currentPart.properties.max_topology_tolerance_mm != null && <p className="sc-footnote">Tolérance topologique maximale : {cadNumber(currentPart.properties.max_topology_tolerance_mm * 1000, 6)} µm. La tessellation de visualisation ne prouve pas une précision micrométrique.</p>}
          <label className="sc-field">Face native sélectionnée<select value={currentFace?.id ?? ""} onChange={event => event.target.value ? selectFace({ partId: currentPart.id, faceId: event.target.value }) : setSelected(null)}><option value="">Choisir une face (clavier ou vue)</option>{currentPart.faces.map(face => <option key={face.id} value={face.id}>{face.id}{face.is_section_cap ? " · fermeture de coupe" : ""}</option>)}</select></label>
          {currentFace && <div className="sc-anchor-data"><code>{currentFace.id}</code><p>{currentFace.surface_type} · {currentFace.is_section_cap ? "Face créée par coupe" : "Face native"}</p><strong>Ancrage réel (mm)</strong><p>{cadPointText(currentFace.anchor_mm)}</p><small>{currentFace.indices.length / 3} triangles de tessellation</small></div>}
          {selected && !currentFace && <p className="sc-footnote">Face sélectionnée absente du résultat de coupe. PMI non réancrée sur une autre face.</p>}
          <form className="sc-pmi-form" onSubmit={event => {
            event.preventDefault();
            if (!sourceFace || mutationDisabled) return;
            try {
              const numbers = kind === "material" ? { nominal_mm: null, tolerance_um: null } : parsePmiNumbers(nominal, tolerance);
              if (!pmiText.trim()) throw new Error("Renseignez le texte de la PMI.");
              void mutate((doc, signal) => solidCadApi.addPmi(doc.model_id, { part_id: originalPart.id, face_id: sourceFace.id, kind, ...numbers, datum, text: pmiText }, signal));
            } catch (error) { setError(errorText(error)); }
          }}><h4>Annotation GD&T utilisateur</h4><p>Ancrage de face calculé par le noyau, conservé avec le SHA de la source.</p>
            <fieldset disabled={mutationDisabled || !sourceFace || !!currentFace?.is_section_cap}><label>Type<select value={kind} onChange={event => setKind(event.target.value)}><option value="position">Position</option><option value="flatness">Planéité</option><option value="parallelism">Parallélisme</option><option value="perpendicularity">Perpendicularité</option><option value="dimension">Dimension</option><option value="material">Spécification matériau</option></select></label>
              <div className="sc-numeric-fields"><label>Nominal (mm)<input inputMode="decimal" value={nominal} placeholder="Facultatif" disabled={kind === "material"} onChange={event => setNominal(event.target.value)} /></label><label>Tolérance (µm)<input inputMode="decimal" value={tolerance} required={kind !== "material"} disabled={kind === "material"} onChange={event => setTolerance(event.target.value)} /></label></div>
              <label>Référentiel / datum<input value={datum} maxLength={32} placeholder="A | B | C" onChange={event => setDatum(event.target.value)} /></label>
              <label>Texte PMI<input value={pmiText} maxLength={500} required placeholder="Ex. Position du logement" onChange={event => setPmiText(event.target.value)} /></label><button type="submit" className="sc-primary">{mutationBusy ? "Enregistrement…" : "Ajouter une PMI à cette face"}</button></fieldset>
            {isDemo && <p className="sc-footnote">PMI de la démo en lecture seule. Import authentifié requis pour ajouter vos annotations.</p>}
            {!isDemo && !sourceFace && <p className="sc-footnote">Sélectionnez une face de la source ; les faces de fermeture ne peuvent pas servir d’ancrage persistant.</p>}
          </form>
        </> : <div className="sc-empty"><p>Sélectionnez une pièce dans l’arbre natif.</p></div>}
      </aside>
    </div>
    {source && <section className="sc-panel sc-pmi-register"><div className="sc-panel-title"><h3>Registre des PMI</h3><span>{source.pmi.length} annotations originales</span></div>{source.pmi.length ? <div className="sc-table-wrap"><table><thead><tr><th>Type / texte</th><th>Face source</th><th>Nominal</th><th>Tolérance</th><th>Datum</th><th>Ancrage X / Y / Z (mm)</th><th>Origine / visibilité</th></tr></thead><tbody>{source.pmi.map(pmi => <tr key={pmi.id}><td><b>{pmi.kind}</b><br />{pmi.text}</td><td><button onClick={() => selectFace({ partId: pmi.part_id, faceId: pmi.face_id })}>{pmi.face_id}</button></td><td>{pmi.nominal_mm == null ? "—" : `${cadNumber(pmi.nominal_mm, 6)} mm`}</td><td>{cadPmiTolerance(pmi)}{pmi.semantic_modifiers?.length ? <small>Modificateurs non interprétés : {pmi.semantic_modifiers.join(" · ")}</small> : null}</td><td>{pmi.datum || "—"}</td><td>{cadPointText(pmi.anchor_mm)}</td><td>{pmi.source} · {visiblePmiIds.has(pmi.id) ? "ancrage présent" : "hors coupe / ID non reconduit"}</td></tr>)}</tbody></table></div> : <p className="sc-footnote">Aucune PMI reçue. Absence de données explicitement conservée.</p>}</section>}
    <footer className="sc-footer"><div><span>SOURCE / TRAÇABILITÉ</span><p>{sourceLabel ? `${sourceLabel.format} · ${sourceLabel.schema ?? "schéma non renseigné"} · unités mm` : "Aucune source native"}</p><code>{sourceLabel?.sha256 ?? "SHA-256 : en attente"}</code></div>
      <details><summary>Capacités déclarées par le service</summary><pre>{capabilities ? JSON.stringify(capabilities, null, 2) : "Le service n’a pas encore déclaré ses capacités."}</pre></details>
      {capabilities?.step_export?.pmi === false && <p>Export STEP AP242 de démonstration : géométrie et noms uniquement, PMI non exportées. Les annotations restent dans le document natif et son registre source.</p>}
      {capabilities?.pmi?.xde_semantic_import === "partial" && <p>Import de PMI sémantiques XDE partiel : fidélité AP242 complète, modificateurs complexes et PMI de présentation non revendiqués.</p>}
      <p>Valeurs physiques issues du noyau et densités nominales du catalogue. Les PMI ne valent pas certification métrologique, validation de fabrication ou conformité GD&T automatique.</p>
    </footer>
    {!!solid?.warnings?.length && <div className="sc-alert sc-warning" role="status">{solid.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
  </section>;
}

/** Public fixture only. No upload, user model lookup, or auth bypass is exposed here. */
export function CadValidationPage() {
  return <main className="sc-public-page"><nav className="sc-public-nav" aria-label="Navigation CAO"><a href="/">← Centre d’ingénierie</a><span>AEROMIND · VALIDATION CAD / SPRINT 01</span></nav><SolidCadWorkbench publicDemoOnly /></main>;
}
