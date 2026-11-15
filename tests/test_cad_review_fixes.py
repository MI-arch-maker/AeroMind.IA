"""Regression tests for native external-reference and split-face review fixes."""
from __future__ import annotations

import copy
from pathlib import Path

import cadquery as cq
import pytest
from OCP.STEPConstruct import STEPConstruct_ExternRefs
from OCP.TopAbs import TopAbs_IN, TopAbs_ON
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.gp import gp_Pnt

from web import cad_kernel as cad


FIXTURES = Path(__file__).resolve().parents[1] / "fixtures/cad"


def test_native_external_reference_guard_prevents_transfer(monkeypatch):
    # A genuine self-contained STEP passes the text prefilter and native parser.
    # Inject a positive native result to exercise the independent second guard.
    events = []
    native_reader = cad.STEPCAFControl_Reader

    class ReaderSpy:
        def __init__(self):
            self.reader = native_reader()

        def __getattr__(self, name):
            return getattr(self.reader, name)

        def ReadFile(self, path):
            status = self.reader.ReadFile(path)
            events.append("read")
            return status

        def Transfer(self, doc):
            events.append("transfer")
            raise AssertionError("STEPCAF transfer must not follow external references")

    class DetectedExternRefs:
        def __init__(self, session):
            # Validate the real OCP work-session binding, not a fabricated reader.
            self.native = STEPConstruct_ExternRefs(session)
            events.append("construct")

        def LoadExternRefs(self):
            loaded = self.native.LoadExternRefs()
            assert self.native.NbExternRefs() == 0
            events.append("load")
            return loaded

        def NbExternRefs(self):
            events.append("count")
            return 1

    monkeypatch.setattr(cad, "STEPCAFControl_Reader", ReaderSpy)
    monkeypatch.setattr(cad, "STEPConstruct_ExternRefs", DetectedExternRefs, raising=False)
    path = FIXTURES / "inch_units_ap242.step"
    with pytest.raises(cad.CadError, match="External STEP references"):
        cad.import_model(path.read_bytes(), path.name)
    assert events == ["read", "construct", "load", "count"]


def model_for(shape):
    return cad.Model("review-model", "Review solid", {"format": "BREP", "sha256": "review-source"},
                     [cad.Part("part-0000", "Review solid", shape.wrapped, "ti6al4v")])


def test_split_source_face_all_fragments_derived_and_pmi_hidden():
    # U plate: left arm 2 mm, right arm 4 mm, notch x=2..6 / y=2..12.
    plate = cq.Solid.makeBox(10, 12, 2).cut(
        cq.Solid.makeBox(4, 10, 2, pnt=cq.Vector(2, 2, 0)))
    model = model_for(plate)
    part = model.parts[0]
    source_meshes = cad.render_model(model)["parts"][0]["faces"]
    top = next(face for face in source_meshes if abs(face["anchor_mm"][2] - 2) < 1e-8)
    item = cad.add_pmi(model, {"part_id": part.id, "face_id": top["id"],
                               "kind": "flatness", "tolerance_um": 1, "text": "Original top face"})
    assert item["anchor_mm"] == pytest.approx([8.666667, 4.666667, 2], abs=1e-6)
    original_pmi = copy.deepcopy(model.pmi)
    original_ids = list(part.face_ids)

    section = cad.section_model(model, [0, -1, 0], -4)  # keep y >= 4
    output_part = section.parts[0]
    faces = cad.entities(output_part.shape, cad.TopAbs_FACE)
    top_fragments = [(fid, face) for fid, face in zip(output_part.face_ids, faces)
                     if abs(cq.Face(face).Center().z - 2) < 1e-8]
    assert len(top_fragments) == 2
    assert sorted(cq.Face(face).Center().x for _, face in top_fragments) == pytest.approx([1, 8])
    assert all(fid.startswith(f"{top['id']}:section:") and ":fragment:" in fid
               for fid, _ in top_fragments)
    assert top["id"] not in output_part.face_ids
    assert len(set(output_part.face_ids)) == len(output_part.face_ids)
    # The source anchor still lies on the right fragment: halfspace visibility
    # alone must not let its ambiguous source ID point at the left fragment.
    right = next(face for _, face in top_fragments if cq.Face(face).Center().x > 6)
    assert BRepClass_FaceClassifier(right, gp_Pnt(*item["anchor_mm"]), 1e-7).State() in (TopAbs_IN, TopAbs_ON)

    rendered = cad.render_model(section)
    annotation = rendered["pmi"][0]
    assert annotation["visible"] is False
    assert "not reanchored" in annotation["visibility_reason"]
    assert {key: annotation[key] for key in item} == item
    assert section.pmi == original_pmi
    assert model.pmi == original_pmi
    assert part.face_ids == original_ids
    assert cad.integral(part.shape)["volume_mm3"] == pytest.approx(160)
    assert rendered["properties"]["volume_mm3"] == pytest.approx(96)
    assert any("Split source face" in warning for warning in section.warnings)


def test_single_source_fragment_preserves_identity_and_pmi():
    model = model_for(cq.Solid.makeBox(10, 12, 2))
    meshes = cad.render_model(model)["parts"][0]["faces"]
    top = next(face for face in meshes if abs(face["anchor_mm"][2] - 2) < 1e-8)
    item = cad.add_pmi(model, {"part_id": model.parts[0].id, "face_id": top["id"],
                               "kind": "flatness", "tolerance_um": 1, "text": "Unambiguous top face"})
    assert item["anchor_mm"][1] > 1
    section = cad.section_model(model, [0, -1, 0], -1)
    assert section.parts[0].face_ids.count(top["id"]) == 1
    annotation = cad.render_model(section)["pmi"][0]
    assert annotation["visible"] is True
    assert {key: annotation[key] for key in item} == item
    assert section.pmi == model.pmi


def test_ap242_roundtrip_preserves_exact_unicode_names(tmp_path):
    model = model_for(cq.Solid.makeBox(10, 12, 2))
    model.name = "Ensemble usiné — perçages"
    model.parts[0].name = "usinée — perçages"
    path = tmp_path / "unicode-names.step"
    cad.export_ap242(model, path)
    restored = cad.import_model(path.read_bytes(), path.name)
    assert len(restored.parts) == 1
    assert restored.parts[0].name == "usinée — perçages"
    assert [node["name"] for node in restored.assembly if node["parent_id"] is None] == [model.name]
    assert [node["name"] for node in restored.assembly if node.get("part_id")] == ["usinée — perçages"]
