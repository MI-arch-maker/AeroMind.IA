import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { File } from "node:buffer";
import {
  cadBounds, cadNumber, cadPmiIsVisible, createCadFaceGeometry, createCarbonTextures,
  LatestCadRequest, parsePmiNumbers, preserveCadSource, solidCadApi, validateCadDocument,
  validatePmiInput, validateSectionPlane, type CadDocument, type CadPmiInput,
} from "./solidCad";
import { mergeMechanicalCenter } from "./mechanicalCenterModel";

// A small contract fixture for buffer tests only; no fixture is imported by production UI.
const nativeDocument = (): CadDocument => ({
  model_id: "private-native-model", name: "Pièce B-Rep", units: "mm",
  source: { format: "STEP", schema: "AP242", sha256: "source-sha" }, kernel: "OCCT",
  parts: [{ id: "part:source", name: "Partie native", material_id: null,
    properties: { volume_mm3: 2000, mass_kg: null, center_of_gravity_mm: null },
    faces: [{ id: "native:face:17", positions: [100, 200, 300, 110, 200, 300, 100, 210, 300],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2], anchor_mm: [103, 203, 300],
      surface_type: "Plane", is_section_cap: false }] }],
  assembly: [{ id: "root", parent_id: null, name: "Assemblée" }, { id: "node", parent_id: "root", name: "Occurrence", part_id: "part:source", transform: [1, 0, 0, 999] }],
  properties: { volume_mm3: 2000, mass_kg: null, center_of_gravity_mm: null },
  pmi: [{ id: "pmi-1", part_id: "part:source", face_id: "native:face:17", anchor_mm: [103, 203, 300], kind: "position", text: "Position", tolerance_um: 0.125, source: "xde" }],
  warnings: ["Matériau inconnu"],
});
const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Contrat B-Rep : aucune propriété ni géométrie inventée", () => {
  it("conserve les unités mm et les masses/COG inconnus null", () => {
    const doc = nativeDocument();
    expect(validateCadDocument(doc)).toBe(doc);
    expect(doc.properties.mass_kg).toBeNull();
    expect(doc.properties.center_of_gravity_mm).toBeNull();
    expect(cadNumber(null)).toBe("Inconnue");
    expect(cadNumber(0)).toBe("0");
  });
  it("rejette un document en mètres, un buffer corrompu ou un index hors limites", () => {
    expect(() => validateCadDocument({ ...nativeDocument(), units: "m" } as unknown as CadDocument)).toThrow(/millimètres/);
    const invalid = nativeDocument(); invalid.parts[0].faces[0].positions[0] = NaN;
    expect(() => validateCadDocument(invalid)).toThrow(/Tessellation/);
    const invalidIndex = nativeDocument(); invalidIndex.parts[0].faces[0].indices[2] = 99;
    expect(() => validateCadDocument(invalidIndex)).toThrow(/Tessellation/);
  });
  it("rejette les normales absentes et les identifiants de faces dupliqués", () => {
    const noNormals = nativeDocument(); noNormals.parts[0].faces[0].normals = [];
    expect(() => validateCadDocument(noNormals)).toThrow(/Tessellation/);
    const duplicates = nativeDocument(); duplicates.parts[0].faces.push({ ...duplicates.parts[0].faces[0] });
    expect(() => validateCadDocument(duplicates)).toThrow(/Tessellation/);
  });
  it("accepte une pièce totalement exclue sans créer une forme de remplacement", () => {
    const empty = nativeDocument();
    empty.parts[0].faces = []; empty.parts[0].properties = { volume_mm3: 0, mass_kg: 0, center_of_gravity_mm: null };
    empty.properties = empty.parts[0].properties;
    expect(validateCadDocument(empty).parts[0].faces).toEqual([]);
    expect(cadBounds(empty)).toBeNull();
  });
  it("ne transforme ni ne recentre les positions monde déjà produites par le noyau", () => {
    const doc = nativeDocument(); const face = doc.parts[0].faces[0];
    const geometry = createCadFaceGeometry(face);
    expect(Array.from(geometry.getAttribute("position").array)).toEqual(face.positions);
    expect(Array.from(geometry.getAttribute("normal").array)).toEqual(face.normals);
    expect(Array.from(geometry.index!.array)).toEqual(face.indices);
    expect(Array.from(geometry.getAttribute("uv").array)).toEqual([100, 200, 110, 200, 100, 210]);
    expect(Array.from(geometry.getAttribute("tangent").array).every(Number.isFinite)).toBe(true);
    expect(cadBounds(doc)).toEqual({ min: [100, 200, 300], max: [110, 210, 300], center: [105, 205, 300], span: 10 });
    geometry.dispose();
  });
  it("génère la texture carbone technique avec un repeat physique de 4 mm et espaces colorimétriques distincts", () => {
    const textures = createCarbonTextures(32);
    expect(textures.map).toBeInstanceOf(THREE.DataTexture);
    expect(textures.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(textures.bump.colorSpace).toBe(THREE.NoColorSpace);
    expect(textures.map.repeat.toArray()).toEqual([0.25, 0.25]);
    expect(textures.map.wrapS).toBe(THREE.RepeatWrapping);
    expect(textures.map.image.data).toHaveLength(32 * 32 * 4);
    expect(new Set(Array.from(textures.map.image.data!)).size).toBeGreaterThan(1);
    textures.map.dispose(); textures.bump.dispose();
  });
});

