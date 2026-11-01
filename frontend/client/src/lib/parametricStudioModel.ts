import { z } from "zod";
import type { ConceptConfig } from "./aeroEngine";
import { mechanicalSettingsSchema } from "./projectSyncStore";
import {
  type ParametricVariableDefinition,
  type MechanicalTwinConfig,
} from "./mechanicalTwinGeometry";

export type VariableRow = ParametricVariableDefinition & { error?: string };

type DefaultVariable = Omit<ParametricVariableDefinition, "value"> & { value: number };

export const DEFAULT_PARAMETRIC_VARIABLES: readonly DefaultVariable[] = [
  { id: "length", name: "#length", value: 10, unit: "m", min: 1, max: 80, step: 0.1, type: "length", description: "Longueur du fuselage", appliesTo: "fuselageLength" },
  { id: "wingspan", name: "#wingspan", value: 15, unit: "m", min: 0.5, max: 120, step: 0.1, type: "length", description: "Envergure totale", appliesTo: "wingspan" },
  { id: "sweep", name: "#sweep", value: 24, unit: "°", min: -10, max: 80, step: 1, type: "angle", description: "Flèche de l’aile", appliesTo: "sweepDeg" },
  { id: "dihedral", name: "#dihedral", value: 3, unit: "°", min: -20, max: 30, step: 0.5, type: "angle", description: "Dièdre de l’aile", appliesTo: "dihedralDeg" },
  { id: "max_thickness", name: "#max_thickness", value: 0.3, unit: "m", min: 0.01, max: 5, step: 0.01, type: "length", description: "Hauteur nominale de section", appliesTo: "fuselageHeight" },
  { id: "chord", name: "#chord", value: 3, unit: "m", min: 0.05, max: 30, step: 0.1, type: "length", description: "Corde de référence", appliesTo: "chord" },
  { id: "thickness_ratio", name: "#thickness_ratio", value: 0.1, unit: "ratio", min: 0.01, max: 0.5, step: 0.01, type: "ratio", description: "Rapport hauteur de section / corde", appliesTo: "fuselageHeight" },
  { id: "winglet_angle", name: "#winglet_angle", value: 45, unit: "°", min: 0, max: 90, step: 1, type: "angle", description: "Métadonnée — ne pilote pas encore le générateur de winglet", appliesTo: "metadata" },
  { id: "motor_count", name: "#motor_count", value: 4, unit: "", min: 1, max: 32, step: 1, type: "count", description: "Nombre de moteurs du concept", appliesTo: "motorCount" },
  { id: "cruise_speed", name: "#cruise_speed", value: 20, unit: "km/h", min: 0, max: 650, step: 1, type: "speed", description: "Vitesse cible de conception", appliesTo: "cruiseSpeedKmh" },
  { id: "altitude", name: "#altitude", value: 100, unit: "m", min: 0, max: 12000, step: 5, type: "length", description: "Altitude de conception", appliesTo: "altitudeM" },
  { id: "fuse_sec3_top", name: "#fuse_sec3_top", value: 1.7, unit: "m", min: 0.05, max: 10, step: 0.05, type: "length", description: "Largeur de section du fuselage", appliesTo: "fuselageWidth" },
];

const variableDefinitionSchema = z.object({
  id: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/),
  name: z.string().min(2).max(80),
  value: z.number().finite(),
  unit: z.string().max(24),
  min: z.number().finite(),
  max: z.number().finite(),
  step: z.number().finite().positive(),
  type: z.string().min(1).max(40),
  description: z.string().max(300),
  appliesTo: z.string().max(100),
  expression: z.string().max(200).optional(),
}).superRefine((variable, context) => {
  if (variable.min > variable.max) context.addIssue({ code: "custom", path: ["min"], message: "La borne minimale dépasse la borne maximale." });
  if (variable.value < variable.min || variable.value > variable.max) context.addIssue({ code: "custom", path: ["value"], message: "La valeur est hors plage." });
  if (!Number.isFinite(variable.step) || variable.step <= 0) context.addIssue({ code: "custom", path: ["step"], message: "Le pas doit être positif." });
});

export const parametricSnapshotSchema = z.object({
  format: z.literal("aeromind-parametric"),
  version: z.literal(1),
  designId: z.string().min(1),
  variables: z.array(variableDefinitionSchema).max(250),
  mechanicalTwin: mechanicalSettingsSchema.optional(),
  concept: z.object({
    wingspan: z.number().finite().positive().optional(),
    chord: z.number().finite().positive().optional(),
    fuselageLength: z.number().finite().positive().optional(),
    motorCount: z.number().finite().positive().optional(),
    cruiseSpeedKmh: z.number().finite().min(0).max(650).optional(),
    altitudeM: z.number().finite().min(0).max(12000).optional(),
  }).optional(),
});
export type ParametricSnapshot = z.infer<typeof parametricSnapshotSchema>;

