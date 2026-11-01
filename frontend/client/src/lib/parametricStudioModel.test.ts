import { describe, expect, it } from "vitest";
import { defaultConcept } from "./aeroEngine";
import {
  addCustomVariable,
  collectVariableRows,
  evaluateParametricExpression,
  makeParametricSnapshot,
  parseParametricSnapshot,
  removeCustomVariable,
  resolveVariableExpressions,
  setVariableValue,
  updateVariableDefinition,
  variablesFromCsv,
  variablesToCsv,
  type VariableRow,
} from "./parametricStudioModel";

const makeConfig = () => ({
  ...defaultConcept,
  mechanicalTwins: {
    "design-a": { designId: "design-a", sweepDeg: 20, fuselageHeight: 0.3 },
    "design-b": { designId: "design-b", sweepDeg: 35, fuselageHeight: 0.5 },
  },
});

describe("parametricStudioModel", () => {
  it("collecte les dimensions effectives du design actif, pas les valeurs globales du prototype", () => {
    const config = makeConfig();
    const rows = collectVariableRows(config, true, "design-b");
    expect(rows.find(row => row.id === "sweep")?.value).toBe(35);
    expect(rows.find(row => row.id === "max_thickness")?.value).toBe(0.5);
    expect(rows.find(row => row.id === "wingspan")?.value).toBe(config.wingspan);
  });

  it("lie une variable au seul design sélectionné", () => {
    const config = makeConfig();
    const sweep = collectVariableRows(config, true, "design-a").find(row => row.id === "sweep")!;
    const updated = setVariableValue(config, "design-a", sweep, 42);
    expect(updated.mechanicalTwins?.["design-a"].sweepDeg).toBe(42);
    expect(updated.mechanicalTwins?.["design-b"].sweepDeg).toBe(35);
    expect(updated.mechanicalTwin).toBe(config.mechanicalTwin);
  });

  it("résout des expressions arithmétiques sans eval et refuse les appels de fonction", () => {
    expect(evaluateParametricExpression("(#wingspan + 2) * #chord / 2", { wingspan: 10, chord: 3 })).toBe(18);
    expect(() => evaluateParametricExpression("process.exit()", {})).toThrow();
    expect(() => evaluateParametricExpression("1 / 0", {})).toThrow(/zéro/i);
  });

  it("recalcule les variables dépendantes et signale les cycles et valeurs hors plage", () => {
    const rows: VariableRow[] = [
      { id: "wingspan", name: "#wingspan", value: 10, unit: "m", min: 1, max: 100, step: 0.1, type: "length", description: "span", appliesTo: "wingspan" },
      { id: "chord", name: "#chord", value: 3, unit: "m", min: 1, max: 20, step: 0.1, type: "length", description: "chord", appliesTo: "chord" },
      { id: "area", name: "#area", value: 1, unit: "m2", min: 0, max: 100, step: 1, type: "custom", description: "derived", appliesTo: "metadata", expression: "#wingspan * #chord" },
    ];
    expect(resolveVariableExpressions(rows).find(row => row.id === "area")?.value).toBe(30);
    const cycle = resolveVariableExpressions([
      { ...rows[0], expression: "#chord" },
      { ...rows[1], expression: "#wingspan" },
    ]);
    expect(cycle.every(row => Boolean(row.error))).toBe(true);
    const outOfRange = resolveVariableExpressions([rows[0], { ...rows[2], expression: "#wingspan * 1000" }]);
    expect(outOfRange.find(row => row.id === "area")?.error).toMatch(/plage/i);
  });

  it("ajoute, duplique, modifie et retire de vraies définitions persistées", () => {
    const config = makeConfig();
    const added = addCustomVariable(config, "design-a");
    expect(added.config.mechanicalTwins?.["design-a"].customVariables).toContainEqual(added.variable);
    const duplicated = addCustomVariable(added.config, "design-a", added.variable);
    expect(duplicated.variable.id).not.toBe(added.variable.id);
    expect(duplicated.variable.name).not.toBe(added.variable.name);
    const changed = updateVariableDefinition(duplicated.config, "design-a", duplicated.variable.id, { unit: "mm", min: 0, max: 10 });
    expect(changed.mechanicalTwins?.["design-a"].customVariables?.find(v => v.id === duplicated.variable.id)?.unit).toBe("mm");
    const removed = removeCustomVariable(changed, "design-a", duplicated.variable.id);
    expect(removed.mechanicalTwins?.["design-a"].customVariables?.some(v => v.id === duplicated.variable.id)).toBe(false);
    expect(removed.mechanicalTwins?.["design-b"].customVariables).toBeUndefined();
  });

  it("exporte/import CSV avec unités, bornes et champs cités, et refuse un fichier incohérent", () => {
    const config = makeConfig();
    const rows = collectVariableRows(config, true, "design-a");
    const csv = variablesToCsv(rows);
    const parsed = variablesFromCsv(csv);
    expect(parsed).toHaveLength(rows.length);
    expect(parsed.find(v => v.id === "length")?.unit).toBe("m");
    const quoted = variablesToCsv(rows.map(row => row.id === "length" ? { ...row, description: 'Longueur, "principale"\nligne 2' } : row));
    expect(variablesFromCsv(quoted).find(v => v.id === "length")?.description).toBe('Longueur, "principale"\nligne 2');
    const invalidRows = rows.map(row => row.id === "length" ? { ...row, value: row.max + 1 } : row);
    expect(() => variablesFromCsv(variablesToCsv(invalidRows))).toThrow();
  });

  it("échange un snapshot JSON versionné et refuse un format ou une plage invalides", () => {
    const config = makeConfig();
    const rows = collectVariableRows(config, true, "design-a");
    const snapshot = makeParametricSnapshot(config, "design-a", rows);
    expect(parseParametricSnapshot(JSON.stringify(snapshot)).designId).toBe("design-a");
    expect(() => parseParametricSnapshot("{" )).toThrow(/JSON/i);
    expect(() => parseParametricSnapshot(JSON.stringify({ ...snapshot, version: 9 }))).toThrow();
    const invalid = { ...snapshot, variables: [{ ...snapshot.variables[0], value: snapshot.variables[0].max + 1 }] };
    expect(() => parseParametricSnapshot(JSON.stringify(invalid))).toThrow();
  });
});
