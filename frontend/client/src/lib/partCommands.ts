import {
  clampPartOffset,
  clampPartScale,
  installedPartMassKg,
  isManufacturerReference,
  PART_OFFSET_RANGE,
  PART_SCALE_RANGE,
  type InstalledMaterial,
} from "./aeroEngine";

/**
 * Commandes locales d’édition des pièces installées.
 *
 * Périmètre volontairement limité : ces commandes ne modifient que la position,
 * l’échelle géométrique, la quantité et la présence d’une ligne de nomenclature.
 * Elles n’écrivent jamais dans les champs produit d’une référence constructeur
 * (masse, référence, fournisseur, dimensions, liens) : une donnée fabricant
 * vérifiée reste intacte et traçable.
 */

export const PART_NUDGE_STEP = 3;
export const PART_SCALE_STEP = 0.1;
export const PART_COUNT_MIN = 1;
export const PART_COUNT_MAX = 999;

export type PartCommandKind =
  | "move"
  | "scale"
  | "duplicate"
  | "remove"
  | "quantity"
  | "reset-transform";

export type PartCommand =
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "scale"; id: string; factor: number }
  | { kind: "duplicate"; id: string }
  | { kind: "remove"; id: string }
  | { kind: "quantity"; id: string; quantity: number }
  | { kind: "reset-transform"; id: string };

export type PartCommandOutcome = {
  parts: InstalledMaterial[];
  /** Texte court à afficher à l’utilisateur dans le journal d’atelier. */
  message: string;
  /** Vrai si la nomenclature a effectivement changé. */
  changed: boolean;
  /** Avertissements d’ingénierie à afficher avec le résultat. */
  warnings: string[];
};

const findPart = (parts: InstalledMaterial[], id: string) =>
  parts.find(part => part.id === id);

const replacePart = (
  parts: InstalledMaterial[],
  id: string,
  patch: Partial<InstalledMaterial>
) => parts.map(part => (part.id === id ? { ...part, ...patch } : part));

export const describePartMass = (part: InstalledMaterial) => {
  const mass = installedPartMassKg(part);
  const scale = clampPartScale(part.scale ?? 1);
  if (isManufacturerReference(part)) {
    return {
      massKg: mass,
      label: `${mass.toFixed(3)} kg`,
      detail:
        scale === 1
          ? "Masse produit documentée."
          : "Masse produit documentée conservée : l’échelle ne modifie qu’un affichage de scène.",
      estimated: false,
    };
  }
  return {
    massKg: mass,
    label: `${mass.toFixed(3)} kg`,
    detail:
      scale === 1
        ? "Masse de concept, non mesurée."
        : `Masse de concept estimée à l’échelle ${scale.toFixed(2)} (loi volumique, non mesurée).`,
    estimated: scale !== 1,
  };
};

export const createDuplicateId = (sourceId: string, nonce = Date.now()) =>
  `${sourceId.replace(/-dup\d+$/, "")}-dup${nonce.toString(36)}`;

