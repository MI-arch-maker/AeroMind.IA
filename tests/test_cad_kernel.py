"""Native OCCT Sprint 1 regression suite. All persistence uses pytest tmp_path."""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import json
import math
import uuid

import cadquery as cq
import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from OCP.BRep import BRep_Builder
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.BRepGProp import BRepGProp
from OCP.BRepPrimAPI import BRepPrimAPI_MakeSphere
from OCP.GProp import GProp_GProps
from OCP.gp import gp_Pnt
from OCP.TopAbs import TopAbs_IN, TopAbs_ON
from OCP.TopoDS import TopoDS_Solid

from web import cad_kernel as cad
from web import cad_api as api
from scripts.generate_cad_evidence import make_placement_doc, make_semantic_doc, write_xde

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures/cad"


def model_for(shape, material="ti6al4v"):
    wrapped = shape.wrapped if isinstance(shape, cq.Shape) else shape.val().wrapped
    return cad.Model(uuid.uuid4().hex, "Analytical solid", {"format": "BREP", "schema": None, "sha256": "test"},
                     [cad.Part("part-0000", "Analytical solid", wrapped, material)])


def brep_bytes(tmp_path, shape):
    path = tmp_path / "source.brep"
    wrapped = shape.wrapped if isinstance(shape, cq.Shape) else shape.val().wrapped
    cad._write_brep(wrapped, path)
    return path.read_bytes()


def cube_bytes(tmp_path):
    return brep_bytes(tmp_path, cq.Solid.makeBox(10, 10, 10))


@pytest.mark.parametrize("shape,expected,center", [
    (cq.Solid.makeBox(10, 10, 10), 1000., [5, 5, 5]),
    (cq.Shape(BRepPrimAPI_MakeSphere(10).Shape()), 4 / 3 * math.pi * 10**3, [0, 0, 0]),
    (cq.Workplane("XY").circle(7).extrude(23), math.pi * 49 * 23, [0, 0, 11.5]),
])
def test_analytical_brep_volume_centroid_mass(shape, expected, center):
    doc = cad.render_model(model_for(shape))
    p = doc["properties"]
    assert p["volume_mm3"] == pytest.approx(expected, rel=1e-10, abs=1e-8)
    assert p["mass_kg"] == pytest.approx(expected * 4430e-9, rel=1e-10)
    assert p["center_of_gravity_mm"] == pytest.approx(center, abs=1e-8)
    assert doc["parts"][0]["properties"]["integration_relative_error_estimate"] <= 1e-8
    assert doc["kernel"]["max_topology_tolerance_mm"] >= 1e-7
    assert doc["kernel"]["mesh_deflection_mm"] == cad.MESH_DEFLECTION_MM


def test_mesh_does_not_determine_properties(monkeypatch):
    model = model_for(cq.Workplane("XY").sphere(10))
    expected = cad.integral(model.parts[0].shape)
    monkeypatch.setattr(cad, "MESH_DEFLECTION_MM", 2.0)
    coarse = cad.render_model(model)
    assert coarse["properties"]["volume_mm3"] == pytest.approx(expected["volume_mm3"], rel=1e-12)


def test_unknown_material_has_no_invented_mass(tmp_path):
    data = cube_bytes(tmp_path)
    model = cad.import_model(data, "unknown.brep")
    doc = cad.render_model(model)
    assert doc["properties"]["volume_mm3"] == pytest.approx(1000)
    assert doc["properties"]["mass_kg"] is None
    assert doc["properties"]["center_of_gravity_mm"] is None
    assert doc["parts"][0]["properties"]["mass_kg"] is None
    assert doc["source"]["sha256"] == sha256(data).hexdigest()
    assert any("interpreted as mm" in w for w in doc["warnings"])


