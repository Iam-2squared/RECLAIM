"""Generate a separate RECLAIM v03 scene with original procedural geometry.

Set the CONFIG values below, then run in Blender's Text Editor. No ANT/Sapling,
Fab files, network, or other add-ons are required. Original scenes remain intact.
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path
from typing import Any

# ---- USER CONFIG: set explicit paths before running -------------------------
TOOLS_DIRECTORY = ""  # Folder containing this script and _reclaim_common.py.
OUTPUT_DIRECTORY = ""  # e.g. r"C:\Users\Owner\Documents\RECLAIM_Exports\v03_run01"
SCENE_NAME = "RECLAIM_Generated_Shiretoko_v03"
OUTPUT_BLEND_NAME = "RECLAIM_Shiretoko_v03.blend"
OUTPUT_GLB_NAME = "RECLAIM_Shiretoko_v03_generated_only.glb"
AUTHORING_BOUNDS = (-144, 144, -96, 192)  # Runtime X/Z metres, whole 48m chunks.
TREE_COUNT = 188
EXPORT_GLB = True
# No overwrite mode. For a rerun choose a new output folder; an unchanged,
# complete generated scene is reused instead of appending duplicate objects.
# --------------------------------------------------------------------------


def tool_directory() -> Path:
    configured = Path(TOOLS_DIRECTORY).expanduser() if TOOLS_DIRECTORY else None
    if configured is not None:
        if not (configured / "_reclaim_common.py").is_file():
            raise FileNotFoundError("TOOLS_DIRECTORY must contain _reclaim_common.py.")
        return configured.resolve()
    if "__file__" in globals() and Path(__file__).is_file():
        return Path(__file__).resolve().parent
    raise ValueError("Set TOOLS_DIRECTORY when running pasted text in Blender.")


class Geometry:
    """Small reusable low-poly primitives, with per-face material slots."""
    def __init__(self) -> None:
        self.vertices: list[tuple[float, float, float]] = []
        self.faces: list[tuple[int, ...]] = []
        self.material_indices: list[int] = []

    def add(self, vertices: list[tuple[float, float, float]], faces: list[tuple[int, ...]], material: int) -> None:
        start = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(start + index for index in face) for face in faces)
        self.material_indices.extend([material] * len(faces))

    def branch(self, start: tuple[float, float, float], end: tuple[float, float, float],
               radius0: float, radius1: float, material: int = 0, sides: int = 6) -> None:
        from mathutils import Vector
        a, b = Vector(start), Vector(end)
        direction = (b - a).normalized()
        perpendicular = direction.cross(Vector((0, 0, 1)))
        if perpendicular.length < .001:
            perpendicular = direction.cross(Vector((0, 1, 0)))
        u = perpendicular.normalized()
        v = direction.cross(u).normalized()
        vertices = []
        for center, radius in ((a, radius0), (b, radius1)):
            for index in range(sides):
                angle = index / sides * math.tau
                vertices.append(tuple(center + (u * math.cos(angle) + v * math.sin(angle)) * radius))
        faces = [tuple(range(sides - 1, -1, -1)), tuple(range(sides, sides * 2))]
        faces.extend((index, (index + 1) % sides, (index + 1) % sides + sides, index + sides) for index in range(sides))
        self.add(vertices, faces, material)

    def ellipsoid(self, center: tuple[float, float, float], radii: tuple[float, float, float],
                  material: int, sides: int = 7, rings: int = 3) -> None:
        vertices = [(center[0], center[1], center[2] - radii[2])]
        for ring in range(1, rings + 1):
            latitude = -math.pi / 2 + math.pi * ring / (rings + 1)
            for side in range(sides):
                angle = side / sides * math.tau
                vertices.append((center[0] + math.cos(angle) * math.cos(latitude) * radii[0],
                                 center[1] + math.sin(angle) * math.cos(latitude) * radii[1],
                                 center[2] + math.sin(latitude) * radii[2]))
        vertices.append((center[0], center[1], center[2] + radii[2]))
        faces = [(0, 1 + (side + 1) % sides, 1 + side) for side in range(sides)]
        for ring in range(rings - 1):
            base, following = 1 + ring * sides, 1 + (ring + 1) * sides
            faces.extend((base + side, base + (side + 1) % sides,
                          following + (side + 1) % sides, following + side) for side in range(sides))
        top, base = len(vertices) - 1, 1 + (rings - 1) * sides
        faces.extend((base + side, base + (side + 1) % sides, top) for side in range(sides))
        self.add(vertices, faces, material)


class SceneBuilder:
    def __init__(self, bpy: Any, scene: Any, area: dict[str, Any], fingerprint: str) -> None:
        from _reclaim_common import terrain_height
        self.bpy, self.scene, self.area, self.fingerprint = bpy, scene, area, fingerprint
        self.height = lambda x, z: terrain_height(x, z, area)
        self.collections: dict[str, Any] = {}
        self.materials: dict[str, Any] = {}

    def collection(self, name: str) -> Any:
        if name not in self.collections:
            collection = self.bpy.data.collections.new(f"R03_{name}")
            collection["reclaim_generator_id"] = "reclaim.shiretoko.environment.v03"
            self.scene.collection.children.link(collection)
            self.collections[name] = collection
        return self.collections[name]

    def material(self, name: str, rgb: tuple[float, float, float], roughness: float = .9,
                 alpha: float = 1) -> Any:
        if name in self.materials:
            return self.materials[name]
        material = self.bpy.data.materials.new(f"R03_{name}")
        material.diffuse_color = (*rgb, alpha)
        material.use_nodes = True
        principled = material.node_tree.nodes.get("Principled BSDF")
        if principled is not None:
            principled.inputs["Base Color"].default_value = (*rgb, alpha)
            principled.inputs["Roughness"].default_value = roughness
            principled.inputs["Alpha"].default_value = alpha
        self.materials[name] = material
        return material

    def object(self, name: str, mesh: Any, collection: str, position: tuple[float, float, float] = (0, 0, 0)) -> Any:
        obj = self.bpy.data.objects.new(f"R03_{name}", mesh)
        # Authored positions use runtime X/Z with Blender-height Z in this file.
        # Negate the horizontal Z axis so standard glTF Y-up export round-trips.
        obj.location = (position[0], -position[1], position[2])
        obj["reclaim_generator_id"] = "reclaim.shiretoko.environment.v03"
        self.collection(collection).objects.link(obj)
        return obj

    def mesh(self, name: str, geometry: Geometry, materials: list[Any]) -> Any:
        mesh = self.bpy.data.meshes.new(f"R03_{name}")
        mesh.from_pydata([(x, -y, z) for x, y, z in geometry.vertices], [],
                         [tuple(reversed(face)) for face in geometry.faces])
        mesh.update()
        for material in materials:
            mesh.materials.append(material)
        for polygon, index in zip(mesh.polygons, geometry.material_indices):
            polygon.material_index = index
        return mesh

    def box(self, name: str, center: tuple[float, float, float], size: tuple[float, float, float],
            material: Any, collection: str = "Cabin") -> Any:
        sx, sy, sz = (value / 2 for value in size)
        geometry = Geometry()
        geometry.add([(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
                      (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)],
                     [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5),
                      (2, 3, 7, 6), (3, 0, 4, 7)], 0)
        return self.object(name, self.mesh(name, geometry, [material]), collection, center)

    def terrain(self) -> None:
        from _reclaim_common import within_trail_margin
        grass = self.material("forest_ground", (.22, .28, .21))
        trail = self.material("earth_trail", (.39, .36, .27))
        rock = self.material("bare_rock_ground", (.36, .39, .36))
        minx, maxx, minz, maxz = AUTHORING_BOUNDS
        cell, chunk = self.area["lodSettings"]["collisionCellSize"], self.area["lodSettings"]["chunkSize"]
        if any(value % chunk for value in AUTHORING_BOUNDS) or not minx < maxx or not minz < maxz:
            raise ValueError("AUTHORING_BOUNDS must be increasing whole runtime chunks.")
        for cz in range(minz // chunk, maxz // chunk):
            for cx in range(minx // chunk, maxx // chunk):
                segments = chunk // cell
                geometry = Geometry()
                for iz in range(segments + 1):
                    for ix in range(segments + 1):
                        x, z = cx * chunk + ix * cell, cz * chunk + iz * cell
                        geometry.vertices.append((x, z, self.height(x, z)))
                for iz in range(segments):
                    for ix in range(segments):
                        a = iz * (segments + 1) + ix
                        b, c, d = a + 1, a + segments + 1, a + segments + 2
                        # Y-up -> Z-up exchanges axes, so reverse runtime winding.
                        geometry.faces.extend(((a, b, c), (b, d, c)))
                        x, z = cx * chunk + (ix + .5) * cell, cz * chunk + (iz + .5) * cell
                        slot = 1 if within_trail_margin(self.area, x, z, .4) else 0
                        geometry.material_indices.extend((slot, slot))
                self.object(f"Terrain_chunk_{cx}_{cz}", self.mesh(f"Terrain_chunk_{cx}_{cz}", geometry,
                            [grass, trail, rock]), "Terrain")

    def cabin(self) -> None:
        from _reclaim_common import gable_roof_vertices, gable_roof_faces
        wood = self.material("cedar_walls", (.31, .21, .13))
        alternate = self.material("cedar_light", (.40, .29, .18))
        floor = self.material("floorboards", (.43, .33, .22))
        trim = self.material("dark_window_frames", (.14, .12, .095))
        roof_material = self.material("weathered_roof", (.19, .22, .22))
        glass = self.material("window_glass", (.40, .49, .47), .24, .38)
        self.box("Cabin_floor", (0, 0, -.09), (10, 10, .22), floor)
        # Short strips make actual door/window holes; no solid invisible wall.
        for level in range(15):
            height = .1 + level * .2
            chosen = wood if level % 3 else alternate
            self.box(f"Front_L_plank_{level}", (-3.1, 5, height), (3.8, .2, .19), chosen)
            self.box(f"Front_R_plank_{level}", (3.1, 5, height), (3.8, .2, .19), chosen)
            if height > 2.3:
                self.box(f"Front_above_door_{level}", (0, 5, height), (2.4, .2, .19), chosen)
            self.box(f"Rear_plank_{level}", (0, -5, height), (10, .2, .19), chosen)
            for side in (-1, 1):
                if 1.0 < height < 2.3:
                    self.box(f"Side_{side}_L_{level}", (side * 5, -3.15, height), (.2, 3.7, .19), chosen)
                    self.box(f"Side_{side}_R_{level}", (side * 5, 3.15, height), (.2, 3.7, .19), chosen)
                else:
                    self.box(f"Side_{side}_plank_{level}", (side * 5, 0, height), (.2, 10, .19), chosen)
        for side in (-1, 1):
            self.box(f"Window_{side}", (side * 5, 0, 1.65), (.07, 2.6, 1.25), glass)
            self.box(f"Window_frame_{side}_center", (side * 5, 0, 1.65), (.25, .08, 1.4), trim)
            for y in (-1.35, 1.35):
                self.box(f"Window_frame_{side}_{y}", (side * 5, y, 1.65), (.25, .12, 1.5), trim)
            for z in (1, 2.3):
                self.box(f"Window_frame_horizontal_{side}_{z}", (side * 5, 0, z), (.25, 2.8, .12), trim)
        geometry = Geometry()
        geometry.add(gable_roof_vertices(), gable_roof_faces(), 0)
        self.object("Cabin_correct_gable_roof", self.mesh("Cabin_gable_roof", geometry, [roof_material]), "Cabin")
        door = self.box("Cabin_open_door", (-1.95, 5.8, 1.15), (1.9, .13, 2.3), wood)
        door.rotation_euler[2] = math.radians(65)
        self.box("Front_step", (0, 5.6, .07), (2.5, 1.2, .14), floor)
        self.box("Bed_frame", (2.3, -2.3, .24), (1.5, 2.3, .4), trim)
        linen = self.material("old_linen", (.48, .50, .44))
        self.box("Bed_linen", (2.3, -2.3, .49), (1.4, 2.1, .18), linen)
        self.box("Bed_pillow", (2.3, -3, .64), (1.1, .5, .13), linen)
        self.box("Radio_table_top", (-3, -3, .82), (1.5, .9, .13), floor)
        for x in (-3.6, -2.4):
            for y in (-3.32, -2.68):
                self.box(f"Radio_table_leg_{x}_{y}", (x, y, .4), (.1, .1, .8), trim)
        radio = self.material("radio_shell", (.15, .17, .15))
        self.box("Radio_body", (-3, -3, 1.1), (.72, .3, .43), radio)
        self.box("Radio_speaker", (-3.15, -2.84, 1.1), (.3, .035, .3), trim)
        self.box("Radio_tuner", (-2.77, -2.83, 1.17), (.2, .03, .06), linen)
        self.box("Radio_antenna", (-3.25, -3, 1.58), (.012, .012, .7), trim)

    def tree_prototype(self, variant: int) -> Any:
        rng = random.Random(self.area["seed"] + variant * 7919)
        bark = self.material("bark", (.23, .20, .16))
        foliage = [self.material(f"foliage_{index}", rgb) for index, rgb in enumerate(
            ((.13, .24, .18), (.20, .31, .21), (.29, .36, .23)))]
        geometry = Geometry()
        geometry.branch((0, 0, 0), (.03, -.02, 1), .032, .013)
        if variant < 4:
            # Spruce: visible branches and uneven clustered foliage, not cones.
            for tier in range(5):
                z = .3 + tier * .135
                extent = .235 * (1 - tier * .14)
                for side in range(4):
                    angle = side / 4 * math.tau + tier * .48 + rng.uniform(-.15, .15)
                    tip = (math.cos(angle) * extent, math.sin(angle) * extent, z - .02)
                    geometry.branch((0, 0, z + .02), tip, .009, .004)
                    geometry.ellipsoid((tip[0] * .74, tip[1] * .74, z),
                                       (extent * .65, extent * .49, .075), 1 + (side + tier + variant) % 3)
            geometry.ellipsoid((.015, -.01, .96), (.055, .056, .105), 2)
        else:
            for branch in range(7):
                angle = branch / 7 * math.tau + rng.uniform(-.4, .4)
                tip = (math.cos(angle) * .22, math.sin(angle) * .22, .62 + rng.random() * .24)
                geometry.branch((0, 0, .42 + branch * .04), tip, .012, .005)
                geometry.ellipsoid(tip, (.18, .17, .17), 1 + branch % 3)
            geometry.ellipsoid((0, 0, .93), (.19, .17, .18), 3)
        # Normalize the entire authored tree once, including trunk + leaf crown.
        prototype_height = max(vertex[2] for vertex in geometry.vertices)
        geometry.vertices = [(x / prototype_height, y / prototype_height, z / prototype_height)
                             for x, y, z in geometry.vertices]
        return self.mesh(f"Tree_prototype_{variant}", geometry, [bark, *foliage])

    def forest(self) -> None:
        from _reclaim_common import within_trail_margin
        rng = random.Random(self.area["seed"])
        prototypes = [self.tree_prototype(index) for index in range(6)]
        minx, maxx, minz, maxz = AUTHORING_BOUNDS
        placed, attempts = 0, 0
        while placed < TREE_COUNT and attempts < TREE_COUNT * 30:
            attempts += 1
            x, z = rng.uniform(minx + 5, maxx - 5), rng.uniform(minz + 5, maxz - 5)
            if max(abs(x), abs(z)) < 13 or within_trail_margin(self.area, x, z, 1.8):
                continue
            lake = self.area["terrainProfile"]["water"][0]
            if math.hypot((x - lake["x"]) / lake["radiusX"], (z - lake["z"]) / lake["radiusZ"]) < 1.12:
                continue
            variant = rng.randrange(4) if rng.random() > .22 else rng.randrange(4, 6)
            height = rng.uniform(self.area["biome"]["minTreeHeight"], self.area["biome"]["maxTreeHeight"])
            obj = self.object(f"Tree_{placed:03d}", prototypes[variant], "Forest", (x, z, self.height(x, z)))
            width = height * rng.uniform(.89, 1.10)
            obj.scale = (width, width, height)
            obj.rotation_euler[2] = -rng.uniform(0, math.tau)
            placed += 1
        self.scene["reclaim_tree_count"] = placed
        stone = self.material("stone", (.35, .38, .35))
        for index in range(32):
            x, z = rng.uniform(minx + 5, maxx - 5), rng.uniform(minz + 5, maxz - 5)
            if max(abs(x), abs(z)) < 11 or within_trail_margin(self.area, x, z, .9):
                continue
            geometry = Geometry()
            geometry.ellipsoid((0, 0, 0), (1.2, .85, .7), 0, sides=6, rings=2)
            obj = self.object(f"Rock_{index}", self.mesh(f"Rock_mesh_{index}", geometry, [stone]), "Forest", (x, z, self.height(x, z) + .35))
            obj.rotation_euler[2] = rng.random() * math.tau
        sasa = self.material("sasa_grass", (.28, .34, .23))
        for index in range(80):
            x, z = rng.uniform(-60, 60), rng.uniform(-20, 100)
            if max(abs(x), abs(z)) < 11 or within_trail_margin(self.area, x, z, .9) or self.height(x, z) < .4:
                continue
            geometry = Geometry()
            for blade in range(3):
                angle = blade * math.tau / 3
                a, b = math.cos(angle) * .3, math.sin(angle) * .3
                geometry.add([(-a, -b, 0), (a, b, 0), (a * .3, b * .3, .5 + blade * .08)], [(0, 1, 2)], 0)
            self.object(f"Sasa_{index}", self.mesh(f"Sasa_mesh_{index}", geometry, [sasa]), "Forest", (x, z, self.height(x, z)))

    def landmarks(self) -> None:
        water = self.material("quiet_lake", (.21, .34, .34), .25)
        lake = self.area["terrainProfile"]["water"][0]
        geometry = Geometry()
        geometry.vertices.append((lake["x"], lake["z"], lake["surfaceHeight"]))
        for side in range(48):
            angle = side / 48 * math.tau
            geometry.vertices.append((lake["x"] + math.cos(angle) * lake["radiusX"] * .94,
                                      lake["z"] + math.sin(angle) * lake["radiusZ"] * .94, lake["surfaceHeight"]))
        geometry.faces = [(0, side + 1, (side + 1) % 48 + 1) for side in range(48)]
        geometry.material_indices = [0] * 48
        self.object("Lake_surface", self.mesh("Lake_surface", geometry, [water]), "Landmarks")
        wood = self.material("boardwalk_wood", (.33, .30, .23))
        bank = next(poi["position"] for poi in self.area["landmarks"] if poi["type"] == "boardwalk")
        for index in range(math.floor((80 - 44) / 1.05) + 1):
            x, z = bank["x"], 44 + index * 1.05
            height = self.height(x, z) + .035
            self.box(f"Boardwalk_plank_{index}", (x, z, height), (2.15, 1.01, .07), wood, "Landmarks")
            for side in (-1, 1):
                if math.floor(z + .5) % 4 == 0:
                    self.box(f"Boardwalk_post_{index}_{side}", (x + side * 1.05, z, height + .56), (.1, .1, 1.15), wood, "Landmarks")
                self.box(f"Boardwalk_rail_{index}_{side}", (x + side * 1.05, z, height + 1.08), (.065, 1.1, .065), wood, "Landmarks")
        for poi in self.area["landmarks"]:
            marker = self.object(f"POI_{poi['id']}", None, "Markers",
                                 (poi["position"]["x"], poi["position"]["z"], self.height(poi["position"]["x"], poi["position"]["z"])))
            marker.empty_display_size = .3
            marker["reclaim_poi_id"] = poi["id"]
            marker["reclaim_provisional"] = True
        spawn = self.area["spawn"]
        marker = self.object("Player_spawn", None, "Markers", (spawn["x"], spawn["z"], self.height(spawn["x"], spawn["z"])))
        marker["runtime_yaw_radians"] = spawn["yaw"]
        drone_material = self.material("drone_shell", (.23, .27, .27), .65)
        drone_ground = self.height(0, 25)
        self.box("Drone_art_placeholder", (0, 25, drone_ground + 2.0), (.65, .38, .25), drone_material, "Landmarks")
        # This Blender object is an art marker only. AI/HP/shooting live in the game.
        for side in (-1, 1):
            self.box(f"Drone_arm_{side}", (side * .4, 25, drone_ground + 2.0), (.3, .07, .07), drone_material, "Landmarks")

    def lighting(self) -> None:
        from mathutils import Vector
        world = self.bpy.data.worlds.new("R03_Muted_Morning")
        world.use_nodes = True
        background = world.node_tree.nodes.get("Background")
        if background:
            background.inputs["Color"].default_value = (.45, .54, .53, 1)
            background.inputs["Strength"].default_value = .45
        self.scene.world = world
        sun_data = self.bpy.data.lights.new("R03_Morning_sun", "SUN")
        sun_data.energy, sun_data.color, sun_data.angle = 1.7, (1, .88, .72), math.radians(8)
        sun = self.object("Morning_sun", sun_data, "Review")
        sun.rotation_euler = (math.radians(37), math.radians(-25), math.radians(-35))
        camera_data = self.bpy.data.cameras.new("R03_Review_camera")
        camera_data.lens = 28
        camera = self.object("Review_camera", camera_data, "Review", (13, 19, 5.5))
        camera.rotation_euler = (Vector((0, 0, 1.9)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        self.scene.camera = camera
        self.scene.render.resolution_x, self.scene.render.resolution_y = 1920, 1080
        self.scene.render.resolution_percentage = 100
        self.scene.unit_settings.system = 'METRIC'
        self.scene.unit_settings.scale_length = 1

    def build(self) -> None:
        self.terrain()
        self.cabin()
        self.forest()
        self.landmarks()
        self.lighting()


def main() -> dict[str, Any]:
    directory = tool_directory()
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))
    from _reclaim_common import (GENERATOR_ID, MANIFEST_SCHEMA, ArtifactTransaction, check_outputs,
                                config_hash, load_world_contract, reusable_scene, source_records,
                                sha256_file, write_json)
    from _reclaim_bpy import inspect_scene, export_selected_glb, save_blend_copy
    import bpy

    contract_file = directory / "shiretoko_contract.json"
    contract = load_world_contract(contract_file)
    area = contract["area"]
    config = {"generatorId": GENERATOR_ID, "scene": SCENE_NAME, "bounds": AUTHORING_BOUNDS,
              "treeCount": TREE_COUNT, "worldContractSha256": sha256_file(contract_file)}
    fingerprint = config_hash(config)
    source_blend = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    source_info = source_records([source_blend]) if source_blend else []
    names = [OUTPUT_BLEND_NAME, "RECLAIM_Shiretoko_v03_manifest.json"]
    if EXPORT_GLB:
        names.append(OUTPUT_GLB_NAME)
    output_dir, _ = check_outputs(OUTPUT_DIRECTORY, names, [source_blend] if source_blend else [])
    existing = bpy.data.scenes.get(SCENE_NAME)
    if existing:
        reusable_scene(existing, GENERATOR_ID, fingerprint)
        if not existing.get("reclaim_generation_complete", False):
            raise ValueError("An incomplete generated scene exists. Review it, then choose a new SCENE_NAME.")
        scene = existing
    else:
        scene = bpy.data.scenes.new(SCENE_NAME)
        scene["reclaim_generator_id"], scene["reclaim_config_sha256"] = GENERATOR_ID, fingerprint
        scene["reclaim_generation_complete"] = False
        SceneBuilder(bpy, scene, area, fingerprint).build()
        scene["reclaim_generation_complete"] = True
    inspection, _ = inspect_scene(bpy, scene)
    manifest = {
        "schema": MANIFEST_SCHEMA, "generatorId": GENERATOR_ID, "configSha256": fingerprint,
        "config": config, "blenderVersionExecuted": bpy.app.version_string,
        "sourceBlend": source_info, "sourceBlendWasOverwritten": False,
        "sourceFiles": source_records([directory / name for name in (
            "build_shiretoko_environment.py", "_reclaim_common.py", "_reclaim_bpy.py", "shiretoko_contract.json")]),
        "worldContract": contract,
        "assets": [{"id": "procedural/shiretoko-v03", "origin": "Original geometry generated by the scripts",
                    "thirdPartyArt": False, "license": "Project-controlled original RECLAIM geometry; no separate third-party art licence",
                    "externalDependencies": [], "textures": [], "statistics": inspection["statistics"]}],
        "inspection": inspection, "outputs": [],
        "scope": {"generatedOnlyGlb": True, "blendPreservesOriginalScenes": True,
                  "blendMayContainUserSourceAssets": bool(source_blend), "runtimeGameCollisionReplacement": False,
                  "droneInBlend": "Static art marker. Game AI and combat are separate runtime modules.",
                  "windowsPcOrGamePerformanceMeasuredHere": False},
    }
    with ArtifactTransaction(output_dir, names, [source_blend] if source_blend else []) as transaction:
        save_blend_copy(bpy, scene, transaction.path(OUTPUT_BLEND_NAME))
        if EXPORT_GLB:
            export_selected_glb(bpy, scene, transaction.path(OUTPUT_GLB_NAME))
        for name in names:
            if not name.endswith("_manifest.json"):
                staged = transaction.path(name)
                manifest["outputs"].append({"name": name, "bytes": staged.stat().st_size,
                                            "sha256": sha256_file(staged), "sourceConfigSha256": fingerprint})
        write_json(transaction.path("RECLAIM_Shiretoko_v03_manifest.json"), manifest)
        transaction.commit()
    print(f"RECLAIM v03 created in {output_dir}. Original scenes/files preserved.")
    print("The generated GLB includes only the new scene. Review its manifest before distributing the .blend.")
    return manifest


if __name__ == "__main__":
    main()
