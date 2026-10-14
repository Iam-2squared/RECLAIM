"""Pure helpers shared by RECLAIM's optional, offline Blender tools.

No bpy import occurs here. Output checks and unit tests can run without Blender.
The tools never remove objects from an existing user scene.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Iterable

GENERATOR_ID = "reclaim.shiretoko.environment.v03"
MANIFEST_SCHEMA = "reclaim.blender-artifacts.v1"
WORLD_SEED = 431071


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def config_hash(config: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(config, sort_keys=True, ensure_ascii=False,
                                     separators=(",", ":")).encode("utf-8")).hexdigest()


def runtime_to_blender(position: Iterable[float]) -> tuple[float, float, float]:
    """Runtime is Y-up; Blender is Z-up. GLB export restores standard Y-up."""
    x, y, z = position
    return float(x), -float(z), float(y)


def _resolved(path: str | Path) -> Path:
    return Path(path).expanduser().resolve()


def _portable_filename(name: str) -> bool:
    return bool(name) and Path(name).name == name and not any(
        character in name for character in ("/", "\\", ":", "\0")) and name not in (".", "..")


def check_outputs(output_directory: str | Path | None, filenames: Iterable[str],
                  protected_paths: Iterable[str | Path] = ()) -> tuple[Path, list[Path]]:
    """Default: refuse every existing output. No directory is created on failure.

    Deliberately no generic overwrite flag: choose a new directory/name, then
    review/remove only generated outputs manually if replacement is wanted.
    Original .blend/GLB paths are protected even if nonexistent.
    """
    if output_directory is None or not str(output_directory).strip():
        raise ValueError("Set OUTPUT_DIRECTORY explicitly before running this script.")
    directory = _resolved(output_directory)
    if directory.exists() and not directory.is_dir():
        raise ValueError(f"Output directory is not a directory: {directory}")
    names = list(filenames)
    if not names or len(set(names)) != len(names) or not all(_portable_filename(n) for n in names):
        raise ValueError("Output names must be unique, plain portable filenames.")
    paths = [directory / name for name in names]
    protected = {_resolved(path) for path in protected_paths if str(path)}
    for path in paths:
        if _resolved(path) in protected:
            raise ValueError(f"An original/source file cannot be an output: {path}")
        if path.exists() or path.is_symlink():
            raise FileExistsError(f"Output already exists; use a new output folder/name: {path}")
    return directory, paths


class ArtifactTransaction:
    """Stage outputs together, recheck conflicts, then publish new files only.

    Link creation is exclusive. On an I/O failure only files created by this
    transaction are removed. Existing files are never replaced or deleted.
    Blender's save-as-copy operation writes into this staging directory.
    """
    def __init__(self, directory: Path, filenames: Iterable[str], protected: Iterable[Path] = ()):
        self.directory, self.targets = check_outputs(directory, filenames, protected)
        self.protected = tuple(protected)
        self.staging: Path | None = None

    def __enter__(self) -> "ArtifactTransaction":
        self.directory.mkdir(parents=True, exist_ok=True)
        self.staging = Path(tempfile.mkdtemp(prefix=".reclaim-stage-", dir=self.directory))
        return self

    def path(self, name: str) -> Path:
        if self.staging is None or name not in {p.name for p in self.targets}:
            raise ValueError("Requested file is outside the declared transaction.")
        return self.staging / name

    def commit(self) -> None:
        if self.staging is None:
            raise RuntimeError("Transaction is not active.")
        for target in self.targets:
            staged = self.staging / target.name
            if not staged.is_file():
                raise FileNotFoundError(f"No staged output: {staged}")
        check_outputs(self.directory, [p.name for p in self.targets], self.protected)
        published: list[Path] = []
        try:
            for target in self.targets:
                # Same-filesystem hard link uses exclusive destination creation.
                # Never fall back to replace(): preserving user files is mandatory.
                os.link(self.staging / target.name, target)
                published.append(target)
        except Exception:
            for target in published:
                target.unlink(missing_ok=True)
            raise

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        if self.staging is not None:
            shutil.rmtree(self.staging, ignore_errors=True)
        self.staging = None


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def source_records(paths: Iterable[Path]) -> list[dict[str, Any]]:
    return [{"path": str(path.resolve()), "sha256": sha256_file(path), "bytes": path.stat().st_size}
            for path in paths if path.is_file()]


def normalization(bounds_min: Iterable[float], bounds_max: Iterable[float],
                  target_height: float) -> dict[str, Any]:
    """One transform for the entire tree hierarchy, never one per leaf/trunk."""
    low, high = tuple(bounds_min), tuple(bounds_max)
    if len(low) != 3 or len(high) != 3 or not all(math.isfinite(v) for v in (*low, *high, target_height)):
        raise ValueError("Bounds and target height must be finite 3D values.")
    height = high[2] - low[2]
    if height <= 0.01 or target_height <= 0 or target_height > 30:
        raise ValueError("Tree height must be positive; target is limited to 30 metres.")
    return {"scale": target_height / height,
            "base_center": ((low[0] + high[0]) / 2, (low[1] + high[1]) / 2, low[2]),
            "source_height": height, "target_height": target_height}


def descendant_ids(nodes: list[dict[str, Any]], root_id: str) -> set[str]:
    by_id = {node["nodeId"]: node for node in nodes}
    if len(by_id) != len(nodes) or root_id not in by_id:
        raise ValueError("Inspection contains duplicate or missing node IDs.")
    result, frontier = set(), [root_id]
    while frontier:
        current = frontier.pop()
        if current in result:
            raise ValueError("Hierarchy contains a cycle.")
        result.add(current)
        frontier.extend(node["nodeId"] for node in nodes if node.get("parentId") == current)
    return result


def validate_tree_selection(report: dict[str, Any], root_ids: Iterable[str],
                            confirmed_whole_tree_ids: Iterable[str]) -> list[str]:
    chosen, confirmed = list(root_ids), set(confirmed_whole_tree_ids)
    if not chosen or len(chosen) != len(set(chosen)):
        raise ValueError("Choose unique inspected TREE_ROOT_IDS; automatic guessing is disabled.")
    if set(chosen) != confirmed:
        raise ValueError("Confirm that every selected ID is one whole tree, including foliage and trunk.")
    nodes = report.get("nodes", [])
    covered: set[str] = set()
    by_id = {node["nodeId"]: node for node in nodes}
    for root_id in chosen:
        tree = descendant_ids(nodes, root_id)
        if covered.intersection(tree):
            raise ValueError("Nested/overlapping tree roots cannot be scaled separately.")
        if not any(by_id[node_id].get("meshTriangles", 0) > 0 for node_id in tree):
            raise ValueError(f"Selected tree has no mesh: {root_id}")
        covered.update(tree)
    return chosen


def require_third_party_export_permission(asset: dict[str, Any], allow: bool,
                                          confirmation: str) -> None:
    if not allow or confirmation != "I CONFIRM THIS LICENSE ALLOWS THIS GENERATED GAME ASSET EXPORT":
        raise PermissionError("Third-party .blend/.glb export is disabled until explicitly confirmed.")
    required = ("name", "creator", "sourceUrl", "licenseName", "acquisitionMethod", "evidencePath")
    if any(not isinstance(asset.get(key), str) or not asset[key].strip() for key in required):
        raise ValueError("Complete source, acquisition, licence, and evidence metadata before export.")
    evidence = _resolved(asset["evidencePath"])
    if not evidence.is_file():
        raise FileNotFoundError("Licence/acquisition evidence file is missing.")


def reusable_scene(scene: Any, generator_id: str, fingerprint: str) -> bool:
    """Reject unrelated names/configs; ownership comes from explicit properties."""
    if scene.get("reclaim_generator_id") != generator_id:
        raise ValueError("An existing scene with that name is not owned by this tool.")
    if scene.get("reclaim_config_sha256") != fingerprint:
        raise ValueError("Generated scene uses a different config; choose a new SCENE_NAME.")
    return True


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def coordinate_seed(seed: int, x: int, z: int) -> int:
    """Port of src/world/random.ts; all bitwise operations use uint32 bits."""
    mask = 0xFFFFFFFF
    h = ((int(x) * 374761393) ^ (int(z) * 668265263) ^ seed) & mask
    h = ((h ^ (h >> 13)) * 1274126177) & mask
    return (h ^ (h >> 16)) & mask


def lattice_noise(seed: int, x: float, z: float) -> float:
    ix, iz = math.floor(x), math.floor(z)
    tx, tz = smoothstep(0, 1, x - ix), smoothstep(0, 1, z - iz)
    def value(px: int, pz: int) -> float:
        return coordinate_seed(seed, px, pz) / 4294967295 * 2 - 1
    a = value(ix, iz) * (1 - tx) + value(ix + 1, iz) * tx
    b = value(ix, iz + 1) * (1 - tx) + value(ix + 1, iz + 1) * tx
    return a * (1 - tz) + b * tz


def load_world_contract(path: Path) -> dict[str, Any]:
    contract = json.loads(path.read_text(encoding="utf-8"))
    if contract.get("schema") != "reclaim.blender-world-contract.v1" or contract.get("area", {}).get("id") != "shiretoko":
        raise ValueError("Unsupported/missing Shiretoko world contract.")
    return contract


def route_sample(area: dict[str, Any], x: float, z: float,
                 waypoints: list[dict[str, Any]] | None = None) -> dict[str, float]:
    best = {"distance": math.inf, "height": 0.0, "x": x, "z": z}
    route = area["route"] if waypoints is None else waypoints
    for a, b in zip(route, route[1:]):
        dx, dz = b["x"] - a["x"], b["z"] - a["z"]
        t = max(0.0, min(1.0, ((x - a["x"]) * dx + (z - a["z"]) * dz) / (dx * dx + dz * dz or 1)))
        px, pz = a["x"] + dx * t, a["z"] + dz * t
        distance = math.hypot(x - px, z - pz)
        if distance < best["distance"]:
            best = {"distance": distance, "height": a["height"] + (b["height"] - a["height"]) * t, "x": px, "z": pz}
    return best


def within_trail_margin(area: dict[str, Any], x: float, z: float, margin: float = 0) -> bool:
    """Protect canonical and optional exploration trails from authored props."""
    if route_sample(area, x, z)["distance"] < area["terrainProfile"]["pathWidth"] + margin:
        return True
    return any(route_sample(area, x, z, route["waypoints"])["distance"] < route["width"] + margin
               for route in area.get("explorationRoutes", []))


def terrain_raw_height(x: float, z: float, area: dict[str, Any]) -> float:
    """Direct scalar port of TerrainSystem.rawHeight; scene geometry is optional."""
    profile, seed = area["terrainProfile"], area["seed"]
    frequency = profile["frequency"]
    broad = lattice_noise(seed, x * frequency, z * frequency)
    medium = lattice_noise(seed + 103, x * frequency * 2.1, z * frequency * 2.1)
    detail = lattice_noise(seed + 709, x * frequency * 5.3, z * frequency * 5.3)
    height = profile["baseHeight"] + profile["amplitude"] * (broad * .64 + medium * .25 + detail * profile["ruggedness"] * .18)
    for water in profile["water"]:
        d = math.hypot((x - water["x"]) / water["radiusX"], (z - water["z"]) / water["radiusZ"])
        blend = 1 - smoothstep(.72, 1.25, d)
        bed = water["surfaceHeight"] - water["depth"] + max(0, d - .65) * 2
        height = height * (1 - blend) + bed * blend
    # Optional exploration trails blend first; canonical route remains authority.
    for exploration in area.get("explorationRoutes", []):
        route = route_sample(area, x, z, exploration["waypoints"])
        blend = 1 - smoothstep(exploration["width"], exploration["width"] + exploration["blendWidth"], route["distance"])
        height = height * (1 - blend) + route["height"] * blend
    route = route_sample(area, x, z)
    blend = 1 - smoothstep(profile["pathWidth"], profile["pathWidth"] + profile["pathBlendWidth"], route["distance"])
    height = height * (1 - blend) + route["height"] * blend
    if profile["cabinPlateau"]:
        blend = 1 - smoothstep(7.5, 15, max(abs(x), abs(z)))
        height *= 1 - blend
    return height


def terrain_height(x: float, z: float, area: dict[str, Any]) -> float:
    """The exact 2m collision triangle interpolation, including its b-c diagonal."""
    cell = area["lodSettings"]["collisionCellSize"]
    gx, gz = x / cell, z / cell
    ix, iz = math.floor(gx), math.floor(gz)
    tx, tz = gx - ix, gz - iz
    a = terrain_raw_height(ix * cell, iz * cell, area)
    b = terrain_raw_height((ix + 1) * cell, iz * cell, area)
    c = terrain_raw_height(ix * cell, (iz + 1) * cell, area)
    d = terrain_raw_height((ix + 1) * cell, (iz + 1) * cell, area)
    return (a + (b - a) * tx + (c - a) * tz if tx + tz <= 1 else
            d + (c - d) * (1 - tx) + (b - d) * (1 - tz))


def gable_roof_vertices(half_width: float = 5.4, half_depth: float = 5.4,
                        eave_z: float = 3.15, ridge_z: float = 5.15) -> list[tuple[float, float, float]]:
    """A ridge parallel to the front/back axis, above both eaves. Blender Z-up."""
    if not 0 < half_width or not 0 < half_depth or ridge_z <= eave_z:
        raise ValueError("The roof ridge must sit above its eaves.")
    return [(-half_width, -half_depth, eave_z), (half_width, -half_depth, eave_z),
            (0, -half_depth, ridge_z), (-half_width, half_depth, eave_z),
            (half_width, half_depth, eave_z), (0, half_depth, ridge_z)]


def gable_roof_faces() -> list[tuple[int, ...]]:
    """Outward front/back faces and upward roof slopes, before axis conversion."""
    return [(0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (2, 1, 4, 5)]
