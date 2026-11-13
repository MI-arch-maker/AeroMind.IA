import type { RunStatus } from "./types";

export type LabCommand = "START" | "PAUSE" | "RESUME" | "COMPLETE" | "RESET";

export function transitionRunState(
  state: RunStatus,
  command: LabCommand,
): RunStatus {
  switch (command) {
    case "START":
      return state === "ready" || state === "complete" ? "running" : state;
    case "PAUSE":
      return state === "running" ? "paused" : state;
    case "RESUME":
      return state === "paused" ? "running" : state;
    case "COMPLETE":
      return state === "running" ? "complete" : state;
    case "RESET":
      return "ready";
    default: {
      const neverCommand: never = command;
      return neverCommand;
    }
  }
}
