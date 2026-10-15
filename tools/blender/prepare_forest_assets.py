"""Duplicate inspected whole-tree hierarchies into a separate, normalized scene.

Source objects/data/transforms remain unchanged. Export is disabled by default.
Explicit inspected root IDs and licence/acquisition evidence are required.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# ---- USER CONFIG -----------------------------------------------------------
TOOLS_DIRECTORY = ""
OUTPUT_DIRECTORY = ""  # New folder. No existing files will be overwritten.
SOURCE_GLB = ""  # Existing original .glb; untouched by this script.
INSPECTION_REPORT_PATH = ""  # inspect_fab_pack.py report for this exact GLB hash.
TREE_ROOT_IDS = ()  # e.g. ("node-0001",), after reviewing the report.
CONFIRMED_WHOLE_TREE_ROOT_IDS = ()  # Same IDs only after confirming trunk + foliage.
TARGET_HEIGHT_METRES = 9.0
SAMPLE_SPACING_METRES = 18.0
SCENE_NAME = "RECLAIM_Prepared_Forest_v03"
EXPORT_ASSETS = False  # Report/in-memory preview only until licence is confirmed.
ALLOW_THIRD_PARTY_EXPORT = False
LICENSE_CONFIRMATION = ""
ASSET_METADATA = {
    "name": "Trees and bush Pack LOWPOLY", "creator": "EFX",
    "sourceUrl": "", "licenseName": "", "acquisitionMethod": "", "evidencePath": "",
}
OUTPUT_BLEND_NAME = "RECLAIM_Forest_v03.blend"
OUTPUT_GLB_NAME = "RECLAIM_Forest_v03.glb"
OUTPUT_MANIFEST_NAME = "RECLAIM_Forest_v03_manifest.json"
# Required exact confirmation if EXPORT_ASSETS=True:
# I CONFIRM THIS LICENSE ALLOWS THIS GENERATED GAME ASSET EXPORT
# A Fab product title alone is not proof. Do not commit these exports publicly.
# --------------------------------------------------------------------------


def tool_directory() -> Path:
    directory = Path(TOOLS_DIRECTORY).expanduser() if TOOLS_DIRECTORY else (
        Path(__file__).resolve().parent if "__file__" in globals() and Path(__file__).is_file() else None)
    if directory is None or not (directory / "_reclaim_common.py").is_file():
        raise ValueError("Set TOOLS_DIRECTORY to the folder containing these scripts.")
    return directory.resolve()


def clone_whole_tree(bpy: Any, source_root: Any, source_scene: Any, prepared_scene: Any,
                     root_id: str, index: int, bounds: dict[str, Any]) -> dict[str, Any]:
    from mathutils import Matrix, Vector
    from _reclaim_common import normalization
    from _reclaim_bpy import subtree

    transform = normalization(bounds["min"], bounds["max"], TARGET_HEIGHT_METRES)
    members = subtree(source_root, set(source_scene.objects))
    collection = bpy.data.collections.new(f"R03_Tree_{root_id}")
    collection["reclaim_generator_id"] = "reclaim.prepared-forest.v03"
    prepared_scene.collection.children.link(collection)
    group = bpy.data.objects.new(f"R03_WholeTree_{root_id}", None)
    group["reclaim_generator_id"] = "reclaim.prepared-forest.v03"
    group["source_root_node_id"] = root_id
    collection.objects.link(group)
    clones = {}
    for original in members:
        duplicate = original.copy()
        # Geometry/materials are shared read-only; object transforms/parents are copied.
        duplicate.name = f"R03_{root_id}_{original.name}"
        duplicate["reclaim_generator_id"] = "reclaim.prepared-forest.v03"
        duplicate.parent = None
        collection.objects.link(duplicate)
        clones[original] = duplicate
    for original, duplicate in clones.items():
        duplicate.parent = clones.get(original.parent, group)
        duplicate.matrix_world = original.matrix_world.copy()
    base = transform["base_center"]
    placement = Vector((index * SAMPLE_SPACING_METRES, 0, 0))
    group.matrix_world = (Matrix.Translation(placement) @ Matrix.Scale(transform["scale"], 4)
                          @ Matrix.Translation(Vector((-base[0], -base[1], -base[2]))))
    prepared_scene.view_layers[0].update()
    return {"sourceRootNodeId": root_id, "sourceRootName": source_root.name,
            "sourceMemberCount": len(members), "sourceMemberNames": [obj.name for obj in members],
            "transform": transform, "samplePlacementBlender": list(placement),
            "hierarchyPreserved": True, "individualFoliageScaling": False}


def main() -> dict[str, Any]:
    directory = tool_directory()
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))
    from _reclaim_common import (ArtifactTransaction, MANIFEST_SCHEMA, check_outputs, config_hash,
                                descendant_ids, require_third_party_export_permission,
                                reusable_scene, sha256_file, source_records, validate_tree_selection, write_json)
    from _reclaim_bpy import aggregate_bounds, imported_scene, inspect_scene, export_selected_glb, save_blend_copy
    from inspect_fab_pack import hierarchy_signature
    import bpy

    if not SOURCE_GLB or not INSPECTION_REPORT_PATH:
        raise ValueError("Set SOURCE_GLB and INSPECTION_REPORT_PATH; no local file is guessed.")
    source = Path(SOURCE_GLB).expanduser().resolve()
    inspection_file = Path(INSPECTION_REPORT_PATH).expanduser().resolve()
    if not source.is_file() or source.suffix.lower() != ".glb" or not inspection_file.is_file():
        raise FileNotFoundError("The explicit source GLB or inspection report is missing.")
    inspection = json.loads(inspection_file.read_text(encoding="utf-8"))
    source_sha = sha256_file(source)
    if (inspection.get("schema") != "reclaim.fab-inspection.v1"
            or inspection.get("inspectionMode") != "temporary-explicit-glb"
            or not isinstance(inspection.get("source"), dict)
            or inspection["source"].get("sha256") != source_sha):
        raise ValueError("Inspect this exact original GLB first; the report/source hash does not match.")
    roots = validate_tree_selection(inspection, TREE_ROOT_IDS, CONFIRMED_WHOLE_TREE_ROOT_IDS)
    if SAMPLE_SPACING_METRES < TARGET_HEIGHT_METRES or TARGET_HEIGHT_METRES <= 0:
        raise ValueError("Sample spacing must be at least the target tree height.")
    names = [OUTPUT_MANIFEST_NAME]
    if EXPORT_ASSETS:
        require_third_party_export_permission(ASSET_METADATA, ALLOW_THIRD_PARTY_EXPORT, LICENSE_CONFIRMATION)
        names.extend([OUTPUT_BLEND_NAME, OUTPUT_GLB_NAME])
    original_blend = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    protected = [source, inspection_file] + ([original_blend] if original_blend else [])
    output_dir, _ = check_outputs(OUTPUT_DIRECTORY, names, protected)
    generator_id = "reclaim.prepared-forest.v03"
    config = {"generatorId": generator_id, "sourceSha256": source_sha, "inspectionSha256": sha256_file(inspection_file),
              "treeRootIds": roots, "targetHeightMetres": TARGET_HEIGHT_METRES, "sampleSpacingMetres": SAMPLE_SPACING_METRES}
    fingerprint = config_hash(config)
    scene = bpy.data.scenes.get(SCENE_NAME)
    if scene is not None:
        reusable_scene(scene, generator_id, fingerprint)
        if not scene.get("reclaim_generation_complete", False):
            raise ValueError("An incomplete prepared scene exists; review it and choose a new SCENE_NAME.")
        tree_records = json.loads(scene["reclaim_tree_records"])
    else:
        with imported_scene(bpy, source) as source_scene:
            facts, by_id = inspect_scene(bpy, source_scene)
            if hierarchy_signature(facts) != inspection["sourceShapeSha256"]:
                raise ValueError("Imported hierarchy differs from inspection. Inspect again; no scaling was applied.")
            selected_ids = set().union(*(descendant_ids(facts["nodes"], root_id) for root_id in roots))
            for node in facts["nodes"]:
                if node["nodeId"] in selected_ids and (node["type"] not in {"MESH", "EMPTY"}
                        or node["modifiers"] or node["constraints"] or node["hasAnimationData"]):
                    raise ValueError("Animated/constrained/modifier trees require a separately baked copy and new inspection; originals were not changed.")
            scene = bpy.data.scenes.new(SCENE_NAME)
            scene["reclaim_generator_id"], scene["reclaim_config_sha256"] = generator_id, fingerprint
            scene["reclaim_generation_complete"] = False
            tree_records = []
            for index, root_id in enumerate(roots):
                member_ids = descendant_ids(facts["nodes"], root_id)
                bounds = aggregate_bounds([node for node in facts["nodes"] if node["nodeId"] in member_ids])
                if bounds is None:
                    raise ValueError(f"Selected root has no visible geometry: {root_id}")
                tree_records.append(clone_whole_tree(bpy, by_id[root_id], source_scene, scene, root_id, index, bounds))
            scene["reclaim_tree_records"] = json.dumps(tree_records, ensure_ascii=False)
            scene["reclaim_generation_complete"] = True
    facts, _ = inspect_scene(bpy, scene)
    manifest = {
        "schema": MANIFEST_SCHEMA, "generatorId": generator_id, "configSha256": fingerprint, "config": config,
        "blenderVersionExecuted": bpy.app.version_string,
        "sourceFiles": source_records([source, inspection_file, directory / "prepare_forest_assets.py",
                                       directory / "_reclaim_common.py", directory / "_reclaim_bpy.py"]),
        "declaredAssetMetadata": ASSET_METADATA, "licenseStatus": "USER CONFIRMED FOR PRIVATE EXPORT" if EXPORT_ASSETS else "UNVERIFIED / export disabled",
        "licenseEvidence": source_records([Path(ASSET_METADATA["evidencePath"]).expanduser().resolve()]) if EXPORT_ASSETS else [],
        "thirdPartyArt": True, "sourceWasOverwritten": False, "sourceHierarchyWasModified": False,
        "treeRecords": tree_records, "inspection": facts, "outputs": [],
        "scope": {"distribution": "Private authoring output; do not commit raw third-party models to public GitHub",
                  "automaticRootGuessing": False, "lodGeneration": "Not implemented: assess the measured geometry before a later LOD workflow",
                  "antOrSaplingRequired": False, "gameAssetIntegration": "Not automatic; GLB replacement must separately preserve collider/LOD contracts"},
    }
    with ArtifactTransaction(output_dir, names, protected) as transaction:
        if EXPORT_ASSETS:
            save_blend_copy(bpy, scene, transaction.path(OUTPUT_BLEND_NAME))
            export_selected_glb(bpy, scene, transaction.path(OUTPUT_GLB_NAME))
            for name in (OUTPUT_BLEND_NAME, OUTPUT_GLB_NAME):
                staged = transaction.path(name)
                manifest["outputs"].append({"name": name, "bytes": staged.stat().st_size,
                                            "sha256": sha256_file(staged), "sourceConfigSha256": fingerprint})
        write_json(transaction.path(OUTPUT_MANIFEST_NAME), manifest)
        transaction.commit()
    if sha256_file(source) != source_sha:
        raise RuntimeError("Source hash changed during processing; stop and inspect it before using outputs.")
    if bpy.context.window is not None:
        bpy.context.window.scene = scene
    print(f"Prepared {len(roots)} inspected whole trees in separate scene {SCENE_NAME}.")
    print("Exported assets." if EXPORT_ASSETS else "Export disabled; only the manifest was saved. Original GLB/Blend untouched.")
    return manifest


if __name__ == "__main__":
    main()
