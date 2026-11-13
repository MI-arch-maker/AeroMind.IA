import React from "react";
import type { ConceptConfig } from "../lib/aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "../lib/droneCatalog";
import { buildMechanicalModel, transformedPartVertices, type MechanicalModel, type Vec3 } from "../lib/mechanicalTwinGeometry";

type Props = { design: DroneCatalogDesign; construction?: { parts: number; massKg: number }; zoom?: number };
type Orbit = { yaw: number; pitch: number };
type Face = { a: number; b: number; c: number; color: string; opacity: number };
type PreparedPart = { vertices: number[]; faces: Face[] };
type PreparedModel = { parts: PreparedPart[]; center: Vec3; radius: number; faceCount: number };
type ProjectedPath = { d: string; color: string; opacity: number };

const INITIAL_ORBIT: Orbit = { yaw: 35, pitch: 32 };
const DEPTH_BUCKETS = 40;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const radians = (degrees: number) => degrees * Math.PI / 180;

/** Couleur de la pièce éclairée de manière simple, sans prétendre reproduire ses matériaux réels. */
function faceColor(color: string, light: number) {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color);
  if (!hex) return color || "#668b91";
  const value = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join("") : hex[1];
  const amount = [0.22, 0.34, 0.46, 0.58][light];
  const target = [178, 208, 207];
  const rgb = target.map((channel, index) => Math.round(parseInt(value.slice(index * 2, index * 2 + 2), 16) * (1 - amount) + channel * amount));
  return `rgb(${rgb.join(",")})`;
}