describe("Coupes réelles et préservation de la traçabilité PMI", () => {
  it("normalise la normale sans changer l’offset distance en millimètres", () => {
    expect(validateSectionPlane({ normal: [0, 0, 2], offset_mm: 12.5 })).toEqual({ normal: [0, 0, 1], offset_mm: 12.5 });
    expect(() => validateSectionPlane({ normal: [0, 0, 0], offset_mm: 0 })).toThrow(/non nulle/);
    expect(() => validateSectionPlane({ normal: [1, 0, 0], offset_mm: Infinity })).toThrow(/invalide/);
  });
  it("conserve propriétés de coupe, durée backend, provenance, assemblage et ancrages source", () => {
    const source = nativeDocument();
    const section = { ...nativeDocument(), pmi: [], assembly: [], properties: { volume_mm3: 1000, mass_kg: null, center_of_gravity_mm: null }, warnings: ["Matériau inconnu", "Coupe"], section: { normal: [1, 0, 0] as [number, number, number], offset_mm: 105, elapsed_ms: 78.2 } };
    const combined = preserveCadSource(source, section);
    expect(combined.pmi).toBe(source.pmi);
    expect(combined.pmi[0].anchor_mm).toEqual([103, 203, 300]);
    expect(combined.assembly).toBe(source.assembly);
    expect(combined.source).toBe(source.source);
    expect(combined.properties.volume_mm3).toBe(1000);
    expect(combined.section?.elapsed_ms).toBe(78.2);
    expect(combined.warnings).toEqual(["Matériau inconnu", "Coupe"]);
  });
  it("refuse une coupe d’un modèle ou SHA différent", () => {
    expect(() => preserveCadSource(nativeDocument(), { ...nativeDocument(), model_id: "other" })).toThrow(/autre source/);
    const changedSha = nativeDocument(); changedSha.source.sha256 = "changed";
    expect(() => preserveCadSource(nativeDocument(), changedSha)).toThrow(/autre source/);
  });
  it("ne montre pas une PMI dont l’ancrage a disparu même si l’ID de face est conservé", () => {
    const doc = nativeDocument();
    expect(cadPmiIsVisible(doc, doc.pmi[0])).toBe(true);
    doc.section = { normal: [1, 0, 0], offset_mm: 102, elapsed_ms: 4 };
    expect(cadPmiIsVisible(doc, doc.pmi[0])).toBe(false);
    expect(doc.pmi[0].anchor_mm).toEqual([103, 203, 300]);
    doc.section.offset_mm = 104;
    expect(cadPmiIsVisible(doc, doc.pmi[0])).toBe(true);
    doc.parts[0].faces[0].id = "new-section-face";
    expect(cadPmiIsVisible(doc, doc.pmi[0])).toBe(false);
  });
  it("une face de fermeture de section ne sert pas d’ancrage silencieux", () => {
    const doc = nativeDocument(); doc.parts[0].faces[0].is_section_cap = true;
    expect(cadPmiIsVisible(doc, doc.pmi[0])).toBe(false);
  });
  it("annule la requête précédente et rejette ses réponses même si le transport ignore l’abort", async () => {
    const latest = new LatestCadRequest();
    const old = latest.start();
    let resolve!: (value: string) => void;
    const delayed = new Promise<string>(done => { resolve = done; });
    const commits: string[] = [];
    const pending = delayed.then(value => { if (old.isCurrent()) commits.push(value); });
    const next = latest.start();
    expect(old.signal.aborted).toBe(true);
    resolve("old boolean"); await pending;
    expect(commits).toEqual([]);
    expect(next.isCurrent()).toBe(true);
    latest.cancel();
    expect(next.signal.aborted).toBe(true);
    expect(next.isCurrent()).toBe(false);
  });
  it("reset et changement de modèle invalident tous les tickets déjà délivrés", () => {
    const gate = new LatestCadRequest(); const beforeReset = gate.start(); gate.cancel();
    expect(beforeReset.isCurrent()).toBe(false);
    const newModel = gate.start();
    expect(beforeReset.isCurrent()).toBe(false);
    expect(newModel.isCurrent()).toBe(true);
  });
});

