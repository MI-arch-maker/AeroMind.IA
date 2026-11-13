export const HOME_VIEW_IDS = [
  "overview",
  "engineering-hub",
  "intelligence-center",
  "requirements",
  "concept",
  "tools",
  "inspector",
  "digital-twin",
  "catalog",
  "satellite-nav",
  "simulation",
  "mission-planner",
  "labbench",
  "live",
  "mission-center",
  "command-center",
  "report",
  "copilot",
  "operations",
  "materials",
  "aero-center",
  "aero-cfd",
  "design-studio",
  "parametric-center",
  "mechanical-center",
  "fleet-maintenance",
  "control-center",
] as const;

export type HomeViewId = (typeof HOME_VIEW_IDS)[number];

const knownHomeViews = new Set<string>(HOME_VIEW_IDS);

/**
 * Resolve a bookmarked/query-string Home view without inventing routes.
 * `tools` and `inspector` are legacy aliases for the Digital Twin Explorer,
 * matching Home's existing navigation behavior.
 */
export function resolveInitialHomeView(search: string, pathname: string): HomeViewId {
  if (pathname === "/engineering-hub") return "engineering-hub";
  if (pathname === "/labbench") return "labbench";

  const requested = new URLSearchParams(search).get("view");
  if (requested === "tools" || requested === "inspector") return "digital-twin";
  if (requested && knownHomeViews.has(requested)) return requested as HomeViewId;
  return "overview";
}
