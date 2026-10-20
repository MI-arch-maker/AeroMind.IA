import { z } from "zod";
import type { ConceptConfig, InstalledMaterial } from "./aeroEngine";

export const componentCategorySchema = z.enum(["airframe", "propulsion", "energy", "avionics", "payload", "landing-gear", "safety", "hardware"]);
export const componentSourceStatusSchema = z.enum(["verified", "partial", "estimate", "missing"]);

export const componentInstanceSchema = z.object({
  id: z.string().min(1), definition_id: z.string().min(1), label: z.string().min(1),
  category: componentCategorySchema, quantity: z.number().int().positive(), mass_kg: z.number().nonnegative(),
  x_m: z.number(), y_m: z.number(), z_m: z.number(), rotation_deg: z.number(), scale: z.number().positive(),
  source_status: componentSourceStatusSchema, interfaces: z.array(z.string()),
});
export type ComponentInstance = z.infer<typeof componentInstanceSchema>;

export const connectionSchema = z.object({
  id: z.string().min(1), source_component_id: z.string().min(1), target_component_id: z.string().min(1),
  kind: z.enum(["mechanical", "power", "control", "data", "mount"]),
  status: z.enum(["defined", "verified", "warning", "invalid"]), connector: z.string().nullable().optional(), notes: z.string().nullable().optional(),
});
export type EngineeringConnection = z.infer<typeof connectionSchema>;

export const validationIssueSchema = z.object({
  id: z.string().min(1), severity: z.enum(["info", "warning", "error"]), code: z.string().min(1), message: z.string().min(1),
  component_ids: z.array(z.string()), status: z.enum(["open", "resolved", "not_checked"]),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const bomLineSchema = z.object({
  component_id: z.string().min(1), reference: z.string().min(1), designation: z.string().min(1), quantity: z.number().int().positive(),
  unit_mass_kg: z.number().nonnegative().nullable().optional(), total_mass_kg: z.number().nonnegative().nullable().optional(),
  data_status: componentSourceStatusSchema, notes: z.string().nullable().optional(),
});
export type BomLine = z.infer<typeof bomLineSchema>;

export const engineeringDocumentSchema = z.object({
  schema: z.literal("aeromind-engineering-document"), schema_version: z.literal(1), project_id: z.string().min(1), prototype_version_id: z.string().min(1),
  architecture: z.string().min(1), units: z.literal("SI"), geometry: z.record(z.string(), z.number()),
  parameters: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])), component_instances: z.array(componentInstanceSchema),
  connections: z.array(connectionSchema), validation: z.array(validationIssueSchema), bom: z.array(bomLineSchema), assumptions: z.array(z.string()), missing_data: z.array(z.string()), created_at: z.string().nullable().optional(),
}).superRefine((value, context) => {
  const ids = value.component_instances.map(item => item.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["component_instances"], message: "Les identifiants de composants doivent être uniques." });
  const connectionIds = value.connections.map(item => item.id);
  if (new Set(connectionIds).size !== connectionIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["connections"], message: "Les identifiants de connexions doivent être uniques." });
});
export type EngineeringDocument = z.infer<typeof engineeringDocumentSchema>;

const categoryFor = (part: InstalledMaterial): ComponentInstance["category"] => part.category ?? "airframe";
const sourceFor = (part: InstalledMaterial): ComponentInstance["source_status"] => part.manufacturerDataStatus ?? (part.catalogSource === "manufacturer" ? "partial" : "estimate");

export function engineeringDocumentFromConfig(config: ConceptConfig, projectId: string, prototypeVersionId: string): EngineeringDocument {
  const components = (config.installedMaterials ?? []).map((part, index) => ({
    id: part.id, definition_id: part.partNumber ?? part.id, label: part.label, category: categoryFor(part), quantity: Math.max(1, Math.round(part.quantity ?? 1)),
    mass_kg: Math.max(0, part.massKg), x_m: (part.offsetX ?? 0) / 100, y_m: (part.offsetY ?? 0) / 100, z_m: 0, rotation_deg: 0, scale: part.scale ?? 1,
    source_status: sourceFor(part), interfaces: (part.interfaces ?? "").split(",").map(value => value.trim()).filter(Boolean),
  } satisfies ComponentInstance));
  const bom = components.map(item => ({ component_id: item.id, reference: item.definition_id, designation: item.label, quantity: item.quantity, unit_mass_kg: item.mass_kg, total_mass_kg: item.mass_kg * item.quantity, data_status: item.source_status, notes: item.source_status === "estimate" ? "Masse indicative — validation requise" : null } satisfies BomLine));
  const missingData = components.filter(item => item.source_status !== "verified").map(item => `${item.id}: données source ${item.source_status}`);
  return engineeringDocumentSchema.parse({
    schema: "aeromind-engineering-document", schema_version: 1, project_id: projectId, prototype_version_id: prototypeVersionId,
    architecture: config.modelType ?? config.airframe ?? "custom", units: "SI",
    geometry: { wingspan_m: config.wingspan, chord_m: config.chord, fuselage_length_m: config.fuselageLength, propeller_diameter_m: config.propDiameter },
    parameters: { battery_wh: config.batteryWh, payload_kg: config.payloadKg, max_takeoff_mass_kg: config.maxTakeoffKg, motor_count: config.motorCount ?? 1 },
    component_instances: components, connections: [], validation: [], bom, assumptions: ["Document de conception paramétrique — pas une CAO industrielle."], missing_data: missingData, created_at: null,
  });
}

export async function saveEngineeringDocument(document: EngineeringDocument) {
  const response = await fetch(`/api/engineering-documents/prototype-versions/${document.prototype_version_id}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(document) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.detail ?? `Engineering document error (${response.status})`);
  return body as { id: string; prototype_version_id: string; document: EngineeringDocument; created_at: string | null };
}

export async function getEngineeringDocument(prototypeVersionId: string) {
  const response = await fetch(`/api/engineering-documents/prototype-versions/${prototypeVersionId}`, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.detail ?? `Engineering document error (${response.status})`);
  return engineeringDocumentSchema.parse(body.document);
}
