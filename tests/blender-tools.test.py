"""Safety/data-contract checks. Does not pretend to execute Blender or GLB I/O."""
from __future__ import annotations

import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools" / "blender"))
from _reclaim_common import (ArtifactTransaction, check_outputs, config_hash, coordinate_seed,
                             descendant_ids, gable_roof_vertices, gable_roof_faces, load_world_contract, normalization,
                             require_third_party_export_permission, reusable_scene, runtime_to_blender,
                             sha256_file, terrain_height, terrain_raw_height, within_trail_margin,
                             validate_tree_selection)


class OutputSafetyTests(unittest.TestCase):
    def test_configuration_is_required(self):
        for value in (None, "", "   "):
            with self.assertRaises(ValueError):
                check_outputs(value, ["v03.blend"])

    def test_plain_portable_unique_names(self):
        with tempfile.TemporaryDirectory() as directory:
            for names in (["../original.blend"], [r"..\original.blend"], ["C:original.blend"],
                          ["a.json", "a.json"], [""], []):
                with self.assertRaises(ValueError):
                    check_outputs(directory, names)

    def test_source_cannot_be_an_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "v02.blend"
            with self.assertRaises(ValueError):
                check_outputs(directory, [source.name], [source])
            self.assertFalse(source.exists())

    def test_existing_output_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "v02.blend"
            source.write_bytes(b"ORIGINAL")
            with self.assertRaises(FileExistsError):
                check_outputs(directory, [source.name])
            self.assertEqual(source.read_bytes(), b"ORIGINAL")

    def test_symlink_cannot_bypass_source_protection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "v02.blend"
            source.write_bytes(b"ORIGINAL")
            link = root / "v03.blend"
            link.symlink_to(source)
            with self.assertRaises(ValueError):
                check_outputs(directory, [link.name], [source])
            self.assertEqual(source.read_bytes(), b"ORIGINAL")

    def test_no_directory_created_when_preflight_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            new = Path(directory) / "new"
            with self.assertRaises(ValueError):
                check_outputs(new, ["../wrong.json"])
            self.assertFalse(new.exists())

    def test_incomplete_transaction_publishes_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(FileNotFoundError):
                with ArtifactTransaction(Path(directory), ["v03.blend", "manifest.json"]) as transaction:
                    transaction.path("v03.blend").write_bytes(b"NEW")
                    transaction.commit()
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_transaction_creates_only_declared_new_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = root / "v02.blend"
            original.write_bytes(b"ORIGINAL")
            with ArtifactTransaction(root, ["v03.blend", "manifest.json"], [original]) as transaction:
                transaction.path("v03.blend").write_bytes(b"NEW")
                transaction.path("manifest.json").write_text("{}", encoding="utf-8")
                with self.assertRaises(ValueError):
                    transaction.path("v02.blend")
                transaction.commit()
            self.assertEqual(original.read_bytes(), b"ORIGINAL")
            self.assertEqual((root / "v03.blend").read_bytes(), b"NEW")
            self.assertEqual({path.name for path in root.iterdir()}, {"v02.blend", "v03.blend", "manifest.json"})

    def test_race_never_replaces_an_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(FileExistsError):
                with ArtifactTransaction(root, ["v03.blend"]) as transaction:
                    transaction.path("v03.blend").write_bytes(b"NEW")
                    (root / "v03.blend").write_bytes(b"OTHER WRITER")
                    transaction.commit()
            self.assertEqual((root / "v03.blend").read_bytes(), b"OTHER WRITER")

    def test_io_failure_rolls_back_only_new_outputs(self):
        import os
        original_link = os.link
        count = 0
        def failing_link(source, target):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("simulated output device failure")
            original_link(source, target)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = root / "v02.blend"
            original.write_bytes(b"ORIGINAL")
            with self.assertRaises(OSError):
                with ArtifactTransaction(root, ["v03.blend", "manifest.json"], [original]) as transaction:
                    transaction.path("v03.blend").write_bytes(b"NEW")
                    transaction.path("manifest.json").write_text("{}", encoding="utf-8")
                    with patch("os.link", failing_link):
                        transaction.commit()
            self.assertEqual({path.name for path in root.iterdir()}, {"v02.blend"})
            self.assertEqual(original.read_bytes(), b"ORIGINAL")


