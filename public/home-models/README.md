# HOME player models

`jonesy.glb` and `ramirez.glb` are display copies of the user's animated Jonesy and Ramirez models from `motion/characters/Jonesy/Jonesy_animated.glb` and `motion/characters/Ramirez/Ramirez_animated.glb` beside the repository. Those source GLBs, their Blender files and the earlier originals are preserved.

The runtime copies preserve mesh geometry, skeletons, skinning, UVs, accessors, all ten animation definitions and every non-image buffer view byte-for-byte. Texture content is the source content, resized to at most 1024 pixels per side. Opaque base-colour images use JPEG quality 92 with full chroma sampling; normal, data and alpha images use PNG. Material factors make skin, cloth and hair nonmetallic, matching the established character preview's correction. No replacement character geometry is used.

Each file retains `Idle`, `Walk`, `Run`, `Jump`, `Aim`, `Shoot`, `Reload`, `Hit`, `Death` and `Melee`. HOME plays only the supplied looping `Idle` using an independent Three.js `AnimationMixer` for each actor. It does not play walking, attacks or death in the lobby. The character roots remain on their pads; the source Idle has no root motion. Authored units are metres with a feet origin; the display normalizes the standing Idle pose to 1.8m.

Hidden pages, leaving HOME and reduced-motion settings freeze the actual mixer time. Resuming continues from that pose without including time spent hidden. Four standing characters reuse the two cached geometries, textures and clips with independently cloned skeletons and mixers.

Regenerate with `tools/home-lobby/prepare_characters.py` using Python with Pillow. `manifest.json` records source/runtime SHA-256 hashes, preserved geometry/animation checks, texture transformations and actual GLB clip times. The export starts keys at frame 1 (about 0.0333s), so actual GLB end times include that offset; nominal authored durations are also recorded.

Run `node tools/home-lobby/verify_characters.mjs` to load the actual optimized GLBs with Three.js, bind every clip, and sample skinned Idle bounds through a full loop. `animation-verification.json` records real bone motion, stable root positions and foot heights. This geometry-only check uses stub textures and does not claim GPU or screenshot verification. Model source attribution remains in `ATTRIBUTION.md`.
