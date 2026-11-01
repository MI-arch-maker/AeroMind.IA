import { z } from "zod";
import type { ConceptConfig } from "./aeroEngine";
import type { MechanicalTwinConfig } from "./mechanicalTwinGeometry";
import { mechanicalSettingsSchema } from "./projectSyncStore";

export const mechanicalDraftKey = (designId: string) =>
  `aeromind-mechanical-draft-v1:${encodeURIComponent(designId)}`;
const documentSchema = z.object({
  schema: z.literal("aeromind-mechanical-twin"),
  version: z.literal(1),
  designId: z.string().min(1),
  configuration: z.object({
    wingspan: z.number().finite().positive().max(40),
    fuselageLength: z.number().finite().positive().max(30),
    chord: z.number().finite().positive().max(30),
    propDiameter: z.number().finite().positive().max(30),
    motorCount: z.number().int().min(1).max(12).optional(),
    mechanicalTwin: mechanicalSettingsSchema.optional(),
  }),
});
export function serializeMechanicalTwin(
  designId: string,
  config: ConceptConfig,
  settings: MechanicalTwinConfig,
): string {
  return JSON.stringify(
    {
      schema: "aeromind-mechanical-twin",
      version: 1,
      designId,
      configuration: {
        wingspan: config.wingspan,
        fuselageLength: config.fuselageLength,
        chord: config.chord,
        propDiameter: config.propDiameter,
        motorCount: config.motorCount,
        mechanicalTwin: settings,
      },
    },
    null,
    2,
  );
}
export function parseMechanicalTwin(text: string, designId: string) {
  if (text.length > 2_000_000)
    throw new Error("Ce fichier dépasse la limite de 2 Mo.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Fichier JSON illisible.");
  }
  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      "La configuration mécanique n’est pas conforme au format AeroMind v1.",
    );
  if (
    parsed.data.designId !== designId ||
    (parsed.data.configuration.mechanicalTwin &&
      parsed.data.configuration.mechanicalTwin.designId !== designId)
  )
    throw new Error(
      "Ce brouillon appartient à une autre cellule. Sélectionnez d’abord le drone correspondant.",
    );
  return parsed.data.configuration;
}
export function applyMechanicalTwinDocument(
  current: ConceptConfig,
  text: string,
  designId: string,
): ConceptConfig {
  const next = parseMechanicalTwin(text, designId);
  const saved = { ...current.mechanicalTwins };
  if (next.mechanicalTwin) saved[designId] = next.mechanicalTwin;
  else delete saved[designId];
  return {
    ...current,
    ...next,
    mechanicalTwin: next.mechanicalTwin,
    mechanicalTwins: saved,
  };
}
