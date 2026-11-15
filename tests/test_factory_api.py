import io
import numpy as np
from web.factory_api import _points, _voxel_decimate, AssemblyRequest, simulate, ExportRequest, export_factory

def test_lidar_ply_bounds_and_voxel_decimation():
    raw=b"ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n0.001 0 0\n1 1 1\n1.001 1 1\n"
    pts=_points(raw,"scan.ply")
    reduced=_voxel_decimate(pts,0.01)
    assert pts.shape==(4,3)
    assert len(reduced)==2
    assert np.allclose(pts.min(axis=0),[0,0,0])

def test_collision_blocks_and_clear_sequence_runs():
    base={"units":"m","parts":[{"id":"fixture","min":[0,0,0],"max":[1,1,1]},{"id":"part","min":[0,0,0],"max":[.5,.5,.5]}]}
    blocked=simulate(AssemblyRequest(**(base|{"steps":[{"id":"s","label":"insert","duration_s":2,"transforms":{}}]})))
    clear=simulate(AssemblyRequest(**(base|{"steps":[{"id":"s","label":"clear","duration_s":2,"transforms":{"part":[2,0,0]}}]})))
    assert blocked["blocked"] and blocked["steps"][0]["status"]=="BLOCKED"
    assert not clear["blocked"] and clear["steps"][0]["status"]=="CLEAR"

def test_export_has_factory_frame_and_scale_one():
    req=ExportRequest(units="m",parts=[{"id":"a","min":[0,0,0],"max":[1,2,3]}],steps=[{"id":"s","label":"x","duration_s":1}],format="laser-json")
    out=export_factory(req)
    assert out["coordinate_frame"]=="factory-world"
    assert out["scale"]==1
    assert out["parts"][0]["max"]==[1,2,3]
