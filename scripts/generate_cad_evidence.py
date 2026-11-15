#!/usr/bin/env python3
"""Reproduce Sprint 1 native B-Rep/AP242 fixtures and computational evidence.

Run from repository root: .venv/bin/python scripts/generate_cad_evidence.py
No database, production storage, browser, server, or external service is used.
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import argparse
import json
import math
import platform
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from web import cad_kernel as cad
import cadquery as cq
import OCP
from OCP.gp import gp_Ax1, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec
from OCP.IFSelect import IFSelect_RetDone
from OCP.Interface import Interface_Static
from OCP.STEPCAFControl import STEPCAFControl_Writer
from OCP.STEPControl import STEPControl_AsIs
from OCP.TCollection import TCollection_ExtendedString, TCollection_HAsciiString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_LabelSequence
from OCP.TopLoc import TopLoc_Location
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_Dimension, XCAFDoc_GeomTolerance, XCAFDoc_Datum
from OCP.XCAFDimTolObjects import (XCAFDimTolObjects_DimensionObject,
    XCAFDimTolObjects_GeomToleranceObject, XCAFDimTolObjects_DatumObject,
    XCAFDimTolObjects_DimensionType_Size_Thickness, XCAFDimTolObjects_GeomToleranceType_Parallelism)


def write_xde(doc, destination, unit="MM"):
    writer = STEPCAFControl_Writer()
    assert Interface_Static.SetCVal_s("write.step.schema", "AP242DIS")
    assert Interface_Static.SetCVal_s("write.step.unit", unit)
    writer.SetNameMode(True)
    writer.SetDimTolMode(True)
    assert writer.Transfer(doc, STEPControl_AsIs)
    assert writer.Write(str(destination)) == IFSelect_RetDone
    assert "AP242_MANAGED_MODEL" in Path(destination).read_text()[:2000]
    Interface_Static.SetCVal_s("write.step.unit", "MM")


def _translation(x, y, z):
    t = gp_Trsf()
    t.SetTranslation(gp_Vec(x, y, z))
    return TopLoc_Location(t)


def make_placement_doc():
    doc = cad._new_xde()
    tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    empty = cq.Compound.makeCompound([]).wrapped
    root = tool.AddShape(empty, True)
    TDataStd_Name.Set_s(root, TCollection_ExtendedString("Fixture root"))
    sub = tool.NewShape()
    tool.SetShape(sub, cq.Compound.makeCompound([]).wrapped)
    TDataStd_Name.Set_s(sub, TCollection_ExtendedString("Nested module"))
    cube = tool.AddShape(cq.Solid.makeBox(10, 10, 10).wrapped, False)
    TDataStd_Name.Set_s(cube, TCollection_ExtendedString("Reusable cube 10 mm"))
    t = gp_Trsf()
    t.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), math.pi / 2)
    t.SetTranslationPart(gp_Vec(10, 0, 0))
    leaf = tool.AddComponent(sub, cube, TopLoc_Location(t))
    TDataStd_Name.Set_s(leaf, TCollection_ExtendedString("Rotated occurrence"))
    a = tool.AddComponent(root, sub, _translation(100, 20, 0))
    b = tool.AddComponent(root, sub, _translation(100, 60, 0))
    TDataStd_Name.Set_s(a, TCollection_ExtendedString("Module occurrence A"))
    TDataStd_Name.Set_s(b, TCollection_ExtendedString("Module occurrence B"))
    tool.UpdateAssemblies()
    return doc


def make_semantic_doc():
    doc = cad._new_xde()
    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    dim_tool = XCAFDoc_DocumentTool.DimTolTool_s(doc.Main())
    cube = cq.Solid.makeBox(10, 10, 10).wrapped
    part = shape_tool.AddShape(cube, False)
    TDataStd_Name.Set_s(part, TCollection_ExtendedString("PMI calibration cube (software fixture)"))
    face = shape_tool.AddSubShape(part, cad.entities(cube, cad.TopAbs_FACE)[0])
    dimension = dim_tool.AddDimension()
    obj = XCAFDimTolObjects_DimensionObject()
    obj.SetType(XCAFDimTolObjects_DimensionType_Size_Thickness)
    obj.SetValue(10.)
    obj.SetUpperTolValue(0.008)
    obj.SetLowerTolValue(0.005)
    XCAFDoc_Dimension.Set_s(dimension).SetObject(obj)
    TDataStd_Name.Set_s(dimension, TCollection_ExtendedString("Thickness 10 +8/-5 micrometres"))
    dim_tool.SetDimension(face, dimension)
    tolerance = dim_tool.AddGeomTolerance()
    tobj = XCAFDimTolObjects_GeomToleranceObject()
    tobj.SetType(XCAFDimTolObjects_GeomToleranceType_Parallelism)
    tobj.SetValue(0.008)
    XCAFDoc_GeomTolerance.Set_s(tolerance).SetObject(tobj)
    TDataStd_Name.Set_s(tolerance, TCollection_ExtendedString("Parallelism 8 micrometres / datum A"))
    dim_tool.SetGeomTolerance(face, tolerance)
    datum = dim_tool.AddDatum()
    dobj = XCAFDimTolObjects_DatumObject()
    dobj.SetName(TCollection_HAsciiString("A"))
    dobj.SetPosition(1)
    XCAFDoc_Datum.Set_s(datum).SetObject(dobj)
    refs = TDF_LabelSequence()
    refs.Append(face)
    dim_tool.SetDatum(refs, datum)
    dim_tool.SetDatumToGeomTol(datum, tolerance)
    return doc


def _model(shape, material="ti6al4v"):
    wrapped = shape.val().wrapped
    return cad.Model("analytical", "Analytical fixture", {"format": "BREP", "schema": None, "sha256": "analytical"},
                     [cad.Part("part-0000", "Analytical solid", wrapped, material)])


def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    demo = cad.demo_model()
    demo_step = output / "aeromind_support_ap242.step"
    cad.export_ap242(demo, demo_step)
    cad._write_brep(cq.Compound.makeCompound([cq.Shape(p.shape) for p in demo.parts]).wrapped, output / "aeromind_support.brep")
    write_xde(make_placement_doc(), output / "nested_placements_ap242.step")
    write_xde(make_semantic_doc(), output / "semantic_pmi_ap242.step")
    unit_doc = cad._new_xde()
    XCAFDoc_DocumentTool.ShapeTool_s(unit_doc.Main()).AddShape(cq.Workplane("XY").box(25.4, 25.4, 25.4, centered=(False, False, False)).val().wrapped, False)
    write_xde(unit_doc, output / "inch_units_ap242.step", "INCH")
    evidence = {"generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "python": sys.version, "platform": platform.platform(), "ocp": OCP.__version__,
        "kernel": cad.KERNEL_INFO, "limits": {"max_source_bytes": cad.MAX_SOURCE_BYTES},
        "certification": "software checks only; not institutional/lot/metrology certification",
        "pmi_export_limitation": "Demo export has geometry/names only. Separate semantic fixture exercises native XDE import; no complete AP242 claim.",
        "analytical_checks": []}
    for name, model, expected in [
        ("cube_10_mm", _model(cq.Workplane("XY").box(10, 10, 10, centered=(False, False, False))), 1000.),
        ("sphere_r10_mm", _model(cq.Workplane("XY").sphere(10)), 4 / 3 * math.pi * 10**3),
        ("tube_r10_r4_h20", _model(cq.Workplane("XY").circle(10).circle(4).extrude(20)), math.pi * (100 - 16) * 20),
    ]:
        document = cad.render_model(model)
        actual = document["properties"]["volume_mm3"]
        evidence["analytical_checks"].append({"name": name, "expected_volume_mm3": expected, "actual_volume_mm3": actual,
            "relative_error": abs(actual - expected) / expected, "properties": document["properties"],
            "integral_error_estimate": document["parts"][0]["properties"]["integration_relative_error_estimate"]})
    evidence["demo"] = {"solids": len(demo.parts), "materials": sorted({p.material_id for p in demo.parts}),
                        "properties": cad.render_model(demo)["properties"], "step_sha256": sha256(demo_step.read_bytes()).hexdigest()}
    timings = []
    for normal, offset in [([1, 0, 0], 0), ([0, 1, 0], 0), ([0, 0, 1], 25), ([1, 1, .2], 5)]:
        start = time.perf_counter()
        cut = cad.section_model(demo, normal, offset)
        document = cad.render_model(cut)
        timings.append({"normal": document["section"]["normal"], "offset_mm": offset,
            "boolean_elapsed_ms": cut.section["elapsed_ms"], "boolean_plus_mesh_ms": (time.perf_counter() - start) * 1000,
            "caps": sum(f["is_section_cap"] for p in document["parts"] for f in p["faces"]),
            "properties": document["properties"]})
    evidence["sections"] = timings
    for name in ["nested_placements_ap242.step", "semantic_pmi_ap242.step", "inch_units_ap242.step"]:
        model = cad.import_model((output / name).read_bytes(), name)
        doc = cad.render_model(model)
        evidence[name] = {"source": model.source, "parts": [{"name": p["name"], "properties": p["properties"]} for p in doc["parts"]],
                          "assembly": model.assembly, "pmi": model.pmi, "warnings": model.warnings}
    (output / "cad_evidence.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    print(json.dumps({"evidence": str(output / "cad_evidence.json"), "analytical_checks": evidence["analytical_checks"],
                      "section_timings_ms": [t["boolean_plus_mesh_ms"] for t in timings]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=ROOT / "fixtures/cad")
    generate(parser.parse_args().output_dir)
