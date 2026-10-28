import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Activity,
  ArrowRight,
  BatteryCharging,
  Box,
  CircleDot,
  Cpu,
  Download,
  Gauge,
  Layers3,
  Maximize2,
  Move3d,
  MoreHorizontal,
  PenLine,
  Play,
  RotateCcw,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { ConceptConfig, DroneSketchStroke } from "../lib/aeroEngine";
import type { AppLanguage } from "../lib/language";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import { getDroneGeometryStrokes } from "../lib/droneSketchGeometry";
import { buildMechanicalModel } from "../lib/mechanicalTwinGeometry";
import {
  groupTwinSketchByUserLayer,
  loadTwinPresentationPreference,
  saveTwinPresentationPreference,
  type TwinPresentationMode,
} from "../lib/digitalTwinPresentation";
import { MechanicalTwinEditor } from "./MechanicalTwinEditor";
import "./digital-twin-explorer.css";

type Props = {
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  activeProfile?: DroneCatalogDesign;
  language?: AppLanguage;
  projectName: string;
  runId: string;
  hasProject?: boolean;
  onRunSimulation: () => void;
  onOpenCatalog: () => void;
  onOpenSketch: () => void;
};
type EventEntry = { id: number; time: string; label: string };
type ProjectTreeItem = { id: string; label: string; status: string };
const sectionItems = [
  "CONCEPTION",
  "ANALYSE",
  "SIMULATION",
  "SURVEILLANCE",
] as const;
const tabs = ["SYNTHÈSE", "PERFORMANCE", "MATÉRIAUX"] as const;
const evolutionStages = [
  {
    title: "Concept initial",
    short: "CONCEPT",
    detail: "Idée, mission et architecture",
  },
  {
    title: "Étude de configuration",
    short: "CONFIGURATION",
    detail: "Volume, dimensions et structure",
  },
  {
    title: "Raffinement aérodynamique",
    short: "RAFFINEMENT",
    detail: "Géométrie et intégration",
  },
  {
    title: "Intégration systèmes",
    short: "INTÉGRATION",
    detail: "Propulsion, énergie et charge",
  },
  {
    title: "Véhicule optimisé",
    short: "SYNTHÈSE",
    detail: "Configuration déclarée et revue",
  },
] as const;
const fmt = (value: number, digits = 2) =>
  Number.isFinite(value) && value > 0 ? value.toFixed(digits) : "—";
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function renderSketchStroke(stroke: DroneSketchStroke, prefix: string) {
  const first = stroke.points[0];
  if (!first) return null;
  if (stroke.tool === "annotation")
    return (
      <text
        key={`${prefix}-${stroke.id}`}
        x={first.x}
        y={first.y}
        fill={stroke.color}
        fontSize="18"
      >
        {stroke.label ?? "Repère"}
      </text>
    );
  if (
    (stroke.tool === "ellipse" || stroke.tool === "rectangle") &&
    stroke.points[1]
  ) {
    const [a, b] = stroke.points;
    const common = {
      fill: stroke.fill ?? "none",
      stroke: stroke.color,
      strokeWidth: stroke.width,
      opacity: stroke.opacity ?? 1,
    };
    return stroke.tool === "ellipse" ? (
      <ellipse
        key={`${prefix}-${stroke.id}`}
        cx={(a.x + b.x) / 2}
        cy={(a.y + b.y) / 2}
        rx={Math.abs(a.x - b.x) / 2}
        ry={Math.abs(a.y - b.y) / 2}
        {...common}
      />
    ) : (
      <rect
        key={`${prefix}-${stroke.id}`}
        x={Math.min(a.x, b.x)}
        y={Math.min(a.y, b.y)}
        width={Math.abs(a.x - b.x)}
        height={Math.abs(a.y - b.y)}
        {...common}
      />
    );
  }
  const path = stroke.points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
  return (
    <path
      key={`${prefix}-${stroke.id}`}
      d={path}
      fill={stroke.fill ?? "none"}
      stroke={stroke.color}
      strokeWidth={stroke.width}
      opacity={stroke.opacity ?? 1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function SourceSilhouette({
  profile,
  config,
  strokes = [],
  stage = 0,
  projection = "top",
}: {
  profile?: DroneCatalogDesign;
  config: ConceptConfig;
  strokes?: DroneSketchStroke[];
  stage?: number;
  projection?: "top" | "front" | "side";
}) {
  if (strokes.length) {
    if (projection !== "top")
      return <div className="dte-projection-unavailable">Projection non définie dans le croquis utilisateur</div>;
    return <svg className="dte-source-silhouette is-sketch" viewBox="0 0 1000 560" aria-label="Croquis réel de l’utilisateur">
      {strokes.map((stroke) => renderSketchStroke(stroke, `sketch-${projection}`))}
    </svg>;
  }
  if (!profile) return <div className="dte-projection-unavailable">Aucune géométrie chargée</div>;

  const model = profile.modelType ?? (profile.key === "vtol" ? "tiltrotor" : profile.key === "quadcopter" ? "multirotor" : "voilure-conventionnelle");
  const type = String(model).toLowerCase();
  const vtol = ["tiltrotor", "tilt-wing", "tail-sitter"].includes(type);
  const winged = profile.key === "fixed-wing" || vtol || ["aile-volante", "voilure-conventionnelle", "planeur", "hale-voilure", "male-voilure", "stealth-wing", "blended-pusher", "tandem-wing", "canard", "biplan", "double-poutre", "effet-de-sol"].includes(type);
  const span = clamp((config.wingspan || profile.configuration.wingspan || 2.4) * 34, 76, 132);
  const length = clamp((config.fuselageLength || profile.configuration.fuselageLength || 1.6) * 28, 46, 82);
  const motors = clamp(Math.round(config.motorCount ?? profile.configuration.motorCount ?? (winged ? 1 : 4)), 1, 12);
  const color = stage === 4 ? "#9bf4de" : "#79d9d4";
  const motorDots = (y: number, count: number, wingSpan = span) => {
    const pairs = Math.ceil(count / 2);
    return Array.from({ length: count }, (_, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      const station = Math.floor(index / 2);
      const fraction = pairs <= 1 ? 0.66 : 0.34 + station * (0.58 / (pairs - 1));
      const x = 160 + side * wingSpan * fraction;
      return <g key={`motor-${index}`}><path d={`M${160 + side * wingSpan * 0.2} ${y}L${x} ${y - 5}`} stroke="#a8c8c9" strokeWidth="1"/><circle cx={x} cy={y - 5} r="4.2" fill="rgba(239,189,114,.13)" stroke="#efbd72" strokeWidth="1.2"/><path d={`M${x - 6} ${y - 5}H${x + 6}M${x} ${y - 11}V${y + 1}`} stroke="#efbd72" strokeWidth=".8" opacity=".8"/></g>;
    });
  };

  if (projection === "front") return <svg className="dte-source-silhouette" viewBox="0 0 320 112" aria-label={`Projection de face de ${profile.label}`}>
    {winged ? <><path d={`M${160-span} 50Q160 39 ${160+span} 50L${160+span-10} 62Q160 52 ${160-span+10} 62Z`} fill="rgba(77,184,183,.2)" stroke={color} strokeWidth="1.6"/><path d="M160 35V75" stroke="#b7eee4" strokeWidth="2"/>{vtol && motorDots(48, motors)}</> : type === "aérostat" ? <><ellipse cx="160" cy="43" rx="38" ry="24" fill="rgba(77,184,183,.17)" stroke={color}/><path d="M160 67V83M151 83H169" stroke="#b7eee4"/></> : <><path d="M160 44L160 72" stroke="#b7eee4" strokeWidth="4"/>{Array.from({length:motors},(_,i)=>{const x=160+(i-(motors-1)/2)*Math.min(18,100/motors);return <g key={i}><path d={`M${x} 43V30M${x-6} 30H${x+6}`} stroke="#efbd72" strokeWidth="1.5"/><circle cx={x} cy="43" r="3" fill={color}/></g>})}</>}
  </svg>;
  if (projection === "side") return <svg className="dte-source-silhouette" viewBox="0 0 320 112" aria-label={`Projection de profil de ${profile.label}`}>
    {type === "aérostat" ? <><ellipse cx="154" cy="42" rx="45" ry="24" fill="rgba(77,184,183,.17)" stroke={color}/><path d="M154 66V80L170 85" stroke="#b7eee4"/></> : type === "parapente" ? <><path d="M68 44Q160 7 252 44Q160 28 68 44Z" fill="rgba(77,184,183,.18)" stroke={color}/><path d="M160 43V76M146 76H174" stroke="#b7eee4"/></> : <><path d={`M${160-length} 59Q145 42 160 48Q${160+length*.6} 48 ${160+length} 59L${160+length*.72} 68L${160-length*.62} 68Z`} fill="rgba(77,184,183,.2)" stroke={color} strokeWidth="1.6"/>{winged && <path d={type === "biplan" ? "M115 48H205M115 56H205" : `M145 54L${160-span*.55} 46L${160+span*.55} 48L174 57`} fill="none" stroke="#a6e8df" strokeWidth="1.3"/>}{vtol && motorDots(51, motors, span*.65)}{type === "cyclocoptère" && <><circle cx="140" cy="53" r="13" fill="none" stroke="#efbd72"/><circle cx="180" cy="53" r="13" fill="none" stroke="#efbd72"/></>}</>}
  </svg>;

  return <svg className="dte-source-silhouette" viewBox="0 0 320 112" aria-label={`Plan de ${profile.label} · ${model}`}>
    {type === "aérostat" ? <g><ellipse cx="160" cy="47" rx="47" ry="25" fill="rgba(117,224,213,.22)" stroke={color} strokeWidth="1.5"/><path d="M146 69L151 81H169L174 69M155 80V88M165 80V88" fill="none" stroke="#b7eee4"/><path d="M160 72V84" stroke="#edbd73"/></g>
    : type === "parapente" ? <g><path d="M36 43Q160 4 284 43Q160 28 36 43Z" fill="rgba(117,224,213,.2)" stroke={color} strokeWidth="1.5"/><path d="M45 42L153 77M90 39L156 77M140 35L159 77M275 42L167 77M230 39L164 77M180 35L161 77" stroke="#b7eee4" strokeWidth=".7"/><path d="M153 77L160 87L167 77Z" fill="#edbd73"/></g>
    : type === "ornithoptère" ? <g><path d="M160 25Q135 30 48 17Q92 49 151 55L160 72L169 55Q228 49 272 17Q185 30 160 25Z" fill="rgba(117,224,213,.2)" stroke={color}/><path d="M160 27V84" stroke="#d7f6ed" strokeWidth="3"/><path d="M75 25L148 50M245 25L172 50" stroke="#a6e8df"/></g>
    : type === "cyclocoptère" ? <g><path d="M160 35Q151 44 153 58L160 77L167 58Q169 44 160 35Z" fill="rgba(117,224,213,.3)" stroke={color}/><ellipse cx="111" cy="54" rx="12" ry="28" fill="none" stroke="#edbd73" strokeWidth="3"/><ellipse cx="209" cy="54" rx="12" ry="28" fill="none" stroke="#edbd73" strokeWidth="3"/><path d="M123 54H151M169 54H197" stroke="#a6e8df" strokeWidth="3"/></g>
    : type === "effet-de-sol" ? <g><path d="M70 49Q160 40 250 49L232 68H88Z" fill="rgba(117,224,213,.25)" stroke={color}/><path d="M96 48L80 39M224 48L240 39M160 45V73" stroke="#b7eee4" strokeWidth="2"/><path d="M58 76Q160 70 262 76" fill="none" stroke="#edbd73" strokeDasharray="3 3"/></g>
    : winged ? <g>
      <path d={`M160 ${56-length*.54}Q153 53 156 ${56+length*.5}L160 ${56+length*.7}L164 ${56+length*.5}Q167 53 160 ${56-length*.54}Z`} fill="rgba(117,224,213,.4)" stroke={color} strokeWidth="1.5"/>
      {(["aile-volante","stealth-wing"].includes(type))
        ? <path d={`M160 30L${160-span} 47L${160-span*.72} 68L160 60L${160+span*.72} 68L${160+span} 47Z`} fill="rgba(70,166,176,.25)" stroke="#b1eee5" strokeWidth="1.5"/>
        : type === "blended-pusher"
          ? <path d={`M160 25L${160-span} 43L${160-span*.82} 67L160 61L${160+span*.82} 67L${160+span} 43Z`} fill="rgba(70,166,176,.28)" stroke="#b1eee5" strokeWidth="1.5"/>
          : type === "tandem-wing"
            ? <><path d={`M160 42L${160-span*.82} 33L${160+span*.82} 33L160 47Z`} fill="rgba(70,166,176,.22)" stroke="#b1eee5"/><path d={`M160 61L${160-span} 55L${160+span} 55L160 67Z`} fill="rgba(70,166,176,.22)" stroke="#b1eee5"/></>
            : type === "canard"
              ? <><path d={`M160 39L${160-span*.42} 34L${160+span*.42} 34L160 45Z`} fill="rgba(70,166,176,.2)" stroke="#b1eee5"/><path d={`M160 54L${160-span} 43L${160+span} 43L160 64Z`} fill="rgba(70,166,176,.22)" stroke="#b1eee5"/><path d={`M160 73L${160-span*.35} 69L${160+span*.35} 69L160 78Z`} fill="rgba(70,166,176,.18)" stroke="#90d9d1"/></>
              : <><path d={`M160 52L${160-span} 31L${160-span*.82} 58L160 63L${160+span*.82} 58L${160+span} 31Z`} fill="rgba(70,166,176,.23)" stroke="#b1eee5" strokeWidth="1.5"/>{type === "biplan" && <path d={`M160 69L${160-span*.82} 63L${160+span*.82} 63L160 76Z`} fill="rgba(70,166,176,.17)" stroke="#90d9d1"/>}{type === "double-poutre" && <path d={`M${160-span*.45} 52L${160-span*.38} 81M${160+span*.45} 52L${160+span*.38} 81M${160-span*.38} 81H${160+span*.38}`} fill="none" stroke="#b1eee5" strokeWidth="2"/>}{!(["aile-volante","stealth-wing"].includes(type)) && type !== "biplan" && <path d={`M160 ${56+length*.34}L${160-span*.36} 80L160 ${56+length*.48}L${160+span*.36} 80Z`} fill="rgba(70,166,176,.16)" stroke="#90d9d1" strokeWidth="1.1"/>}</>}
      {vtol ? motorDots(43, motors, span*.82) : type === "ducted-fan" ? motorDots(55, motors) : motors > 1 ? motorDots(45, Math.min(motors, 4), span*.72) : <g><circle cx="160" cy="80" r="3" fill="#edbd73"/><path d="M154 80H166" stroke="#edbd73"/></g>}
      {stage >= 3 && <rect x="155" y="51" width="10" height="13" rx="2" fill="#a994ff" opacity=".85"/>}
    </g>
    : <g><path d="M160 38Q151 44 152 57Q153 70 160 76Q167 70 168 57Q169 44 160 38Z" fill="rgba(117,224,213,.4)" stroke={color} strokeWidth="1.5"/>{Array.from({length:motors},(_,index)=>{const angle=-Math.PI/2+(index/motors)*Math.PI*2;const x=160+Math.cos(angle)*span*.62;const y=56+Math.sin(angle)*31;return <g key={index}><path d={`M160 56L${x} ${y}`} stroke="#6dbbc1" strokeWidth="2.6"/><circle cx={x} cy={y} r="5.5" fill="rgba(239,189,114,.12)" stroke="#efbd72" strokeWidth="1.3"/>{stage>=3&&<circle cx={x} cy={y} r="1.4" fill="#ffe4ac"/>}</g>})}{stage>=3&&<rect x="155" y="51" width="10" height="13" rx="2" fill="#a994ff" opacity=".85"/>}</g>}
    {stage === 2 && <g fill="none" stroke="#73e4d2" strokeWidth="1" strokeDasharray="3 4" opacity=".8"><path d="M28 42Q86 33 128 49"/><path d="M28 70Q87 80 128 63"/><path d="M192 49Q234 33 292 42"/><path d="M192 63Q234 80 292 70"/></g>}
    {stage === 4 && <circle cx="160" cy="56" r="48" fill="none" stroke="#72e6d4" strokeOpacity=".35" strokeDasharray="2 5"/>}
  </svg>;
}

function CustomSketchStage({ strokes }: { strokes: DroneSketchStroke[] }) {
  return (
    <svg
      viewBox="0 0 1000 560"
      role="img"
      aria-label="Dessin réel du drone personnalisé"
    >
      {strokes.map((stroke) => renderSketchStroke(stroke, "active-sketch"))}
    </svg>
  );
}

function CustomExplodedStage({
  strokes,
  groups,
  onOpenSketch,
}: {
  strokes: DroneSketchStroke[];
  groups: ReturnType<typeof groupTwinSketchByUserLayer>;
  onOpenSketch: () => void;
}) {
  const hasUserLayers = groups.some((group) => group.assigned);
  if (!hasUserLayers)
    return (
      <div className="dte-custom-exploded-empty">
        <div className="dte-custom-exploded-source">
          <CustomSketchStage strokes={strokes} />
        </div>
        <div className="dte-custom-exploded-message">
          <Box size={18} />
          <strong>Ce dessin n’a pas de calque utilisateur à éclater</strong>
          <span>
            Le croquis 2D reste affiché fidèlement. Aucun calque ni composant
            n’est créé automatiquement.
          </span>
          <button onClick={onOpenSketch}>
            <Layers3 size={13} />
            Gérer les calques
          </button>
        </div>
      </div>
    );

  return (
    <div
      className="dte-custom-layer-explosion"
      role="group"
      aria-label="Vue éclatée 2D des calques du croquis"
    >
      <div className="dte-custom-layer-stack">
        {groups.map((group) => (
          <section
            className={`dte-custom-layer-card ${group.assigned ? "is-assigned" : "is-unassigned"}`}
            key={group.key}
          >
            <header>
              <span>
                {group.assigned ? "CALQUE UTILISATEUR" : "NON AFFECTÉ"}
              </span>
              <strong>{group.label}</strong>
              <small>{group.strokes.length} entité(s)</small>
            </header>
            <svg
              viewBox="0 0 1000 560"
              role="img"
              aria-label={`Géométrie du groupe ${group.label}`}
            >
              {group.strokes.map((stroke) =>
                renderSketchStroke(stroke, `exploded-${group.key}`),
              )}
            </svg>
          </section>
        ))}
      </div>
      <div className="dte-custom-layer-caption">
        <span>ASSEMBLAGE 2D PAR CALQUES · SOURCE FIDÈLE</span>
        <small>
          Les éléments montrés proviennent du croquis. Les contours ne sont ni
          extrudés ni réinterprétés.
        </small>
        <button onClick={onOpenSketch}>
          <Layers3 size={13} />
          Modifier les calques
        </button>
      </div>
    </div>
  );
}

export function DigitalTwinExplorer({
  config,
  setConfig,
  activeProfile,
  language = "fr",
  projectName,
  runId,
  hasProject = false,
  onRunSimulation,
  onOpenCatalog,
  onOpenSketch,
}: Props) {
  const [section, setSection] =
    useState<(typeof sectionItems)[number]>("CONCEPTION");
  const [workspaceTab, setWorkspaceTab] = useState<
    "LOCAL" | "HISTORIQUE" | "CONFIG"
  >("LOCAL");
  const [inspectorTab, setInspectorTab] =
    useState<(typeof tabs)[number]>("SYNTHÈSE");
  const [selected, setSelected] = useState("");
  const [activeTool, setActiveTool] = useState<"select" | "draw" | "move" | "correct" | "create">("select");
  const [projectionMode, setProjectionMode] = useState<"Perspective" | "Orthographique">("Perspective");
  const [xrayEnabled, setXrayEnabled] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [layerDraft, setLayerDraft] = useState("");
  const [toolMessage, setToolMessage] = useState("");
  const [search, setSearch] = useState("");
  const [presentation, setPresentation] = useState<TwinPresentationMode>(() =>
    loadTwinPresentationPreference(),
  );
  const syncText = "État local · non synchronisé serveur";
  const [events, setEvents] = useState<EventEntry[]>([]);
  const priorSignature = useRef("");
  const customStrokes = config.customSketch?.strokes ?? [];
  const customGeometryStrokes = getDroneGeometryStrokes(customStrokes);
  const customLayerGroups = useMemo(
    () =>
      groupTwinSketchByUserLayer(
        customGeometryStrokes,
        config.studioLayers ?? [],
      ),
    [customGeometryStrokes, config.studioLayers],
  );
  const customSource =
    customGeometryStrokes.length > 0 &&
    (config.engineeringSelection?.source === "custom" || !activeProfile);
  const design =
    activeProfile && !customSource
      ? {
          ...activeProfile,
          configuration: { ...activeProfile.configuration, ...config },
        }
      : undefined;
  // Mechanical Twin always receives a parametric design contract. For a user
  // sketch this is an explicitly labelled engineering proxy seeded from the
  // current project dimensions; the original 2D strokes remain the source of
  // truth and are not silently replaced by this illustrative 3D envelope.
  const twinDesign: DroneCatalogDesign | undefined = design ?? (customSource
    ? {
        key: config.airframe ?? "quadcopter",
        modelType: config.modelType as DroneCatalogDesign["modelType"],
        id: `custom-sketch-${config.engineeringSelection?.droneId ?? "active"}`,
        label: config.engineeringSelection?.droneLabel ?? config.designName ?? "Dessin personnalisé",
        family: "Jumeau mécanique paramétrique · source dessin utilisateur",
        mission: "Maquette de travail dérivée des paramètres du projet; croquis 2D conservé comme référence utilisateur.",
        specs: `${(config.wingspan ?? 0).toFixed(2)} m · ${(config.fuselageLength ?? 0).toFixed(2)} m · ${Math.round(config.motorCount ?? 0)} moteurs`,
        disciplines: "Géométrie paramétrique · enveloppe mécanique illustrative",
        tone: "cyan",
        configuration: { ...config },
        role: "civil",
        defenseUse: "Prototype conceptuel non armé; revue humaine et validation technique requises.",
        origin: "aeromind-parametric",
      }
    : undefined);
  const hasSource = Boolean(design || customSource);
  const sourceLabel =
    design?.label ??
    (customSource
      ? (config.engineeringSelection?.droneLabel ??
        config.designName ??
        "Dessin utilisateur")
      : "");
  const materials = config.installedMaterials ?? [];
  const mechanicalParts = useMemo(
    () => twinDesign ? buildMechanicalModel(twinDesign, config).parts : [],
    [twinDesign, config],
  );
  const materialMass = materials.reduce(
    (sum, item) => sum + item.massKg * (item.quantity ?? 1),
    0,
  );
  const motorCount = Math.max(0, Math.round(config.motorCount ?? 0));
  const filteredMaterials = useMemo(
    () =>
      materials.filter((item) =>
        `${item.label} ${item.category ?? ""} ${item.manufacturer ?? ""}`
          .toLocaleLowerCase("fr-FR")
          .includes(search.toLocaleLowerCase("fr-FR")),
      ),
    [materials, search],
  );
  const stampEvent = (label: string) =>
    setEvents((current) =>
      [
        {
          id: Date.now(),
          time: new Date().toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          label,
        },
        ...current,
      ].slice(0, 6),
    );
  const treeGroups = useMemo(() => {
    const groups: Array<{ group: string; items: ProjectTreeItem[] }> = [];
    if (mechanicalParts.length)
      groups.push({
        group: "COMPOSANTS DU DRONE",
        items: mechanicalParts.map((part) => ({ id: `twin:${part.id}`, label: part.name, status: part.category.toUpperCase() })),
      });
    const layers = config.studioLayers ?? [];
    if (layers.length)
      groups.push({
        group: "CALQUES CRÉÉS PAR L’UTILISATEUR",
        items: layers.map((label) => ({
          id: `layer:${label}`,
          label,
          status: "CALQUE",
        })),
      });
    if (materials.length)
      groups.push({
        group: "PIÈCES DU DOCUMENT",
        items: materials.map((item) => ({
          id: `part:${item.id}`,
          label: item.label,
          status: "LIÉ AU PROJET",
        })),
      });
    if (customStrokes.length)
      groups.push({
        group: "ENTITÉS DU CROQUIS",
        items: customStrokes.map((stroke, index) => ({
          id: `stroke:${stroke.id}`,
          label: stroke.label ?? `Entité ${String(index + 1).padStart(2, "0")}`,
          status: "DESSIN",
        })),
      });
    if (hasSource && !materials.length && !customStrokes.length)
      groups.push({
        group: "SOURCE ACTIVE",
        items: [
          {
            id: "source:active",
            label: sourceLabel,
            status: design ? "CATALOGUE" : "DESSIN",
          },
        ],
      });
    return groups;
  }, [
    config.studioLayers,
    mechanicalParts,
    materials,
    customStrokes,
    hasSource,
    sourceLabel,
    design,
  ]);
  const treeItems = treeGroups.flatMap((group) => group.items);
  const selectedItem = treeItems.find((item) => item.id === selected);
  const selectedMechanicalId = selected.startsWith("twin:") ? selected.slice(5) : selected.startsWith("part:") ? `installed:${selected.slice(5)}` : "";
  const selectedMaterialId = selected.startsWith("part:") ? selected.slice(5) : "";
  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId);
  const assignedLayer = selectedMechanicalId ? config.studioLayerAssignments?.[selectedMechanicalId] : undefined;
  const activeValue =
    selectedItem?.label ?? sourceLabel ?? "Aucun élément sélectionné";
  const evolutionStage = clamp(
    Math.round(config.designEvolutionStage ?? 0),
    0,
    evolutionStages.length - 1,
  );

  useEffect(() => {
    const signature = JSON.stringify({
      wingspan: config.wingspan,
      fuselageLength: config.fuselageLength,
      batteryWh: config.batteryWh,
      payloadKg: config.payloadKg,
      motorCount: config.motorCount,
      materials: materials.map((item) => [item.id, item.quantity, item.massKg]),
      sketch: config.customSketch?.modifiedAt,
    });
    if (priorSignature.current && priorSignature.current !== signature)
      stampEvent("Paramètres actualisés depuis le document partagé");
    priorSignature.current = signature;
  }, [
    config.wingspan,
    config.fuselageLength,
    config.batteryWh,
    config.payloadKg,
    config.motorCount,
    materials,
    config.customSketch?.modifiedAt,
  ]);

  useEffect(() => {
    if (!treeItems.some((item) => item.id === selected))
      setSelected(treeItems[0]?.id ?? "");
  }, [treeItems, selected]);

  useEffect(() => {
    saveTwinPresentationPreference(presentation);
  }, [presentation]);

  const updateNumber = (key: keyof ConceptConfig, value: string) =>
    setConfig((current) => ({
      ...current,
      [key]: Math.max(0, Number(value) || 0),
    }));
  const resetTwinView = () => {
    setSection("CONCEPTION");
    setWorkspaceTab("LOCAL");
    setInspectorTab("SYNTHÈSE");
    setActiveTool("select");
    setSelected("");
    setSearch("");
    setPresentation("horizon");
    setXrayEnabled(false);
    setToolMessage("Vue Forge réinitialisée");
    stampEvent("Vue du jumeau réinitialisée");
  };
  const toggleTwinFullscreen = () => {
    const root = document.querySelector(".digital-twin-explorer");
    if (!document.fullscreenElement) void root?.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };
  const choosePresentation = (mode: TwinPresentationMode) => {
    if (mode === presentation) return;
    setPresentation(mode);
    stampEvent(
      mode === "exploded"
        ? "Présentation Assemblage éclaté choisie sur cet appareil"
        : "Présentation Horizon 3D choisie sur cet appareil",
    );
  };
  const setEvolutionStage = (index: number) => {
    const next = clamp(index, 0, evolutionStages.length - 1);
    setConfig((current) => ({ ...current, designEvolutionStage: next }));
  };
  const createLayerFromSelection = () => {
    if (!selectedMechanicalId || !selectedItem) { setToolMessage("Sélectionnez d’abord une pièce du drone ou un matériel installé."); return; }
    const label = layerDraft.trim() || `${selectedItem.label} · calque`;
    const layers = config.studioLayers ?? [];
    const unique = layers.includes(label) ? `${label} ${layers.length + 1}` : label;
    setConfig((current) => ({ ...current, studioLayers: [...(current.studioLayers ?? []), unique], activeStudioLayer: unique, studioLayerSettings: { ...current.studioLayerSettings, [unique]: { visible: true, locked: false } }, studioLayerAssignments: { ...current.studioLayerAssignments, [selectedMechanicalId]: unique } }));
    setLayerDraft("");
    setToolMessage(`Calque « ${unique} » créé depuis « ${selectedItem.label} » et affecté à sa géométrie.`);
    stampEvent(`Calque créé depuis ${selectedItem.label}`);
  };
  const updateSelectedTransform = (axis: 0 | 1, value: number) => {
    if (!selectedMechanicalId || !Number.isFinite(value)) return;
    if (selectedMaterial) {
      setConfig((current) => ({ ...current, installedMaterials: (current.installedMaterials ?? []).map((part) => part.id === selectedMaterial.id ? { ...part, [axis === 0 ? "offsetX" : "offsetY"]: clamp(value, -35, 35) } : part) }));
      return;
    }
    if (!selected.startsWith("twin:") || !twinDesign) return;
    const designId = twinDesign.id;
    setConfig((current) => {
      const source = current.mechanicalTwin?.designId === designId ? current.mechanicalTwin : current.mechanicalTwins?.[designId];
      const existing = source?.edits?.[selectedMechanicalId]?.offset ?? [0, 0, 0];
      const offset: [number, number, number] = [...existing] as [number, number, number];
      offset[axis] = clamp(value, -2, 2);
      const next = { ...(source ?? { designId }), edits: { ...source?.edits, [selectedMechanicalId]: { ...source?.edits?.[selectedMechanicalId], offset } } };
      return { ...current, mechanicalTwin: next, mechanicalTwins: { ...current.mechanicalTwins, [designId]: next } };
    });
  };
  const updateSelectedScale = (value: number) => {
    if (!selectedMaterial || !Number.isFinite(value)) return;
    setConfig((current) => ({ ...current, installedMaterials: (current.installedMaterials ?? []).map((part) => part.id === selectedMaterial.id ? { ...part, scale: clamp(value, 0.5, 2) } : part) }));
  };
  const attachSelectedAnnotation = () => {
    if (!selectedMechanicalId || !selectedItem) { setToolMessage("Sélectionnez une pièce du drone ou un matériel avant d’ajouter une annotation."); return; }
    const text = window.prompt("Annotation de revue pour l’élément sélectionné", selectedItem.label);
    if (!text?.trim()) return;
    const layer = assignedLayer ?? config.activeStudioLayer;
    if (!layer) { setToolMessage("Créez d’abord un calque depuis la sélection, puis ajoutez votre annotation."); return; }
    setConfig((current) => ({ ...current, studioLayerMeta: { ...current.studioLayerMeta, [layer]: { color: current.studioLayerMeta?.[layer]?.color ?? "#b9a6ff", opacity: current.studioLayerMeta?.[layer]?.opacity ?? 100, ...current.studioLayerMeta?.[layer], note: text.trim() } } }));
    setToolMessage(`Annotation attachée au calque « ${layer} » · ${selectedItem.label}.`);
    stampEvent(`Annotation ajoutée à ${selectedItem.label}`);
  };
  const downloadConfig = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            projectName,
            runId,
            configuration: config,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aeromind-digital-twin.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main
      className="digital-twin-explorer"
      aria-label="Explorateur de jumeau numérique"
    >
      <header className="dte-topbar">
        <div className="dte-brand">
          <span className="dte-brand-mark">A</span>
          <strong>
            DIGITAL TWIN <b>EXPLORER</b>
          </strong>
        </div>
        <nav className="dte-main-nav" aria-label="Modules du jumeau numérique">
          {sectionItems.map((item) => (
            <button
              key={item}
              className={section === item ? "is-active" : ""}
              onClick={() => {
                setSection(item);
                if (item === "ANALYSE") setInspectorTab("PERFORMANCE");
                if (item === "SIMULATION") {
                  setInspectorTab("PERFORMANCE");
                  if (hasSource) {
                    stampEvent("Simulation locale demandée depuis le jumeau");
                    onRunSimulation();
                  } else
                    stampEvent(
                      "Simulation différée · source géométrique requise",
                    );
                }
                if (item === "SURVEILLANCE") setWorkspaceTab("HISTORIQUE");
              }}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="dte-workspace-tabs" aria-label="Mode de travail">
          {(["LOCAL", "HISTORIQUE", "CONFIG"] as const).map((item) => (
            <button
              key={item}
              className={workspaceTab === item ? "is-active" : ""}
              onClick={() => setWorkspaceTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </header>
      <div className="dte-subhead">
        <div>
          <span className="dte-eyebrow">
            AEROMIND / {projectName.toUpperCase()}
          </span>
          <h1>
            {hasSource
              ? sourceLabel || config.designName || "Jumeau numérique"
              : "Jumeau numérique"}
          </h1>
          <p>
            {design
              ? (
                  design.family ??
                  design.modelType ??
                  "ARCHITECTURE SÉLECTIONNÉE"
                ).toUpperCase()
              : customSource
                ? "ARCHITECTURE DESSINÉE PAR L’UTILISATEUR"
                : "AUCUNE SOURCE DE GÉOMÉTRIE"}{" "}
            <i /> {section} <i />{" "}
            {workspaceTab === "LOCAL" ? "CONFIGURATION LOCALE" : workspaceTab}
          </p>
        </div>
        <div className="dte-head-actions">
          <span className="dte-sync-state">
            <i /> {syncText}
          </span>
          <button
            onClick={downloadConfig}
            aria-label="Exporter la configuration locale"
            title="Exporter la configuration locale (non synchronisée)"
          >
            <Download size={14} />
          </button>
        </div>
      </div>
      <section className="dte-forge-header" aria-label="Atelier Forge du jumeau numérique">
        <div className="dte-forge-title">
          <span className="dte-forge-mark"><Box size={19} /></span>
          <div>
            <span>AEROMIND / JUMEAU NUMÉRIQUE EXPLORER</span>
            <strong>FORGE <small>ATELIER MÉCANIQUE PARAMÉTRIQUE</small></strong>
          </div>
          <span className={`dte-forge-state ${hasSource ? "is-ready" : ""}`}><i /> {hasSource ? "ÉDITABLE · SOURCE ACTIVE" : "SOURCE REQUISE"}</span>
        </div>
        <div className="dte-forge-actions">
          <button type="button" onClick={resetTwinView} title="Réinitialiser la vue"><RotateCcw size={14} /></button>
          <button type="button" onClick={toggleTwinFullscreen} title="Plein écran"><Maximize2 size={14} /></button>
          <button type="button" className={moreMenuOpen ? "is-active" : ""} onClick={() => setMoreMenuOpen((open) => !open)} aria-expanded={moreMenuOpen} title="Plus d’outils"><MoreHorizontal size={15} /></button>
          {moreMenuOpen && <div className="dte-more-menu" role="menu">
            <button type="button" onClick={() => { setMoreMenuOpen(false); onRunSimulation(); }} disabled={!hasSource}>Simulation</button>
            <button type="button" onClick={() => { setMoreMenuOpen(false); setInspectorTab("PERFORMANCE"); setSection("ANALYSE"); }}>Analyse déclarative</button>
            <button type="button" onClick={() => { setMoreMenuOpen(false); downloadConfig(); }}>Exporter JSON</button>
            <button type="button" onClick={() => { setMoreMenuOpen(false); stampEvent("Partage JSON préparé"); }}>Partager l’état</button>
          </div>}
        </div>
      </section>
      <section className={`dte-advanced-tools ${twinDesign ? "is-forge-replaced" : ""}`} aria-label="Outils avancés du Digital Twin">
        <div className="dte-tool-palette" role="toolbar" aria-label="Outils de travail">
          {([
            ["select", "Sélection", Search],
            ["move", "Déplacer", Move3d],
            ["correct", "Correction", Settings2],
            ["draw", "Annoter", PenLine],
            ["create", "Créer calque", Layers3],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" className={activeTool === id ? "is-active" : ""} aria-pressed={activeTool === id} onClick={() => setActiveTool(id)}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <label className="dte-tool-selection">
          <span>ÉLÉMENT ACTIF</span>
          <select aria-label="Sélectionner une pièce ou un matériel du drone" value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="">Choisir une pièce du drone…</option>
            {mechanicalParts.map((part) => <option key={part.id} value={`twin:${part.id}`}>{part.name} · {part.category}</option>)}
            {materials.map((part) => <option key={part.id} value={`part:${part.id}`}>{part.label} · matériel</option>)}
          </select>
        </label>
        {activeTool === "move" && selectedMechanicalId && <div className="dte-transform-controls"><label>Position X <input aria-label="Position X" type="number" step="0.01" value={selectedMaterial ? selectedMaterial.offsetX ?? 0 : (twinDesign ? config.mechanicalTwins?.[twinDesign.id]?.edits?.[selectedMechanicalId]?.offset?.[0] ?? 0 : 0)} onChange={(event) => updateSelectedTransform(0, Number(event.target.value))} /></label><label>Position Y <input aria-label="Position Y" type="number" step="0.01" value={selectedMaterial ? selectedMaterial.offsetY ?? 0 : (twinDesign ? config.mechanicalTwins?.[twinDesign.id]?.edits?.[selectedMechanicalId]?.offset?.[1] ?? 0 : 0)} onChange={(event) => updateSelectedTransform(1, Number(event.target.value))} /></label><small>{selectedMaterial ? "Décalage indicatif de matériel (%)" : "Décalage géométrique (m) · bornes ±2 m"}</small></div>}
        {activeTool === "correct" && selectedMaterial && <label className="dte-correction-control">Échelle du matériel <input aria-label="Échelle du matériel sélectionné" type="range" min="0.5" max="2" step="0.05" value={selectedMaterial.scale ?? 1} onChange={(event) => updateSelectedScale(Number(event.target.value))} /><b>{(selectedMaterial.scale ?? 1).toFixed(2)}×</b></label>}
        {activeTool === "correct" && selectedMechanicalId && !selectedMaterial && <span className="dte-tool-hint">Sélectionnez un matériel installé pour corriger son échelle, ou choisissez Déplacer pour ajuster la pièce paramétrique.</span>}
        {activeTool === "draw" && <button className="dte-tool-action" type="button" disabled={!selectedMechanicalId} onClick={attachSelectedAnnotation}><PenLine size={13} /> Ajouter une annotation à l’élément sélectionné</button>}
        {activeTool === "create" && <div className="dte-create-layer"><input aria-label="Nom du nouveau calque" placeholder={selectedItem ? `${selectedItem.label} · calque` : "Sélectionnez d’abord un composant"} value={layerDraft} onChange={(event) => setLayerDraft(event.target.value)} /><button type="button" disabled={!selectedMechanicalId} onClick={createLayerFromSelection}><Layers3 size={13} /> Créer et affecter</button></div>}
        <div className="dte-tool-selection-state"><span>{selectedItem ? `Sélection : ${selectedItem.label}` : "Aucune pièce sélectionnée"}</span>{assignedLayer && <b>Calque lié · {assignedLayer}</b>}{toolMessage && <small role="status">{toolMessage}</small>}</div>
        <div className="dte-forge-view-controls" role="group" aria-label="Contrôle de vue du modèle">
          <label>Projection <select value={projectionMode} onChange={(event) => setProjectionMode(event.target.value as typeof projectionMode)}><option>Perspective</option><option>Orthographique</option></select></label>
          <label className="dte-toggle-control"><input type="checkbox" checked={xrayEnabled} onChange={(event) => setXrayEnabled(event.target.checked)} /> X-ray du jumeau</label>
        </div>
      </section>
      <section className="dte-mesh-analysis dte-panel" aria-label="Analyse de cohérence du jumeau numérique">
        <div className="dte-panel-title"><div><span>ANALYSE DU MAILLAGE · CONTRÔLE DE COHÉRENCE</span><strong>{hasSource ? "Source chargée et inspectable" : "Aucune source inspectable"}</strong></div><Shield size={15} /></div>
        <div className="dte-mesh-metrics">
          <div><small>PIÈCES VISIBLES</small><strong>{hasSource ? mechanicalParts.length : "—"}</strong></div>
          <div><small>ENTITÉS DE SOURCE</small><strong>{hasSource ? treeItems.length : "—"}</strong></div>
          <div><small>CALQUES UTILISATEUR</small><strong>{config.studioLayers?.length ?? 0}</strong></div>
          <div><small>COHÉRENCE</small><strong className={hasSource ? "is-good" : "is-wait"}>{hasSource ? "CONFORME" : "EN ATTENTE"}</strong></div>
        </div>
        <p>{hasSource ? "Source paramétrique ou croquis utilisateur chargé ; les éléments affichés restent liés à la configuration active." : "Chargez une cellule AeroMind ou un croquis utilisateur pour activer l’inspection."}</p>
      </section>
      <div className={`dte-dashboard ${twinDesign ? "has-mechanical-source" : ""} ${xrayEnabled ? "is-xray" : ""}`} data-projection={projectionMode}>
        <aside className="dte-component-panel dte-panel">
          <div className="dte-panel-title">
            <div>
              <span>COMPONENTS</span>
              <strong>Arborescence du document</strong>
            </div>
            <Layers3 size={15} />
          </div>
          <div className="dte-tree">
            {treeGroups.length ? (
              treeGroups.map((group) => (
                <section key={group.group}>
                  <h3>
                    <span>⌄</span>
                    {group.group}
                  </h3>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      className={`dte-tree-row ${selected === item.id ? "is-active" : ""}`}
                      onClick={() => setSelected(item.id)}
                    >
                      <span className="dte-tree-dot" />
                      <span>{item.label}</span>
                      <small>{item.status}</small>
                    </button>
                  ))}
                </section>
              ))
            ) : (
              <div className="dte-tree-empty">
                <Layers3 size={18} />
                <strong>Document vide</strong>
                <span>Aucune pièce ni aucun calque créé.</span>
              </div>
            )}
          </div>
          <div className="dte-project-link">
            <span>PROJET ACTIF</span>
            <strong>{projectName}</strong>
            <small>Session · {runId || "locale"}</small>
          </div>
        </aside>
        <section className="dte-center-column">
          {twinDesign ? (
            <MechanicalTwinEditor
              design={twinDesign}
              config={config}
              setConfig={setConfig}
              language={language}
              exploded={presentation === "exploded"}
              hasProject={hasProject}
              onOpenCatalog={onOpenCatalog}
              onPresentation={choosePresentation}
            />
          ) : (
            <div className="dte-model-panel dte-panel">
              <div className="dte-model-heading">
                <div>
                  <span className="dte-eyebrow">DIGITAL TWIN / {section}</span>
                  <strong>
                    {hasSource ? sourceLabel : "Aucun véhicule chargé"}
                  </strong>
                </div>
                <div className="dte-camera-hint">
                  <span>
                    {design
                      ? presentation === "exploded"
                        ? "ASSEMBLAGE ÉCLATÉ · PARAMÉTRIQUE"
                        : "HORIZON 3D · PARAMÉTRIQUE"
                      : customSource
                        ? presentation === "exploded"
                          ? "CROQUIS 2D · VUE PAR CALQUES"
                          : "CROQUIS UTILISATEUR · SOURCE EXACTE"
                        : "SCÈNE VIDE · AUCUN MODÈLE GÉNÉRÉ"}
                  </span>
                  <small>
                    {design
                      ? presentation === "exploded"
                        ? "Séparation indicative des groupes · glisser pour orbiter"
                        : "Glisser pour orbiter · molette pour zoomer"
                      : customSource
                        ? "Aucune conversion 3D ni géométrie substituée"
                        : "Choisissez une cellule ou ouvrez l’atelier de dessin"}
                  </small>
                </div>
                <div
                  className="dte-presentation-controls"
                  role="group"
                  aria-label="Choisir la présentation du jumeau"
                >
                  <button
                    className={presentation === "horizon" ? "is-active" : ""}
                    aria-pressed={presentation === "horizon"}
                    title="Préférence locale à cet appareil"
                    onClick={() => choosePresentation("horizon")}
                  >
                    <CircleDot size={13} /> Horizon 3D
                  </button>
                  <button
                    className={presentation === "exploded" ? "is-active" : ""}
                    aria-pressed={presentation === "exploded"}
                    title="Préférence locale à cet appareil"
                    onClick={() => choosePresentation("exploded")}
                  >
                    <Box size={13} /> Assemblage éclaté
                  </button>
                </div>
                <span
                  className={`dte-status-chip ${hasSource ? "is-ready" : "is-wait"}`}
                >
                  <i />
                  {hasSource ? "SOURCE ACTIVE" : "SOURCE REQUISE"}
                </span>
              </div>
              <div
                className={`dte-model-stage ${!hasSource ? "is-empty" : ""} ${presentation === "exploded" ? "is-exploded" : "is-horizon"}`}
              >
                <div className="dte-stage-grid" />
                {customSource && presentation === "horizon" && (
                  <div className="dte-custom-art">
                    <CustomSketchStage strokes={customGeometryStrokes} />
                  </div>
                )}
                {customSource && presentation === "exploded" && (
                  <CustomExplodedStage
                    strokes={customGeometryStrokes}
                    groups={customLayerGroups}
                    onOpenSketch={onOpenSketch}
                  />
                )}
                {design && presentation === "exploded" && (
                  <div className="dte-exploded-caption">
                    <Box size={13} />
                    <span>
                      Géométrie paramétrique locale · séparation indicative, non
                      certifiée
                    </span>
                  </div>
                )}
                {!hasSource && (
                  <div className="dte-empty-source">
                    <div>
                      <CrosshairIcon />
                      <span>AUCUNE GÉOMÉTRIE INJECTÉE</span>
                    </div>
                    <strong>Commencez avec une source réelle</strong>
                    <small>
                      L’explorateur n’ajoute aucun drone de démonstration.
                    </small>
                    <div className="dte-empty-actions">
                      <button onClick={onOpenCatalog}>
                        <Layers3 size={14} /> Choisir une cellule
                      </button>
                      <button onClick={onOpenSketch}>
                        <PenLine size={14} /> Dessiner le drone
                      </button>
                    </div>
                  </div>
                )}
                {hasSource && (
                  <div className="dte-stage-controls">
                    <button
                      title="Exécuter une simulation"
                      onClick={onRunSimulation}
                    >
                      <Play size={14} />
                    </button>
                    <button
                      title="Ouvrir le diagnostic de configuration"
                      onClick={() => {
                        setSection("ANALYSE");
                        setInspectorTab("PERFORMANCE");
                        stampEvent("Analyse locale ouverte");
                      }}
                    >
                      <Activity size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="dte-model-footer">
                <span>
                  <CircleDot size={12} />{" "}
                  {customSource
                    ? "CROQUIS 2D · UNITÉS NON CALIBRÉES"
                    : design
                      ? presentation === "exploded"
                        ? "ÉCLATEMENT PARAMÉTRIQUE · NON CERTIFIÉ"
                        : "HORIZON 3D · PARAMÉTRIQUE · NON CERTIFIÉ"
                      : "SCÈNE VIDE · SOURCE REQUISE"}
                </span>
                <span>
                  {hasSource
                    ? `ENVERGURE DÉCLARÉE · ${fmt(config.wingspan)} m`
                    : "AUCUNE COTE PRÉCHARGÉE"}
                </span>
                <span>{materials.length} PIÈCES LIÉES</span>
              </div>
            </div>
          )}
          <section
            className="dte-evolution-panel dte-panel"
            aria-label="Progression de conception"
          >
            <div className="dte-panel-title dte-evolution-heading">
              <div>
                <span>DESIGN EVOLUTION / WORKFLOW</span>
                <strong>Progression de conception</strong>
                <small>
                  Étape active : {String(evolutionStage + 1).padStart(2, "0")} /
                  05 · pilotage manuel
                </small>
              </div>
              <span className="dte-evolution-source">
                {hasSource ? sourceLabel : "SOURCE REQUISE"}
              </span>
            </div>
            <div
              className="dte-evolution-track"
              role="list"
              aria-label="Étapes d’évolution du design"
            >
              {evolutionStages.map((item, index) => (
                <div
                  className={`dte-evolution-step ${index === evolutionStage ? "is-current" : index < evolutionStage ? "is-visited" : "is-upcoming"}`}
                  key={item.short}
                  role="listitem"
                >
                  <button
                    onClick={() => setEvolutionStage(index)}
                    aria-current={index === evolutionStage ? "step" : undefined}
                    aria-label={`Étape ${index + 1} : ${item.title}`}
                  >
                    <span className="dte-evolution-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="dte-evolution-name">{item.title}</span>
                    <span className="dte-evolution-focus">{item.detail}</span>
                    <span className="dte-evolution-thumbnail">
                      <SourceSilhouette
                        profile={design}
                        config={config}
                        strokes={customSource ? customGeometryStrokes : []}
                        stage={index}
                      />
                    </span>
                  </button>
                  {index < evolutionStages.length - 1 && (
                    <ArrowRight className="dte-evolution-arrow" size={15} />
                  )}
                </div>
              ))}
            </div>
            <div className="dte-evolution-specs">
              <div>
                <small>ENVERGURE</small>
                <strong>
                  {hasSource ? fmt(config.wingspan) : "—"} <i>m</i>
                </strong>
              </div>
              <div>
                <small>LONGUEUR FUSELAGE</small>
                <strong>
                  {hasSource ? fmt(config.fuselageLength) : "—"} <i>m</i>
                </strong>
              </div>
              <div>
                <small>MASSE COMPOSANTS DÉCLARÉE</small>
                <strong>
                  {hasSource
                    ? fmt(config.constructionMassKg ?? materialMass)
                    : "—"}{" "}
                  <i>kg</i>
                </strong>
              </div>
              <div>
                <small>PROPULSION CONFIGURÉE</small>
                <strong>{hasSource ? motorCount || "—" : "—"}</strong>
              </div>
              <small className="dte-evolution-disclaimer">
                Aucun gain, aucune révision ni validation n’est inventé. Les
                vues d’étape représentent la même source active.
              </small>
            </div>
            <div className="dte-projection-strip">
              <div>
                <span>TOP / SOURCE</span>
                <SourceSilhouette
                  profile={design}
                  config={config}
                  strokes={customSource ? customGeometryStrokes : []}
                  stage={evolutionStage}
                  projection="top"
                />
              </div>
              <div>
                <span>FRONT / SOURCE</span>
                <SourceSilhouette
                  profile={design}
                  config={config}
                  strokes={customSource ? customGeometryStrokes : []}
                  stage={evolutionStage}
                  projection="front"
                />
              </div>
              <div>
                <span>SIDE / SOURCE</span>
                <SourceSilhouette
                  profile={design}
                  config={config}
                  strokes={customSource ? customGeometryStrokes : []}
                  stage={evolutionStage}
                  projection="side"
                />
              </div>
              <p>
                Vues indicatives · issue du modèle de bibliothèque ou du croquis
                fourni
              </p>
            </div>
          </section>
          <div className="dte-metric-row">
            <article className="dte-panel dte-metric">
              <span>
                <BatteryCharging size={14} /> ÉNERGIE
              </span>
              <strong>
                {hasSource ? fmt(config.batteryWh, 0) : "—"} <small>Wh</small>
              </strong>
              <em>
                {hasSource && config.batteryWh > 0
                  ? "Capacité déclarée"
                  : "À renseigner"}
              </em>
            </article>
            <article className="dte-panel dte-metric">
              <span>
                <Gauge size={14} /> STRUCTURE
              </span>
              <strong>
                {hasSource ? fmt(config.maxTakeoffKg) : "—"}{" "}
                <small>kg MTOW</small>
              </strong>
              <em>
                {hasSource && config.wingspan > 0
                  ? `${fmt(config.wingspan)} m d’envergure`
                  : "Dimensions à renseigner"}
              </em>
            </article>
            <article className="dte-panel dte-metric">
              <span>
                <Cpu size={14} /> SYSTÈMES
              </span>
              <strong>
                {materials.length.toString().padStart(2, "0")}{" "}
                <small>composants</small>
              </strong>
              <em>
                {hasSource && motorCount
                  ? `${motorCount} motorisation(s) déclarée(s)`
                  : "Propulsion à renseigner"}
              </em>
            </article>
          </div>
          <div className="dte-bottom-grid">
            <section className="dte-panel dte-history-panel">
              <div className="dte-panel-title">
                <div>
                  <span>
                    {workspaceTab === "HISTORIQUE"
                      ? "HISTORIQUE"
                      : "TENDANCES / CONFIGURATION"}
                  </span>
                  <strong>
                    {workspaceTab === "HISTORIQUE"
                      ? "Activité du projet"
                      : "Indicateurs déclarés"}
                  </strong>
                </div>
                <span className="dte-range">
                  LOCAL · {events.length} ÉVÉNEMENT(S)
                </span>
              </div>
              {events.length ? (
                <div className="dte-events">
                  {events.map((event) => (
                    <div key={event.id}>
                      <i />
                      <time>{event.time}</time>
                      <span>{event.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dte-empty-chart">
                  <div className="dte-chart-grid" />
                  <Activity size={20} />
                  <strong>Aucune télémétrie connectée</strong>
                  <span>
                    Les relevés réels et historiques apparaîtront ici lorsqu’une
                    source sera reliée.
                  </span>
                </div>
              )}
            </section>
            <section className="dte-panel dte-events-panel">
              <div className="dte-panel-title">
                <div>
                  <span>ÉTAT DU MODÈLE</span>
                  <strong>Revue de configuration</strong>
                </div>
                <Shield size={15} />
              </div>
              <div className="dte-review-row">
                <span>
                  <i className={hasSource ? "is-ok" : ""} /> Architecture
                </span>
                <b>{hasSource ? "SOURCE ACTIVE" : "À SÉLECTIONNER"}</b>
              </div>
              <div className="dte-review-row">
                <span>
                  <i
                    className={hasSource && config.wingspan > 0 ? "is-ok" : ""}
                  />{" "}
                  Géométrie
                </span>
                <b>
                  {hasSource && config.wingspan > 0
                    ? "RENSEIGNÉE"
                    : "À RENSEIGNER"}
                </b>
              </div>
              <div className="dte-review-row">
                <span>
                  <i className={materials.length ? "is-ok" : ""} /> Nomenclature
                </span>
                <b>
                  {materials.length ? `${materials.length} LIGNE(S)` : "VIDE"}
                </b>
              </div>
              <button
                className="dte-run-button"
                disabled={!hasSource}
                title={
                  !hasSource
                    ? "Sélectionnez une architecture ou créez une géométrie avant de simuler"
                    : undefined
                }
                onClick={() => {
                  setSection("SIMULATION");
                  stampEvent("Simulation locale demandée");
                  onRunSimulation();
                }}
              >
                <Play size={14} />{" "}
                {hasSource
                  ? "Lancer la simulation"
                  : "Source géométrique requise"}
              </button>
              <small>
                Calcul local uniquement · aucune commande physique ni
                certification.
              </small>
            </section>
          </div>
        </section>
        <aside className="dte-inspector-panel dte-panel">
          <div className="dte-panel-title">
            <div>
              <span>SÉLECTION / INSPECTEUR</span>
              <strong>
                {selectedItem?.label ??
                  (hasSource ? sourceLabel : "Aucune sélection")}
              </strong>
            </div>
            <Settings2 size={15} />
          </div>
          <div className="dte-inspector-tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={inspectorTab === tab ? "is-active" : ""}
                onClick={() => setInspectorTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          {inspectorTab === "SYNTHÈSE" && (
            <div className="dte-detail-content">
              <div className="dte-selected-visual">
                <div className="dte-selection-mark">
                  <Box size={20} />
                </div>
                <span>{selectedItem?.status ?? "SOURCE ACTIVE"}</span>
                <strong>{activeValue}</strong>
              </div>
              <dl>
                <div>
                  <dt>ÉTAT DE SOURCE</dt>
                  <dd>{hasSource ? "DÉCLARÉE" : "À RENSEIGNER"}</dd>
                </div>
                <div>
                  <dt>ENVERGURE</dt>
                  <dd>{hasSource ? `${fmt(config.wingspan)} m` : "—"}</dd>
                </div>
                <div>
                  <dt>MASSE COMPOSANTS</dt>
                  <dd>
                    {hasSource
                      ? `${fmt(config.constructionMassKg ?? materialMass)} kg`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>CHARGE UTILE</dt>
                  <dd>{hasSource ? `${fmt(config.payloadKg)} kg` : "—"}</dd>
                </div>
                <div>
                  <dt>RUN ID</dt>
                  <dd>{runId || "LOCAL"}</dd>
                </div>
                <div>
                  <dt>ÉTAPE DE CONCEPTION</dt>
                  <dd>{evolutionStage + 1} / 5</dd>
                </div>
              </dl>
              <div className="dte-data-note">
                <Sparkles size={14} />
                <span>
                  Les valeurs proviennent de la configuration active; aucun état
                  capteur n’est simulé comme télémétrie réelle.
                </span>
              </div>
            </div>
          )}
          {inspectorTab === "PERFORMANCE" && (
            <div className="dte-detail-content">
              <div className="dte-performance-list">
                <div>
                  <span>VITESSE DE CROISIÈRE DÉCLARÉE</span>
                  <strong>
                    {hasSource ? `${fmt(config.cruiseSpeedKmh, 0)} km/h` : "—"}
                  </strong>
                </div>
                <div>
                  <span>VENT DE RÉFÉRENCE</span>
                  <strong>
                    {hasSource ? `${fmt(config.windSpeedKmh, 0)} km/h` : "—"}
                  </strong>
                </div>
                <div>
                  <span>RÉSERVE BATTERIE</span>
                  <strong>
                    {hasSource
                      ? `${fmt(config.reserveFraction * 100, 0)} %`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>MASSE MAX. DÉCLARÉE</span>
                  <strong>
                    {hasSource ? `${fmt(config.maxTakeoffKg)} kg` : "—"}
                  </strong>
                </div>
                <div>
                  <span>ÉTAT DE SIMULATION</span>
                  <strong>{runId || "AUCUNE EXÉCUTION"}</strong>
                </div>
              </div>
              <button
                className="dte-run-button"
                disabled={!hasSource}
                onClick={onRunSimulation}
              >
                <Play size={14} />{" "}
                {hasSource
                  ? "Calculer la simulation"
                  : "Source géométrique requise"}
              </button>
            </div>
          )}
          {inspectorTab === "MATÉRIAUX" && (
            <div className="dte-detail-content">
              <label className="dte-material-search">
                <Search size={13} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher une référence"
                />
              </label>
              {filteredMaterials.length ? (
                filteredMaterials.map((item) => (
                  <div className="dte-material-row" key={item.id}>
                    <span>
                      <i />
                      {item.label}
                      <small>
                        {item.manufacturer ??
                          item.category ??
                          "Matériau déclaré"}
                      </small>
                    </span>
                    <strong>
                      {(item.massKg * (item.quantity ?? 1)).toFixed(2)} kg
                    </strong>
                  </div>
                ))
              ) : (
                <div className="dte-no-materials">
                  <Box size={20} />
                  <strong>Aucun matériau correspondant</strong>
                  <small>
                    Ajoutez ou sélectionnez des composants dans le projet.
                  </small>
                </div>
              )}
            </div>
          )}
          {workspaceTab === "CONFIG" && (
            <div className="dte-config-fields">
              <label>
                Envergure · m
                <input
                  type="number"
                  min="0"
                  step="0.05"
                  value={config.wingspan}
                  onChange={(event) =>
                    updateNumber("wingspan", event.target.value)
                  }
                />
              </label>
              <label>
                Longueur fuselage · m
                <input
                  type="number"
                  min="0"
                  step="0.05"
                  value={config.fuselageLength}
                  onChange={(event) =>
                    updateNumber("fuselageLength", event.target.value)
                  }
                />
              </label>
              <label>
                Batterie · Wh
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={config.batteryWh}
                  onChange={(event) =>
                    updateNumber("batteryWh", event.target.value)
                  }
                />
              </label>
              <label>
                Charge utile · kg
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={config.payloadKg}
                  onChange={(event) =>
                    updateNumber("payloadKg", event.target.value)
                  }
                />
              </label>
            </div>
          )}
          <div className="dte-inspector-footer">
            <Wrench size={13} /> DONNÉES D’INGÉNIERIE · REVUE HUMAINE REQUISE
          </div>
        </aside>
      </div>
    </main>
  );
}

function CrosshairIcon() {
  return (
    <span className="dte-crosshair-icon" aria-hidden="true">
      <i />
      <b />
    </span>
  );
}
