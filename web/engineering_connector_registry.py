"""Evidence-aware catalog for the 13 connector families shown by the Hub."""
from __future__ import annotations

import shutil
from typing import Any

FAMILIES: tuple[dict[str, Any], ...] = (
    {"family_id": "cad-parametric", "products": ["FreeCAD"], "source_validation": "verified", "candidate_binaries": ["FreeCADCmd", "freecadcmd", "FreeCAD", "freecad"], "planned_capabilities": ["file.fcstd.open", "file.step.import"]},
    {"family_id": "aero-geometry", "products": ["OpenVSP"], "source_validation": "verified", "candidate_binaries": ["vspscript", "openvsp"], "planned_capabilities": ["file.vsp3.read", "geometry.export"]},
    {"family_id": "enterprise-cad", "products": ["Siemens NX", "Designcenter NX"], "source_validation": "verified", "candidate_binaries": ["ugraf"], "planned_capabilities": ["nxopen.read", "file.step.exchange"]},
    {"family_id": "solidworks-cad", "products": ["SOLIDWORKS"], "source_validation": "verified", "candidate_binaries": ["SLDWORKS.exe", "sldworks"], "planned_capabilities": ["com.document.read", "file.step.exchange"]},
    {"family_id": "geometry-visualization", "products": ["Blender"], "source_validation": "verified", "candidate_binaries": ["blender"], "planned_capabilities": ["bpy.scene.read", "file.gltf.exchange"]},
    {"family_id": "commercial-fem-cfd", "products": ["ANSYS Mechanical", "ANSYS Fluent"], "source_validation": "verified", "candidate_binaries": ["runwb2", "fluent", "ansys"], "planned_capabilities": ["pymechanical.session", "pyfluent.session"]},
    {"family_id": "fem-solvers", "products": ["Abaqus", "CalculiX"], "source_validation": "verified", "candidate_binaries": ["abaqus", "ccx"], "planned_capabilities": ["fem.run", "fem.results.read"]},
    {"family_id": "open-cfd", "products": ["OpenFOAM", "SU2", "XFLR5"], "source_validation": "pending", "candidate_binaries": ["foamVersion", "simpleFoam", "SU2_CFD", "xflr5"], "planned_capabilities": ["cfd.run", "cfd.results.read"]},
    {"family_id": "electronics-pcb", "products": ["KiCad", "LTspice", "Altium"], "source_validation": "pending", "candidate_binaries": ["kicad-cli", "ltspice", "AltiumDesigner"], "planned_capabilities": ["schematic.read", "spice.run", "pcb.read"]},
    {"family_id": "embedded-sitl", "products": ["ROS 2", "PX4", "Gazebo"], "source_validation": "pending", "candidate_binaries": ["ros2", "px4", "gz", "gazebo"], "planned_capabilities": ["simulation.sitl", "telemetry.read"]},
    {"family_id": "numerical-simulation", "products": ["MATLAB", "Simulink", "Isaac Sim"], "source_validation": "pending", "candidate_binaries": ["matlab", "isaac-sim.sh"], "planned_capabilities": ["model.run", "simulation.results.read"]},
    {"family_id": "manufacturing", "products": ["PrusaSlicer", "Cura", "Fusion"], "source_validation": "pending", "candidate_binaries": ["prusa-slicer", "PrusaSlicer", "cura", "FusionLauncher"], "planned_capabilities": ["manufacturing.prepare", "file.gcode.export"]},
    {"family_id": "plm-projects", "products": ["GitLab", "Teamcenter", "Aras Innovator"], "source_validation": "pending", "candidate_binaries": [], "planned_capabilities": ["plm.read", "plm.write"]},
)


def connector_catalog() -> dict[str, Any]:
    """Return status from repository evidence and read-only executable lookup.

    Binary presence is not a successful health check, licence check, or data
    exchange. Consequently no entry is ever marked connected by this function.
    """
    items: list[dict[str, Any]] = []
    for family in FAMILIES:
        detected = sorted({name for candidate in family["candidate_binaries"] if (name := shutil.which(candidate))})
        items.append({
            "schema_version": "aeromind.connector-manifest.v1",
            "family_id": family["family_id"],
            "products": list(family["products"]),
            "source_validation": family["source_validation"],
            "integration_mode": "not_configured",
            "candidate_capabilities": list(family["planned_capabilities"]),
            "capabilities_verified": [],
            "runtime_detected": bool(detected),
            "runtime_names": [path.rsplit("/", 1)[-1] for path in detected],
            "license_state": "unknown",
            "last_exchange_test": None,
            "status": "configuration_required",
            "evidence_level": "not_tested",
            "physical_output_enabled": False,
            "status_detail": (
                "Un binaire candidat est présent, mais sa version, sa licence et un échange de test restent à qualifier."
                if detected else
                "Aucun runtime configuré ou vérifié dans cet environnement."
            ),
        })
    return {
        "schema_version": "aeromind.connector-catalog.v1",
        "items": items,
        "built_in_file_capabilities": [
            {"id": "csv.bom.import", "status": "available", "evidence_level": "parsed_and_validated"},
            {"id": "csv.simulation-results.import", "status": "available", "evidence_level": "parsed_and_validated"},
            {"id": "step.p21.inspect", "status": "available", "evidence_level": "structure_only"},
            {"id": "step.geometry.import", "status": "disabled", "evidence_level": "not_tested"},
        ],
        "physical_output_enabled": False,
    }
