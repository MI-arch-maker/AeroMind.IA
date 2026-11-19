"""AEROMIND Sprint 1 solid CAD kernel (Open CASCADE via OCP).

Geometry is always B-Rep in millimetres. Meshes are disposable display products;
no property is computed from a mesh. OCCT import/export is serialized because
Interface_Static and several STEP settings are process-global. This module is
not a certification or a complete AP242 semantic-PMI implementation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
from pathlib import Path
from threading import RLock
from typing import Any
import copy
import json
import math
import os
import re
import tempfile
import time
import uuid

import numpy as np
try:
    import cadquery as cq
    from OCP.BRep import BRep_Builder, BRep_Tool
    HAS_OCCT = True
except ImportError:
    cq = None
    HAS_OCCT = False

KERNEL_LOCK = RLock()
MAX_SOURCE_BYTES = 25 * 1024 * 1024
MAX_SOLIDS = 256
MAX_FACES = 20000
MAX_TRIANGLES = 1000000
MAX_EXTENT_MM = 100000.0
MESH_DEFLECTION_MM = 0.18
MESH_ANGLE_RAD = 0.22
KERNEL_INFO = {
    "name": "Open CASCADE / OCP", "cadquery_version": getattr(cq, "__version__", "macos-local"),
    "properties_method": "BRepGProp adaptive integration (not mesh)",
    "integration_relative_tolerance": 1e-9,
    "mesh_deflection_mm": MESH_DEFLECTION_MM,
    "mesh_angular_deflection_rad": MESH_ANGLE_RAD,
    "certification": "not certified; software verification only",
}
MATERIALS = {
    "ti6al4v": {"id": "ti6al4v", "name": "Ti-6Al-4V (nominal)", "density_kg_m3": 4430.0,
        "pbr": {"color": "#8895a5", "metalness": 0.94, "roughness": 0.31},
        "source": "KYOCERA SGS Ti-6Al-4V Grade 5 datasheet, nominal 4.43 g/cm3",
        "reference_url": "https://kyocera-sgstool.co.uk/titanium-resources/titanium-information-everything-you-need-to-know/ti-6al-4v-grade-5-titanium-alloy-data-sheet/",
        "calibration_status": "parameterized; no measured BRDF or batch certification"},
    "al7075": {"id": "al7075", "name": "Aluminium 7075 (nominal)", "density_kg_m3": 2810.0,
        "pbr": {"color": "#c5ced6", "metalness": 0.91, "roughness": 0.27},
        "source": "Smiths Metal Centres 7075 datasheet, nominal 2.81 g/cm3; not batch-specific",
        "reference_url": "https://www.smithmetal.com/pdf/aluminium/7xxx/7075.pdf",
        "calibration_status": "parameterized; no measured BRDF or batch certification"},
    "cfrp": {"id": "cfrp", "name": "CFRP fabric, Vf≈50% (nominal)", "density_kg_m3": 1600.0,
        "pbr": {"color": "#252c35", "metalness": 0.12, "roughness": 0.46},
        "source": "Performance Composites typical fabric laminate Vf≈50%, 1600 kg/m3; not universal CFRP; actual layup must be supplied",
        "reference_url": "https://www.performance-composites.com/carbonfibre/mechanicalproperties_2.asp",
        "calibration_status": "parameterized; weave appearance is not measured optical calibration"},
}


class CadError(ValueError):
    """Invalid or unsupported CAD data; safe to expose as an API validation error."""


def entities(shape, kind):
    explorer = TopExp_Explorer(shape, kind)
    result = []
    while explorer.More():
        item = explorer.Current()
        result.append(TopoDS.Face_s(item) if kind == TopAbs_FACE else
                      TopoDS.Solid_s(item) if kind == TopAbs_SOLID else item)
        explorer.Next()
    return result


def point(p):
    return [float(p.X()), float(p.Y()), float(p.Z())]


def integral(shape):
    """Exact underlying surfaces with adaptive quadrature, independent of mesh."""
    if shape.IsNull() or not entities(shape, TopAbs_SOLID):
        return {"volume_mm3": 0.0, "center_of_volume_mm": None, "integration_relative_error_estimate": 0.0}
    props = GProp_GProps()
    error = BRepGProp.VolumeProperties_s(shape, props, 1e-9, True, False)
    volume = float(props.Mass())
    if volume < -1e-8 or not math.isfinite(volume):
        raise CadError("Solid has negative/non-finite oriented volume")
    return {"volume_mm3": max(0., volume),
            "center_of_volume_mm": point(props.CentreOfMass()) if volume > 1e-10 else None,
            "integration_relative_error_estimate": float(error)}


def topology_tolerance(shape):
    if shape.IsNull():
        return 0.0
    tolerances = []
    for kind, cast in [(TopAbs_FACE, TopoDS.Face_s), (TopAbs_EDGE, TopoDS.Edge_s), (TopAbs_VERTEX, TopoDS.Vertex_s)]:
        tolerances.extend(float(BRep_Tool.Tolerance_s(cast(item))) for item in entities(shape, kind))
    return max(tolerances, default=0.0)


def validate_solids(shape):
    if shape.IsNull() or not BRepCheck_Analyzer(shape, True).IsValid():
        raise CadError("Invalid B-Rep topology/geometry")
    solids = entities(shape, TopAbs_SOLID)
    if not solids or len(solids) > MAX_SOLIDS:
        raise CadError("Only closed solids are supported (maximum 256)")
    # Reject legitimate solids mixed with loose surface/edge/vertex geometry.
    all_faces = entities(shape, TopAbs_FACE)
    if not all_faces or len(all_faces) > MAX_FACES:
        raise CadError("Empty solid or face limit exceeded")
    for kind in (TopAbs_FACE, TopAbs_EDGE, TopAbs_VERTEX):
        contained = TopTools_IndexedMapOfShape()
        for solid in solids:
            TopExp.MapShapes_s(solid, kind, contained)
        if any(not contained.Contains(item) for item in entities(shape, kind)):
            raise CadError("Loose faces/shells/edges in solid document are not supported")
    bounds = cq.Shape(shape).BoundingBox()
    if max(bounds.xlen, bounds.ylen, bounds.zlen) > MAX_EXTENT_MM or max(abs(v) for v in [bounds.xmin, bounds.xmax, bounds.ymin, bounds.ymax, bounds.zmin, bounds.zmax]) > 1e7:
        raise CadError("CAD dimensions exceed computational safety bounds")
    for solid in solids:
        if not BRepCheck_Analyzer(solid, True).IsValid():
            raise CadError("Invalid solid")
        for shell in entities(solid, TopAbs_SHELL):
            if not BRep_Tool.IsClosed_s(shell):
                raise CadError("Open shell is not a volumetric solid")
        if integral(solid)["volume_mm3"] <= 1e-10:
            raise CadError("Zero-volume or reversed solid")
    return solids


@dataclass
class Part:
    id: str
    name: str
    shape: Any
    material_id: str | None = None
    # IDs refer to the source B-Rep, never to generated triangle indices.
    face_ids: list[str] = field(default_factory=list)
    caps: dict[str, dict] = field(default_factory=dict)

    def __post_init__(self):
        if not self.face_ids:
            self.face_ids = [f"{self.id}:face:{i:04d}" for i, _ in enumerate(entities(self.shape, TopAbs_FACE))]


@dataclass
class Model:
    id: str
    name: str
    source: dict
    parts: list[Part]
    assembly: list[dict] = field(default_factory=list)
    pmi: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    section: dict | None = None


def _attribute(label, cls):
    # OCP's FindAttribute output Handle argument is not assigned back to the
    # caller on 7.9. Iterate native attributes; Value returns the derived type.
    iterator = TDF_AttributeIterator(label)
    while iterator.More():
        value = iterator.Value()
        if isinstance(value, cls):
            return value
        iterator.Next()
    return None


def _name(label, fallback):
    attr = _attribute(label, TDataStd_Name)
    return attr.Get().ToExtString() if attr is not None else fallback


def _matrix(location):
    t = location.Transformation()
    return [float(t.Value(r, c)) for r in range(1, 4) for c in range(1, 5)] + [0., 0., 0., 1.]


def _new_xde():
    return TDocStd_Document(TCollection_ExtendedString("MDTV-XCAF"))


def _read_brep(path):
    shape = TopoDS_Shape()
    if not BRepTools.Read_s(shape, str(path), BRep_Builder()):
        raise CadError("Unable to read BREP")
    return shape


def _write_brep(shape, path):
    if not BRepTools.Write_s(shape, str(path), False, False, TopTools_FormatVersion_VERSION_3):
        raise CadError("Unable to persist B-Rep")


def import_model(data: bytes, filename: str = "import.step", model_id: str | None = None):
    if not data or len(data) > MAX_SOURCE_BYTES:
        raise CadError("Empty file or source exceeds 25 MiB limit")
    extension = Path(filename).suffix.lower()
    if extension not in {".step", ".stp", ".brep"}:
        raise CadError("Only .step, .stp and .brep imports are supported")
    mid = model_id or uuid.uuid4().hex
    digest = sha256(data).hexdigest()
    name = Path(filename.replace("\\", "/")).name[:200]
    source = {"format": "BREP" if extension == ".brep" else "STEP", "schema": None,
              "sha256": digest, "immutable": True}
    model = Model(mid, name, source, [])
    with KERNEL_LOCK, tempfile.TemporaryDirectory(prefix="aeromind-cad-import-") as tmp:
        path = Path(tmp) / ("source" + extension)
        path.write_bytes(data)
        if extension == ".brep":
            shape = _read_brep(path)
            for i, solid in enumerate(validate_solids(shape)):
                pid = f"part-{i:04d}"
                model.parts.append(Part(pid, f"{name} / solid {i + 1}", solid))
                model.assembly.append({"id": f"node-{i:04d}", "name": model.parts[-1].name,
                                       "parent_id": None, "part_id": pid, "transform": _matrix(TopLoc_Location())})
            model.warnings.append("BREP has no declared units: interpreted as mm; caller must confirm source units")
        else:
            # STEPCAF may resolve external DOCUMENT_FILE paths during Transfer.
            # Reject external-reference profiles before the native reader sees
            # them; remove comments/quoted strings to avoid label false positives.
            tokens = re.sub(rb"/\*.*?\*/|'(?:''|[^'])*'", b" ", data, flags=re.S)
            if re.search(rb"\b(?:REFERENCE|ANCHOR)\s*;|\b(?:DOCUMENT_FILE|EXTERNAL_SOURCE|EXTERNAL_REFERENCE|EXTERNALLY_DEFINED_REPRESENTATION)\s*\(", tokens, flags=re.I):
                raise CadError("External STEP references are unsupported and never followed")
            source["external_references_followed"] = False
            header = data[:131072].decode("ascii", "ignore")
            match = re.search(r"FILE_SCHEMA\s*\(\s*\((.*?)\)\s*\)", header, re.S | re.I)
            source["schema"] = match.group(1).strip().strip("'") if match else "undeclared"
            reader = STEPCAFControl_Reader()
            reader.SetNameMode(True)
            reader.SetColorMode(True)
            reader.SetGDTMode(True)
            reader.SetMatMode(True)
            if reader.ReadFile(str(path)) != IFSelect_RetDone:
                raise CadError("STEP parser rejected input")
            # Inspect native reference entities without resolving/opening files.
            # This independent guard must run before STEPCAF Transfer follows refs.
            refs = STEPConstruct_ExternRefs(reader.Reader().WS())
            refs.LoadExternRefs()
            if refs.NbExternRefs():
                raise CadError("External STEP references are unsupported and never followed")
            reader.Reader().SetSystemLengthUnit(1.0)  # OCCT internal target = mm
            doc = _new_xde()
            if not reader.Transfer(doc):
                raise CadError("STEP transfer failed")
            tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
            roots = TDF_LabelSequence()
            tool.GetFreeShapes(roots)

            def visit(label, parent, parent_location, depth=0):
                if depth > 64 or len(model.assembly) > 2048:
                    raise CadError("Assembly nesting/occurrence limit exceeded")
                definition = label
                if tool.IsReference_s(label):
                    definition = TDF_Label()
                    if not tool.GetReferredShape_s(label, definition):
                        raise CadError("Broken XDE occurrence reference")
                local = tool.GetLocation_s(label)
                world = parent_location.Multiplied(local)
                nid = f"node-{len(model.assembly):04d}"
                node = {"id": nid, "name": _name(label, _name(definition, nid)),
                        "parent_id": parent, "transform": _matrix(world)}
                model.assembly.append(node)
                if tool.IsAssembly_s(definition):
                    children = TDF_LabelSequence()
                    tool.GetComponents_s(definition, children, False)
                    for j in range(1, children.Length() + 1):
                        visit(children.Value(j), nid, world, depth + 1)
                else:
                    shape = tool.GetShape_s(definition)
                    # GetShape may carry the definition location. The explicit
                    # occurrence transform is applied exactly once.
                    shape = shape.Located(TopLoc_Location()).Moved(world)
                    solids = validate_solids(shape)
                    if len(model.parts) + len(solids) > MAX_SOLIDS:
                        raise CadError("Solid occurrence limit exceeded")
                    for solid in solids:
                        pid = f"part-{len(model.parts):04d}"
                        part = Part(pid, _name(definition, node["name"]), solid)
                        model.parts.append(part)
                        if len(solids) == 1:
                            node["part_id"] = pid
                        else:
                            model.assembly.append({"id": f"{nid}/{pid}", "name": part.name,
                                                   "parent_id": nid, "part_id": pid, "transform": _matrix(world)})
            for i in range(1, roots.Length() + 1):
                visit(roots.Value(i), None, TopLoc_Location())
            if not model.parts:
                raise CadError("STEP has no solid occurrences")
            _import_xde_pmi(doc, model)
            model.warnings.append("STEP material labels are not a validated density: assign a documented material explicitly")
        model.warnings.append("Nominal densities and parameterized PBR; no lot certification or measured optical calibration")
    return model


def _face_mesh(face, face_id, cap=None):
    location = TopLoc_Location()
    tri = BRep_Tool.Triangulation_s(face, location)
    if tri is None or tri.NbTriangles() == 0:
        raise CadError("A B-Rep face could not be triangulated")
    vertices = np.array([point(tri.Node(i).Transformed(location.Transformation()))
                         for i in range(1, tri.NbNodes() + 1)], dtype=float)
    indices = np.array([tri.Triangle(i).Get() for i in range(1, tri.NbTriangles() + 1)], dtype=np.int64) - 1
    if face.Orientation() == TopAbs_REVERSED:
        indices = indices[:, [0, 2, 1]]
    triangle_normals = np.cross(vertices[indices[:, 1]] - vertices[indices[:, 0]],
                                vertices[indices[:, 2]] - vertices[indices[:, 0]])
    lengths = np.linalg.norm(triangle_normals, axis=1)
    normals = np.zeros_like(vertices)
    for corner in range(3):
        np.add.at(normals, indices[:, corner], triangle_normals)
    nl = np.linalg.norm(normals, axis=1)
    normals /= np.where(nl > 1e-20, nl, 1.)[:, None]
    # A triangle barycentre is on a planar face. For curved faces use the
    # barycentric UV of an interior triangle evaluated on the true surface.
    k = int(np.argmax(lengths))
    ids = indices[k]
    anchor = vertices[ids].mean(axis=0).tolist()
    if tri.HasUVNodes():
        uv = [tri.UVNode(int(i) + 1) for i in ids]
        surface = BRepAdaptor_Surface(face, True)
        uvpoint = gp_Pnt2d(sum(p.X() for p in uv) / 3., sum(p.Y() for p in uv) / 3.)
        if BRepClass_FaceClassifier(face, uvpoint, 1e-7).State() in (TopAbs_IN, TopAbs_ON):
            anchor = point(surface.Value(uvpoint.X(), uvpoint.Y()))
        else:
            # Trimmed/periodic faces can have nonconvex UV regions. A sampled
            # B-Rep mesh node is on the true face boundary, never its hole.
            candidate = uv[0]
            anchor = point(surface.Value(candidate.X(), candidate.Y()))
    result = {"id": face_id, "positions": vertices.reshape(-1).tolist(),
              "normals": normals.reshape(-1).tolist(), "indices": indices.reshape(-1).tolist(),
              "anchor_mm": anchor, "surface_type": str(BRepAdaptor_Surface(face, True).GetType()).split(".")[-1],
              "is_section_cap": cap is not None}
    if cap is not None:
        result["provenance"] = cap
    return result


def render_model(model):
    with KERNEL_LOCK:
        output = {"model_id": model.id, "name": model.name, "source": copy.deepcopy(model.source),
                  "units": "mm", "kernel": copy.deepcopy(KERNEL_INFO), "parts": [],
                  "assembly": copy.deepcopy(model.assembly), "pmi": [], "warnings": list(model.warnings)}
        total_volume = 0.
        weighted_volume = np.zeros(3)
        total_mass = 0.
        weighted_mass = np.zeros(3)
        unknown_material = False
        face_lookup = {}
        triangle_count = 0
        maximum_topology_tolerance = 0.0
        for part in model.parts:
            props = integral(part.shape)
            volume, center = props["volume_mm3"], props["center_of_volume_mm"]
            density = MATERIALS.get(part.material_id, {}).get("density_kg_m3")
            mass = volume * density * 1e-9 if density is not None else (0. if volume == 0 else None)
            if volume:
                total_volume += volume
                weighted_volume += np.asarray(center) * volume
                if mass is None:
                    unknown_material = True
                else:
                    total_mass += mass
                    weighted_mass += np.asarray(center) * mass
            faces = []
            if volume:
                BRepMesh_IncrementalMesh(part.shape, MESH_DEFLECTION_MM, False, MESH_ANGLE_RAD, False).Perform()
                for fid, face in zip(part.face_ids, entities(part.shape, TopAbs_FACE)):
                    mesh = _face_mesh(face, fid, part.caps.get(fid))
                    triangle_count += len(mesh["indices"]) // 3
                    if triangle_count > MAX_TRIANGLES:
                        raise CadError("Display triangle limit exceeded")
                    faces.append(mesh)
                    face_lookup[(part.id, fid)] = mesh
            part_tolerance = topology_tolerance(part.shape)
            maximum_topology_tolerance = max(maximum_topology_tolerance, part_tolerance)
            output["parts"].append({"id": part.id, "name": part.name, "material_id": part.material_id,
                "properties": {"volume_mm3": volume, "mass_kg": mass,
                               "center_of_gravity_mm": center if mass is not None and volume else None,
                               "center_of_volume_mm": center,
                               "integration_relative_error_estimate": props["integration_relative_error_estimate"],
                               "max_topology_tolerance_mm": part_tolerance}, "faces": faces})
        for pmi in model.pmi:
            item = copy.deepcopy(pmi)
            face = face_lookup.get((item["part_id"], item["face_id"]))
            if model.section:
                # Preserve source anchor rather than silently moving an annotation
                # onto a trimmed face. Visibility is decided by halfspace + face ID.
                anchor = np.asarray(item["anchor_mm"])
                retained = np.dot(model.section["normal"], anchor) <= model.section["offset_mm"] + 1e-7
                item["visible"] = bool(face is not None and retained)
                if not item["visible"]:
                    item["visibility_reason"] = "source anchor/face removed by section; not reanchored"
            output["pmi"].append(item)
        output["properties"] = {"volume_mm3": total_volume,
            "mass_kg": None if unknown_material else total_mass,
            "center_of_gravity_mm": (weighted_mass / total_mass).tolist() if total_mass and not unknown_material else None,
            "center_of_volume_mm": (weighted_volume / total_volume).tolist() if total_volume else None}
        if unknown_material:
            output["warnings"].append("Mass and mass-weighted centre of gravity unavailable: material density missing")
        output["kernel"]["max_topology_tolerance_mm"] = maximum_topology_tolerance
        output["kernel"]["precision_notice"] = "Display tessellation does not establish micrometre accuracy; topology tolerances and integral error estimator are separate quantities"
        if model.section:
            output["section"] = copy.deepcopy(model.section)
        return output


def normalized_plane(normal, offset_mm):
    try:
        n = np.asarray(normal, dtype=float)
        offset = float(offset_mm)
    except (TypeError, ValueError):
        raise CadError("Invalid section plane")
    if n.shape != (3,) or not np.isfinite(n).all() or not math.isfinite(offset):
        raise CadError("Section plane must have three finite components and finite offset")
    length = float(np.linalg.norm(n))
    if length < 1e-12 or length > 1e12 or abs(offset) > 1e7:
        raise CadError("Section plane zero normal or out of bounds")
    # Offset is the distance along the normalized normal (API contract).
    return n / length, offset


def section_model(model, normal, offset_mm):
    n, offset = normalized_plane(normal, offset_mm)
    start = time.perf_counter()
    key = sha256(json.dumps([n.tolist(), offset]).encode()).hexdigest()[:12]
    result = Model(model.id, model.name, copy.deepcopy(model.source), [], copy.deepcopy(model.assembly),
                   copy.deepcopy(model.pmi), list(model.warnings))
    with KERNEL_LOCK:
        origin = n * offset
        plane_face = BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(*origin), gp_Dir(*n))).Face()
        halfspace = BRepPrimAPI_MakeHalfSpace(plane_face, gp_Pnt(*(origin - n))).Solid()
        for part in model.parts:
            operation = BRepAlgoAPI_Common(part.shape, halfspace)
            operation.SetRunParallel(False)
            operation.Build()
            if not operation.IsDone():
                raise CadError("Halfspace Boolean operation failed")
            cut = operation.Shape()
            if entities(cut, TopAbs_SOLID):
                validate_solids(cut)
            else:
                cut = TopoDS_Shape()  # tangent/fully removed parts have no material
            output_faces = entities(cut, TopAbs_FACE) if not cut.IsNull() else []
            ids, caps = [], {}
            originals = list(zip(part.face_ids, entities(part.shape, TopAbs_FACE)))
            face_matches, source_fragment_counts = [], {}
            # Determine all source-to-output correspondences before assigning IDs:
            # no fragment of a split face may retain the ambiguous source ID.
            for face in output_faces:
                matches = set()
                for source_id, source_face in originals:
                    if face.IsSame(source_face):
                        matches.add(source_id)
                    else:
                        for modified in operation.Modified(source_face):
                            if face.IsSame(modified):
                                matches.add(source_id)
                face_matches.append(matches)
                for source_id in matches:
                    source_fragment_counts[source_id] = source_fragment_counts.get(source_id, 0) + 1
            if any(count > 1 for count in source_fragment_counts.values()):
                result.warnings.append("Split source face receives section-specific ID; PMI not silently rebound")
            for j, (face, matches) in enumerate(zip(output_faces, face_matches)):
                if len(matches) == 1:
                    fid = next(iter(matches))
                    if source_fragment_counts[fid] > 1:
                        fid = f"{fid}:section:{key}:fragment:{j}"
                else:
                    fid = f"{part.id}:section:{key}:face:{j:04d}"
                    surf = BRepAdaptor_Surface(face, True)
                    from OCP.GeomAbs import GeomAbs_Plane
                    if surf.GetType() == GeomAbs_Plane:
                        pl = surf.Plane()
                        if abs(float(np.dot(n, point(pl.Location()))) - offset) < 1e-6 and abs(abs(np.dot(n, point(pl.Axis().Direction()))) - 1) < 1e-7:
                            caps[fid] = {"operation": "BRepAlgoAPI_Common halfspace", "source_sha256": model.source["sha256"],
                                         "normal": n.tolist(), "offset_mm": offset, "role": "new section cap"}
                ids.append(fid)
            result.parts.append(Part(part.id, part.name, cut, part.material_id, ids, caps))
    result.section = {"normal": n.tolist(), "offset_mm": offset,
                      "elapsed_ms": (time.perf_counter() - start) * 1000,
                      "property_method": "BRepGProp on Boolean result", "retained_halfspace": "dot(normal,p)<=offset_mm"}
    return result


def assign_materials(model, assignments):
    by_id = {p.id: p for p in model.parts}
    if not isinstance(assignments, dict) or not assignments:
        raise CadError("Nonempty material assignments required")
    if any(pid not in by_id or material not in MATERIALS for pid, material in assignments.items()):
        raise CadError("Unknown part or material ID")
    for pid, material in assignments.items():
        by_id[pid].material_id = material


def add_pmi(model, body, source="user"):
    allowed = {"dimension", "position", "flatness", "parallelism", "perpendicularity", "circularity",
               "cylindricity", "profile", "runout", "datum", "material", "note"}
    kind = body.get("kind")
    if kind not in allowed:
        raise CadError("Unsupported PMI kind")
    part = next((p for p in model.parts if p.id == body.get("part_id")), None)
    if part is None or body.get("face_id") not in part.face_ids:
        raise CadError("PMI must reference an existing source B-Rep face")
    for key in ("nominal_mm", "tolerance_um"):
        value = body.get(key)
        if value is not None and (not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value < 0 or value > 1e9):
            raise CadError(f"{key} must be a finite nonnegative number")
    if kind not in {"material", "note", "datum"} and body.get("tolerance_um") is None:
        raise CadError("Dimensional/GD&T PMI requires explicit tolerance_um (micrometres)")
    text = body.get("text", "")
    datum = body.get("datum")
    if not isinstance(text, str) or len(text) > 2000 or (datum is not None and (not isinstance(datum, str) or len(datum) > 32)):
        raise CadError("PMI text/datum too long or invalid")
    if kind == "material" and not text.strip():
        raise CadError("Material specification text required")
    with KERNEL_LOCK:
        BRepMesh_IncrementalMesh(part.shape, MESH_DEFLECTION_MM, False, MESH_ANGLE_RAD, False).Perform()
        index = part.face_ids.index(body["face_id"])
        anchor = _face_mesh(entities(part.shape, TopAbs_FACE)[index], body["face_id"])["anchor_mm"]
    item = {"id": uuid.uuid4().hex, "part_id": part.id, "face_id": body["face_id"],
            "anchor_mm": anchor, "kind": kind, "text": text, "source": source,
            "source_sha256": model.source["sha256"]}
    for key in ("nominal_mm", "tolerance_um", "datum"):
        if body.get(key) is not None:
            item[key] = body[key]
    model.pmi.append(item)
    return item


def _import_xde_pmi(doc, model):
    """Read semantic XDE objects; unsupported/unanchored objects are disclosed."""
    # Implementation below uses XCAF semantic tools, not STEP text heuristics.
    from OCP.XCAFDoc import XCAFDoc_Dimension, XCAFDoc_GeomTolerance, XCAFDoc_Datum
    tool = XCAFDoc_DocumentTool.DimTolTool_s(doc.Main())
    count = 0
    for category, getter, attribute in [
        ("dimension", "GetDimensionLabels", XCAFDoc_Dimension),
        ("tolerance", "GetGeomToleranceLabels", XCAFDoc_GeomTolerance),
        ("datum", "GetDatumLabels", XCAFDoc_Datum),
    ]:
        labels = TDF_LabelSequence()
        getattr(tool, getter)(labels)
        for i in range(1, labels.Length() + 1):
            count += 1
            label = labels.Value(i)
            attr = _attribute(label, attribute)
            if attr is None:
                model.warnings.append(f"Unsupported XDE {category}: semantic attribute unavailable")
                continue
            try:
                obj = attr.GetObject()
            except Exception:
                model.warnings.append(f"Unsupported XDE {category}: malformed semantic object (source preserved)")
                continue
            references = TDF_LabelSequence()
            secondary = TDF_LabelSequence()
            try:
                tool.GetRefShapeLabel_s(label, references, secondary)
            except (TypeError, AttributeError):
                try:
                    tool.GetRefShapeLabel_s(label, references)
                except (TypeError, AttributeError):
                    model.warnings.append(f"Unsupported XDE {category}: no accessible face references")
                    continue
            linked = []
            reference_labels = [references.Value(j) for j in range(1, references.Length() + 1)]
            reference_labels += [secondary.Value(j) for j in range(1, secondary.Length() + 1)]
            for reference_label in reference_labels:
                target = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main()).GetShape_s(reference_label)
                if target.IsNull() or target.ShapeType() != TopAbs_FACE:
                    continue
                for part in model.parts:
                    for fid, face in zip(part.face_ids, entities(part.shape, TopAbs_FACE)):
                        if face.IsPartner(target):
                            linked.append((part, fid))
            if not linked:
                model.warnings.append(f"Unsupported XDE {category}: references not identifiable solid faces (object retained in immutable STEP)")
                continue
            semantic_type = str(obj.GetType()) if hasattr(obj, "GetType") else category
            if category == "dimension" and "Angular" in semantic_type:
                model.warnings.append("Unsupported XDE angular dimension: not mislabeled as millimetres")
                continue
            type_name = semantic_type.split("_")[-1]
            kind_map = {"Flatness": "flatness", "Position": "position", "Parallelism": "parallelism",
                        "Perpendicularity": "perpendicularity", "CircularityOrRoundness": "circularity",
                        "Cylindricity": "cylindricity", "ProfileOfSurface": "profile",
                        "ProfileOfLine": "profile", "CircularRunout": "runout", "TotalRunout": "runout"}
            datum_names = []
            if category == "tolerance":
                datums = TDF_LabelSequence()
                tool.GetDatumOfTolerLabels_s(label, datums)
                for j in range(1, datums.Length() + 1):
                    dattr = _attribute(datums.Value(j), XCAFDoc_Datum)
                    if dattr is not None:
                        datum_names.append(dattr.GetObject().GetName().ToCString())
            for part, fid in linked:
                body = {"part_id": part.id, "face_id": fid, "kind": "datum" if category == "datum" else "dimension" if category == "dimension" else "profile",
                        "text": _name(label, "") or type_name}
                extra = {}
                if category == "dimension":
                    body.update(nominal_mm=float(obj.GetValue()), tolerance_um=0.)
                    if obj.IsDimWithPlusMinusTolerance():
                        extra["upper_tolerance_um"] = float(obj.GetUpperTolValue()) * 1000.
                        extra["lower_tolerance_um"] = float(obj.GetLowerTolValue()) * 1000.
                        body["tolerance_um"] = max(abs(extra["upper_tolerance_um"]), abs(extra["lower_tolerance_um"]))
                        extra["tolerance_summary"] = "maximum absolute bound; use upper/lower fields for asymmetric limits"
                    else:
                        body.pop("tolerance_um")
                    if obj.IsDimWithRange():
                        extra.update(lower_bound_mm=float(obj.GetLowerBound()), upper_bound_mm=float(obj.GetUpperBound()))
                    if obj.IsDimWithClassOfTolerance():
                        model.warnings.append("Unsupported XDE dimension fit-class interpretation; nominal retained without invented numeric tolerance")
                elif category == "tolerance":
                    body["tolerance_um"] = float(obj.GetValue()) * 1000.
                    body["kind"] = kind_map.get(type_name, "profile")
                    if datum_names:
                        body["datum"] = ",".join(datum_names)[:32]
                        extra["datum_references"] = datum_names
                    if type_name not in kind_map:
                        extra["unsupported_gdt_symbol"] = True
                        model.warnings.append(f"Unsupported XDE GD&T symbol {type_name}: enum retained, do not substitute profile")
                else:
                    if hasattr(obj, "GetName"):
                        body["datum"] = obj.GetName().ToCString()
                # XDE dimensions can be nominal only. Add with zero only to pass
                # user validation, then remove and mark unknown tolerance.
                nominal_only = category == "dimension" and "tolerance_um" not in body
                if nominal_only:
                    body["tolerance_um"] = 0.
                try:
                    item = add_pmi(model, body, source="xde")
                    item["semantic_type"] = semantic_type
                    item.update(extra)
                    if nominal_only:
                        item.pop("tolerance_um", None)
                    if category == "tolerance" and type_name not in kind_map:
                        item["kind"] = "gdt"
                    item["semantic_interpretation"] = "partial: OCCT type and numeric values preserved; complex modifiers/presentation not fully interpreted"
                    if hasattr(obj, "GetModifiers"):
                        modifiers = obj.GetModifiers()
                        if modifiers.Length():
                            item["semantic_modifiers"] = [str(modifiers.Value(j)) for j in range(1, modifiers.Length() + 1)]
                            model.warnings.append(f"Unsupported full interpretation of XDE {category} modifiers; raw enums retained")
                except (CadError, TypeError, ValueError) as exc:
                    model.warnings.append(f"Unsupported XDE {category}: {exc}")
            if len(linked) > 1:
                model.warnings.append(f"XDE {category} applied to multiple occurrence faces of the referenced definition")
    model.warnings.append("PMI support is limited to face-referenced XDE dimensions/tolerances/datums; presentation-only and complex modifiers are not fully interpreted")
    model.source["xde_semantic_objects"] = count


def export_ap242(model, destination):
    """Genuine STEPCAF AP242 export; user/demo PMI is not exported in Sprint 1."""
    with KERNEL_LOCK:
        doc = _new_xde()
        tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
        assembly = cq.Compound.makeCompound([]).wrapped
        root = tool.AddShape(assembly, True)
        TDataStd_Name.Set_s(root, TCollection_ExtendedString(model.name, True))
        for part in model.parts:
            label = tool.AddShape(part.shape, False)
            TDataStd_Name.Set_s(label, TCollection_ExtendedString(part.name, True))
            occurrence = tool.AddComponent(root, label, TopLoc_Location())
            TDataStd_Name.Set_s(occurrence, TCollection_ExtendedString(part.name, True))
        tool.UpdateAssemblies()
        writer = STEPCAFControl_Writer()
        if not Interface_Static.SetCVal_s("write.step.schema", "AP242DIS"):
            raise CadError("OCCT AP242 schema setting unavailable")
        writer.SetNameMode(True)
        writer.SetColorMode(True)
        if not writer.Transfer(doc, STEPControl_AsIs) or writer.Write(str(destination)) != IFSelect_RetDone:
            raise CadError("AP242 export failed")
        header = Path(destination).read_bytes()[:131072].decode("ascii", "ignore")
        if "AP242" not in header.upper():
            raise CadError("Writer did not produce genuine AP242 schema")
    return {"schema": "AP242", "pmi_exported": False,
            "warning": "Geometry and names exported; Sprint 1 user/demo PMI is not exported to STEP"}


def demo_model():
    """Fixed, deterministic 15-solid mechanical fixture with physical cavities."""
    parts = []
    def append(name, shape, material):
        pid = f"part-{len(parts):04d}"
        parts.append(Part(pid, name, shape.wrapped if isinstance(shape, cq.Shape) else shape.val().wrapped, material))
    base = cq.Workplane("XY").box(120, 80, 12, centered=(True, True, False))
    for x in (-45, 45):
        for y in (-25, 25):
            base = base.cut(cq.Workplane("XY").center(x, y).circle(4.5).extrude(12))
    base = base.cut(cq.Workplane("XY").rect(40, 24).extrude(12))
    append("Support usiné — lumière et quatre perçages", base, "al7075")
    for x in (-34, 34):
        bearing = cq.Workplane("YZ", origin=(x - 8, 0, 30)).circle(15).circle(8).extrude(16)
        append(f"Palier annulaire {x:+d}", bearing, "al7075")
        foot = cq.Workplane("XY", origin=(x, 0, 12)).box(22, 38, 5, centered=(True, True, False))
        foot = foot.cut(cq.Workplane("XY", origin=(x, 0, 12)).circle(5).extrude(5))
        append(f"Semelle percée {x:+d}", foot, "al7075")
    append("Arbre titane creux", cq.Workplane("YZ", origin=(-58, 0, 30)).circle(7.5).circle(3).extrude(116), "ti6al4v")
    for x in (-53, 48):
        append(f"Collier annulaire {x:+d}", cq.Workplane("YZ", origin=(x, 0, 30)).circle(12).circle(7.5).extrude(5), "ti6al4v")
    for x in (-45, 45):
        for y in (-25, 25):
            bolt = cq.Workplane("XY", origin=(x, y, -5)).circle(4).extrude(17)
            bolt = bolt.union(cq.Workplane("XY", origin=(x, y, 12)).polygon(6, 13).extrude(5))
            bolt = bolt.cut(cq.Workplane("XY", origin=(x, y, 14)).polygon(6, 5).extrude(3))
            append(f"Boulon titane M8 ({x:+d},{y:+d})", bolt, "ti6al4v")
    plate = cq.Workplane("XY", origin=(0, 0, -8)).box(112, 72, 3, centered=(True, True, False))
    for x in (-45, 45):
        for y in (-25, 25):
            plate = plate.cut(cq.Workplane("XY", origin=(x, y, -8)).circle(4.5).extrude(3))
    append("Plaque composite — quatre perçages", plate, "cfrp")
    for x in (-20, 20):
        append(f"Entretoise creuse {x:+d}", cq.Workplane("XY", origin=(x, 29, 12)).circle(7).circle(3).extrude(18), "ti6al4v")
    for part in parts:
        validate_solids(part.shape)
    # Hash actual canonical source B-Rep, not a descriptive string.
    with tempfile.TemporaryDirectory(prefix="aeromind-cad-demo-") as tmp:
        path = Path(tmp) / "demo.brep"
        _write_brep(cq.Compound.makeCompound([cq.Shape(p.shape) for p in parts]).wrapped, path)
        digest = sha256(path.read_bytes()).hexdigest()
    model = Model("demo", "AEROMIND — support de transmission percé", {"format": "BREP", "schema": None, "sha256": digest, "immutable": True, "fixture": "aeromind-support-v1"}, parts)
    model.assembly = [{"id": "root", "name": model.name, "parent_id": None}] + [
        {"id": f"node-{i:04d}", "name": p.name, "parent_id": "root", "part_id": p.id, "transform": _matrix(TopLoc_Location())}
        for i, p in enumerate(parts)]
    model.warnings = ["Engineering demonstration fixture; nominal densities, not institutional certification",
                      "Parameterized PBR; no measured BRDF calibration",
                      "STEP export contains geometry/names, not the demo/user semantic PMI"]
    add_pmi(model, {"part_id": parts[0].id, "face_id": parts[0].face_ids[0], "kind": "flatness", "tolerance_um": 8., "text": "Planéité 8 µm — démonstration", "datum": "A"}, "demo")
    add_pmi(model, {"part_id": parts[5].id, "face_id": parts[5].face_ids[0], "kind": "dimension", "nominal_mm": 15., "tolerance_um": 5., "text": "Ø15 ±5 µm — démonstration"}, "demo")
    add_pmi(model, {"part_id": parts[12].id, "face_id": parts[12].face_ids[0], "kind": "material", "text": "CFRP nominal 1600 kg/m³ — stratification et lot à confirmer"}, "demo")
    return model


class CadStore:
    """Filesystem persistence scoped by canonical authenticated owner.

    Sources and canonical part B-Reps are write-once; metadata is atomically
    replaced under a lock. Model paths never contain user-provided filenames.
    Loading checks source and B-Rep hashes and refuses symlink traversal.
    """
    def __init__(self, root=None):
        configured = root or os.environ.get("AEROMIND_CAD_STORAGE_DIR") or os.environ.get("CAD_STORAGE_ROOT")
        self.root = Path(configured or Path.home() / ".local/share/aeromind/cad").absolute()

    def _directory(self, owner, model_id):
        if not isinstance(owner, str) or not owner or not re.fullmatch(r"[a-f0-9]{32}", model_id or ""):
            raise CadError("Model not found")
        path = self.root / sha256(owner.encode()).hexdigest() / model_id
        # The root is explicitly configured; no component may be a symlink.
        for candidate in [self.root, *self.root.parents, path.parent, path]:
            if candidate.is_symlink():
                raise CadError("Unsafe storage path")
        return path

    @staticmethod
    def _file(directory, name):
        path = directory / name
        if path.is_symlink():
            raise CadError("Unsafe storage file")
        return path

    def save_new(self, owner, model, source_bytes):
        directory = self._directory(owner, model.id)
        if sha256(source_bytes).hexdigest() != model.source["sha256"]:
            raise CadError("Source hash mismatch")
        with KERNEL_LOCK:
            directory.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            directory.mkdir(mode=0o700)
            try:
                self._file(directory, "source.bin").write_bytes(source_bytes)
                records = []
                for i, part in enumerate(model.parts):
                    path = self._file(directory, f"part-{i:04d}.brep")
                    _write_brep(part.shape, path)
                    records.append({"id": part.id, "name": part.name, "material_id": part.material_id,
                                    "face_ids": part.face_ids, "brep_file": path.name,
                                    "brep_sha256": sha256(path.read_bytes()).hexdigest()})
                state = {"version": 1, "model_id": model.id, "name": model.name, "source": model.source,
                         "owner_sha256": sha256(owner.encode()).hexdigest(), "parts": records,
                         "assembly": model.assembly, "pmi": model.pmi, "warnings": model.warnings}
                self._atomic_metadata(directory, state)
            except Exception:
                import shutil
                shutil.rmtree(directory)
                raise

    def _atomic_metadata(self, directory, state):
        fd, tmp = tempfile.mkstemp(prefix="metadata-", suffix=".tmp", dir=directory)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(state, stream, ensure_ascii=False, allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            destination = self._file(directory, "metadata.json")
            os.replace(tmp, destination)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

    def load(self, owner, model_id):
        with KERNEL_LOCK:
            directory = self._directory(owner, model_id)
            path = self._file(directory, "metadata.json")
            if not path.is_file():
                raise FileNotFoundError("Model not found")
            state = json.loads(path.read_text())
            if state["model_id"] != model_id or state["owner_sha256"] != sha256(owner.encode()).hexdigest():
                raise CadError("Metadata identity mismatch")
            data = self._file(directory, "source.bin").read_bytes()
            if len(data) > MAX_SOURCE_BYTES or sha256(data).hexdigest() != state["source"]["sha256"]:
                raise CadError("Immutable source integrity failure")
            parts = []
            for record in state["parts"]:
                if not re.fullmatch(r"part-[0-9]{4}\.brep", record["brep_file"]):
                    raise CadError("Unsafe B-Rep filename")
                path = self._file(directory, record["brep_file"])
                if sha256(path.read_bytes()).hexdigest() != record["brep_sha256"]:
                    raise CadError("Immutable B-Rep integrity failure")
                shape = _read_brep(path)
                validate_solids(shape)
                if len(entities(shape, TopAbs_FACE)) != len(record["face_ids"]):
                    raise CadError("Stored face identity mismatch")
                parts.append(Part(record["id"], record["name"], shape, record["material_id"], record["face_ids"]))
            return Model(model_id, state["name"], state["source"], parts, state["assembly"], state["pmi"], state["warnings"])

    def update(self, owner, model):
        with KERNEL_LOCK:
            directory = self._directory(owner, model.id)
            state = json.loads(self._file(directory, "metadata.json").read_text())
            if state["source"] != model.source or model.section:
                raise CadError("Cannot replace immutable source or persist derived section as source")
            by_id = {p.id: p for p in model.parts}
            for record in state["parts"]:
                record["material_id"] = by_id[record["id"]].material_id
            state["pmi"] = model.pmi
            self._atomic_metadata(directory, state)
