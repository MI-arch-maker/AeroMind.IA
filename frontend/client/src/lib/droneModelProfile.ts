import type { DroneCatalogDesign } from "./droneCatalog";

export type DroneModelArchitecture = "fixed-wing" | "vtol" | "multirotor";
type DroneModelProfile = Pick<DroneCatalogDesign, "key" | "modelType" | "configuration">;

/** Résout la famille de géométrie à partir de l’architecture déclarée, pas du nombre de moteurs seul. */
export function resolveDroneModelArchitecture(design?: DroneModelProfile): DroneModelArchitecture {
  const key = design?.key ?? "";
  const modelType = design?.modelType ?? "";
  if (key === "vtol" || ["tiltrotor", "tilt-wing", "tail-sitter"].includes(modelType)) return "vtol";
  if (key === "fixed-wing" || ["aile-volante", "voilure-conventionnelle", "planeur", "biplan", "tandem-wing", "canard", "hale-voilure", "male-voilure", "stealth-wing", "blended-pusher"].includes(modelType)) return "fixed-wing";
  return "multirotor";
}

/** Garde un moteur unique pour un avion à hélice, sans effacer la configuration VTOL/multirotor déclarée. */
export function resolveDroneMotorCount(design?: DroneModelProfile): number {
  const architecture = resolveDroneModelArchitecture(design);
  const minimum = architecture === "fixed-wing" ? 1 : 2;
  const defaultCount = architecture === "fixed-wing" ? 1 : 4;
  const declared = Math.round(design?.configuration.motorCount ?? defaultCount);
  return Math.max(minimum, Math.min(declared, 8));
}
