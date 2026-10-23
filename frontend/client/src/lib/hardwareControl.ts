export type DroneConfig = Record<string, unknown>;

/** Garde-fou historique : ce booléen ne rend pas HARDWARE disponible dans AeroMind. */
export function hardwareModeAllowed(_flag: boolean, _firstConfirmation: boolean, _secondConfirmation: boolean) {
  return false;
}

export function coordinateInsideGeofence(latitude: number, longitude: number, fence: {minLatitude:number;maxLatitude:number;minLongitude:number;maxLongitude:number}) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= fence.minLatitude && latitude <= fence.maxLatitude && longitude >= fence.minLongitude && longitude <= fence.maxLongitude;
}

export function isEmergencyStop(payload: {disarmed?:boolean;queue_purged?:number}) { return payload.disarmed === true && (payload.queue_purged ?? 0) >= 0; }

export async function loadActiveDrone(projectId: string, fetcher: typeof fetch = fetch): Promise<DroneConfig | null> {
  try {
    const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/drone`, {credentials:"include"});
    if (!response.ok) return null;
    const body = await response.json();
    return body?.config && typeof body.config === "object" ? body.config as DroneConfig : null;
  } catch { return null; }
}

export function subscribeToActiveDrone(projectId: string, onConfig: (config: DroneConfig | null) => void, fetcher: typeof fetch = fetch) {
  let stopped=false;
  const refresh=async()=>{const config=await loadActiveDrone(projectId,fetcher);if(!stopped)onConfig(config);};
  void refresh();
  const channel=typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("aeromind-workspace-sync");
  if(channel) channel.onmessage=(event)=>{if(event.data?.type==="workspace")void refresh();};
  const storageHandler=(event:StorageEvent)=>{if(event.key==="aeromind-blank-workspace-v3")void refresh();};
  if(typeof window!=="undefined")window.addEventListener("storage",storageHandler);
  return ()=>{stopped=true;channel?.close();if(typeof window!=="undefined")window.removeEventListener("storage",storageHandler);};
}

export type VirtualControlMode = "SIMULATION" | "VIRTUAL";
export type VirtualReceipt = {
  id: string;
  revision: number;
  event: string;
  payload: Record<string, unknown>;
  status: string;
  created_at?: string;
  scope: "virtual-only";
  physical_output: false;
};

export type VirtualControlState = {
  mode: VirtualControlMode;
  revision: number;
  virtual_active: boolean;
  armed: boolean;
  stopped: boolean;
  physical_output: false;
  pending_commands: number;
  virtual_geofence: VirtualGeofence;
  setpoint: { position: VirtualPosition | null; heading_deg: number | null };
};

export type VirtualControlResponse = VirtualControlState & {
  receipt?: VirtualReceipt;
  disarmed?: boolean;
  queue_purged?: number;
  hardware_called?: false;
  confirmations_consumed?: boolean;
  confirmations_invalidated?: boolean;
  command_confirmation_consumed?: boolean;
};

export type VirtualGeofence = {
  coordinate_system: "local-virtual-meters";
  origin: string;
  x_m: { min: number; max: number };
  y_m: { min: number; max: number };
  altitude_m: { min: number; max: number };
};

export type VirtualPosition = { x_m: number; y_m: number; altitude_m: number };
export type VirtualAction = { action_id?: string; expected_revision?: number };
export type VirtualCommandInput =
  | ({ command: "position"; x_m: number; y_m: number; altitude_m: number; confirm_command: boolean } & VirtualAction)
  | ({ command: "heading"; heading_deg: number; confirm_command: boolean } & VirtualAction);

/** Repère de démo local : ces valeurs ne sont ni GPS ni un emplacement réel. */
export const VIRTUAL_GEOFENCE: VirtualGeofence = Object.freeze({
  coordinate_system: "local-virtual-meters",
  origin: "synthetic scenario origin; not a geographic coordinate",
  x_m: Object.freeze({ min: -500, max: 500 }),
  y_m: Object.freeze({ min: -500, max: 500 }),
  altitude_m: Object.freeze({ min: 0, max: 120 }),
});

export type LocalVirtualControlState = VirtualControlState & {
  sequence: number;
  journal: readonly VirtualReceipt[];
};
export type LocalVirtualTransition = {
  state: LocalVirtualControlState;
  receipt?: VirtualReceipt;
  error?: string;
};

export function createLocalVirtualControlState(): LocalVirtualControlState {
  return {
    mode: "SIMULATION",
    revision: 0,
    virtual_active: false,
    armed: false,
    stopped: false,
    physical_output: false,
    pending_commands: 0,
    virtual_geofence: VIRTUAL_GEOFENCE,
    setpoint: { position: null, heading_deg: null },
    sequence: 0,
    journal: [],
  };
}

function localReceipt(
  state: LocalVirtualControlState,
  event: string,
  payload: Record<string, unknown>,
  status: string,
): LocalVirtualTransition {
  const receipt: VirtualReceipt = {
    id: `LOCAL-VCTRL-${String(state.sequence + 1).padStart(6, "0")}`,
    revision: state.revision + 1,
    event,
    payload,
    status,
    scope: "virtual-only",
    physical_output: false,
  };
  return {
    state: {
      ...state,
      revision: state.revision + 1,
      sequence: state.sequence + 1,
      journal: [receipt, ...state.journal].slice(0, 100),
    },
    receipt,
  };
}

/** Fonction pure : active uniquement le modèle local du navigateur. */
export function activateLocalVirtual(
  state: LocalVirtualControlState,
  confirmOperator: boolean,
  confirmSafety: boolean,
): LocalVirtualTransition {
  if (!confirmOperator || !confirmSafety) {
    return { state, error: "L’activation VIRTUAL exige les deux confirmations explicites du même opérateur." };
  }
  return localReceipt(
    { ...state, mode: "VIRTUAL", virtual_active: true, armed: false, stopped: false, pending_commands: 0 },
    "virtual_activation",
    { confirm_operator: true, confirm_safety: true },
    "accepted",
  );
}

/** Fonction pure : quitter VIRTUAL désarme toujours le modèle local. */
export function selectLocalSimulation(state: LocalVirtualControlState): LocalVirtualTransition {
  return localReceipt(
    { ...state, mode: "SIMULATION", virtual_active: false, armed: false, pending_commands: 0 },
    "simulation_selected",
    {},
    "accepted",
  );
}

/** Fonction pure : l’armement est séparé de l’activation et requiert à nouveau les deux attestations. */
export function armLocalVirtual(
  state: LocalVirtualControlState,
  confirmOperator: boolean,
  confirmSafety: boolean,
): LocalVirtualTransition {
  if (state.stopped) return { state, error: "Arrêt d’urgence actif : réactivez explicitement VIRTUAL avant tout armement." };
  if (!state.virtual_active || state.mode !== "VIRTUAL") return { state, error: "Activez d’abord le mode VIRTUAL avant l’armement virtuel." };
  if (!confirmOperator || !confirmSafety) return { state, error: "L’armement VIRTUAL exige une nouvelle paire de confirmations explicites." };
  return localReceipt(
    { ...state, armed: true },
    "virtual_arm",
    { confirm_operator: true, confirm_safety: true },
    "accepted",
  );
}

export function validateVirtualCommand(input: VirtualCommandInput): string | null {
  if (!input.confirm_command) return "Confirmez le setpoint courant avant de l’appliquer au modèle virtuel.";
  if (input.command === "position") {
    const position = input;
    if (!Number.isFinite(position.x_m) || !Number.isFinite(position.y_m) || !Number.isFinite(position.altitude_m)) return "Le setpoint position doit contenir des nombres finis.";
    if (position.x_m < VIRTUAL_GEOFENCE.x_m.min || position.x_m > VIRTUAL_GEOFENCE.x_m.max || position.y_m < VIRTUAL_GEOFENCE.y_m.min || position.y_m > VIRTUAL_GEOFENCE.y_m.max) return "Position hors geofence VIRTUAL locale (x/y : −500 à 500 m).";
    if (position.altitude_m < VIRTUAL_GEOFENCE.altitude_m.min || position.altitude_m > VIRTUAL_GEOFENCE.altitude_m.max) return "Altitude virtuelle hors plage (0 à 120 m).";
    return null;
  }
  if (!Number.isFinite(input.heading_deg) || input.heading_deg < 0 || input.heading_deg > 360) return "Cap virtuel hors plage (0 à 360°).";
  return null;
}

/** Fonction pure : applique un setpoint immédiatement au jumeau local, sans transport externe. */
export function applyLocalVirtualCommand(
  state: LocalVirtualControlState,
  input: VirtualCommandInput,
): LocalVirtualTransition {
  if (state.stopped) return { state, error: "Arrêt d’urgence actif : aucune reprise automatique n’est autorisée." };
  if (!state.virtual_active || state.mode !== "VIRTUAL" || !state.armed) return { state, error: "Commande VIRTUAL refusée : activez puis armez explicitement le jumeau." };
  const invalid = validateVirtualCommand(input);
  if (invalid) return { state, error: invalid };
  if (input.command === "position") {
    const { x_m, y_m, altitude_m } = input;
    return localReceipt({ ...state, setpoint: { ...state.setpoint, position: { x_m, y_m, altitude_m } } }, "position", { x_m, y_m, altitude_m }, "applied_virtual");
  }
  return localReceipt({ ...state, setpoint: { ...state.setpoint, heading_deg: input.heading_deg } }, "heading", { heading_deg: input.heading_deg }, "applied_virtual");
}

/** Fonction pure : purge et désarme; seul un nouvel acte d’activation peut reprendre le scénario. */
export function emergencyStopLocalVirtual(state: LocalVirtualControlState): LocalVirtualTransition {
  const purged = state.pending_commands;
  const transition = localReceipt(
    { ...state, mode: "SIMULATION", virtual_active: false, armed: false, stopped: true, pending_commands: 0 },
    "emergency_stop",
    { queue_purged: purged },
    "stopped",
  );
  return { ...transition, state: { ...transition.state, stopped: true } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Transforme les détails FastAPI/Pydantic (chaîne ou tableau) en texte sûr à rendre dans React. */
export function apiDetailMessage(detail: unknown, fallback = "La demande a été refusée."): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map(item => {
      if (typeof item === "string") return item;
      if (!isRecord(item)) return "";
      const message = typeof item.msg === "string" ? item.msg : "Erreur de validation";
      const location = Array.isArray(item.loc)
        ? item.loc.filter((part): part is string | number => typeof part === "string" || typeof part === "number").join(".")
        : "";
      return location ? `${location} : ${message}` : message;
    }).filter(Boolean);
    return messages.length ? messages.join(" — ") : fallback;
  }
  if (isRecord(detail) && typeof detail.message === "string") return detail.message;
  if (isRecord(detail) && isRecord(detail.error) && typeof detail.error.message === "string") return detail.error.message;
  return fallback;
}

export function isVirtualControlResponse(value: unknown): value is VirtualControlResponse {
  if (!isRecord(value)) return false;
  return (value.mode === "SIMULATION" || value.mode === "VIRTUAL")
    && typeof value.revision === "number"
    && typeof value.virtual_active === "boolean"
    && typeof value.armed === "boolean"
    && typeof value.stopped === "boolean"
    && value.physical_output === false;
}

export function hasVirtualControlCapability(value: unknown): boolean {
  return isRecord(value) && value.virtual_control === true;
}
