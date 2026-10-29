import { useEffect, useState } from "react";
import { Download, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { normalizeCommandList, recordOf } from "@/lib/labBench";

const STORAGE_KEY = "aeromind.labbench.hardware-config.v1";
type HardwareConfig = {
  manufacturer: string;
  model: string;
  hardwareRevision: string;
  firmwareVersion: string;
  transport: "serial" | "can" | "ethernet";
  connectionAddress: string;
  baudRate: number;
  canNodeId: number;
  actuatorChannel: number;
  commandName: string;
  unit: string;
  minimum: number;
  neutral: number;
  maximum: number;
  maxRate: number;
  allowedCommands: string;
  stopType:
    | "normally-closed"
    | "normally-open"
    | "external-safety-controller"
    | "not-defined";
};
const defaults: HardwareConfig = {
  manufacturer: "AeroMind — émulateur",
  model: "LabBench 01 virtuel",
  hardwareRevision: "VIRTUAL",
  firmwareVersion: "simulation-v1",
  transport: "serial",
  connectionAddress: "virtual://labbench-01",
  baudRate: 115200,
  canNodeId: 1,
  actuatorChannel: 1,
  commandName: "simulate.servo.setpoint",
  unit: "degree",
  minimum: 0,
  neutral: 45,
  maximum: 90,
  maxRate: 1,
  allowedCommands:
    "read.status\nread.temperature\nread.position\nsimulate.servo.setpoint",
  stopType: "not-defined",
};

export function LabBenchHardwareConfig() {
  const [config, setConfig] = useState<HardwareConfig>(defaults);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = recordOf(JSON.parse(raw));
        const next = { ...defaults };
        for (const key of Object.keys(defaults) as Array<
          keyof HardwareConfig
        >) {
          if (key === "allowedCommands") continue;
          if (typeof stored[key] === typeof defaults[key])
            (next as Record<string, unknown>)[key] = stored[key];
        }
        next.allowedCommands = normalizeCommandList(
          stored.allowedCommands,
          defaults.allowedCommands,
        );
        setConfig(next);
        if (typeof stored.savedAt === "string") setSavedAt(stored.savedAt);
      }
    } catch {
      toast.error("Configuration locale illisible", {
        description: "Les valeurs par défaut restent chargées.",
      });
    }
  }, []);
  const set = <K extends keyof HardwareConfig>(
    key: K,
    value: HardwareConfig[K],
  ) => setConfig((current) => ({ ...current, [key]: value }));
  // P2-13 fix: validate allowedCommands against backend MAVLink allowlist.
  // DO_SET_SERVO/DO_SET_RELAY are intentionally excluded (non-weaponized compliance).
  const BACKEND_ALLOWLIST = [
    "COMPONENT_ARM_DISARM", "NAV_TAKEOFF", "NAV_LAND",
    "NAV_RETURN_TO_LAUNCH", "DO_SET_MODE",
    "MISSION_COUNT", "MISSION_ITEM_INT",
  ];
  const _invalidCommands = config.allowedCommands
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => !BACKEND_ALLOWLIST.includes(l) && !l.startsWith("simulate.") && !l.startsWith("read."));
  const allowedCommandsValid = _invalidCommands.length === 0;
  const valid =
    config.manufacturer.trim() &&
    config.model.trim() &&
    config.connectionAddress.trim() &&
    Number.isFinite(config.minimum) &&
    Number.isFinite(config.neutral) &&
    Number.isFinite(config.maximum) &&
    config.minimum < config.neutral &&
    config.neutral < config.maximum &&
    Number.isFinite(config.maxRate) &&
    config.maxRate > 0 &&
    Number.isInteger(config.actuatorChannel) &&
    config.actuatorChannel >= 1 &&
    Number.isFinite(config.baudRate) &&
    config.baudRate > 0 &&
    Number.isInteger(config.canNodeId) &&
    config.canNodeId >= 0 &&
    allowedCommandsValid;  // P2-13: block save if invalid commands present
  const save = () => {
    if (!allowedCommandsValid) {
      toast.error("Commandes non autorisées dans la liste blanche", {
        description: `Retirer: ${_invalidCommands.join(", ")}. Autorisé: COMPONENT_ARM_DISARM, NAV_*, DO_SET_MODE, MISSION_*, simulate.*, read.* (P2-13: DO_SET_SERVO/RELAY exclus — conformité non-armée).`,
      });
      return;
    }
    if (!valid) {
      toast.error("Paramètres incomplets ou incohérents", {
        description:
          "Renseignez fabricant, modèle, interface et des limites cohérentes. Vérifiez-les dans la fiche technique du matériel.",
      });
      return;
    }
    const saved = {
      ...config,
      allowedCommands: config.allowedCommands
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)
        .join("\n"),
      savedAt: new Date().toISOString(),
      physicalOutputEnabled: false,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setSavedAt(saved.savedAt);
      toast.success("Configuration enregistrée sur cet appareil", {
        description:
          "Ceci ne connecte pas l’équipement et n’active aucune sortie physique.",
      });
    } catch {
      toast.error("Stockage local indisponible", {
        description:
          "Le profil reste en mémoire et peut être exporté ; aucune sauvegarde n’est revendiquée.",
      });
    }
  };
  const exportConfig = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schema: "aeromind.labbench-hardware-config.v1",
            config,
            physicalOutputEnabled: false,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aeromind-labbench-hardware-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="lb-panel lb-hw-config">
      <div className="lb-panel-title">
        <Save size={17} />
        <span>Profil du banc virtuel et préparation matérielle</span>
        <small>VIRTUEL · AUCUNE SORTIE PHYSIQUE</small>
      </div>
      <p className="lb-config-intro">
        Le profil par défaut décrit l’émulateur AeroMind, pas un appareil réel.
        Vous pouvez le modifier et l’exporter. Un profil de matériel réel reste
        documentaire : aucune adresse saisie n’ouvre une connexion.
      </p>
      <div className="lb-config-section">
        <h3>Identité et liaison</h3>
        <div className="lb-config-grid">
          <label>
            Fabricant
            <input
              value={config.manufacturer}
              onChange={(e) => set("manufacturer", e.target.value)}
              placeholder="Selon l’étiquette / fiche technique"
            />
          </label>
          <label>
            Modèle
            <input
              value={config.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder="Référence exacte"
            />
          </label>
          <label>
            Révision matériel
            <input
              value={config.hardwareRevision}
              onChange={(e) => set("hardwareRevision", e.target.value)}
              placeholder="Révision"
            />
          </label>
          <label>
            Version firmware
            <input
              value={config.firmwareVersion}
              onChange={(e) => set("firmwareVersion", e.target.value)}
              placeholder="Version vérifiée"
            />
          </label>
          <label>
            Transport
            <select
              value={config.transport}
              onChange={(e) =>
                set("transport", e.target.value as HardwareConfig["transport"])
              }
            >
              <option value="serial">USB / Série</option>
              <option value="can">CAN</option>
              <option value="ethernet">Ethernet</option>
            </select>
          </label>
          <label>
            Port / adresse
            <input
              value={config.connectionAddress}
              onChange={(e) => set("connectionAddress", e.target.value)}
              placeholder="Ex. COM… /dev/… / adresse réseau"
            />
          </label>
          {config.transport === "serial" && (
            <label>
              Débit série (baud, selon fiche technique)
              <input
                type="number"
                min={1}
                value={config.baudRate}
                onChange={(e) => set("baudRate", Number(e.target.value))}
              />
            </label>
          )}
          {config.transport === "can" && (
            <label>
              Identifiant nœud CAN (selon protocole)
              <input
                type="number"
                min={0}
                value={config.canNodeId}
                onChange={(e) => set("canNodeId", Number(e.target.value))}
              />
            </label>
          )}
        </div>
      </div>
      <div className="lb-config-section">
        <h3>Commande structurée de l’actionneur (profil à confirmer)</h3>
        <div className="lb-config-grid">
          <label>
            Nom de commande
            <input
              value={config.commandName}
              onChange={(e) => set("commandName", e.target.value)}
            />
          </label>
          <label>
            Canal / sortie
            <input
              type="number"
              min={1}
              value={config.actuatorChannel}
              onChange={(e) => set("actuatorChannel", Number(e.target.value))}
            />
          </label>
          <label>
            Unité
            <input
              value={config.unit}
              onChange={(e) => set("unit", e.target.value)}
            />
          </label>
          <label>
            Limite minimale
            <input
              type="number"
              value={config.minimum}
              onChange={(e) => set("minimum", Number(e.target.value))}
            />
          </label>
          <label>
            Position neutre
            <input
              type="number"
              value={config.neutral}
              onChange={(e) => set("neutral", Number(e.target.value))}
            />
          </label>
          <label>
            Limite maximale
            <input
              type="number"
              value={config.maximum}
              onChange={(e) => set("maximum", Number(e.target.value))}
            />
          </label>
          <label>
            Variation maximale (unité/s)
            <input
              type="number"
              min={0.001}
              step={0.1}
              value={config.maxRate}
              onChange={(e) => set("maxRate", Number(e.target.value))}
            />
          </label>
          <label className="lb-config-wide">
            Liste blanche — une commande par ligne
            {/* P2-13 fix: validate allowedCommands against backend allowlist */}
            <textarea
              rows={3}
              value={config.allowedCommands}
              onChange={(e) => {
                const value = e.target.value;
                // Validate each line against the backend MAVLink allowlist + simulate/read prefixes
                const BACKEND_ALLOWLIST = [
                  "COMPONENT_ARM_DISARM", "NAV_TAKEOFF", "NAV_LAND",
                  "NAV_RETURN_TO_LAUNCH", "DO_SET_MODE",
                  "MISSION_COUNT", "MISSION_ITEM_INT",
                ];
                const lines = value.split("\n").map(l => l.trim()).filter(Boolean);
                const invalid = lines.filter(
                  l => !BACKEND_ALLOWLIST.includes(l) && !l.startsWith("simulate.") && !l.startsWith("read.")
                );
                if (invalid.length > 0) {
                  console.warn("[LabBenchHardwareConfig] Commandes non autorisées:", invalid);
                }
                set("allowedCommands", value);
              }}
            />
            <small className="text-muted-foreground">
              Autorisé: COMPONENT_ARM_DISARM, NAV_*, DO_SET_MODE, MISSION_*, simulate.*, read.*
              (P2-13: DO_SET_SERVO/DO_SET_RELAY exclus — conformité non-armée)
            </small>
          </label>
          <label>
            Type de circuit d’arrêt déclaré
            <select
              value={config.stopType}
              onChange={(e) =>
                set("stopType", e.target.value as HardwareConfig["stopType"])
              }
            >
              <option value="not-defined">Non défini</option>
              <option value="normally-closed">Contact normalement fermé</option>
              <option value="normally-open">Contact normalement ouvert</option>
              <option value="external-safety-controller">
                Contrôleur de sécurité externe
              </option>
            </select>
          </label>
        </div>
      </div>
      <div className="lb-config-warning">
        <ShieldAlert size={18} />
        <span>
          Ce profil ne modifie pas les bornes du contrôleur virtuel.
          L’activation des essais synthétiques se fait dans le panneau supervisé
          après confirmations humaines. Aucun port série/CAN/Ethernet n’est
          ouvert ; une déclaration d’arrêt n’est pas une preuve physique.
        </span>
      </div>
      <div className="lb-config-actions">
        <button className="lb-primary" onClick={save}>
          Enregistrer le profil local
        </button>
        <button className="lb-secondary" onClick={exportConfig}>
          <Download size={15} />
          Exporter JSON
        </button>
        {savedAt && (
          <small>
            Enregistré le {new Date(savedAt).toLocaleString("fr-FR")} · local
            uniquement
          </small>
        )}
      </div>
    </section>
  );
}