export function applyPartCommand(
  parts: InstalledMaterial[],
  command: PartCommand,
  options: { nonce?: number } = {}
): PartCommandOutcome {
  const part = findPart(parts, command.id);
  if (!part) {
    return {
      parts,
      changed: false,
      message: "Pièce introuvable : aucune modification appliquée.",
      warnings: [],
    };
  }
  const warnings: string[] = [];

  switch (command.kind) {
    case "move": {
      const offsetX = clampPartOffset((part.offsetX ?? 0) + command.dx);
      const offsetY = clampPartOffset((part.offsetY ?? 0) + command.dy);
      const clamped =
        offsetX !== (part.offsetX ?? 0) + command.dx ||
        offsetY !== (part.offsetY ?? 0) + command.dy;
      if (clamped) {
        warnings.push(
          `Déplacement borné à ±${PART_OFFSET_RANGE.max} % pour rester dans la zone de maquette.`
        );
      }
      return {
        parts: replacePart(parts, part.id, { offsetX, offsetY }),
        changed: offsetX !== (part.offsetX ?? 0) || offsetY !== (part.offsetY ?? 0),
        message: `${part.label} déplacée à ${offsetX.toFixed(1)} % / ${offsetY.toFixed(1)} %.`,
        warnings,
      };
    }
    case "scale": {
      const next = clampPartScale((part.scale ?? 1) * command.factor);
      const changed = next !== clampPartScale(part.scale ?? 1);
      if (!changed) {
        warnings.push(
          `Échelle limitée à ${PART_SCALE_RANGE.min}–${PART_SCALE_RANGE.max}×.`
        );
      }
      const outcome = {
        parts: replacePart(parts, part.id, { scale: next }),
        changed,
        message: `${part.label} à l’échelle ${next.toFixed(2)} (${describePartMass({ ...part, scale: next }).label}).`,
        warnings,
      };
      if (isManufacturerReference(part)) {
        warnings.push(
          "Référence constructeur : l’échelle ne modifie pas la masse produit documentée."
        );
      }
      return outcome;
    }
    case "duplicate": {
      const duplicate: InstalledMaterial = {
        ...part,
        id: createDuplicateId(part.id, options.nonce),
        quantity: 1,
        offsetX: clampPartOffset((part.offsetX ?? 0) + PART_NUDGE_STEP),
        offsetY: clampPartOffset((part.offsetY ?? 0) + PART_NUDGE_STEP),
      };
      const index = parts.findIndex(item => item.id === part.id);
      const next = [...parts];
      next.splice(index + 1, 0, duplicate);
      return {
        parts: next,
        changed: true,
        message: `Copie de ${part.label} ajoutée (${describePartMass(duplicate).label}).`,
        warnings: isManufacturerReference(part)
          ? [
              "Copie d’une référence constructeur : vérifier la quantité réellement prévue avant tout achat ou dossier de fabrication.",
            ]
          : [],
      };
    }
    case "remove": {
      return {
        parts: parts.filter(item => item.id !== part.id),
        changed: true,
        message: `${part.label} retirée de la nomenclature (${describePartMass(part).label} sortis du bilan).`,
        warnings: [],
      };
    }
    case "quantity": {
      const quantity = Number.isFinite(command.quantity)
        ? Math.min(
            PART_COUNT_MAX,
            Math.max(PART_COUNT_MIN, Math.round(command.quantity))
          )
        : 1;
      return {
        parts: replacePart(parts, part.id, { quantity }),
        changed: quantity !== Math.max(1, Math.round(part.quantity ?? 1)),
        message: `${part.label} : ${quantity} × ${part.massKg.toFixed(3)} kg/u.`,
        warnings: [],
      };
    }
    case "reset-transform": {
      return {
        parts: replacePart(parts, part.id, { offsetX: 0, offsetY: 0, scale: 1 }),
        changed:
          (part.offsetX ?? 0) !== 0 ||
          (part.offsetY ?? 0) !== 0 ||
          clampPartScale(part.scale ?? 1) !== 1,
        message: `Position et échelle de ${part.label} réinitialisées.`,
        warnings: [],
      };
    }
    default:
      return {
        parts,
        changed: false,
        message: "Commande inconnue.",
        warnings: [],
      };
  }
}

/** Résumé de masse utilisé par le bilan et l’inspecteur. */
export function summarizeParts(parts: InstalledMaterial[]) {
  const total = parts.reduce((sum, part) => sum + installedPartMassKg(part), 0);
  const scaled = parts.filter(
    part => !isManufacturerReference(part) && clampPartScale(part.scale ?? 1) !== 1
  );
  const manufacturerLines = parts.filter(isManufacturerReference).length;
  return {
    totalMassKg: total,
    lineCount: parts.length,
    manufacturerLines,
    scaledLines: scaled.length,
    note: scaled.length
      ? `${scaled.length} pièce(s) de concept mise(s) à l’échelle : masse estimée, à confirmer.`
      : "Aucune mise à l’échelle de pièce de concept.",
  };
}