class HierarchyAndLicenceTests(unittest.TestCase):
    def setUp(self):
        self.report = {"nodes": [
            {"nodeId": "tree", "parentId": None, "meshTriangles": 0},
            {"nodeId": "trunk", "parentId": "tree", "meshTriangles": 12},
            {"nodeId": "branch", "parentId": "tree", "meshTriangles": 0},
            {"nodeId": "foliage", "parentId": "branch", "meshTriangles": 30},
            {"nodeId": "tree2", "parentId": None, "meshTriangles": 20},
        ]}

    def test_whole_tree_contains_trunk_and_all_nested_foliage(self):
        self.assertEqual(descendant_ids(self.report["nodes"], "tree"), {"tree", "trunk", "branch", "foliage"})
        self.assertEqual(validate_tree_selection(self.report, ["tree", "tree2"], ["tree", "tree2"]), ["tree", "tree2"])

    def test_individual_leaf_is_not_guessed_as_a_whole_tree(self):
        with self.assertRaises(ValueError):
            validate_tree_selection(self.report, ["foliage"], [])

    def test_nested_selected_roots_cannot_be_scaled_twice(self):
        with self.assertRaises(ValueError):
            validate_tree_selection(self.report, ["tree", "branch"], ["tree", "branch"])

    def test_invalid_or_unconfirmed_roots_stop_before_geometry_changes(self):
        for roots, confirmations in (([], []), (["unknown"], ["unknown"]),
                                      (["tree", "tree"], ["tree"]), (["branch"], ["tree"])):
            with self.assertRaises(ValueError):
                validate_tree_selection(self.report, roots, confirmations)

    def test_hierarchy_cycle_is_rejected(self):
        cyclic = [{"nodeId": "a", "parentId": "b"}, {"nodeId": "b", "parentId": "a"}]
        with self.assertRaises(ValueError):
            descendant_ids(cyclic, "a")

    def test_single_group_transform_scales_a_40m_tree_to_9m(self):
        result = normalization((-3, -2, -1), (3, 2, 39), 9)
        self.assertEqual(result["base_center"], (0, 0, -1))
        self.assertEqual(result["source_height"], 40)
        self.assertAlmostEqual(result["scale"], .225)

    def test_bad_bounds_and_implausible_height_are_rejected(self):
        for low, high, target in (((0, 0, 0), (1, 1, 0), 9), ((0, 0, 0), (1, 1, 2), 40),
                                  ((0, 0, 0), (1, 1, math.nan), 9), ((0, 0), (1, 1), 9)):
            with self.assertRaises(ValueError):
                normalization(low, high, target)

    def test_licence_export_defaults_to_disabled(self):
        with self.assertRaises(PermissionError):
            require_third_party_export_permission({}, False, "")
        with self.assertRaises(PermissionError):
            require_third_party_export_permission({}, True, "yes")

    def test_product_name_is_not_licence_evidence(self):
        with self.assertRaises(ValueError):
            require_third_party_export_permission({"name": "Trees and bush Pack LOWPOLY"}, True,
                "I CONFIRM THIS LICENSE ALLOWS THIS GENERATED GAME ASSET EXPORT")

    def test_explicit_confirmation_requires_existing_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            evidence = Path(directory) / "acquisition-proof.txt"
            metadata = {"name": "Pack", "creator": "Creator", "sourceUrl": "https://example.invalid/asset",
                        "licenseName": "Operator reviewed licence", "acquisitionMethod": "Operator obtained",
                        "evidencePath": str(evidence)}
            confirmation = "I CONFIRM THIS LICENSE ALLOWS THIS GENERATED GAME ASSET EXPORT"
            with self.assertRaises(FileNotFoundError):
                require_third_party_export_permission(metadata, True, confirmation)
            evidence.write_text("Operator-provided evidence", encoding="utf-8")
            require_third_party_export_permission(metadata, True, confirmation)

    def test_rerun_guard_reuses_only_owned_matching_config(self):
        fingerprint = config_hash({"seed": 431071})
        self.assertTrue(reusable_scene({"reclaim_generator_id": "own", "reclaim_config_sha256": fingerprint}, "own", fingerprint))
        for scene in ({}, {"reclaim_generator_id": "other", "reclaim_config_sha256": fingerprint},
                      {"reclaim_generator_id": "own", "reclaim_config_sha256": "different"}):
            with self.assertRaises(ValueError):
                reusable_scene(scene, "own", fingerprint)


class GeometryContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = load_world_contract(ROOT / "tools/blender/shiretoko_contract.json")
        cls.area = cls.contract["area"]

    def test_world_snapshot_corresponds_to_current_sources(self):
        for source in self.contract["sourceFiles"]:
            self.assertEqual(sha256_file(ROOT / source["path"]), source["sha256"],
                "Regenerate with node --experimental-strip-types tools/blender/export_world_contract.mjs --write")

    def test_coordinate_conversion_round_trips_standard_glb_y_up(self):
        runtime = (7.0, 1.75, 104.0)
        x, y, z = runtime_to_blender(runtime)
        self.assertEqual((x, z, -y), runtime)

    def test_roof_has_a_high_ridge_parallel_to_the_front_back_axis(self):
        vertices = gable_roof_vertices()
        self.assertEqual(vertices[2][0], 0)
        self.assertEqual(vertices[5][0], 0)
        self.assertEqual(vertices[2][2], vertices[5][2])
        self.assertGreater(vertices[2][2], vertices[0][2])
        self.assertGreater(vertices[2][2], vertices[1][2])
        with self.assertRaises(ValueError):
            gable_roof_vertices(ridge_z=2, eave_z=3)

    def test_spawn_radio_cabin_and_main_route_preserve_authority(self):
        for x, z in ((0, -1.5), (-3, -3), (0, 5), (-5, 5), (5, -5)):
            self.assertEqual(terrain_height(x, z, self.area), 0)
        for waypoint in self.area["route"]:
            self.assertAlmostEqual(terrain_raw_height(waypoint["x"], waypoint["z"], self.area), waypoint["height"], places=9)
        for exploration in self.area.get("explorationRoutes", []):
            for waypoint in exploration["waypoints"]:
                self.assertTrue(within_trail_margin(self.area, waypoint["x"], waypoint["z"], 0))

    def test_roof_faces_point_outwards_including_visible_upward_slopes(self):
        vertices = gable_roof_vertices()
        normals = []
        for face in gable_roof_faces():
            a, b, c = (vertices[index] for index in face[:3])
            u, v = [b[i] - a[i] for i in range(3)], [c[i] - a[i] for i in range(3)]
            normals.append((u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]))
        self.assertLess(normals[0][1], 0)
        self.assertGreater(normals[1][1], 0)
        for normal in normals[2:]:
            self.assertGreater(normal[2], 0)

    def test_python_heightfield_matches_runtime_noise_and_collision_triangles(self):
        # Runs the real TS implementation, rather than testing a copied fixture.
        samples = [(0, -1.5), (12, 64), (4, 104), (-46, 62), (-11.75, 21.25),
                   (3.4, 56.7), (-143.7, -95.8), (143.5, 191.2)]
        samples += [(index * 5.27 - 88.8, index * 7.12 - 50.3) for index in range(28)]
        samples += [(point["x"] + offset, point["z"] + .3) for route in self.area.get("explorationRoutes", [])
                    for point in route["waypoints"] for offset in (0, -2.3, 6.1)]
        code = """
import { getAreaDefinition } from './src/world/areas.ts';
import { TerrainSystem } from './src/world/terrain.ts';
import { coordinateSeed } from './src/world/random.ts';
const samples = JSON.parse(process.argv[1]);
const terrain = new TerrainSystem(getAreaDefinition('shiretoko'));
process.stdout.write(JSON.stringify({area: getAreaDefinition('shiretoko'),
  heights: samples.map(([x,z]) => terrain.heightAt(x,z)),
  seeds: samples.map(([x,z]) => coordinateSeed(431071, Math.floor(x), Math.floor(z)))}));
"""
        result = subprocess.run(["node", "--experimental-strip-types", "--input-type=module", "-e", code,
                                 json.dumps(samples)], cwd=ROOT, capture_output=True, text=True, check=True)
        runtime = json.loads(result.stdout)
        self.assertEqual(runtime["area"], self.area)
        for (x, z), height, seed in zip(samples, runtime["heights"], runtime["seeds"]):
            self.assertAlmostEqual(terrain_height(x, z, self.area), height, places=9)
            self.assertEqual(coordinate_seed(431071, math.floor(x), math.floor(z)), seed)


if __name__ == "__main__":
    unittest.main(verbosity=2)