describe("GD&T : tolérances numériques explicites en micromètres", () => {
  it("conserve les fractions de micron sans conversion en mm ni arrondi", () => {
    expect(parsePmiNumbers("15,125", "0,125")).toEqual({ nominal_mm: 15.125, tolerance_um: 0.125 });
    expect(parsePmiNumbers("", "0")).toEqual({ nominal_mm: null, tolerance_um: 0 });
  });
  it.each(["", "NaN", "Infinity", "-1", "8 µm", "undefined", "0x10", "1e10"])("refuse une tolérance invalide %s", value => {
    expect(() => parsePmiNumbers("15", value)).toThrow(/Tolérance/);
  });
  it("valide le lien à la véritable face sans fournir soi-même un ancrage inventé", () => {
    const input: CadPmiInput = { part_id: "part:source", face_id: "native:face:17", kind: "position", nominal_mm: 15, tolerance_um: 8, datum: " A ", text: " Position " };
    const validated = validatePmiInput(input);
    expect(validated.datum).toBe("A"); expect(validated.text).toBe("Position");
    expect(validated).not.toHaveProperty("anchor_mm");
    expect(() => validatePmiInput({ ...input, face_id: "" })).toThrow(/face/);
    expect(() => validatePmiInput({ ...input, tolerance_um: NaN })).toThrow(/tolérance/);
  });
  it("persiste l’ID serveur natif et l’onglet avec le projet sans écraser le dossier documentaire", () => {
    const merged = mergeMechanicalCenter({ solidCadModelId: "owned-model", activeTab: "solid-cad" });
    expect(merged.solidCadModelId).toBe("owned-model");
    expect(merged.activeTab).toBe("solid-cad");
    expect(merged.parts?.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(merged)).solidCadModelId).toBe("owned-model");
  });
});

