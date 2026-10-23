import { z } from "zod";
import type { ConceptConfig, InstalledMaterial } from "./aeroEngine";
import type { DroneCatalogDesign } from "./droneCatalog";

export const renderModes = ["R1", "R2", "R3", "R4", "R5", "R6"] as const;
export type RenderMode = (typeof renderModes)[number];
export const renderModeLabels: Record<RenderMode, string> = {
  R1: "3D Paramétrique",
  R2: "3D Manipulation directe",
  R3: "Blueprint 2D",
  R4: "Sections & Profils",
  R5: "Vue éclatée (assemblage)",
  R6: "Comparaison variantes",
};
export const renderThemes = ["studio-pro", "avionics-hud", "blueprint"] as const;
export type RenderTheme = (typeof renderThemes)[number];
export const renderThemeLabels: Record<RenderTheme, string> = {
  "studio-pro": "Studio Pro",
  "avionics-hud": "Avionics HUD",
  blueprint: "Blueprint",
};
export const renderLayouts = ["immersive", "cad", "operational"] as const;
export type RenderLayout = (typeof renderLayouts)[number];
export const renderLayoutLabels: Record<RenderLayout, string> = {
  immersive: "Viewport immersif",
  cad: "CAO trois zones",
  operational: "Tableau compact",
};

const finite = z.number().finite();
const vector3 = z.object({ x: finite, y: finite, z: finite });
export const aircraftParameterSchema = z.object({
  version: z.literal(1),
  wing: z.object({
    spanM: finite.positive(), rootChordM: finite.positive(), tipChordM: finite.positive(),
    sweepDeg: finite, dihedralDeg: finite, tipTwistDeg: finite,
    airfoilRoot: z.string().min(1), airfoilTip: z.string().min(1),
    stations: z.array(z.object({ spanFraction: finite.min(0).max(1), chordM: finite.positive(), twistDeg: finite, airfoil: z.string().min(1) })).min(2),
  }),
  fuselage: z.object({ lengthM: finite.positive(), maxDiameterM: finite.positive(), noseRatio: finite.min(0).max(1), tailRatio: finite.min(0).max(1) }),
  horizontalTail: z.object({ spanM: finite.positive(), rootChordM: finite.positive(), sweepDeg: finite, armM: finite.positive() }),
  verticalTail: z.object({ heightM: finite.positive(), rootChordM: finite.positive(), sweepDeg: finite }),
  propulsion: z.object({ type: z.string().min(1), position: vector3, staticThrustN: finite.nonnegative() }),
  components: z.array(z.object({ id: z.string().min(1), type: z.string().min(1), name: z.string().min(1), massKg: finite.nonnegative(), position: vector3 })),
});
export type AircraftParameters = z.infer<typeof aircraftParameterSchema>;

const positive = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
const numberOr = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function migrateAircraftParameters(config: ConceptConfig, profile?: DroneCatalogDesign, materials: InstalledMaterial[] = []): AircraftParameters {
  const source = profile?.configuration ?? {};
  const span = positive(config.wingspan ?? source.wingspan, 4.2);
  const chord = positive(config.chord ?? source.chord, 0.5);
  const length = positive(config.fuselageLength ?? source.fuselageLength, 1.8);
  const motorCount = Math.max(1, Math.round(numberOr(config.motorCount ?? source.motorCount, 1)));
  const stations = [
    { spanFraction: 0, chordM: chord, twistDeg: 0, airfoil: "NACA2412" },
    { spanFraction: 0.5, chordM: chord * 0.82, twistDeg: numberOr((config as ConceptConfig & { tipTwistDeg?: number }).tipTwistDeg, 0), airfoil: "NACA2412" },
    { spanFraction: 1, chordM: chord * 0.62, twistDeg: numberOr((config as ConceptConfig & { tipTwistDeg?: number }).tipTwistDeg, 0), airfoil: "NACA2412" },
  ];
  return aircraftParameterSchema.parse({
    version: 1,
    wing: { spanM: span, rootChordM: chord, tipChordM: chord * 0.62, sweepDeg: 4, dihedralDeg: 3, tipTwistDeg: stations[2].twistDeg, airfoilRoot: "NACA2412", airfoilTip: "NACA2412", stations },
    fuselage: { lengthM: length, maxDiameterM: Math.max(0.08, chord * 0.42), noseRatio: 0.22, tailRatio: 0.28 },
    horizontalTail: { spanM: Math.max(0.2, span * 0.28), rootChordM: Math.max(0.12, chord * 0.46), sweepDeg: 8, armM: Math.max(0.2, length * 0.42) },
    verticalTail: { heightM: Math.max(0.12, chord * 0.8), rootChordM: Math.max(0.12, chord * 0.5), sweepDeg: 12 },
    propulsion: { type: profile?.modelType ?? `${motorCount} moteur(s)`, position: { x: length * 0.42, y: 0, z: 0 }, staticThrustN: Math.max(0, numberOr(config.payloadKg, 0) * 9.81 * 0.5) },
    components: materials.map((part, index) => ({ id: part.id, type: part.category ?? "component", name: part.label, massKg: Math.max(0, part.massKg * (part.quantity ?? 1)), position: { x: numberOr(part.offsetX, (index % 3 - 1) * 0.25), y: 0, z: numberOr(part.offsetY, (index % 2) * 0.12 - 0.06) } })),
  });
}

export function aircraftToConfig(config: ConceptConfig, aircraft: AircraftParameters): ConceptConfig {
  return { ...config, wingspan: aircraft.wing.spanM, chord: aircraft.wing.rootChordM, fuselageLength: aircraft.fuselage.lengthM, propDiameter: Math.max(0.05, aircraft.fuselage.maxDiameterM), renderSchemaVersion: aircraft.version, renderUpdatedAt: new Date().toISOString() } as ConceptConfig;
}

export function validateAircraftMutation(current: AircraftParameters, patch: (draft: AircraftParameters) => AircraftParameters) {
  const candidate = patch(structuredClone(current));
  const parsed = aircraftParameterSchema.safeParse(candidate);
  return parsed.success ? { ok: true as const, value: parsed.data } : { ok: false as const, value: current, message: parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(" · ") };
}