def test_multimaterial_mass_weighted_cog():
    a = cad.Part("a", "Titanium", cq.Solid.makeBox(10, 10, 10).wrapped, "ti6al4v")
    b = cad.Part("b", "Aluminium", cq.Solid.makeBox(10, 10, 10, pnt=cq.Vector(100, 0, 0)).wrapped, "al7075")
    m = cad.Model(uuid.uuid4().hex, "Two-material", {"sha256": "test"}, [a, b])
    p = cad.render_model(m)["properties"]
    assert p["volume_mm3"] == pytest.approx(2000)
    assert p["mass_kg"] == pytest.approx((4430 + 2810) * 1e-6)
    expected_x = (5 * 4430 + 105 * 2810) / (4430 + 2810)
    assert p["center_of_gravity_mm"] == pytest.approx([expected_x, 5, 5])
    assert p["center_of_volume_mm"] == pytest.approx([55, 5, 5])
    b.material_id = None
    assert cad.render_model(m)["properties"]["mass_kg"] is None
    assert cad.render_model(m)["properties"]["center_of_gravity_mm"] is None


def test_cube_halfspace_is_solid_and_source_not_mutated():
    model = model_for(cq.Solid.makeBox(10, 10, 10))
    original_ids = list(model.parts[0].face_ids)
    cut = cad.section_model(model, [2, 0, 0], 5)
    doc = cad.render_model(cut)
    assert doc["section"]["normal"] == [1., 0., 0.]
    assert doc["properties"]["volume_mm3"] == pytest.approx(500, abs=1e-8)
    assert doc["properties"]["center_of_gravity_mm"] == pytest.approx([2.5, 5, 5])
    cad.validate_solids(cut.parts[0].shape)
    caps = [f for f in doc["parts"][0]["faces"] if f["is_section_cap"]]
    assert len(caps) == 1
    assert caps[0]["provenance"]["source_sha256"] == "test"
    assert caps[0]["normals"][0:3] == pytest.approx([1, 0, 0])
    retained = [f["id"] for f in doc["parts"][0]["faces"] if not f["is_section_cap"]]
    assert set(retained).issubset(original_ids)
    assert model.parts[0].face_ids == original_ids
    assert cad.integral(model.parts[0].shape)["volume_mm3"] == pytest.approx(1000)


def test_cap_contains_real_annular_hole():
    tube = model_for(cq.Workplane("XY").circle(10).circle(4).extrude(20))
    cut = cad.section_model(tube, [0, 0, 1], 10)
    doc = cad.render_model(cut)
    assert doc["properties"]["volume_mm3"] == pytest.approx(math.pi * 84 * 10, rel=1e-10)
    faces = cad.entities(cut.parts[0].shape, cad.TopAbs_FACE)
    cap_ids = [fid for fid in cut.parts[0].face_ids if fid in cut.parts[0].caps]
    assert len(cap_ids) == 1
    index = cut.parts[0].face_ids.index(cap_ids[0])
    cap_face = faces[index]
    props = GProp_GProps()
    BRepGProp.SurfaceProperties_s(cap_face, props)
    assert props.Mass() == pytest.approx(math.pi * 84, rel=1e-9)
    # Exact topological face must exclude the centre of the physical bore.
    assert BRepClass_FaceClassifier(cap_face, gp_Pnt(0, 0, 10), 1e-7).State() not in (TopAbs_IN, TopAbs_ON)
    mesh = next(f for f in doc["parts"][0]["faces"] if f["is_section_cap"])
    vertices = np.array(mesh["positions"]).reshape(-1, 3)
    triangles = np.array(mesh["indices"]).reshape(-1, 3)
    barycentres = vertices[triangles].mean(axis=1)
    assert np.linalg.norm(barycentres[:, :2], axis=1).min() > 3.9
    assert vertices[:, 2] == pytest.approx(np.full(len(vertices), 10))
    assert mesh["normals"][0:3] == pytest.approx([0, 0, 1])


def test_fully_removed_and_tangent_parts_are_empty():
    cube = model_for(cq.Solid.makeBox(10, 10, 10))
    for offset in (-1, 0):
        doc = cad.render_model(cad.section_model(cube, [1, 0, 0], offset))
        assert doc["parts"][0]["faces"] == []
        assert doc["properties"]["volume_mm3"] == 0
        assert doc["properties"]["center_of_gravity_mm"] is None
        assert doc["parts"][0]["properties"]["center_of_gravity_mm"] is None
    intact = cad.render_model(cad.section_model(cube, [1, 0, 0], 11))
    assert intact["properties"]["volume_mm3"] == pytest.approx(1000)


