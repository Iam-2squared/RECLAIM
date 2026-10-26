"""Prepare the authored weapon assets without modifying their GLB contents.

Run with the bundled Python (Pillow is required for the catalogue thumbnails).
The source folders live beside the repository, under RECLAIM/weapon.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import shutil
import struct

from PIL import Image


REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO.parent / "weapon"
OUTPUT = REPO / "public" / "home-weapons"
WEAPONS = (("assault", "アサルト"), ("sniper", "スナイパー"), ("knife", "サバイバルナイフ"))
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_record(path: Path, relative_to: Path) -> dict:
    return {"path": path.relative_to(relative_to).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}


def multiply(a: list, b: list) -> list:
    # glTF matrices are column-major.
    return [sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4)) for col in range(4) for row in range(4)]


def matrix(node: dict) -> list:
    if "matrix" in node:
        return node["matrix"]
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    tx, ty, tz = node.get("translation", [0, 0, 0])
    return [
        (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
        2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
        2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
        tx, ty, tz, 1,
    ]


def transform(m: list, point: tuple | list) -> list:
    return [sum(m[col * 4 + row] * point[col] for col in range(3)) + m[12 + row] for row in range(3)]


def inspect_glb(path: Path) -> dict:
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", raw)
    assert magic == b"glTF" and version == 2 and total == len(raw), f"Invalid GLB header: {path}"
    offset, doc, binary = 12, None, None
    while offset < len(raw):
        length, kind = struct.unpack_from("<II", raw, offset)
        contents = raw[offset + 8:offset + 8 + length]
        if kind == 0x4E4F534A:
            doc = json.loads(contents)
        elif kind == 0x004E4942:
            binary = contents
        offset += 8 + length
    assert offset == len(raw) and doc is not None and binary is not None
    assert len(doc["buffers"]) == 1 and "uri" not in doc["buffers"][0]
    assert not doc.get("animations") and not doc.get("skins")
    assert all("bufferView" in img and "uri" not in img for img in doc.get("images", []))

    def accessor_values(index: int):
        accessor = doc["accessors"][index]
        assert "sparse" not in accessor
        view = doc["bufferViews"][accessor["bufferView"]]
        code = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}[accessor["componentType"]]
        count = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[accessor["type"]]
        fmt = "<" + code * count
        stride = view.get("byteStride", struct.calcsize(fmt))
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        for item in range(accessor["count"]):
            value = struct.unpack_from(fmt, binary, start + item * stride)
            assert all(math.isfinite(component) for component in value), f"Non-finite geometry: {path}"
            yield value

    lower, upper = [math.inf] * 3, [-math.inf] * 3
    attachments, triangles, mesh_parts, vertex_count = {}, 0, 0, 0

    def visit(index: int, parent: list):
        nonlocal triangles, mesh_parts, vertex_count
        node = doc["nodes"][index]
        world = multiply(parent, matrix(node))
        if node.get("name") in ("Grip_R", "Support_Grip", "Tip_Visual"):
            attachments[node["name"]] = transform(world, [0, 0, 0])
        if "mesh" in node:
            mesh_parts += 1
            for primitive in doc["meshes"][node["mesh"]]["primitives"]:
                assert primitive.get("mode", 4) == 4
                positions = list(accessor_values(primitive["attributes"]["POSITION"]))
                vertex_count += len(positions)
                for position in positions:
                    point = transform(world, position)
                    for axis in range(3):
                        lower[axis] = min(lower[axis], point[axis])
                        upper[axis] = max(upper[axis], point[axis])
                count = doc["accessors"][primitive["indices"]]["count"] if "indices" in primitive else len(positions)
                assert count % 3 == 0
                triangles += count // 3
        for child in node.get("children", []):
            visit(child, world)

    for node_index in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        visit(node_index, IDENTITY)
    images = []
    for entry in doc.get("images", []):
        view = doc["bufferViews"][entry["bufferView"]]
        start = view.get("byteOffset", 0)
        image_bytes = binary[start:start + view["byteLength"]]
        images.append({"name": entry.get("name"), "mimeType": entry["mimeType"], "bytes": len(image_bytes), "sha256": hashlib.sha256(image_bytes).hexdigest()})
    return {
        "forwardAxis": "+X", "upAxis": "+Y", "units": "metres",
        "meshParts": mesh_parts, "triangles": triangles, "vertices": vertex_count,
        "bounds": {"min": lower, "max": upper, "dimensions": [upper[i] - lower[i] for i in range(3)]},
        "attachments": attachments, "embeddedImages": images,
        "materialNames": [material.get("name") for material in doc.get("materials", [])],
        "externalDependencies": 0, "finiteGeometry": True,
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": 1,
        "description": "Runtime copies of the supplied authored weapons. GLBs are byte-identical; catalogue previews are resized WebP conversions of the supplied renders.",
        "preparationScript": "tools/home-lobby/prepare_weapons.py",
        "weapons": [],
    }
    for weapon_id, folder in WEAPONS:
        source_dir = SOURCE / folder
        metadata_path, verification_path = source_dir / "weapon.json", source_dir / "verification.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        verification = json.loads(verification_path.read_text(encoding="utf-8"))
        assert metadata["weapon_id"] == verification["weapon_id"] == weapon_id and verification["passed"]
        source_glb = source_dir / f"{folder}.glb"
        expected = next(item for item in verification["verified_files"] if item["path"].endswith(".glb"))
        assert sha256(source_glb) == expected["sha256"] and source_glb.stat().st_size == expected["bytes"]
        glb_info = inspect_glb(source_glb)
        assert glb_info["triangles"] == verification["glb_triangles"]
        assert glb_info["meshParts"] == verification["native_mesh_parts"]
        assert set(glb_info["attachments"]) == {"Grip_R", "Support_Grip", "Tip_Visual"}
        # Blender's source coordinates are X,Y,Z; its glTF export maps them to X,Z,-Y.
        for name, source_point in verification["attachments"].items():
            expected_point = [source_point[0], source_point[2], -source_point[1]]
            assert max(abs(a - b) for a, b in zip(glb_info["attachments"][name], expected_point)) < 1e-6
        runtime_glb = OUTPUT / f"{weapon_id}.glb"
        shutil.copyfile(source_glb, runtime_glb)
        assert sha256(runtime_glb) == sha256(source_glb)
        source_preview, runtime_preview = source_dir / "preview.png", OUTPUT / f"{weapon_id}.webp"
        with Image.open(source_preview) as image:
            original_dimensions = list(image.size)
            image = image.convert("RGB")
            image.thumbnail((1200, 600), Image.Resampling.LANCZOS)
            image.save(runtime_preview, "WEBP", quality=90, method=6)
            preview_dimensions = list(image.size)
        with Image.open(runtime_preview) as preview:
            assert list(preview.size) == preview_dimensions
            preview.verify()
        record = {
            "id": weapon_id, "displayName": metadata["display_name"], "sourceVersion": metadata["version"],
            "modelUrl": f"/home-weapons/{weapon_id}.glb", "previewUrl": f"/home-weapons/{weapon_id}.webp",
            "sourceModel": file_record(source_glb, SOURCE.parent),
            "sourcePreview": {**file_record(source_preview, SOURCE.parent), "dimensions": original_dimensions},
            "sourceMetadata": file_record(metadata_path, SOURCE.parent),
            "sourceVerification": file_record(verification_path, SOURCE.parent),
            "runtimeModel": file_record(runtime_glb, REPO / "public"),
            "runtimePreview": {**file_record(runtime_preview, REPO / "public"), "dimensions": preview_dimensions, "quality": 90},
            "modelUnmodified": True, **glb_info,
        }
        manifest["weapons"].append(record)
        print(f"{weapon_id}: {record['runtimeModel']['bytes']:,} byte GLB, {record['runtimePreview']['bytes']:,} byte WebP, {glb_info['triangles']:,} triangles")
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
