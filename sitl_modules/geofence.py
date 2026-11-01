"""Géofence 2D en coordonnées normalisées, réservé aux scénarios SITL.

Ce contrôle ne constitue pas un dispositif de sécurité d'un aéronef réel.
Les polygones et trajectoires n'emploient pas de coordonnées géographiques.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Sequence

Point = tuple[float, float]

@dataclass(frozen=True)
class GeofenceZone:
    zone_id: str
    polygon: tuple[Point, ...]
    name: str = "Zone interdite SIM"

    def __post_init__(self) -> None:
        if len(self.polygon) < 3:
            raise ValueError("Un polygone doit avoir au moins trois sommets.")
        if any(not (0 <= x <= 100 and 0 <= y <= 100) for x, y in self.polygon):
            raise ValueError("Les coordonnées normalisées doivent être comprises entre 0 et 100.")

    def contains(self, point: Point) -> bool:
        x, y = point
        if not (0 <= x <= 100 and 0 <= y <= 100):
            raise ValueError("Le point doit être compris entre 0 et 100.")
        inside = False
        vertices = self.polygon
        for index, (x1, y1) in enumerate(vertices):
            x2, y2 = vertices[(index + 1) % len(vertices)]
            # Un point sur la frontière est traité comme étant dans la zone.
            cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
            if abs(cross) < 1e-9 and min(x1, x2) <= x <= max(x1, x2) and min(y1, y2) <= y <= max(y1, y2):
                return True
            if (y1 > y) != (y2 > y):
                crossing_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
                if x < crossing_x:
                    inside = not inside
        return inside

def check_point(point: Point, zones: Sequence[GeofenceZone]) -> dict[str, object]:
    """Renvoie une alerte SIM quand un point entre dans un polygone interdit."""
    breached = [zone for zone in zones if zone.contains(point)]
    return {
        "position": {"x": point[0], "y": point[1]},
        "inside_restricted_zone": bool(breached),
        "breached_zones": [{"id": z.zone_id, "name": z.name} for z in breached],
        "alerts": ["GEOFENCE_SIM_INTRUSION"] if breached else [],
        "simulation_only": True,
        "hardware_control": False,
    }