@pytest.mark.parametrize("normal,offset", [([0, 0, 0], 0), ([1, 2], 0), ([math.nan, 0, 1], 0),
    ([1, 0, 0], math.inf), ([1e-20, 0, 0], 0), ([1, 0, 0], 1e10)])
def test_invalid_planes_rejected(normal, offset):
    with pytest.raises(cad.CadError):
        cad.section_model(model_for(cq.Solid.makeBox(10, 10, 10)), normal, offset)


def test_reject_face_shell_loose_geometry_and_invalid_solid(tmp_path):
    cube = cq.Solid.makeBox(10, 10, 10)
    with pytest.raises(cad.CadError):
        cad.validate_solids(cube.Faces()[0].wrapped)
    with pytest.raises(cad.CadError):
        cad.validate_solids(cube.Shells()[0].wrapped)
    loose = cq.Face.makePlane(3, 3, basePnt=(50, 0, 0))
    mixed = cq.Compound.makeCompound([cube, loose])
    with pytest.raises(cad.CadError):
        cad.import_model(brep_bytes(tmp_path, mixed), "mixed.brep")
    builder = BRep_Builder()
    invalid = TopoDS_Solid()
    builder.MakeSolid(invalid)  # no shell, no finite volume
    with pytest.raises(cad.CadError):
        cad.validate_solids(invalid)
    with pytest.raises(cad.CadError):
        cad.validate_solids(cube.wrapped.Reversed())


def test_xde_assembly_nested_occurrences_positions_names_world_normals(tmp_path):
    path = tmp_path / "nested.step"
    write_xde(make_placement_doc(), path)
    model = cad.import_model(path.read_bytes(), path.name)
    doc = cad.render_model(model)
    assert len(model.parts) == 2
    assert len(model.assembly) == 5
    assert [p.name for p in model.parts] == ["Reusable cube 10 mm"] * 2
    assert [p["properties"]["center_of_volume_mm"] for p in doc["parts"]] == pytest.approx(np.array([[105, 25, 5], [105, 65, 5]]))
    assert doc["properties"]["volume_mm3"] == pytest.approx(2000)
    nodes = {n["id"]: n for n in doc["assembly"]}
    leaf = next(n for n in model.assembly if n.get("part_id") == "part-0000")
    assert nodes[leaf["parent_id"]]["name"] == "Module occurrence A"
    assert leaf["transform"][3] == pytest.approx(110)
    for part in doc["parts"]:
        center = np.asarray(part["properties"]["center_of_volume_mm"])
        for face in part["faces"]:
            vertices = np.array(face["positions"]).reshape(-1, 3)
            normals = np.array(face["normals"]).reshape(-1, 3)
            tri = np.array(face["indices"]).reshape(-1, 3)
            cross = np.cross(vertices[tri[:, 1]] - vertices[tri[:, 0]], vertices[tri[:, 2]] - vertices[tri[:, 0]])
            assert np.all(np.einsum("ij,ij->i", cross, normals[tri[:, 0]]) > 0)
            assert np.all(np.einsum("ij,ij->i", vertices - center, normals) > 0)


def test_inch_step_units_converted_to_mm():
    path = FIXTURES / "inch_units_ap242.step"
    assert "INCH" in path.read_text()
    model = cad.import_model(path.read_bytes(), path.name)
    doc = cad.render_model(model)
    assert doc["units"] == "mm"
    assert doc["properties"]["volume_mm3"] == pytest.approx(25.4**3, rel=1e-10)
    assert doc["properties"]["center_of_volume_mm"] == pytest.approx([12.7] * 3)


