export type XrayPreset = { cut: number; opacity: Record<string, number>; isolated: string };
export const clampXrayCut = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
export const clampXrayOpacity = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 100));
export function isXrayPartVisible(part: { category: string; position: [number, number, number]; size: [number, number, number]; hidden?: boolean }, cut: number, isolated = "", revealHidden = false) {
  // P2-06 fix: when revealHidden=true, ignore the hidden flag so operators
  // can inspect parts that were deliberately hidden (e.g. wing-spar defects).
  if (!revealHidden && part.hidden) return false;
  if (isolated && part.category !== isolated) return false;
  return part.position[2] <= (clampXrayCut(cut) * 2 - 1) * Math.max(0.5, part.size[2]);
}
export function resetXrayPreset(): XrayPreset { return { cut: 1, opacity: {}, isolated: "" }; }
