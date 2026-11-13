import { dronePartCatalog, dronePartCategories, type DronePartDefinition } from "./droneParts";
import { manufacturerPartCatalog } from "./manufacturerParts";

/**
 * Bibliothèque de matériels AeroMind.
 *
 * Les références fabricants restent séparées des modules de concept et aucune
 * entrée n'est considérée comme physiquement présente tant qu'elle n'est pas
 * ajoutée à la nomenclature puis identifiée/réceptionnée par l'utilisateur.
 */
export const materialCatalog: DronePartDefinition[] = [
  ...manufacturerPartCatalog,
  ...dronePartCatalog.filter(part => !manufacturerPartCatalog.some(reference => reference.id === part.id)),
];

export const materialLibrarySources = [
  { id: "manufacturer", label: "Fabricants", description: "Références liées à une fiche produit ou technique" },
  { id: "concept", label: "Concepts AeroMind", description: "Modules génériques d'avant-projet à qualifier" },
  { id: "user", label: "Personnalisés", description: "Références saisies dans le projet" },
] as const;

export const materialLibrarySummary = {
  total: materialCatalog.length,
  manufacturer: materialCatalog.filter(item => item.catalogSource === "manufacturer").length,
  concept: materialCatalog.filter(item => (item.catalogSource ?? "concept") === "concept").length,
  categories: dronePartCategories.map(category => ({
    ...category,
    count: materialCatalog.filter(item => item.category === category.id).length,
  })),
};

export function searchMaterialCatalog(query: string, category?: DronePartDefinition["category"] | "all") {
  const normalized = query.trim().toLocaleLowerCase("fr-FR");
  return materialCatalog.filter(item => {
    const haystack = [item.label, item.use, item.manufacturer, item.partNumber, item.category, item.dimensions]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("fr-FR");
    return (category === undefined || category === "all" || item.category === category) && haystack.includes(normalized);
  });
}
