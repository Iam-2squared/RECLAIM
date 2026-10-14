"""Read mesh/hierarchy facts. Never infer a Fab licence from a material name.

SOURCE_GLB empty: inspect the currently active v02 scene without modifying it.
SOURCE_GLB set: import into a temporary scene and remove only that new import.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# ---- USER CONFIG -----------------------------------------------------------
TOOLS_DIRECTORY = ""
OUTPUT_DIRECTORY = ""  # Explicit new report folder.
SOURCE_GLB = ""  # Optional absolute .glb path; blank inspects the active scene.
OUTPUT_REPORT_NAME = "RECLAIM_Fab_Inspection.json"
ASSET_METADATA = {
    "name": "Trees and bush Pack LOWPOLY", "creator": "EFX",
    "sourceUrl": "", "licenseName": "", "acquisitionMethod": "", "evidencePath": "",
}
# Values above are user-provided labels, not verified licence facts.
# --------------------------------------------------------------------------


def tool_directory() -> Path:
    directory = Path(TOOLS_DIRECTORY).expanduser() if TOOLS_DIRECTORY else (
        Path(__file__).resolve().parent if "__file__" in globals() and Path(__file__).is_file() else None)
    if directory is None or not (directory / "_reclaim_common.py").is_file():
        raise ValueError("Set TOOLS_DIRECTORY to the folder containing these scripts.")
    return directory.resolve()


def hierarchy_signature(report: dict[str, Any]) -> str:
    from _reclaim_common import config_hash
    # Stable structure and transforms; Blender may suffix imported object names.
    return config_hash([{key: node[key] for key in ("nodeId", "parentId", "type", "matrixLocal",
                                                   "meshTriangles", "meshVertices")}
                        for node in report["nodes"]])


def main() -> dict[str, Any]:
    directory = tool_directory()
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))
    from _reclaim_common import ArtifactTransaction, check_outputs, sha256_file, write_json
    from _reclaim_bpy import imported_scene, inspect_scene
    import bpy

    source = Path(SOURCE_GLB).expanduser().resolve() if SOURCE_GLB else (
        Path(bpy.data.filepath).resolve() if bpy.data.filepath else None)
    if SOURCE_GLB and (source is None or not source.is_file() or source.suffix.lower() != ".glb"):
        raise FileNotFoundError("SOURCE_GLB must be an existing explicit .glb file.")
    output_dir, _ = check_outputs(OUTPUT_DIRECTORY, [OUTPUT_REPORT_NAME], [source] if source else [])
    evidence = Path(ASSET_METADATA["evidencePath"]).expanduser().resolve() if ASSET_METADATA.get("evidencePath") else None
    source_data = None if source is None or not source.is_file() else {
        "path": str(source), "sha256": sha256_file(source), "bytes": source.stat().st_size,
    }
    if SOURCE_GLB:
        with imported_scene(bpy, source) as scene:
            facts, _ = inspect_scene(bpy, scene)
    else:
        facts, _ = inspect_scene(bpy, bpy.context.scene)
    report = {
        "schema": "reclaim.fab-inspection.v1", "blenderVersionExecuted": bpy.app.version_string,
        "inspectionMode": "temporary-explicit-glb" if SOURCE_GLB else "active-scene-read-only",
        "source": source_data, "sourceShapeSha256": hierarchy_signature(facts),
        "activeBlendHasUnsavedChanges": bool(bpy.data.is_dirty),
        "declaredAssetMetadata": ASSET_METADATA,
        "licenseStatus": "UNVERIFIED: metadata/evidence do not automatically prove redistribution permission",
        "evidence": None if evidence is None or not evidence.is_file() else {
            "path": str(evidence), "sha256": sha256_file(evidence), "bytes": evidence.stat().st_size,
        }, **facts,
    }
    with ArtifactTransaction(output_dir, [OUTPUT_REPORT_NAME], [source] if source else []) as transaction:
        write_json(transaction.path(OUTPUT_REPORT_NAME), report)
        transaction.commit()
    print(f"Inspection saved: {output_dir / OUTPUT_REPORT_NAME}")
    print("Review node IDs, parents, bounds, and descendants; a named foliage object may be only one tree part.")
    return report


if __name__ == "__main__":
    main()
