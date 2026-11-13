import { Color, Mesh } from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { ConceptConfig } from "./aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "./droneCatalog";
import { hasDroneGeometry } from "./droneSketchGeometry";
import { transformedPartVertices, type MechanicalModel, type MechanicalPart, type Vec3 } from "./mechanicalTwinGeometry";

/** La sélection explicite prime sur un ancien dessin ou un profil transmis périmé. */
export function resolveIddsSource(config: ConceptConfig, activeProfile?: DroneCatalogDesign) {
  const selection = config.engineeringSelection;
  const drawing = hasDroneGeometry(config.customSketch?.strokes);
  const selectionId = selection?.droneId && selection.droneId !== "unselected" ? selection.droneId : undefined;
  if (selection?.source === "custom") return { profile: undefined, usesSketch: drawing };
  if (selectionId && (selection?.source === "catalog" || selection?.source === "industrial")) {
    const profile = activeProfile?.id === selectionId ? activeProfile : droneCatalog.find(item => item.id === selectionId);
    return { profile, usesSketch: false };
  }
  if (drawing) return { profile: undefined, usesSketch: true };
  const legacyId = config.platformProfile && config.platformProfile !== "custom-sketch" ? config.platformProfile : undefined;
  const profile = legacyId
    ? (activeProfile?.id === legacyId ? activeProfile : droneCatalog.find(item => item.id === legacyId))
    : activeProfile;
  return { profile, usesSketch: false };
}

/** Seules les huit références identifiées ont une convention d'axes et d'unités connue.
 * Un profil importé peut hériter par erreur de l'URL de son modèle de rapprochement :
 * ne jamais utiliser cet asset pour une autre identité. */
export function iddsCatalogAsset(design?: DroneCatalogDesign) {
  if (!design) return undefined;
  const canonical = droneCatalog.find(item => item.id === design.id);
  if (!canonical?.id.startsWith("pdf-") || !canonical.engineeringAssets?.obj || canonical.engineeringAssets.obj !== design.engineeringAssets?.obj) return undefined;
  return { url: canonical.engineeringAssets.obj, design: canonical };
}

const categoryFor = (name: string) => /rotor|fan|propeller|motor|nacelle/i.test(name) ? "propulsion"
  : /sensor|canopy/i.test(name) ? "payload"
  : /gear|wheel/i.test(name) ? "landing-gear"
  : /panel/i.test(name) ? "hardware" : "airframe";
const cleanId = (name: string) => name.replace(/[^a-zA-Z0-9_-]+/g, "-");
const finitePositive = (value: number | undefined, fallback: number) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

/** Parse la reconstruction OBJ d'origine : X=longueur, Y=envergure, Z=hauteur en mm.
 * Chaque objet nommé reste sélectionnable, sans inventer de pièces ni surfaces internes. */