def test_genuine_ap242_header_roundtrip_demo(tmp_path):
    model = cad.demo_model()
    path = tmp_path / "real-ap242.step"
    result = cad.export_ap242(model, path)
    text = path.read_text()
    assert "AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF" in text[:2000]
    assert "APPLICATION_PROTOCOL_DEFINITION" in text
    assert "MANIFOLD_SOLID_BREP" in text
    assert "NEXT_ASSEMBLY_USAGE_OCCURRENCE" in text
    assert result["pmi_exported"] is False
    restored = cad.import_model(path.read_bytes(), path.name)
    assert len(restored.parts) == len(model.parts) == 15
    assert cad.render_model(restored)["properties"]["volume_mm3"] == pytest.approx(cad.render_model(model)["properties"]["volume_mm3"], rel=1e-9)
    assert restored.pmi == []  # export must not claim to include demo PMI
    assert len({p.material_id for p in model.parts}) == 3


def test_semantic_xde_pmi_dimension_tolerance_datum_face_anchors(tmp_path):
    path = tmp_path / "semantic.step"
    write_xde(make_semantic_doc(), path)
    model = cad.import_model(path.read_bytes(), path.name)
    assert model.source["xde_semantic_objects"] == 3
    assert {p["kind"] for p in model.pmi} == {"dimension", "parallelism", "datum"}
    dimension = next(p for p in model.pmi if p["kind"] == "dimension")
    assert dimension["nominal_mm"] == pytest.approx(10)
    assert dimension["upper_tolerance_um"] == pytest.approx(8)
    assert dimension["lower_tolerance_um"] == pytest.approx(5)
    tolerance = next(p for p in model.pmi if p["kind"] == "parallelism")
    assert tolerance["tolerance_um"] == pytest.approx(8)
    assert tolerance["datum"] == "A"
    for pmi in model.pmi:
        assert pmi["source"] == "xde"
        assert pmi["source_sha256"] == model.source["sha256"]
        part = next(p for p in model.parts if p.id == pmi["part_id"])
        face = cad.entities(part.shape, cad.TopAbs_FACE)[part.face_ids.index(pmi["face_id"])]
        assert BRepClass_FaceClassifier(face, gp_Pnt(*pmi["anchor_mm"]), 1e-7).State() in (TopAbs_IN, TopAbs_ON)
    assert any("not fully interpreted" in w for w in model.warnings)


def test_user_pmi_validation_and_hole_safe_anchor():
    model = model_for(cq.Workplane("XY").circle(10).circle(4).extrude(20))
    part = model.parts[0]
    doc = cad.render_model(model)
    caplike = next(f for f in doc["parts"][0]["faces"] if f["surface_type"].endswith("Plane"))
    item = cad.add_pmi(model, {"part_id": part.id, "face_id": caplike["id"], "kind": "flatness", "tolerance_um": 1.0, "text": "1 µm"})
    assert math.hypot(*item["anchor_mm"][:2]) >= 4
    assert item["tolerance_um"] == 1
    assert item["source"] == "user"
    with pytest.raises(cad.CadError):
        cad.add_pmi(model, {"part_id": part.id, "face_id": "fake", "kind": "flatness", "tolerance_um": 1})
    for bad in (-1, math.nan, math.inf, True):
        with pytest.raises(cad.CadError):
            cad.add_pmi(model, {"part_id": part.id, "face_id": caplike["id"], "kind": "flatness", "tolerance_um": bad})
    with pytest.raises(cad.CadError):
        cad.add_pmi(model, {"part_id": part.id, "face_id": caplike["id"], "kind": "flatness"})
    with pytest.raises(cad.CadError):
        cad.add_pmi(model, {"part_id": part.id, "face_id": caplike["id"], "kind": "material", "text": ""})


def test_pmi_not_silently_reanchored_by_section():
    model = model_for(cq.Solid.makeBox(10, 10, 10))
    doc = cad.render_model(model)
    selected = next(f for f in doc["parts"][0]["faces"] if abs(f["anchor_mm"][0] - 10) < 1e-8)
    item = cad.add_pmi(model, {"part_id": model.parts[0].id, "face_id": selected["id"], "kind": "dimension", "tolerance_um": .5, "text": "Source anchor"})
    result = cad.render_model(cad.section_model(model, [1, 0, 0], 5))
    assert result["pmi"][0]["anchor_mm"] == item["anchor_mm"]
    assert result["pmi"][0]["visible"] is False
    assert result["pmi"][0]["face_id"] == item["face_id"]