describe("API CAO propriétaire et démo strictement fixe", () => {
  it("emploie les cookies de session et le CSRF existant pour une vraie section privée", async () => {
    vi.stubGlobal("document", { cookie: "aeromind_lab_csrf=csrf-cookie" });
    const doc = nativeDocument(); doc.section = { normal: [1, 0, 0], offset_mm: 104, elapsed_ms: 42 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(doc)); vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const result = await solidCadApi.section("private/native", false, { normal: [1, 0, 0], offset_mm: 104 }, controller.signal);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cad/models/private%2Fnative/section");
    expect(init.credentials).toBe("include"); expect(init.signal).toBe(controller.signal);
    expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("csrf-cookie");
    expect(JSON.parse(init.body)).toEqual({ normal: [1, 0, 0], offset_mm: 104 });
    expect(result.section?.elapsed_ms).toBe(42);
  });
  it("ne transmet aucun identifiant privé au endpoint public de coupe de démo", async () => {
    const doc = nativeDocument(); doc.section = { normal: [0, 0, 1], offset_mm: 10, elapsed_ms: 4 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(doc)); vi.stubGlobal("fetch", fetchMock);
    await solidCadApi.section("not-public", true, { normal: [0, 0, 1], offset_mm: 10 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cad/demo/section");
    expect(JSON.parse(init.body)).toEqual({ normal: [0, 0, 1], offset_mm: 10 });
    expect(init.body).not.toContain("not-public");
  });
  it("refuse de valider un résultat sans coupe ou calculé sur un autre plan", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(nativeDocument())); vi.stubGlobal("fetch", fetchMock);
    await expect(solidCadApi.section("private", false, { normal: [1, 0, 0], offset_mm: 104 })).rejects.toThrow(/plan calculé/);
    const wrongPlane = nativeDocument(); wrongPlane.section = { normal: [0, 1, 0], offset_mm: 104, elapsed_ms: 2 };
    fetchMock.mockResolvedValue(jsonResponse(wrongPlane));
    await expect(solidCadApi.section("private", false, { normal: [1, 0, 0], offset_mm: 104 })).rejects.toThrow(/plan calculé/);
  });
  it("uploade réellement STEP via FormData sans fabriquer la géométrie et sans casser le boundary multipart", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(nativeDocument(), 201)); vi.stubGlobal("fetch", fetchMock);
    const file = new File(["ISO-10303-21;"], "source.step") as unknown as globalThis.File;
    await solidCadApi.import(file);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cad/imports"); expect(init.method).toBe("POST"); expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(Blob);
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });
  it("refuse les extensions non natives avant toute requête réseau", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(solidCadApi.import(new File(["mesh"], "fake.stl") as unknown as globalThis.File)).rejects.toThrow(/STEP/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("une erreur d’auth ou de noyau reste une erreur explicite, sans maillage de secours", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401)); vi.stubGlobal("fetch", fetchMock);
    await expect(solidCadApi.model("owned")).rejects.toThrow(/Authentification/);
    fetchMock.mockResolvedValue(jsonResponse({}, 503));
    await expect(solidCadApi.demo()).rejects.toThrow(/Aucune géométrie/);
    fetchMock.mockResolvedValue(new Response("<html>SPA</html>", { headers: { "Content-Type": "text/html" } }));
    await expect(solidCadApi.demo()).rejects.toThrow(/non JSON/);
  });
  it("envoie les densités par ID de matériau et les PMI en µm au backend propriétaire", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(nativeDocument()))); vi.stubGlobal("fetch", fetchMock);
    await solidCadApi.assignMaterials("owned", { "part:source": "ti6al4v" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/cad/models/owned/materials");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ assignments: { "part:source": "ti6al4v" } });
    await solidCadApi.addPmi("owned", { part_id: "part:source", face_id: "native:face:17", kind: "position", nominal_mm: null, tolerance_um: 0.125, datum: "A", text: "Position" });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/cad/models/owned/pmi");
    expect(JSON.parse(init.body).tolerance_um).toBe(0.125);
    expect(JSON.parse(init.body)).not.toHaveProperty("anchor_mm");
  });
});
