export function nextLocalSimulationRunId(currentRunId: string): string {
  const sequence = /^SIM-(\d+)$/i.exec(currentRunId.trim())?.[1];
  const current = sequence === undefined ? 0 : Number(sequence);
  const next = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
  return `SIM-${String(next).padStart(3, "0")}`;
}
