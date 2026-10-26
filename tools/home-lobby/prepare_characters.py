"""Prepare supplied animated HOME GLBs; preserve every non-image buffer view.

Run with Python and Pillow. Source GLBs and Blender files are never modified.
Only embedded textures and the established nonmetallic display factors change.
"""
from __future__ import annotations

import hashlib
from io import BytesIO
import json
from pathlib import Path
import struct

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
OUTPUT = REPO / "public" / "home-models"
CLIPS = {"Idle", "Walk", "Run", "Jump", "Aim", "Shoot", "Reload", "Hit", "Death", "Melee"}


def read_glb(path):
    raw = path.read_bytes()
    assert struct.unpack_from("<4sII", raw) == (b"glTF", 2, len(raw))
    offset, document, binary = 12, None, None
    while offset < len(raw):
        length, kind = struct.unpack_from("<I4s", raw, offset)
        chunk = raw[offset + 8:offset + 8 + length]
        if kind == b"JSON":
            document = json.loads(chunk)
        elif kind == b"BIN\0":
            binary = chunk
        offset += 8 + length
    assert offset == len(raw) and document is not None and binary is not None
    assert len(document["buffers"]) == 1 and "uri" not in document["buffers"][0]
    assert all("bufferView" in image and "uri" not in image for image in document.get("images", []))
    return raw, document, binary


