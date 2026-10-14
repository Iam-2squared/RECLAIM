"""Blender-only helpers; bpy is injected, so importing this module is harmless."""
from __future__ import annotations

import math
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from _reclaim_common import sha256_file


@contextmanager
def scene_context(bpy: Any, scene: Any) -> Iterator[None]:
    window = bpy.context.window
    if window is not None:
        original = window.scene
        window.scene = scene
        try:
            yield
        finally:
            window.scene = original
    else:
        with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
            yield


@contextmanager
def imported_scene(bpy: Any, filepath: Path) -> Iterator[Any]:
    """Import additively into a fresh scene, then remove only recorded new data.

    Data retained by a prepared duplicate is left intact (users > 0). No name
    matching, orphan purge, factory reset, or user-scene deletion occurs.
    """
    tracked_types = ("objects", "collections", "meshes", "curves", "materials", "images", "cameras", "lights")
    before = {name: set(getattr(bpy.data, name)) for name in tracked_types}
    scene = bpy.data.scenes.new("RECLAIM_Inspection_Temporary")
    scene["reclaim_generator_id"] = "reclaim.asset-inspection.v1"
    created: dict[str, set[Any]] = {}
    try:
        with scene_context(bpy, scene):
            try:
                bpy.ops.import_scene.gltf(filepath=str(filepath))
            finally:
                created = {name: set(getattr(bpy.data, name)) - before[name] for name in tracked_types}
            yield scene
    finally:
        for obj in created.get("objects", ()):
            if obj.name in bpy.data.objects:
                bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(scene)
        # Imported collections no longer contain objects and are exclusively new.
        for collection in created.get("collections", ()):
            if collection.name in bpy.data.collections and collection.users == 0:
                bpy.data.collections.remove(collection)
        for name in tracked_types[2:]:
            for item in created.get(name, ()):
                if item.name in getattr(bpy.data, name) and item.users == 0:
                    getattr(bpy.data, name).remove(item)


def subtree(root: Any, scene_objects: set[Any]) -> list[Any]:
    result = []
    def visit(obj: Any) -> None:
        result.append(obj)
        for child in sorted(obj.children, key=lambda item: item.name):
            if child in scene_objects:
                visit(child)
    visit(root)
    return result


def ordered_objects(scene: Any) -> list[Any]:
    available = set(scene.objects)
    result: list[Any] = []
    for root in sorted((obj for obj in available if obj.parent not in available), key=lambda item: item.name):
        result.extend(subtree(root, available))
    if len(result) != len(available):
        raise ValueError("Invalid/cyclic imported hierarchy; no asset is changed.")
    return result


def mesh_info(bpy: Any, obj: Any, depsgraph: Any) -> dict[str, Any]:
    if obj.type != "MESH":
        return {"meshTriangles": 0, "meshVertices": 0, "bounds": None}
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
        bounds = None if not points else {
            "min": [min(point[i] for point in points) for i in range(3)],
            "max": [max(point[i] for point in points) for i in range(3)],
        }
        return {"meshTriangles": len(mesh.loop_triangles), "meshVertices": len(mesh.vertices), "bounds": bounds}
    finally:
        evaluated.to_mesh_clear()


def aggregate_bounds(nodes: list[dict[str, Any]]) -> dict[str, list[float]] | None:
    bounds = [node["bounds"] for node in nodes if node.get("bounds") is not None]
    if not bounds:
        return None
    return {"min": [min(item["min"][i] for item in bounds) for i in range(3)],
            "max": [max(item["max"][i] for item in bounds) for i in range(3)]}


