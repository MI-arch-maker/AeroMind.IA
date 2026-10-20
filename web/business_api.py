"""Owner-scoped REST mutations for projects, simulations, reports and LabBench sessions."""

import json
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .app_auth_helpers import current_user
from .database import get_db
from .models import Drone, LabSession, Project, Report, Simulation, User, UserSetting

router = APIRouter(prefix="/api", tags=["business"])


class RecordIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=200)
    data: dict = Field(default_factory=dict)
    project_id: str | None = None
    drone: dict | None = None


class SettingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(min_length=1, max_length=120)
    value: dict | list | str | int | float | bool | None


def owner(cookie: str | None, db: Session) -> str:
    user = current_user(cookie)
    if not user:
        raise HTTPException(401, "OIDC authentication required")
    row = db.get(User, user["id"])
    if row is None:
        db.add(User(id=user["id"], email=user["email"]))
        db.commit()
    return user["id"]


def dump(record, key="data"):
    stored_json = record.config_json if isinstance(record, Drone) else record.data_json
    result = {"id": record.id, key: json.loads(stored_json)}
    if isinstance(record, Project):
        result.update(
            {
                "name": record.name,
                "active_drone_id": record.active_drone_id,
                "created_at": record.created_at.isoformat() if record.created_at else None,
                "updated_at": record.updated_at.isoformat() if record.updated_at else None,
            }
        )
    elif isinstance(record, Drone):
        result.update({"name": record.name, "project_id": record.project_id})
    else:
        result["project_id"] = record.project_id
    return result


def get_project(db, user_id, project_id):
    record = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == user_id))
    if not record:
        raise HTTPException(404, "Project not found")
    return record


@router.get("/projects")
def list_projects(
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)
):
    user_id = owner(aeromind_session, db)
    return [
        dump(p)
        for p in db.scalars(
            select(Project).where(Project.user_id == user_id).order_by(Project.created_at.desc())
        )
    ]


@router.post("/projects", status_code=201)
def create_project(
    body: RecordIn,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    db: Session = Depends(get_db),
):
    user_id = owner(aeromind_session, db)
    project_id, drone_id = str(uuid4()), str(uuid4())
    drone_data = body.drone or {
        "mass_kg": 1.2,
        "battery_wh": 100,
        "motor_count": 4,
        "airframe": "multirotor",
    }
    drone = Drone(
        id=drone_id,
        user_id=user_id,
        project_id=project_id,
        name="Drone par défaut",
        config_json=json.dumps(drone_data),
    )
    project = Project(
        id=project_id,
        user_id=user_id,
        name=body.name or "Nouveau projet",
        data_json=json.dumps(body.data),
        active_drone_id=drone_id,
    )
    db.add(project)
    db.commit()
    db.add(drone)
    db.commit()
    db.refresh(project)
    return dump(project)


@router.get("/projects/{project_id}")
def read_project(
    project_id: str,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    db: Session = Depends(get_db),
):
    return dump(get_project(db, owner(aeromind_session, db), project_id))


@router.put("/projects/{project_id}")
@router.patch("/projects/{project_id}")
def update_project(
    project_id: str,
    body: RecordIn,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    db: Session = Depends(get_db),
):
    user_id = owner(aeromind_session, db)
    project = get_project(db, user_id, project_id)
    fields = body.model_fields_set
    if "name" in fields and body.name:
        project.name = body.name
    if "data" in fields:
        project.data_json = json.dumps(body.data)
    if body.drone is not None:
        drone = db.get(Drone, project.active_drone_id) if project.active_drone_id else None
        if drone is None:
            drone = Drone(
                id=str(uuid4()),
                user_id=user_id,
                project_id=project.id,
                name="Drone du projet",
                config_json="{}",
            )
            db.add(drone)
            project.active_drone_id = drone.id
        drone.config_json = json.dumps(body.drone)
    db.commit()
    db.refresh(project)
    return dump(project)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    db: Session = Depends(get_db),
):
    project = get_project(db, owner(aeromind_session, db), project_id)
    db.delete(project)
    db.commit()
    return Response(status_code=204)


@router.get("/projects/{project_id}/drone")
def active_drone(
    project_id: str,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    db: Session = Depends(get_db),
):
    user_id = owner(aeromind_session, db)
    project = get_project(db, user_id, project_id)
    drone = db.get(Drone, project.active_drone_id) if project.active_drone_id else None
    if drone is None:
        raise HTTPException(404, "Active drone not found")
    return dump(drone, "config")


