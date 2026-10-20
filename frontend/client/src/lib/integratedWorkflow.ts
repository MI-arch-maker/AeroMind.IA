import { z } from "zod";
import type { ConceptConfig, Requirement, SimulationResult } from "./aeroEngine";

export const workflowStateSchema = z.enum(["draft", "ready_to_simulate", "running", "completed", "failed"]);
export type WorkflowState = z.infer<typeof workflowStateSchema>;

export const canonicalConfigSchema = z.object({
  wingspan_m: z.number().positive(),
  chord_m: z.number().positive(),
  fuselage_length_m: z.number().positive(),
  propeller_diameter_m: z.number().positive(),
  battery_wh: z.number().nonnegative(),
  payload_kg: z.number().nonnegative(),
  cruise_speed_mps: z.number().positive(),
  wind_speed_mps: z.number().nonnegative(),
  altitude_m: z.number().nonnegative(),
  max_takeoff_mass_kg: z.number().positive(),
  motor_count: z.number().int().positive(),
  airframe: z.string().min(1),
  design_name: z.string().min(1),
});
export type CanonicalConfig = z.infer<typeof canonicalConfigSchema>;

export const workflowScenarioSchema = z.object({
  scenario_id: z.string().min(1),
  name: z.string().min(1),
  coordinate_frame: z.enum(["ENU", "NED"]),
  altitude_unit: z.literal("m"),
  speed_unit: z.literal("m/s"),
  waypoints: z.array(z.object({ id: z.string(), x_m: z.number(), y_m: z.number(), z_m: z.number().nonnegative(), speed_mps: z.number().positive() })).min(2),
  seed: z.number().int().nonnegative(),
});
export type WorkflowScenario = z.infer<typeof workflowScenarioSchema>;

export const workflowPrototypeSchema = z.object({
  id: z.string(), prototype_id: z.string(), project_id: z.string(), name: z.string(), version: z.string(),
  status: workflowStateSchema, input_sha256: z.string().length(64), engine_version: z.string(),
  config: canonicalConfigSchema, requirements: z.array(z.record(z.string(), z.unknown())), sketch: z.record(z.string(), z.unknown()), created_at: z.string().nullable(),
});
export type WorkflowPrototype = z.infer<typeof workflowPrototypeSchema>;

export const workflowRunSchema = z.object({
  id: z.string(), prototype_version_id: z.string(), prototype_id: z.string(), project_id: z.string(),
  status: workflowStateSchema, engine_version: z.string(), scenario: workflowScenarioSchema,
  result: z.object({ evidence_level: z.literal("synthetic_demo"), physical_solver_connected: z.literal(false), hardware_control: z.literal(false), engine_version: z.string(), scenario_id: z.string(), input_units: z.record(z.string(), z.string()), distance_m: z.number(), duration_s: z.number(), waypoint_count: z.number(), seed: z.number(), note: z.string() }).nullable(),
  report_id: z.string().nullable(), replay_of: z.string().nullable(), created_at: z.string().nullable(), completed_at: z.string().nullable(),
});
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

export function toCanonicalConfig(config: ConceptConfig): CanonicalConfig {
  return canonicalConfigSchema.parse({
    wingspan_m: config.wingspan,
    chord_m: config.chord,
    fuselage_length_m: config.fuselageLength,
    propeller_diameter_m: config.propDiameter,
    battery_wh: config.batteryWh,
    payload_kg: config.payloadKg,
    cruise_speed_mps: config.cruiseSpeedKmh / 3.6,
    wind_speed_mps: config.windSpeedKmh / 3.6,
    altitude_m: config.altitudeM,
    max_takeoff_mass_kg: config.maxTakeoffKg,
    motor_count: config.motorCount ?? 1,
    airframe: config.airframe ?? "fixed-wing",
    design_name: config.designName ?? "AeroMind prototype",
  });
}

export function demoScenario(): WorkflowScenario {
  return workflowScenarioSchema.parse({
    scenario_id: "demo-route-01", name: "Vol stationnaire puis route", coordinate_frame: "ENU", altitude_unit: "m", speed_unit: "m/s", seed: 42,
    waypoints: [
      { id: "takeoff", x_m: 0, y_m: 0, z_m: 12, speed_mps: 4 },
      { id: "route-1", x_m: 20, y_m: 8, z_m: 18, speed_mps: 8 },
      { id: "return", x_m: 0, y_m: 0, z_m: 12, speed_mps: 6 },
    ],
  });
}

async function workflowRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/workflow${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.detail ?? body?.error?.message ?? `Workflow API error (${response.status})`);
  return body as T;
}

export function registerPrototype(input: { projectId: string; name: string; version: string; config: ConceptConfig; requirements: Requirement[]; sketch?: Record<string, unknown> }) {
  const payload = { project_id: input.projectId, name: input.name, version: input.version, config: toCanonicalConfig(input.config), requirements: input.requirements.map(item => ({ id: item.id, value: item.value, unit: item.unit })), sketch: input.sketch ?? {} };
  return workflowRequest<WorkflowPrototype>("/prototypes", { method: "POST", body: JSON.stringify(payload) }).then(workflowPrototypeSchema.parse);
}

export function executeWorkflowRun(prototypeVersionId: string, scenario = demoScenario()) {
  workflowScenarioSchema.parse(scenario);
  return workflowRequest<WorkflowRun>(`/prototypes/${prototypeVersionId}/runs`, { method: "POST", body: JSON.stringify(scenario) }).then(workflowRunSchema.parse);
}

export function createWorkflowReport(runId: string) {
  return workflowRequest<{ id: string; report: Record<string, unknown> }>(`/runs/${runId}/report`, { method: "POST" });
}

export function replayWorkflowRun(runId: string) {
  return workflowRequest<WorkflowRun>(`/runs/${runId}/replay`, { method: "POST" }).then(workflowRunSchema.parse);
}

export function localWorkflowEvidence(result: SimulationResult) {
  return { evidence_level: "synthetic_demo" as const, physical_solver_connected: false as const, engine_version: result.engineVersion, note: "Résultat local illustratif; aucun solveur physique réel." };
}