export function parseIddsCatalogObj(text: string): MechanicalPart[] {
  const root = new OBJLoader().parse(text);
  const raw: Array<{ name: string; vertices: number[]; color: string }> = [];
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const position = node.geometry.getAttribute("position");
    if (!position || position.count < 3 || position.count % 3 !== 0) return;
    const colors = node.geometry.getAttribute("color");
    let r = 0, g = 0, b = 0;
    const vertices: number[] = [];
    for (let i = 0; i < position.count; i++) {
      vertices.push(position.getY(i) / 1000, position.getZ(i) / 1000, position.getX(i) / 1000);
      if (colors) { r += colors.getX(i); g += colors.getY(i); b += colors.getZ(i); }
    }
    if (!vertices.every(Number.isFinite)) throw new Error("OBJ : coordonnées non finies");
    const color = colors ? `#${new Color(r / position.count, g / position.count, b / position.count).getHexString()}` : "#8b999a";
    raw.push({ name: node.name || `objet-${raw.length + 1}`, vertices, color });
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => material.dispose());
  });
  if (!raw.length) throw new Error("OBJ sans triangles exploitables");
  const bounds = (vertices: number[]) => {
    const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertices.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertices[i + axis]); max[axis] = Math.max(max[axis], vertices[i + axis]);
    }
    return { min, max };
  };
  const globalMin: Vec3 = [Infinity, Infinity, Infinity], globalMax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const item of raw) {
    const { min, max } = bounds(item.vertices);
    for (let axis = 0; axis < 3; axis++) { globalMin[axis] = Math.min(globalMin[axis], min[axis]); globalMax[axis] = Math.max(globalMax[axis], max[axis]); }
  }
  const globalCenter = globalMin.map((value, axis) => (value + globalMax[axis]) / 2);
  const usedIds = new Map<string, number>();
  return raw.map(item => {
    const { min, max } = bounds(item.vertices);
    const center = min.map((value, axis) => (value + max[axis]) / 2);
    const stem = cleanId(item.name) || "objet";
    const count = usedIds.get(stem) ?? 0; usedIds.set(stem, count + 1);
    const vertices = item.vertices.map((value, index) => value - center[index % 3]);
    return {
      id: `asset-${stem}${count ? `-${count + 1}` : ""}`, name: item.name.replace(/^\d+_/, "").replace(/_/g, " "),
      category: categoryFor(item.name), vertices, indices: Array.from({ length: vertices.length / 3 }, (_, index) => index),
      position: center.map((value, axis) => value - globalCenter[axis]) as Vec3,
      rotation: [0, 0, 0], scale: [1, 1, 1], color: item.color, metalness: 0.2, roughness: 0.6, hidden: false,
      size: max.map((value, axis) => value - min[axis]) as Vec3,
    };
  });
}

/** Les cotes modifient l'échelle globale X/Z ; aucun moteur ou détail interne n'est inventé. */
export function buildIddsAssetModel(base: MechanicalModel, source: MechanicalPart[], canonical: DroneCatalogDesign, config: ConceptConfig): MechanicalModel {
  const spanFactor = finitePositive(config.wingspan, canonical.configuration.wingspan ?? 1) / finitePositive(canonical.configuration.wingspan, 1);
  const lengthFactor = finitePositive(config.fuselageLength, canonical.configuration.fuselageLength ?? 1) / finitePositive(canonical.configuration.fuselageLength, 1);
  const parts = source.map(part => {
    const edit = base.settings.edits?.[part.id];
    const offset = edit?.offset ?? [0, 0, 0];
    const rotation = edit?.rotation ?? [0, 0, 0];
    const scale = edit?.scale ?? [1, 1, 1];
    return {
      ...part,
      name: edit?.name?.trim() || part.name,
      color: edit?.color || part.color,
      hidden: edit?.hidden ?? false,
      position: [part.position[0] * spanFactor + offset[0], part.position[1] + offset[1], part.position[2] * lengthFactor + offset[2]] as Vec3,
      rotation: rotation.map(value => value * Math.PI / 180) as Vec3,
      scale: [spanFactor * scale[0], scale[1], lengthFactor * scale[2]] as Vec3,
    };
  });
  // These five profile-material records are placeholders seeded by catalogue selection,
  // not meshes present in the OBJ. Keep explicitly added modules and user parts only.
  const automaticIds = new Set(["fuselage", "wing", "propulsion", "avionics", "payload"].map(suffix => `installed:${canonical.id}-${suffix}`));
  parts.push(...base.parts.filter(part => part.category === "custom" || (part.category === "installed-module" && !automaticIds.has(part.id))));
  let extent = 0.5;
  for (const part of parts) {
    const vertices = transformedPartVertices(part);
    for (let i = 0; i < vertices.length; i += 3) extent = Math.max(extent, Math.abs(vertices[i]) * 2, Math.abs(vertices[i + 1]) * 2, Math.abs(vertices[i + 2]) * 2);
  }
  return { ...base, parts, extent, modelType: "reconstruction-obj-conceptuelle" };
}
