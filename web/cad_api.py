"""Owner-scoped solid CAD API. Include ``router`` in the existing FastAPI app.

Public routes operate only on the fixed demo fixture. Private mutations accept
same-origin cookies or the existing authenticated bearer mechanism, never an
anonymous upload. Storage root: AEROMIND_CAD_STORAGE_DIR (or CAD_STORAGE_ROOT).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import os
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from .app_auth_helpers import current_user
from . import cad_kernel as cad

router = APIRouter(prefix="/api/cad", tags=["solid-cad"])


class SectionIn(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    normal: list[float] = Field(min_length=3, max_length=3)
    offset_mm: float = Field(ge=-1e7, le=1e7)


class MaterialsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assignments: dict[str, str] = Field(min_length=1, max_length=cad.MAX_SOLIDS)


class PmiIn(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    part_id: str = Field(min_length=1, max_length=120)
    face_id: str = Field(min_length=1, max_length=240)
    kind: str = Field(min_length=1, max_length=40)
    nominal_mm: float | None = Field(default=None, ge=0, le=1e9)
    tolerance_um: float | None = Field(default=None, ge=0, le=1e9)
    datum: str | None = Field(default=None, max_length=32)
    text: str = Field(default="", max_length=2000)


def authenticated_owner(request: Request):
    cookie = request.cookies.get("aeromind_session")
    authorization = request.headers.get("authorization")
    user = current_user(cookie, authorization)
    if not user:
        raise HTTPException(401, "OIDC authentication required")
    if user.get("accountStatus", "active") != "active":
        raise HTTPException(403, "Account is not active")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        if user.get("role") == "visitor":
            raise HTTPException(403, "Visitor cannot create or modify persistent CAD data")
        if cookie:
            # Existing session auth prioritizes the cookie over Authorization.
            # Therefore an unvalidated bearer header cannot bypass cookie CSRF.
            origin = request.headers.get("origin")
            fetch_site = request.headers.get("sec-fetch-site", "").lower()
            parsed = urlsplit(str(request.base_url))
            same_origin = f"{parsed.scheme}://{parsed.netloc}"
            allowed = {same_origin}
            allowed.update(x.strip().rstrip("/") for x in os.environ.get("AEROMIND_CAD_ALLOWED_ORIGINS", "").split(",") if x.strip())
            if fetch_site == "cross-site" or (origin and origin.rstrip("/") not in allowed) or (not origin and fetch_site != "same-origin"):
                raise HTTPException(403, "CAD cookie mutations require a trusted Origin or same-origin Sec-Fetch-Site")
    return str(user["id"])


def get_store():
    return cad.CadStore()


@lru_cache(maxsize=1)
def _demo():
    with cad.KERNEL_LOCK:
        model = cad.import_model(_demo_step_bytes(), "aeromind_support_ap242.step", "demo")
        if len(model.parts) != 15:
            raise HTTPException(503, "Fixed CAD demo fixture integrity/solid-count failure")
        fixed_materials = ["al7075"] * 5 + ["ti6al4v"] * 7 + ["cfrp", "ti6al4v", "ti6al4v"]
        cad.assign_materials(model, {p.id: material for p, material in zip(model.parts, fixed_materials)})
        model.name = "AEROMIND — support de transmission percé"
        model.source.update(fixture="aeromind-support-v1", material_attribution="fixed demo bill of materials, nominal densities")
        cad.add_pmi(model, {"part_id": model.parts[0].id, "face_id": model.parts[0].face_ids[0], "kind": "flatness", "tolerance_um": 8., "text": "Planéité 8 µm — démonstration", "datum": "A"}, "demo")
        cad.add_pmi(model, {"part_id": model.parts[5].id, "face_id": model.parts[5].face_ids[0], "kind": "dimension", "nominal_mm": 15., "tolerance_um": 5., "text": "Ø15 ±5 µm — démonstration"}, "demo")
        cad.add_pmi(model, {"part_id": model.parts[12].id, "face_id": model.parts[12].face_ids[0], "kind": "material", "text": "CFRP fabric Vf≈50%, 1600 kg/m³ — stratification et lot à confirmer"}, "demo")
        model.warnings.append("Fixed demo materials explicitly assigned from fixture BOM, not inferred from unknown STEP labels")
        model.warnings.append("Downloaded demo STEP contains geometry/names; runtime demo/user PMI is not exported")
        return model


@lru_cache(maxsize=1)
def _demo_step_bytes():
    path = Path(__file__).resolve().parents[1] / "fixtures/cad/aeromind_support_ap242.step"
    if not path.is_file() or path.is_symlink():
        raise HTTPException(503, "Fixed AP242 demo fixture unavailable")
    data = path.read_bytes()
    if len(data) > cad.MAX_SOURCE_BYTES or b"AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF" not in data[:2000]:
        raise HTTPException(503, "Fixed AP242 demo fixture schema/size failure")
    return data


@lru_cache(maxsize=1)
def _demo_document():
    return cad.render_model(_demo())


def _load(store, uid, model_id):
    try:
        return store.load(uid, model_id)
    except (FileNotFoundError, cad.CadError):
        # Do not distinguish owner existence or disclose storage paths.
        raise HTTPException(404, "CAD model not found or unavailable") from None


def _validated(operation, *args, **kwargs):
    try:
        return operation(*args, **kwargs)
    except cad.CadError as exc:
        raise HTTPException(422, str(exc)) from None


@router.get("/capabilities")
def capabilities():
    return {"kernel": cad.KERNEL_INFO, "units": "mm", "solid_brep": True,
        "step_import": "STEPCAF XDE; solid occurrences, names, hierarchy and placements",
        "step_export": {"schema": "AP242", "geometry": True, "names": True, "pmi": False,
                        "limitation": "Demo STEP exports geometry/names only, not complete PMI"},
        "exact_properties": "BRepGProp adaptive surface integration, not mesh-derived; relative tolerance 1e-9",
        "section": "BRepAlgoAPI_Common with exact geometric halfspace; capped solid with preserved cavities",
        "face_identity": "source B-Rep face IDs; Boolean history where available; new cap provenance",
        "pmi": {"user_face_linked": True, "tolerance_unit": "micrometre", "xde_semantic_import": "partial",
                "unsupported": ["presentation-only PMI", "complete AP242 profile fidelity", "complex semantic modifiers", "PMI export"]},
        "limits": {"max_source_bytes": cad.MAX_SOURCE_BYTES, "max_solids": cad.MAX_SOLIDS,
                   "max_faces": cad.MAX_FACES, "max_display_triangles": cad.MAX_TRIANGLES},
        "density_status": "documented nominal values; no batch certification",
        "pbr_status": "parameterized; no measured optical calibration",
        "institutional_certification": False}


@router.get("/materials")
def materials():
    return {"materials": list(cad.MATERIALS.values())}


@router.get("/demo")
def demo():
    return _validated(_demo_document)


@router.post("/demo/section")
def demo_section(body: SectionIn):
    # No model ID, shape, source path or user supplied geometry is accepted.
    result = _validated(cad.section_model, _demo(), body.normal, body.offset_mm)
    return _validated(cad.render_model, result)


@router.get("/demo/step")
def demo_step():
    return Response(content=_demo_step_bytes(), media_type="application/step",
        headers={"Content-Disposition": 'attachment; filename="aeromind-support-v1-ap242.step"',
                 "X-Content-Type-Options": "nosniff", "X-CAD-PMI-Export": "false",
                 "Warning": '299 AEROMIND "Geometry/names only; semantic demo/user PMI not exported"'})


@router.post("/imports", status_code=201)
async def import_file(request: Request, file: UploadFile = File(...),
                      uid: str = Depends(authenticated_owner), store: cad.CadStore = Depends(get_store)):
    # Authentication/CSRF dependencies are checked before any CAD file persistence.
    filename = (file.filename or "").replace("\\", "/")
    if Path(filename).suffix.lower() not in {".step", ".stp", ".brep"}:
        await file.close()
        raise HTTPException(415, "Only STEP and BREP files are supported")
    chunks, size = [], 0
    try:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > cad.MAX_SOURCE_BYTES:
                raise HTTPException(413, "CAD source exceeds 25 MiB limit")
            chunks.append(chunk)
    finally:
        await file.close()
    data = b"".join(chunks)
    def process():
        model = _validated(cad.import_model, data, filename)
        # Ensure display limits are satisfied before saving a persistent model.
        document = _validated(cad.render_model, model)
        store.save_new(uid, model, data)
        return document
    return await run_in_threadpool(process)


@router.get("/models/{model_id}")
def read_model(model_id: str, uid: str = Depends(authenticated_owner), store: cad.CadStore = Depends(get_store)):
    return _validated(cad.render_model, _load(store, uid, model_id))


@router.post("/models/{model_id}/section")
def model_section(model_id: str, body: SectionIn, uid: str = Depends(authenticated_owner),
                  store: cad.CadStore = Depends(get_store)):
    model = _load(store, uid, model_id)
    result = _validated(cad.section_model, model, body.normal, body.offset_mm)
    return _validated(cad.render_model, result)


@router.post("/models/{model_id}/materials")
def model_materials(model_id: str, body: MaterialsIn, uid: str = Depends(authenticated_owner),
                    store: cad.CadStore = Depends(get_store)):
    with cad.KERNEL_LOCK:
        model = _load(store, uid, model_id)
        _validated(cad.assign_materials, model, body.assignments)
        store.update(uid, model)
        return _validated(cad.render_model, model)


@router.post("/models/{model_id}/pmi", status_code=201)
def model_pmi(model_id: str, body: PmiIn, uid: str = Depends(authenticated_owner),
              store: cad.CadStore = Depends(get_store)):
    with cad.KERNEL_LOCK:
        model = _load(store, uid, model_id)
        _validated(cad.add_pmi, model, body.model_dump(exclude_none=True))
        store.update(uid, model)
        return _validated(cad.render_model, model)
