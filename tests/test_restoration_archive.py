import pytest

from web.restoration_archive import make_archive, validate_archive


def sample_archive():
    return make_archive(
        {"id": "project-1", "userId": "owner-1", "name": "Essai", "data": {"project": {"name": "Essai"}, "config": {}}, "activeDroneId": "drone-1"},
        [{"id": "drone-1", "userId": "owner-1", "projectId": "project-1", "name": "Quad", "data": {"motor_count": 4}}],
    )


def test_archive_round_trip_and_checksum():
    archive = sample_archive()
    assert validate_archive(archive)["drones"][0]["name"] == "Quad"
    archive["drones"][0]["data"]["motor_count"] = 8
    with pytest.raises(ValueError, match="empreinte"):
        validate_archive(archive)


def test_archive_rejects_cross_project_drone_even_if_rechecksummed():
    archive = sample_archive()
    archive["drones"][0]["projectId"] = "other-project"
    unsigned = {key: value for key, value in archive.items() if key != "sha256"}
    import hashlib, json
    archive["sha256"] = hashlib.sha256(json.dumps(unsigned, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
    with pytest.raises(ValueError, match="ne correspond pas"):
        validate_archive(archive)


def test_archive_rejects_unsupported_version():
    archive = sample_archive()
    archive["version"] = 99
    with pytest.raises(ValueError, match="version"):
        validate_archive(archive)
