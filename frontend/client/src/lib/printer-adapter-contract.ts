/**
 * Extension contract for future printer integrations.
 * This contract intentionally exposes no print/start/stop/motion/G-code method.
 * Implementations must be selected and verified for the exact printer/firmware.
 */
export type PrinterTransport = "usb-serial" | "octoprint-http" | "moonraker-http" | "vendor-api" | "other";
export type PrinterConnectionState = "draft" | "unsupported" | "disconnected" | "connected-readonly" | "error";

export type PrinterConnectionProfile = {
  id: string;
  displayName: string;
  manufacturer: string;
  model: string;
  transport: PrinterTransport;
  endpoint?: string;
  state: PrinterConnectionState;
  createdAt: string;
};

export type PrinterReadOnlyStatus = {
  model?: string;
  firmware?: string;
  state?: string;
  buildVolumeMm?: { x: number; y: number; z: number };
};

/** Future protocol adapter contract. It can only perform read-only discovery/status queries. */
export interface ReadOnlyPrinterAdapter {
  readonly transport: PrinterTransport;
  supports(profile: PrinterConnectionProfile): boolean;
  probe(profile: PrinterConnectionProfile, signal?: AbortSignal): Promise<PrinterReadOnlyStatus>;
  disconnect(): Promise<void>;
}
