from __future__ import annotations

import json

import numpy as np

from web.inspection_api import MetrologyOptions, _best_fit, _parse_geometry, _volume_from_json, _volume_report


def test_ct_json_decodes_spacing_and_density_range() -> None:
    payload = {"dimensions": [2, 2, 2], "spacing_mm": [0.25, 0.5, 1.0], "values": [0, 1, 2, 3, 4, 5, 6, 7]}
    values, meta = _volume_from_json(json.dumps(payload).encode())
    report = _volume_report(values, meta, "fixture.json", "sha")
    assert report["voxel_count"] == 8
    assert report["spacing_mm"] == [0.25, 0.5, 1.0]
    assert report["density_range"] == {"min": 0.0, "max": 7.0}
    assert len(report["texture_values"]) == 8


def test_best_fit_removes_rigid_translation_and_reports_micrometre_scale() -> None:
    cad = np.array([[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10]], dtype=float)
    scan = cad + np.array([0.2, -0.1, 0.3])
    fitted, target, iterations, rms = _best_fit(scan, cad, MetrologyOptions(max_iterations=20))
    assert fitted.shape == target.shape == (4, 3)
    assert iterations <= 20
    assert rms < 1e-6


def test_json_point_cloud_parser_is_explicit_and_finite() -> None:
    points = _parse_geometry(b'{"points": [[0, 0, 0], [1, 2, 3], [2, 3, 4]]}', ".json")
    assert points.shape == (3, 3)
    assert np.isfinite(points).all()