def write_glb(path, document, binary):
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary += b"\0" * (-len(binary) % 4)
    size = 28 + len(encoded) + len(binary)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, size)
                     + struct.pack("<I4s", len(encoded), b"JSON") + encoded
                     + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def view_bytes(document, binary, index):
    view = document["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return binary[start:start + view["byteLength"]]


def clip_times(document, binary, clip):
    first, last = float("inf"), 0.0
    for index in {sampler["input"] for sampler in clip["samplers"]}:
        accessor = document["accessors"][index]
        assert accessor["type"] == "SCALAR" and accessor["componentType"] == 5126
        view = document["bufferViews"][accessor["bufferView"]]
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        stride = view.get("byteStride", 4)
        values = [struct.unpack_from("<f", binary, start + item * stride)[0] for item in range(accessor["count"])]
        first, last = min(first, min(values)), max(last, max(values))
    return first, last


def base_color_images(document):
    textures = document.get("textures", [])
    color, data = set(), set()
    for material in document.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        if "baseColorTexture" in pbr:
            color.add(textures[pbr["baseColorTexture"]["index"]]["source"])
        for usage in [pbr.get("metallicRoughnessTexture"), material.get("normalTexture"),
                      material.get("occlusionTexture"), material.get("emissiveTexture")]:
            if usage:
                data.add(textures[usage["index"]]["source"])
    return color - data


def prepare(character):
    character_id = character.lower()
    source_dir = REPO.parent / "motion" / "characters" / character
    source = source_dir / f"{character}_animated.glb"
    raw, original, binary = read_glb(source)
    metadata = json.loads((source_dir / "animation.json").read_text(encoding="utf-8"))
    verification = json.loads((source_dir / "verification.json").read_text(encoding="utf-8"))
    assert metadata["asset_id"] == verification["asset_id"] == character_id
    assert verification["passed"] and hashlib.sha256(raw).hexdigest() == verification["glb_sha256"]
    assert {clip["name"] for clip in original.get("animations", [])} == CLIPS
    assert all(not clip["root_motion"] for clip in metadata["clips"])
    document = json.loads(json.dumps(original))
    color_images = base_color_images(document)
    replacements, image_records = {}, []
    for index, image_entry in enumerate(document.get("images", [])):
        image_bytes = view_bytes(original, binary, image_entry["bufferView"])
        with Image.open(BytesIO(image_bytes)) as image:
            source_size = list(image.size)
            image = image.convert("RGBA")
            image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            opaque_color = index in color_images and image.getchannel("A").getextrema() == (255, 255)
            output = BytesIO()
            if opaque_color:
                image.convert("RGB").save(output, "JPEG", quality=92, subsampling=0)
                image_entry["mimeType"] = "image/jpeg"
            else:
                image.save(output, "PNG", optimize=True)
                image_entry["mimeType"] = "image/png"
            replacements[image_entry["bufferView"]] = output.getvalue()
            image_records.append({"index": index, "sourceSize": source_size,
                                  "runtimeSize": list(image.size), "sourceBytes": len(image_bytes),
                                  "runtimeBytes": len(output.getvalue()), "mimeType": image_entry["mimeType"]})
    chunks = bytearray()
    for index, view in enumerate(document["bufferViews"]):
        contents = replacements.get(index, view_bytes(original, binary, index))
        chunks.extend(b"\0" * (-len(chunks) % 4))
        view["byteOffset"], view["byteLength"] = len(chunks), len(contents)
        chunks.extend(contents)
    document["buffers"][0]["byteLength"] = len(chunks)
    for material in document.get("materials", []):
        if material.get("name") == "Eyeshadow":
            continue
        pbr = material.setdefault("pbrMetallicRoughness", {})
        pbr["metallicFactor"] = 0.0
        pbr["roughnessFactor"] = .72 if any(word in material.get("name", "").lower() for word in ("head", "hair")) else .82
    destination = OUTPUT / f"{character_id}.glb"
    write_glb(destination, document, bytes(chunks))
    runtime, checked, packed = read_glb(destination)
    for key in ("meshes", "skins", "nodes", "accessors", "animations", "scenes"):
        assert checked.get(key) == original.get(key), f"Source {key} changed: {character}"
    image_views = set(replacements)
    non_image_count = 0
    for index in range(len(original["bufferViews"])):
        if index not in image_views:
            assert view_bytes(original, binary, index) == view_bytes(checked, packed, index), f"Geometry/animation buffer changed: {character}/{index}"
            non_image_count += 1
    duration = {clip["name"]: clip["seconds"] for clip in metadata["clips"]}
    return {"id": character_id, "file": destination.name,
            "source": f"motion/characters/{character}/{source.name}",
            "sourceBytes": len(raw), "runtimeBytes": len(runtime),
            "sourceSha256": hashlib.sha256(raw).hexdigest(), "runtimeSha256": hashlib.sha256(runtime).hexdigest(),
            "meshes": len(checked["meshes"]), "skins": len(checked["skins"]), "animations": len(checked["animations"]),
            "clips": [{"name": clip["name"], "startSeconds": clip_times(checked, packed, clip)[0],
                       "seconds": clip_times(checked, packed, clip)[1], "nominalSeconds": duration[clip["name"]],
                       "channels": len(clip["channels"])} for clip in checked["animations"]],
            "lobbyClip": "Idle", "rootMotion": False, "sourceOrigin": metadata["origin"],
            "sourceHeightMetres": metadata["height_m"], "verifiedNonImageBufferViews": non_image_count,
            "geometrySkeletonUvPreserved": True, "animationDataPreserved": True, "images": image_records}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    models = [prepare(character) for character in ("Jonesy", "Ramirez")]
    manifest = {"purpose": "Actual user-provided animated player characters for the RECLAIM HOME lobby",
                "preparationScript": "tools/home-lobby/prepare_characters.py", "models": models,
                "runtimeDisplayCorrection": "Ramirez animated Head has inconsistent source vertex normals. HOME renderer recomputes that mesh's normals from the existing indexed triangles. Positions, UVs, indices, skeleton and animation files remain unchanged.",
                "optimization": "Animated source meshes, skeletons, UVs, accessors and all animation/non-image buffer bytes retained exactly. Embedded source textures reduced to max1024. Established nonmetallic material factors retained. HOME plays only supplied Idle; all ten clips remain available in each GLB."}
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for model in models:
        print(f"{model['id']}: {model['sourceBytes']:,} -> {model['runtimeBytes']:,} bytes; {model['animations']} clips; {model['verifiedNonImageBufferViews']} preserved non-image views")


if __name__ == "__main__":
    main()
