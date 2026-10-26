"""Copy the current authored Shiretoko viewer into the web runtime unchanged."""

from __future__ import annotations

import base64
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil

from PIL import Image


REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO.parent / "map" / "知床_高画質版"
OUTPUT = REPO / "public" / "home-map"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def record(path: Path, base: Path) -> dict:
    raw = path.read_bytes()
    return {"path": path.relative_to(base).as_posix(), "bytes": len(raw), "sha256": digest(raw)}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source_html = SOURCE / "知床_地形プレビュー_高画質.html"
    runtime_html = OUTPUT / "shiretoko.html"
    html_bytes = source_html.read_bytes()
    html = html_bytes.decode("utf-8")
    match = re.search(r'const terrainGzipBase64\s*=\s*("[A-Za-z0-9+/=]+")\s*;', html)
    assert match, "The supplied viewer must have its compressed map embedded."
    assert not re.findall(r'(?:src|href)=["\'](?!data:|#)([^"\']+)', html), "External viewer dependency found."
    payload = gzip.decompress(base64.b64decode(json.loads(match.group(1))))
    source_data = (SOURCE / "viewer-data.json").read_bytes()
    assert payload == source_data, "Supplied viewer is stale relative to the current map data."
    data = json.loads(payload)
    metadata = json.loads((SOURCE / "terrain_manifest.json").read_text(encoding="utf-8"))
    verification = json.loads((SOURCE / "opening_world_verification.json").read_text(encoding="utf-8"))
    assert verification["passed"]
    assert len(data["meshes"]) == 12 and len(data["structures"]) >= 57
    assert all(data.get(key) for key in ("house", "trail", "yard", "warehouse", "boundary", "pointsOfInterest"))
    assert 'data-preset="warehouse"' in html and 'data-preset="floor2"' in html
    shutil.copyfile(source_html, runtime_html)
    assert runtime_html.read_bytes() == html_bytes
    source_preview, runtime_preview = SOURCE / "知床_高画質_俯瞰.png", OUTPUT / "overview.webp"
    with Image.open(source_preview) as image:
        image = image.convert("RGB")
        image.thumbnail((1280, 720), Image.Resampling.LANCZOS)
        image.save(runtime_preview, "WEBP", quality=89, method=6)
        preview_dimensions = list(image.size)
    manifest = {
        "version": 1,
        "id": "shiretoko-authored",
        "name": "知床 / 高画質マップ",
        "revision": metadata["revision"],
        "integration": "Shared lazy source payload for the HOME viewer and the actual walkable Mission renderer. Authored-coordinate campaign saves use their own namespace.",
        "sourceViewer": record(source_html, REPO.parent),
        "sourceData": record(SOURCE / "viewer-data.json", REPO.parent),
        "sourceModel": record(SOURCE / "知床_地形_高画質.glb", REPO.parent),
        "sourceMetadata": record(SOURCE / "terrain_manifest.json", REPO.parent),
        "sourceVerification": record(SOURCE / "opening_world_verification.json", REPO.parent),
        "runtimeViewer": record(runtime_html, REPO / "public"),
        "runtimePreview": {**record(runtime_preview, REPO / "public"), "dimensions": preview_dimensions},
        "sourcePreview": record(source_preview, REPO.parent),
        "viewerUnmodified": True,
        "embeddedDataMatchesSource": True,
        "externalResources": 0,
        "terrainMeshes": len(data["meshes"]),
        "structureMeshes": len(data["structures"]),
        "vegetationInstances": len(data["vegetation"]["instances"]),
        "pointsOfInterest": len(data["pointsOfInterest"]),
        "sizeMetres": data["size"],
        "features": ["始まりの家と室内", "柵のある庭", "自然な土道と木道", "修復した山道", "廃倉庫", "荒れた畑と廃バス", "山奥の霧と境界"],
        "missionWorld": "src/world/authored-map-world.ts",
        "runtimePhysics": "src/world/authored-map-physics.ts",
        "missionCollisionReady": True,
        "collisionScope": "Runtime triangle-based terrain/floor/stair/boardwalk support, spatial structure collision and authored phase boundary; the original standalone viewer retains its free-camera navigation.",
        "sourceCollisionScope": "The unchanged source viewer contains only its authored phase-boundary collider and free-camera navigation.",
        "runtimeCollisionScope": "Triangle-sampled terrain, floors, stairs and trails; spatially derived walls, structures, trees and rocks, plus the phase boundary.",
        "runtimeProofReferences": ["tools/home-lobby/verify_authored_world.mjs"],
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"viewerBytes": len(html_bytes), "previewBytes": runtime_preview.stat().st_size, "payloadMatchesSource": True, "structureMeshes": len(data["structures"]), "vegetationInstances": manifest["vegetationInstances"]}))


if __name__ == "__main__":
    main()
