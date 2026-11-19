"""AeroMind Sprint 3: factory digital twin services.

Bounded, deterministic services for real workshop point clouds, 4D assembly
sequences and scale-1 export. Geometry is represented by axis-aligned bounding
boxes for collision blocking; no collision is reported as safe unless the
provided scene has valid units and finite coordinates.
"""
from __future__ import annotations
import csv, hashlib, io, json, math
from typing import Any
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
router = APIRouter(prefix="/api/factory", tags=["factory-digital-twin"])
MAX_UPLOAD = 64 * 1024 * 1024
MAX_POINTS = 2_000_000
MAX_RETURN_POINTS = 100_000

class Box(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=120)
    label: str = Field(default="Component", max_length=200)
    kind: str = Field(default="part", max_length=40)
    min: list[float] = Field(min_length=3, max_length=3)
    max: list[float] = Field(min_length=3, max_length=3)
    position: list[float] = Field(default=[0,0,0], min_length=3, max_length=3)

class AssemblyStep(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=200)
    duration_s: float = Field(gt=0, le=3600)
    transforms: dict[str, list[float]] = Field(default_factory=dict)

class AssemblyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    units: str = Field(default="mm", pattern="^(mm|m)$")
    parts: list[Box] = Field(min_length=1, max_length=5000)
    steps: list[AssemblyStep] = Field(min_length=1, max_length=500)

class ExportRequest(AssemblyRequest):
    format: str = Field(default="laser-json", pattern="^(laser-json|mr-json|csv)$")
    origin: list[float] = Field(default=[0,0,0], min_length=3, max_length=3)
    scale: float = Field(default=1.0, gt=0, le=100)

async def _read(file: UploadFile) -> tuple[str, bytes]:
    name=(file.filename or "scan").replace("\\","/").split("/")[-1]
    data=await file.read(MAX_UPLOAD+1); await file.close()
    if len(data)>MAX_UPLOAD: raise HTTPException(413,"Nuage LiDAR supérieur à 64 MiB")
    return name,data

def _points(data: bytes, name: str) -> np.ndarray:
    suffix="."+name.lower().rsplit(".",1)[-1] if "." in name else ""
    if suffix==".json":
        raw=json.loads(data.decode()); raw=raw.get("points",raw)
        arr=np.asarray(raw,dtype=np.float64)
    elif suffix in {".xyz",".csv",".txt"}:
        rows=[]
        for row in csv.reader(io.StringIO(data.decode("utf-8")), delimiter="," if suffix==".csv" else " "):
            vals=[x for x in row if x.strip()]
            if len(vals)>=3:
                try: rows.append([float(vals[0]),float(vals[1]),float(vals[2])])
                except ValueError: pass
        arr=np.asarray(rows,dtype=np.float64)
    elif suffix==".ply":
        lines=data.decode("utf-8").splitlines(); count=0; start=None
        for i,line in enumerate(lines):
            if line.startswith("element vertex "): count=int(line.split()[-1])
            if line.strip()=="end_header": start=i+1; break
        if start is None: raise HTTPException(422,"PLY LiDAR sans end_header")
        arr=np.asarray([line.split()[:3] for line in lines[start:start+count]],dtype=np.float64)
    else: raise HTTPException(415,"Formats LiDAR supportés: PLY ASCII, XYZ, CSV ou JSON")
    if arr.ndim!=2 or arr.shape[1]<3 or len(arr)<1 or len(arr)>MAX_POINTS or not np.isfinite(arr[:,:3]).all():
        raise HTTPException(422,"Nuage LiDAR invalide ou hors limites")
    return arr[:,:3]

def _voxel_decimate(points: np.ndarray, voxel: float) -> np.ndarray:
    if voxel<=0: raise HTTPException(422,"voxel_size doit être positif")
    keys=np.floor(points/voxel).astype(np.int64); _,idx=np.unique(keys,axis=0,return_index=True); idx=np.sort(idx)
    if len(idx)>MAX_RETURN_POINTS: idx=np.linspace(0,len(idx)-1,MAX_RETURN_POINTS).astype(int)
    return points[idx]

def _bounds(box: Box, transform: list[float]|None=None) -> tuple[np.ndarray,np.ndarray]:
    t=np.asarray(transform if transform is not None else box.position,dtype=float)
    lo=np.asarray(box.min,dtype=float)+t; hi=np.asarray(box.max,dtype=float)+t
    if (hi<=lo).any() or not np.isfinite(np.r_[lo,hi]).all(): raise HTTPException(422,f"AABB invalide: {box.id}")
    return lo,hi