export function getActiveMechanicalTwin(config: ConceptConfig, designId?: string): MechanicalTwinConfig | undefined {
  if (!designId) return undefined;
  return config.mechanicalTwins?.[designId]
    ?? (config.mechanicalTwin?.designId === designId ? config.mechanicalTwin : undefined);
}

export function updateActiveMechanicalTwin(
  config: ConceptConfig,
  designId: string,
  update: (current: MechanicalTwinConfig) => MechanicalTwinConfig,
): ConceptConfig {
  const current = getActiveMechanicalTwin(config, designId) ?? { designId };
  const next = { ...update(current), designId };
  return {
    ...config,
    mechanicalTwin: config.mechanicalTwin?.designId === designId ? next : config.mechanicalTwin,
    mechanicalTwins: { ...(config.mechanicalTwins ?? {}), [designId]: next },
  };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function collectVariableRows(config: ConceptConfig, hasProject: boolean, designId?: string): VariableRow[] {
  const twin = getActiveMechanicalTwin(config, designId);
  const stored = twin?.customVariables ?? [];
  const storedById = new Map(stored.map(variable => [variable.id, variable]));
  const defaults = DEFAULT_PARAMETRIC_VARIABLES.map(definition => {
    const valueByBinding: Record<string, number | undefined> = {
      fuselageLength: finiteOr(config.fuselageLength, definition.value),
      wingspan: finiteOr(config.wingspan, definition.value),
      chord: finiteOr(config.chord, definition.value),
      motorCount: finiteOr(config.motorCount, definition.value),
      cruiseSpeedKmh: finiteOr(config.cruiseSpeedKmh, definition.value),
      altitudeM: finiteOr(config.altitudeM, definition.value),
      sweepDeg: twin?.sweepDeg,
      dihedralDeg: twin?.dihedralDeg,
      fuselageHeight: twin?.fuselageHeight,
      fuselageWidth: twin?.fuselageWidth,
    };
    let value = hasProject
      ? finiteOr(valueByBinding[definition.appliesTo], definition.value)
      : definition.value;
    if (definition.id === "thickness_ratio") {
      value = hasProject && config.chord > 0
        ? finiteOr(twin?.fuselageHeight, definition.value * config.chord) / config.chord
        : definition.value;
    }
    if (!Number.isFinite(value) || value < definition.min || value > definition.max) value = definition.value;
    const saved = storedById.get(definition.id);
    const savedValue = finiteOr(saved?.value, value);
    const effectiveValue = savedValue >= definition.min && savedValue <= definition.max ? savedValue : value;
    return { ...definition, ...saved, value: effectiveValue } as VariableRow;
  });
  const defaultIds = new Set(DEFAULT_PARAMETRIC_VARIABLES.map(variable => variable.id));
  const custom = stored.filter(variable => !defaultIds.has(variable.id)).map(variable => ({ ...variable })) as VariableRow[];
  return resolveVariableExpressions([...defaults, ...custom]);
}

/** Safely resolves a small arithmetic expression language (no eval, calls, or property access). */
export function evaluateParametricExpression(expression: string, values: Record<string, number>): number {
  const tokens: string[] = [];
  const source = expression.trim();
  let cursor = 0;
  while (cursor < source.length) {
    const match = source.slice(cursor).match(/^\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:([eE][+-]?\d+))?|([#A-Za-z_][#A-Za-z0-9_-]*)|([()+*/-]))/);
    if (!match) throw new Error(`Expression invalide près de « ${source.slice(cursor, cursor + 12)} »`);
    tokens.push(match[1] ? `${match[1]}${match[2] ?? ""}` : match[3] ?? match[4]);
    cursor += match[0].length;
  }
  let position = 0;
  const expressionValue = (): number => {
    let value = term();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const right = term();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const term = (): number => {
    let value = factor();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position++];
      const right = factor();
      if (operator === "/" && right === 0) throw new Error("Division par zéro.");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const factor = (): number => {
    const token = tokens[position++];
    if (token === "-") return -factor();
    if (token === "+") return factor();
    if (token === "(") {
      const value = expressionValue();
      if (tokens[position++] !== ")") throw new Error("Parenthèse fermante manquante.");
      return value;
    }
    if (token === undefined) throw new Error("Expression incomplète.");
    const numeric = Number(token);
    if (Number.isFinite(numeric)) return numeric;
    const key = token.replace(/^#/, "");
    const value = values[key];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Variable inconnue : ${token}`);
    return value;
  };
  const result = expressionValue();
  if (position !== tokens.length || !Number.isFinite(result)) throw new Error("Résultat d’expression non fini ou syntaxe invalide.");
  return result;
}

export function resolveVariableExpressions(rows: VariableRow[]): VariableRow[] {
  const byId = new Map(rows.map(row => [row.id, row]));
  const byName = new Map(rows.map(row => [row.name.replace(/^#/, ""), row]));
  const resolved = new Map<string, number>();
  const visiting = new Set<string>();
  const resolve = (row: VariableRow): number => {
    if (resolved.has(row.id)) return resolved.get(row.id)!;
    if (visiting.has(row.id)) throw new Error(`Dépendance circulaire détectée sur ${row.name}.`);
    visiting.add(row.id);
    let value = row.value;
    if (row.expression?.trim()) {
      const refs = row.expression.match(/#?[A-Za-z_][A-Za-z0-9_-]*/g) ?? [];
      const scope: Record<string, number> = {};
      for (const ref of refs) {
        const key = ref.replace(/^#/, "");
        const dependency = byId.get(key) ?? byName.get(key);
        if (!dependency) throw new Error(`Variable inconnue : ${ref}`);
        scope[key] = resolve(dependency);
      }
      value = evaluateParametricExpression(row.expression, scope);
      if (value < row.min || value > row.max) throw new Error(`${row.name} est hors plage (${row.min}–${row.max}).`);
    }
    if (!Number.isFinite(value) || value < row.min || value > row.max) {
      throw new Error(`${row.name} est hors plage (${row.min}–${row.max}).`);
    }
    visiting.delete(row.id);
    resolved.set(row.id, value);
    return value;
  };
  return rows.map(row => {
    try {
      return { ...row, value: resolve(row), error: undefined };
    } catch (error) {
      visiting.clear();
      return { ...row, error: error instanceof Error ? error.message : "Expression invalide." };
    }
  });
}

function setCustomValue(twin: MechanicalTwinConfig, variable: VariableRow, value: number): MechanicalTwinConfig {
  const customVariables = [...(twin.customVariables ?? [])];
  const index = customVariables.findIndex(candidate => candidate.id === variable.id);
  const { error: _error, ...definition } = variable;
  const nextDefinition: ParametricVariableDefinition = { ...definition, value };
  if (index >= 0) customVariables[index] = nextDefinition;
  else customVariables.push(nextDefinition);
  return { ...twin, customVariables };
}

export function setVariableValue(config: ConceptConfig, designId: string | undefined, variable: VariableRow, value: number): ConceptConfig {
  if (!Number.isFinite(value) || value < variable.min || value > variable.max) return config;
  if (variable.appliesTo === "fuselageLength") return { ...config, fuselageLength: value };
  if (variable.appliesTo === "wingspan") return { ...config, wingspan: value };
  if (variable.appliesTo === "chord") return { ...config, chord: value };
  if (variable.appliesTo === "motorCount") return { ...config, motorCount: Math.round(value) };
  if (variable.appliesTo === "cruiseSpeedKmh") return { ...config, cruiseSpeedKmh: value };
  if (variable.appliesTo === "altitudeM") return { ...config, altitudeM: value };
  if (!designId) return config;
  return updateActiveMechanicalTwin(config, designId, twin => {
    if (variable.appliesTo === "sweepDeg") return { ...twin, sweepDeg: value };
    if (variable.appliesTo === "dihedralDeg") return { ...twin, dihedralDeg: value };
    if (variable.appliesTo === "fuselageHeight") {
      const height = variable.id === "thickness_ratio" ? config.chord * value : value;
      return { ...twin, fuselageHeight: height };
    }
    if (variable.appliesTo === "fuselageWidth") return { ...twin, fuselageWidth: value };
    return setCustomValue(twin, variable, value);
  });
}

export function updateVariableDefinition(config: ConceptConfig, designId: string, variableId: string, patch: Partial<ParametricVariableDefinition>): ConceptConfig {
  return updateActiveMechanicalTwin(config, designId, twin => {
    const customVariables = [...(twin.customVariables ?? [])];
    const index = customVariables.findIndex(variable => variable.id === variableId);
    if (index < 0) return twin;
    customVariables[index] = { ...customVariables[index], ...patch };
    return { ...twin, customVariables };
  });
}

export function addCustomVariable(config: ConceptConfig, designId: string, source?: VariableRow): { config: ConceptConfig; variable: ParametricVariableDefinition } {
  const base = source ?? { id: "custom", name: "#variable", value: 1, unit: "", min: 0, max: 100, step: 0.1, type: "custom" as const, description: "Variable utilisateur", appliesTo: "metadata" };
  const existing = getActiveMechanicalTwin(config, designId)?.customVariables ?? [];
  const id = `var-${makeId()}`;
  const nameRoot = base.name.replace(/^#/, "").replace(/-copy(?:-\d+)?$/, "");
  let name = `${nameRoot}-copy`;
  let suffix = 2;
  while (existing.some(variable => variable.name.replace(/^#/, "") === name)) name = `${nameRoot}-copy-${suffix++}`;
  const variable: ParametricVariableDefinition = { ...base, id, name: `#${name}`, appliesTo: "metadata", expression: undefined };
  const next = updateActiveMechanicalTwin(config, designId, twin => ({ ...twin, customVariables: [...(twin.customVariables ?? []), variable] }));
  return { config: next, variable };
}

export function removeCustomVariable(config: ConceptConfig, designId: string, variableId: string): ConceptConfig {
  return updateActiveMechanicalTwin(config, designId, twin => ({ ...twin, customVariables: (twin.customVariables ?? []).filter(variable => variable.id !== variableId) }));
}

export function makeParametricSnapshot(config: ConceptConfig, designId: string, variables: VariableRow[]): ParametricSnapshot {
  return parametricSnapshotSchema.parse({
    format: "aeromind-parametric",
    version: 1,
    designId,
    variables: variables.map(({ error: _error, ...variable }) => variable),
    mechanicalTwin: getActiveMechanicalTwin(config, designId),
    concept: {
      wingspan: config.wingspan,
      chord: config.chord,
      fuselageLength: config.fuselageLength,
      motorCount: config.motorCount,
      cruiseSpeedKmh: config.cruiseSpeedKmh,
      altitudeM: config.altitudeM,
    },
  });
}

export function parseParametricSnapshot(source: string): ParametricSnapshot {
  if (source.length > 2_000_000) throw new Error("Le fichier dépasse 2 Mo.");
  let raw: unknown;
  try { raw = JSON.parse(source); }
  catch { throw new Error("JSON invalide."); }
  return parametricSnapshotSchema.parse(raw);
}

export function variablesToCsv(variables: VariableRow[]): string {
  const headers = ["id", "name", "value", "unit", "min", "max", "step", "type", "description", "appliesTo", "expression"];
  const validated = variables.map(({ error: _error, ...variable }) => variableDefinitionSchema.parse(variable));
  if (new Set(validated.map(variable => variable.id)).size !== validated.length) throw new Error("Les identifiants de variables doivent être uniques.");
  const quote = (value: string | number | undefined) => {
    const text = value === undefined ? "" : String(value);
    return /[\",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(","), ...validated.map(variable => headers.map(header => quote(variable[header as keyof ParametricVariableDefinition] as string | number | undefined)).join(","))].join("\r\n");
}

export function variablesFromCsv(source: string): ParametricVariableDefinition[] {
  if (source.length > 2_000_000) throw new Error("Le fichier dépasse 2 Mo.");
  const rows = parseCsvRecords(source.replace(/^\uFEFF/, ""));
  if (!rows.length) throw new Error("Le CSV est vide.");
  const headers = rows.shift()!.map(header => header.trim());
  const required = ["id", "name", "value", "unit", "min", "max", "step", "type", "description", "appliesTo"];
  if (required.some(header => !headers.includes(header))) throw new Error("En-têtes CSV manquants. Exigés : id, name, value, unit, min, max, step, type, description, appliesTo.");
  const dataRows = rows.filter(row => row.some(cell => cell.trim() !== ""));
  if (dataRows.length > 250) throw new Error("Le CSV dépasse 250 variables.");
  const parsed = dataRows.map((row, index) => {
    if (row.length !== headers.length) throw new Error(`Nombre de colonnes incorrect à la ligne ${index + 2}.`);
    const record = Object.fromEntries(headers.map((header, column) => [header, row[column]]));
    for (const key of ["value", "min", "max", "step"]) {
      const number = Number(record[key]);
      if (!Number.isFinite(number)) throw new Error(`Valeur numérique invalide pour « ${key} » à la ligne ${index + 2}.`);
      record[key] = number as unknown as string;
    }
    return variableDefinitionSchema.parse(record);
  });
  if (!parsed.length) throw new Error("Le CSV ne contient aucune variable.");
  if (new Set(parsed.map(variable => variable.id)).size !== parsed.length) throw new Error("Le CSV contient des identifiants de variable dupliqués.");
  return parsed;
}

function parseCsvRecords(source: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { record.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      record.push(field); records.push(record); record = []; field = "";
    } else field += char;
  }
  if (quoted) throw new Error("Guillemet CSV non fermé.");
  if (field.length > 0 || record.length > 0) { record.push(field); records.push(record); }
  return records;
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.().replace(/-/g, "") ?? `${Date.now()}${Math.random().toString(36).slice(2, 12)}`;
}