def inspect_scene(bpy: Any, scene: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    """Measured geometry/hierarchy facts, without licence or performance claims."""
    with scene_context(bpy, scene):
        scene.view_layers[0].update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        objects = ordered_objects(scene)
        ids = {obj: f"node-{index + 1:04d}" for index, obj in enumerate(objects)}
        nodes: list[dict[str, Any]] = []
        materials: set[Any] = set()
        unique_meshes: dict[Any, int] = {}
        for obj in objects:
            info = mesh_info(bpy, obj, depsgraph)
            if obj.type == "MESH":
                unique_meshes.setdefault(obj.data, info["meshTriangles"])
            slots = [slot.material for slot in obj.material_slots if slot.material is not None]
            materials.update(slots)
            nodes.append({
                "nodeId": ids[obj], "name": obj.name, "type": obj.type,
                "parentId": ids.get(obj.parent), "parentName": obj.parent.name if obj.parent is not None else None,
                "matrixWorld": [[float(v) for v in row] for row in obj.matrix_world],
                "matrixLocal": [[float(v) for v in row] for row in obj.matrix_local],
                "dimensions": [float(v) for v in obj.dimensions],
                "scale": [float(v) for v in obj.scale], "materials": [material.name for material in slots],
                "modifiers": [{"name": modifier.name, "type": modifier.type} for modifier in obj.modifiers],
                "constraints": [{"name": constraint.name, "type": constraint.type} for constraint in obj.constraints],
                "hasAnimationData": obj.animation_data is not None,
                **info,
            })
        images: set[Any] = set()
        for material in materials:
            if material.use_nodes and material.node_tree:
                images.update(node.image for node in material.node_tree.nodes
                              if node.type == "TEX_IMAGE" and node.image is not None)
        image_facts = []
        for image in sorted(images, key=lambda item: item.name):
            local_path = Path(bpy.path.abspath(image.filepath)) if image.filepath else None
            image_facts.append({
                "name": image.name, "width": int(image.size[0]), "height": int(image.size[1]),
                "channels": image.channels, "source": image.source,
                "path": str(local_path) if local_path else None,
                "sha256": sha256_file(local_path) if local_path and local_path.is_file() else None,
                "packedBytes": len(image.packed_file.data) if image.packed_file else None,
            })
        root_facts = []
        for obj in objects:
            if obj.parent not in ids:
                descendants = set(subtree(obj, set(objects)))
                member_ids = [ids[item] for item in objects if item in descendants]
                member_nodes = [node for node in nodes if node["nodeId"] in member_ids]
                bounds = aggregate_bounds(member_nodes)
                root_facts.append({"nodeId": ids[obj], "name": obj.name, "memberIds": member_ids,
                                   "bounds": bounds, "heightMetres": bounds["max"][2] - bounds["min"][2] if bounds else None,
                                   "meshTriangles": sum(node["meshTriangles"] for node in member_nodes)})
        return {
            "nodes": nodes, "roots": root_facts, "textures": image_facts,
            "statistics": {"objects": len(nodes), "meshObjects": sum(node["type"] == "MESH" for node in nodes),
                           "uniqueMeshDatablocks": len(unique_meshes), "uniqueMeshTriangles": sum(unique_meshes.values()),
                           "meshTriangleOccurrences": sum(node["meshTriangles"] for node in nodes),
                           "materials": len(materials), "textures": len(image_facts),
                           "texturePixels": sum(image["width"] * image["height"] for image in image_facts)},
            "bounds": aggregate_bounds(nodes), "coordinateSystem": "Blender Z-up metres",
            "notes": ["A root can be a whole scene or one foliage part; inspect its descendants before choosing a whole tree.",
                      "Triangle occurrences include every object; unique meshes count each shared datablock once.",
                      "Texture pixels are a count, not a GPU-memory or FPS measurement."],
        }, {ids[obj]: obj for obj in objects}


def export_selected_glb(bpy: Any, scene: Any, filepath: Path) -> None:
    with scene_context(bpy, scene):
        for obj in scene.objects:
            obj.select_set(False)
        selected = [obj for obj in scene.objects if obj.type not in {"CAMERA", "LIGHT"}]
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = selected[0] if selected else None
        if not selected:
            raise ValueError("The generated scene has no exportable objects.")
        bpy.ops.export_scene.gltf(filepath=str(filepath), export_format="GLB", use_selection=True,
                                  export_yup=True, export_cameras=False, export_lights=False)


def save_blend_copy(bpy: Any, scene: Any, filepath: Path) -> None:
    with scene_context(bpy, scene):
        bpy.ops.wm.save_as_mainfile(filepath=str(filepath), check_existing=False, compress=True, copy=True)