@router.put("/projects/{project_id}/drone")
def set_drone(
    project_id: str,
    body: RecordIn,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    db: Session = Depends(get_db),
):
    user_id = owner(aeromind_session, db)
    project = get_project(db, user_id, project_id)
    drone = db.get(Drone, project.active_drone_id) if project.active_drone_id else None
    if drone is None:
        drone = Drone(
            id=str(uuid4()),
            user_id=user_id,
            project_id=project.id,
            name=body.name or "Drone du projet",
            config_json="{}",
        )
        db.add(drone)
    drone.config_json = json.dumps(body.data)
    project.active_drone_id = drone.id
    db.commit()
    return dump(drone, "config")


# All child resources use identical owner-scoped REST semantics.
for route, model in [
    ("simulations", Simulation),
    ("reports", Report),
    ("lab-sessions", LabSession),
]:

    def make_list(m):
        def endpoint(
            project_id: str,
            aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
            db: Session = Depends(get_db),
        ):
            uid = owner(aeromind_session, db)
            get_project(db, uid, project_id)
            return [
                dump(x)
                for x in db.scalars(
                    select(m)
                    .where(m.user_id == uid, m.project_id == project_id)
                    .order_by(m.created_at.desc())
                )
            ]

        return endpoint

    def make_create(m):
        def endpoint(
            project_id: str,
            body: RecordIn,
            aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
            db: Session = Depends(get_db),
        ):
            uid = owner(aeromind_session, db)
            get_project(db, uid, project_id)
            obj = m(
                id=str(uuid4()), user_id=uid, project_id=project_id, data_json=json.dumps(body.data)
            )
            db.add(obj)
            db.commit()
            return dump(obj)

        return endpoint

    router.add_api_route(
        f"/projects/{{project_id}}/{route}", make_list(model), methods=["GET"], name=f"{route}_list"
    )
    router.add_api_route(
        f"/projects/{{project_id}}/{route}",
        make_create(model),
        methods=["POST"],
        status_code=201,
        name=f"{route}_create",
    )

    def make_read(m):
        def endpoint(
            project_id: str,
            item_id: str,
            aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
            db: Session = Depends(get_db),
        ):
            uid = owner(aeromind_session, db)
            obj = db.scalar(
                select(m).where(m.id == item_id, m.user_id == uid, m.project_id == project_id)
            )
            if not obj:
                raise HTTPException(404, "Record not found")
            return dump(obj)

        return endpoint

    router.add_api_route(
        f"/projects/{{project_id}}/{route}/{{item_id}}",
        make_read(model),
        methods=["GET"],
        name=f"{route}_read",
    )

    def make_item(m):
        def endpoint(
            project_id: str,
            item_id: str,
            body: RecordIn | None = None,
            aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
            db: Session = Depends(get_db),
        ):
            uid = owner(aeromind_session, db)
            obj = db.scalar(
                select(m).where(m.id == item_id, m.user_id == uid, m.project_id == project_id)
            )
            if not obj:
                raise HTTPException(404, "Record not found")
            if body is None:
                db.delete(obj)
                db.commit()
                return Response(status_code=204)
            obj.data_json = json.dumps(body.data)
            db.commit()
            return dump(obj)

        return endpoint

    router.add_api_route(
        f"/projects/{{project_id}}/{route}/{{item_id}}",
        make_item(model),
        methods=["PUT", "PATCH"],
        name=f"{route}_update",
    )
    router.add_api_route(
        f"/projects/{{project_id}}/{route}/{{item_id}}",
        make_item(model),
        methods=["DELETE"],
        status_code=204,
        name=f"{route}_delete",
    )


@router.get("/settings")
def get_settings(
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)
):
    uid = owner(aeromind_session, db)
    return {
        x.key: json.loads(x.value_json)
        for x in db.scalars(select(UserSetting).where(UserSetting.user_id == uid))
    }


@router.put("/settings")
def put_setting(
    body: SettingIn,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    db: Session = Depends(get_db),
):
    uid = owner(aeromind_session, db)
    row = db.scalar(
        select(UserSetting).where(UserSetting.user_id == uid, UserSetting.key == body.key)
    )
    if row is None:
        row = UserSetting(user_id=uid, key=body.key, value_json="null")
        db.add(row)
    row.value_json = json.dumps(body.value)
    db.commit()
    return {"key": body.key, "value": body.value}