/** Une seule transformation locale → monde par modèle, même si plusieurs fiches l'affichent. */
export function prepareMechanicalPreview(model: MechanicalModel): PreparedModel {
  const parts: PreparedPart[] = [];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let faceCount = 0;
  for (const part of model.parts) {
    if (part.hidden || part.opacity === 0 || !part.vertices.length || !part.indices.length) continue;
    const vertices = transformedPartVertices(part);
    const faces: Face[] = [];
    const colors = Array.from({ length: 4 }, (_, light) => faceColor(part.color, light));
    for (let i = 0; i + 2 < part.indices.length; i += 3) {
      const [a, b, c] = part.indices.slice(i, i + 3);
      if (![a, b, c].every(index => Number.isInteger(index) && index >= 0 && index * 3 + 2 < vertices.length)) continue;
      const ax = vertices[a * 3], ay = vertices[a * 3 + 1], az = vertices[a * 3 + 2];
      const ux = vertices[b * 3] - ax, uy = vertices[b * 3 + 1] - ay, uz = vertices[b * 3 + 2] - az;
      const vx = vertices[c * 3] - ax, vy = vertices[c * 3 + 1] - ay, vz = vertices[c * 3 + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const size = Math.hypot(nx, ny, nz);
      if (!Number.isFinite(size) || size < 1e-12) continue;
      for (const index of [a, b, c]) {
        for (let axis = 0; axis < 3; axis++) {
          const value = vertices[index * 3 + axis];
          min[axis] = Math.min(min[axis], value);
          max[axis] = Math.max(max[axis], value);
        }
      }
      // Deux faces : certains maillages importés ne garantissent pas une orientation uniforme.
      const brightness = Math.abs((nx * 0.35 + ny * 0.85 + nz * 0.4) / size);
      const light = clamp(Math.floor(brightness * 4), 0, 3);
      faces.push({ a, b, c, color: colors[light], opacity: clamp(part.opacity ?? 1, 0, 1) });
    }
    faceCount += faces.length;
    parts.push({ vertices, faces });
  }
  if (!Number.isFinite(min[0]) || !Number.isFinite(min[1]) || !Number.isFinite(min[2])) {
    return { parts: [], center: [0, 0, 0], radius: 1, faceCount: 0 };
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2, 0.001);
  return { parts, center, radius, faceCount };
}

/** Projection orthographique autour de Y (lacet) et élévation, suivie d'un cadrage sans déformation. */
export function projectMechanicalPreview(model: PreparedModel, orbit: Orbit): ProjectedPath[] {
  const yaw = radians(orbit.yaw), pitch = radians(orbit.pitch);
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const projected = model.parts.map(part => {
    const points: number[] = [];
    for (let i = 0; i + 2 < part.vertices.length; i += 3) {
      const x = part.vertices[i] - model.center[0], y = part.vertices[i + 1] - model.center[1], z = part.vertices[i + 2] - model.center[2];
      const horizontal = x * cy - z * sy;
      const vertical = -x * sp * sy + y * cp - z * sp * cy;
      const depth = x * cp * sy + y * sp + z * cp * cy;
      points.push(horizontal, vertical, depth);
    }
    for (const face of part.faces) {
      for (const index of [face.a, face.b, face.c]) {
        const x = points[index * 3], y = points[index * 3 + 1];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    return points;
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return [];
  const scale = Math.min(264 / Math.max(maxX - minX, 0.001), 104 / Math.max(maxY - minY, 0.001));
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  const buckets = Array.from({ length: DEPTH_BUCKETS }, () => new Map<string, ProjectedPath>());
  const screenX = (x: number) => (160 + (x - midX) * scale).toFixed(1);
  const screenY = (y: number) => (84 - (y - midY) * scale).toFixed(1);
  model.parts.forEach((part, partIndex) => {
    const points = projected[partIndex];
    for (const face of part.faces) {
      const a = face.a * 3, b = face.b * 3, c = face.c * 3;
      const depth = (points[a + 2] + points[b + 2] + points[c + 2]) / 3;
      if (!Number.isFinite(depth)) continue;
      const area = (points[b] - points[a]) * (points[c + 1] - points[a + 1]) - (points[b + 1] - points[a + 1]) * (points[c] - points[a]);
      if (!Number.isFinite(area) || Math.abs(area) < 1e-12) continue;
      // Les sous-chemins d'un même remplissage doivent avoir le même sens :
      // sinon deux triangles superposés de sens opposés peuvent s'annuler.
      const second = area > 0 ? b : c, third = area > 0 ? c : b;
      const bucket = clamp(Math.floor((depth / model.radius / 2 + 0.5) * DEPTH_BUCKETS), 0, DEPTH_BUCKETS - 1);
      const key = `${face.color}|${face.opacity}`;
      let path = buckets[bucket].get(key);
      if (!path) {
        path = { d: "", color: face.color, opacity: face.opacity };
        buckets[bucket].set(key, path);
      }
      path.d += `M${screenX(points[a])} ${screenY(points[a + 1])}L${screenX(points[second])} ${screenY(points[second + 1])}L${screenX(points[third])} ${screenY(points[third + 1])}Z`;
    }
  });
  // Tri par tranches de profondeur : moins de nœuds DOM pour les nombreuses fiches.
  return buckets.flatMap(bucket => [...bucket.values()]);
}

export function previewOrbitFromKey(orbit: Orbit, key: string): Orbit | null {
  if (key === "Home") return { ...INITIAL_ORBIT };
  if (key === "ArrowLeft") return { ...orbit, yaw: orbit.yaw - 15 };
  if (key === "ArrowRight") return { ...orbit, yaw: orbit.yaw + 15 };
  if (key === "ArrowUp") return { ...orbit, pitch: clamp(orbit.pitch + 10, -80, 80) };
  if (key === "ArrowDown") return { ...orbit, pitch: clamp(orbit.pitch - 10, -80, 80) };
  return null;
}

export function previewOrbitFromDrag(start: Orbit, dx: number, dy: number): Orbit {
  return { yaw: start.yaw + dx * 0.8, pitch: clamp(start.pitch + dy * 0.5, -80, 80) };
}

// WeakMap évite de conserver indéfiniment les conceptions qui quittent les listes.
const preparedCache = new WeakMap<DroneCatalogDesign, { configuration: DroneCatalogDesign["configuration"]; model: MechanicalModel; prepared: PreparedModel; initial: ProjectedPath[] }>();
function previewForDesign(design: DroneCatalogDesign) {
  const previous = preparedCache.get(design);
  if (previous && previous.configuration === design.configuration) return previous;
  const model = buildMechanicalModel(design, design.configuration as ConceptConfig);
  const prepared = prepareMechanicalPreview(model);
  const entry = { configuration: design.configuration, model, prepared, initial: projectMechanicalPreview(prepared, INITIAL_ORBIT) };
  preparedCache.set(design, entry);
  return entry;
}

/** Aucun lien OBJ n'est une preuve que le constructeur utilise ce fichier : il faut une provenance explicite du modèle. */
export function provenanceForModel(model: MechanicalModel) {
  const source = (model as MechanicalModel & { geometrySource?: string }).geometrySource;
  if (source === "obj") return "MAQUETTE OBJ · NON CERTIFIÉE";
  if (model.modelType.startsWith("dessin-utilisateur")) return "GÉOMÉTRIE DES TRAITS · NON CERTIFIÉE";
  return "RECONSTRUCTION PARAMÉTRIQUE · NON CERTIFIÉE";
}

/** Un rapprochement d'import peut transmettre des actifs appartenant à une autre référence. */
function canonicalEngineeringAssets(design: DroneCatalogDesign) {
  const assets = design.engineeringAssets;
  if (!assets) return undefined;
  const canonical = droneCatalog.find(item => item.id === design.id)?.engineeringAssets;
  if (!canonical) return undefined;
  const keys = ["hudSvg", "vectorSvg", "cadSvg", "previewPng", "obj", "stl", "openScad"] as const;
  return keys.every(key => typeof canonical[key] === "string" && canonical[key].length > 0 && assets[key] === canonical[key])
    ? canonical : undefined;
}

/** Vue conceptuelle des faces effectivement retournées par buildMechanicalModel, sans contexte WebGL. */
export function ParametricDronePreview({ design, construction, zoom = 1 }: Props) {
  const preview = React.useMemo(() => previewForDesign(design), [design, design.configuration]);
  const [orbit, setOrbit] = React.useState<Orbit>(INITIAL_ORBIT);
  const drag = React.useRef<{ pointerId: number; x: number; y: number; orbit: Orbit } | null>(null);
  const paths = React.useMemo(() => orbit.yaw === INITIAL_ORBIT.yaw && orbit.pitch === INITIAL_ORBIT.pitch
    ? preview.initial : projectMechanicalPreview(preview.prepared, orbit), [preview, orbit]);
  const visualZoom = clamp(Number.isFinite(zoom) ? zoom : 1, 0.7, 1.8);
  const type = preview.model.modelType;
  const span = preview.model.span;
  const motors = Math.max(1, Math.round(design.configuration.motorCount ?? 1));
  const provenance = provenanceForModel(preview.model);
  const assets = canonicalEngineeringAssets(design);
  const uid = React.useId().replace(/[^a-z0-9_-]/gi, "");
  const grid = `preview-grid-${uid}`;
  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div className="physical-drone-preview legacy-url-drone-image" style={{ touchAction: "none", cursor: "grab", position: "relative" }}
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, orbit };
    }}
    onPointerMove={event => {
      const start = drag.current;
      if (start?.pointerId === event.pointerId) setOrbit(previewOrbitFromDrag(start.orbit, event.clientX - start.x, event.clientY - start.y));
    }}
    onPointerUp={stopDrag} onPointerCancel={stopDrag}
    onLostPointerCapture={() => { drag.current = null; }}>
    <svg className="parametric-drone-preview" style={{ transform: `scale(calc(${visualZoom} * var(--workspace-drone-scale, 1)))`, touchAction: "none" }} viewBox="0 0 320 174" role="img" tabIndex={0}
      aria-label={`${design.label}, ${provenance.toLowerCase()}, ${type}, envergure ${span.toFixed(1)} mètres, ${motors} moteur(s). Glisser pour orbiter ; flèches gauche/droite et haut/bas, Home réinitialise.`}
      onKeyDown={event => {
        const next = previewOrbitFromKey(orbit, event.key);
        if (next) { event.preventDefault(); setOrbit(next); }
      }}>
      <title>Rotation orbitale : glisser ou utiliser les flèches gauche/droite et haut/bas ; Home réinitialise.</title>
      <defs><pattern id={grid} width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="rgba(117,226,220,.13)" strokeWidth=".45" /></pattern></defs>
      <rect width="320" height="174" fill={`url(#${grid})`} opacity=".45" />
      <path d="M160 27V142M30 84H290" className="legacy-svg-axis" />
      <g className="legacy-svg-body" data-preview-faces={preview.prepared.faceCount}>
        {paths.map((path, index) => <path key={index} d={path.d} fill={path.color} fillOpacity={path.opacity} />)}
      </g>
      {paths.length === 0 && <text x="160" y="84" textAnchor="middle" className="legacy-svg-spec">MAQUETTE INDISPONIBLE</text>}
      <path d="M54 145H266M54 141V149M266 141V149" className="legacy-svg-dimension" />
      <text x="18" y="16" className="legacy-svg-label">{provenance}</text>
      <text x="302" y="26" textAnchor="end" className="legacy-svg-label">ORBITE {Math.round(orbit.yaw)}° / {Math.round(orbit.pitch)}°</text>
      <text x="18" y="158" className="legacy-svg-spec">{type.toUpperCase()} · {span.toFixed(1)} M · {motors} MOTEUR{motors > 1 ? "S" : ""}</text>
      {construction && <text x="18" y="169" className="legacy-svg-build">STUDIO · {construction.parts} PIÈCES · {construction.massKg.toFixed(2)} KG</text>}
    </svg>
    {assets && <nav className="parametric-cad-links" aria-label={`Fichiers source de ${design.label}`} onPointerDown={event => event.stopPropagation()}>
      <a href={assets.hudSvg} target="_blank" rel="noreferrer" title="Ouvrir le dessin vectoriel HUD">HUD SVG</a>
      <a href={assets.obj} download title="Télécharger le maillage OBJ">OBJ</a>
      <a href={assets.stl} download title="Télécharger le maillage STL">STL</a>
      <a href={assets.openScad} download title="Télécharger la source paramétrique OpenSCAD">SCAD</a>
    </nav>}
  </div>;
}