def test_restart_persistence_face_identity_material_and_pmi(tmp_path):
    data = cube_bytes(tmp_path)
    model = cad.import_model(data, "../../untrusted.brep")
    cad.assign_materials(model, {model.parts[0].id: "al7075"})
    item = cad.add_pmi(model, {"part_id": model.parts[0].id, "face_id": model.parts[0].face_ids[0], "kind": "material", "text": "Al7075 nominal; lot TBD"})
    root = tmp_path / "store"
    first = cad.CadStore(root)
    first.save_new("alice", model, data)
    second = cad.CadStore(root)
    loaded = second.load("alice", model.id)
    assert loaded.source == model.source
    assert loaded.parts[0].face_ids == model.parts[0].face_ids
    assert loaded.parts[0].material_id == "al7075"
    assert loaded.pmi == model.pmi
    assert loaded.pmi[0]["anchor_mm"] == item["anchor_mm"]
    a, b = cad.render_model(model), cad.render_model(loaded)
    assert a["properties"] == b["properties"]
    assert [(f["id"], f["anchor_mm"]) for f in a["parts"][0]["faces"]] == [(f["id"], f["anchor_mm"]) for f in b["parts"][0]["faces"]]
    with pytest.raises(FileNotFoundError):
        second.load("bob", model.id)
    assert not (tmp_path / "untrusted.brep").exists()


def test_store_rejects_traversal_symlinks_and_source_tampering(tmp_path):
    store = cad.CadStore(tmp_path / "store")
    for bad in ("../escape", "/etc/passwd", "demo", "x" * 32):
        with pytest.raises(cad.CadError):
            store.load("alice", bad)
    data = cube_bytes(tmp_path)
    model = cad.import_model(data, "x.brep")
    store.save_new("alice", model, data)
    directory = store._directory("alice", model.id)
    (directory / "source.bin").write_bytes(data + b"tamper")
    with pytest.raises(cad.CadError, match="integrity"):
        store.load("alice", model.id)
    (directory / "source.bin").unlink()
    (directory / "source.bin").symlink_to(tmp_path / "source.brep")
    with pytest.raises(cad.CadError, match="Unsafe"):
        store.load("alice", model.id)
    linked = tmp_path / "linked"
    linked.symlink_to(store.root)
    with pytest.raises(cad.CadError, match="Unsafe"):
        cad.CadStore(linked).load("alice", model.id)


@pytest.fixture
def client(tmp_path, monkeypatch):
    store = cad.CadStore(tmp_path / "api-storage")
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[api.get_store] = lambda: store
    def identity(cookie, authorization):
        token = cookie or authorization
        if token in {"alice", "Bearer alice"}:
            return {"id": "alice", "role": "user"}
        if token == "Bearer bob":
            return {"id": "bob", "role": "user"}
        if token == "visitor":
            return {"id": "visitor", "role": "visitor"}
        return None
    monkeypatch.setattr(api, "current_user", identity)
    with TestClient(app) as test_client:
        yield test_client, store


def test_api_public_routes_fixed_demo_and_no_public_upload(client, tmp_path):
    tc, store = client
    assert tc.get("/api/cad/capabilities").json()["step_export"]["pmi"] is False
    assert len(tc.get("/api/cad/materials").json()["materials"]) == 3
    demo = tc.get("/api/cad/demo")
    assert demo.status_code == 200
    assert len(demo.json()["parts"]) == 15
    assert tc.post("/api/cad/demo/section", json={"normal": [0, 1, 0], "offset_mm": 0, "model_id": "arbitrary"}).status_code == 422
    assert tc.post("/api/cad/demo/section", json={"normal": [0, 0, 0], "offset_mm": 0}).status_code == 422
    cut = tc.post("/api/cad/demo/section", json={"normal": [0, 1, 0], "offset_mm": 0})
    assert cut.status_code == 200
    assert any(f["is_section_cap"] for p in cut.json()["parts"] for f in p["faces"])
    upload = tc.post("/api/cad/imports", files={"file": ("x.brep", cube_bytes(tmp_path))})
    assert upload.status_code == 401
    assert not store.root.exists()
    step = tc.get("/api/cad/demo/step")
    assert step.status_code == 200
    assert "AP242_MANAGED_MODEL" in step.text[:2000]
    assert step.headers["x-cad-pmi-export"] == "false"