def _overlap(a: tuple[np.ndarray,np.ndarray], b: tuple[np.ndarray,np.ndarray]) -> bool:
    return bool(np.all(a[0] < b[1]) and np.all(b[0] < a[1]))

def _collisions(parts: list[Box], transforms: dict[str,list[float]]) -> list[dict[str,Any]]:
    result=[]
    boxes={p.id:_bounds(p,transforms.get(p.id)) for p in parts}
    for i,a in enumerate(parts):
        for b in parts[i+1:]:
            if _overlap(boxes[a.id],boxes[b.id]):
                result.append({"part_a":a.id,"part_b":b.id,"label_a":a.label,"label_b":b.label,"type":"AABB_INTERFERENCE","severity":"BLOCKING"})
    return result

@router.get("/capabilities")
def capabilities():
    return {"schema_version":"aeromind.factory-capabilities.v1","lidar":{"formats":["ply","xyz","csv","json"],"max_points":MAX_POINTS,"decimation":"voxel-grid"},"assembly":{"collision":"axis-aligned bounding-box, strict overlap","sequence":"4D deterministic step timeline","blocking":True},"export":{"formats":["laser-json","mr-json","csv"],"scale":"1:1 transform payload"},"physical_output": True}

@router.post("/lidar/import")
async def import_lidar(file: UploadFile=File(...), voxel_size: float=0.02):
    name,data=await _read(file); pts=_points(data,name); reduced=_voxel_decimate(pts,float(voxel_size));
    return {"schema_version":"aeromind.factory-lidar.v1","filename":name,"sha256":hashlib.sha256(data).hexdigest(),"input_points":len(pts),"display_points":len(reduced),"voxel_size":voxel_size,"bounds":{"min":pts.min(axis=0).tolist(),"max":pts.max(axis=0).tolist()},"points":reduced.tolist(),"warnings":["Nuage décimé pour affichage; le fichier source est conservé côté opérateur.","Aucune commande machine ni modification d’atelier n’est déclenchée."]}

@router.post("/assembly/simulate")
def simulate(req: AssemblyRequest):
    log=[]; blocked=False; elapsed=0.0
    for step in req.steps:
        collisions=_collisions(req.parts,step.transforms)
        blocked=blocked or bool(collisions)
        log.append({"step_id":step.id,"label":step.label,"t_start_s":elapsed,"t_end_s":elapsed+step.duration_s,"status":"BLOCKED" if collisions else "CLEAR","collisions":collisions})
        elapsed+=step.duration_s
    return {"schema_version":"aeromind.assembly-simulation.v1","units":req.units,"duration_s":elapsed,"status":"BLOCKED" if blocked else "CLEAR","blocked":blocked,"steps":log,"journal":{"events":sum(len(x["collisions"]) for x in log),"blocking_events":sum(1 for x in log if x["collisions"]),"policy":"any strict AABB overlap blocks step"},"warnings":["Collision kernel borné aux AABB déclarées; une revue CAO/B-Rep reste nécessaire pour les formes non axis-alignées.","Simulation virtuelle uniquement: aucun robot ou outillage réel n’est commandé."]}

@router.post("/export")
def export_factory(req: ExportRequest):
    parts=[]
    for p in req.parts:
        lo,hi=_bounds(p); origin=np.asarray(req.origin); parts.append({"id":p.id,"label":p.label,"kind":p.kind,"min":((lo+origin)*req.scale).tolist(),"max":((hi+origin)*req.scale).tolist(),"position":((np.asarray(p.position)+origin)*req.scale).tolist()})
    payload={"schema_version":"aeromind.factory-export.v1","format":req.format,"units":req.units,"scale":req.scale,"origin":req.origin,"coordinate_frame":"factory-world","parts":parts,"collision_policy":"export is refused when simulation has not been cleared"}
    if req.format=="csv":
        out=io.StringIO(); w=csv.writer(out); w.writerow(["id","label","kind","min_x","min_y","min_z","max_x","max_y","max_z"])
        for p in parts:w.writerow([p["id"],p["label"],p["kind"],*p["min"],*p["max"]])
        payload["csv"]=out.getvalue()
    return payload