def test_api_owner_isolation_material_pmi_and_restart(client, tmp_path):
    tc, store = client
    auth = {"Authorization": "Bearer alice"}
    response = tc.post("/api/cad/imports", files={"file": ("../../cube.brep", cube_bytes(tmp_path))}, headers=auth)
    assert response.status_code == 201, response.text
    doc = response.json()
    assert doc["properties"]["mass_kg"] is None
    model_id = doc["model_id"]
    path = f"/api/cad/models/{model_id}"
    assert tc.get(path).status_code == 401
    assert tc.get(path, headers={"Authorization": "Bearer bob"}).status_code == 404
    assert tc.post(path + "/section", json={"normal": [1, 0, 0], "offset_mm": 5}, headers={"Authorization": "Bearer bob"}).status_code == 404
    assigned = tc.post(path + "/materials", json={"assignments": {doc["parts"][0]["id"]: "al7075"}}, headers=auth)
    assert assigned.status_code == 200
    assert assigned.json()["properties"]["mass_kg"] == pytest.approx(0.00281)
    body = {"part_id": doc["parts"][0]["id"], "face_id": doc["parts"][0]["faces"][0]["id"], "kind": "flatness", "tolerance_um": 1, "text": "1 µm"}
    saved = tc.post(path + "/pmi", json=body, headers=auth)
    assert saved.status_code == 201, saved.text
    assert tc.post(path + "/pmi", json={**body, "anchor_mm": [9, 9, 9]}, headers=auth).status_code == 422
    restored = cad.CadStore(store.root).load("alice", model_id)
    assert restored.pmi[0]["tolerance_um"] == 1
    assert restored.parts[0].material_id == "al7075"
    assert restored.source["sha256"] == sha256(cube_bytes(tmp_path)).hexdigest()


def test_api_cookie_csrf_and_visitor_defense(client, tmp_path):
    tc, store = client
    data = cube_bytes(tmp_path)
    tc.cookies.set("aeromind_session", "alice")
    upload = lambda headers: tc.post("/api/cad/imports", files={"file": ("cube.brep", data)}, headers=headers)
    assert upload({}).status_code == 403
    assert upload({"Origin": "https://attacker.test", "Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert upload({"Authorization": "Bearer alice"}).status_code == 403  # cookie wins; no CSRF bypass
    assert not store.root.exists()
    assert upload({"Origin": "http://testserver", "Sec-Fetch-Site": "same-origin"}).status_code == 201
    tc.cookies.set("aeromind_session", "visitor")
    assert upload({"Origin": "http://testserver"}).status_code == 403


def test_api_size_invalid_and_unsupported_uploads_no_persistence(client, tmp_path, monkeypatch):
    tc, store = client
    auth = {"Authorization": "Bearer alice"}
    assert tc.post("/api/cad/imports", files={"file": ("x.exe", b"data")}, headers=auth).status_code == 415
    assert tc.post("/api/cad/imports", files={"file": ("x.brep", b"not BREP")}, headers=auth).status_code == 422
    assert tc.post("/api/cad/imports", files={"file": ("face.brep", brep_bytes(tmp_path, cq.Solid.makeBox(10, 10, 10).Faces()[0]))}, headers=auth).status_code == 422
    monkeypatch.setattr(cad, "MAX_SOURCE_BYTES", 32)
    assert tc.post("/api/cad/imports", files={"file": ("x.step", b"x" * 33)}, headers=auth).status_code == 413
    assert not store.root.exists()
