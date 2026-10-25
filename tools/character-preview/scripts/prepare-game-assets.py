"""Retain source geometry and image bytes; repair metallic skin/cloth material flags."""
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent.parent
ORIGINALS = {
    gender: ROOT / 'originals' / f'{gender}.glb'
    for gender in ['male', 'female']
}

def read_glb(path):
    raw = path.read_bytes()
    magic, version, size = struct.unpack_from('<4sII', raw)
    assert magic == b'glTF' and version == 2 and size == len(raw)
    position, chunks = 12, []
    while position < len(raw):
        length, kind = struct.unpack_from('<I4s', raw, position)
        chunks.append((kind, raw[position + 8:position + 8 + length]))
        position += 8 + length
    document = json.loads(next(data for kind, data in chunks if kind == b'JSON'))
    binary = next(data for kind, data in chunks if kind == b'BIN\0')
    return raw, document, binary

def write_glb(path, document, binary):
    source = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode()
    source += b' ' * (-len(source) % 4)
    binary += b'\0' * (-len(binary) % 4)
    total = 12 + 8 + len(source) + 8 + len(binary)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(source), b'JSON') + source + struct.pack('<I4s', len(binary), b'BIN\0') + binary)

results = []
for gender, original_path in ORIGINALS.items():
    original_raw, original, original_binary = read_glb(original_path)
    source_raw, document, binary = read_glb(original_path)
    changes = []
    for index, material in enumerate(document.get('materials', [])):
        if index >= len(original.get('materials', [])):
            continue
        name = material.get('name', '')
        if name == 'Eyeshadow':
            continue
        pbr = material.setdefault('pbrMetallicRoughness', {})
        before = {k: pbr.get(k, 1.0) for k in ['metallicFactor', 'roughnessFactor']}
        pbr['metallicFactor'] = 0.0
        pbr['roughnessFactor'] = .72 if 'head' in name.lower() or 'hair' in name.lower() else .82
        changes.append({'material': name, 'before': before, 'after': {k: pbr[k] for k in ['metallicFactor', 'roughnessFactor']}, 'reason': 'Skin, fabric, leather and hair are not metallic. Existing green roughness channels were constant white. Geometry, base colour images, normal images and UVs are unchanged.'})
    document.setdefault('asset', {}).setdefault('extras', {})['reclaimReview'] = {
        'sourceGeometryAndImagesPreserved': True,
        'materialAdjustment': 'Source mesh materials use non-metallic skin/fabric/hair; existing base colour and normal textures retained.',
        'source': original.get('asset', {}).get('extras', {}).get('source'),
    }
    output_path = ROOT / 'assets' / gender / f'{gender}-game.glb'
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_glb(output_path, document, binary)
    _, output_document, output_binary = read_glb(output_path)
    assert output_binary == original_binary, 'Original binary data changed'
    for field in ['meshes', 'skins', 'images', 'nodes', 'accessors', 'bufferViews']:
        assert output_document.get(field) == original.get(field), f'Original {field} changed'
    result = {'gender': gender, 'source': original_path.relative_to(ROOT).as_posix(), 'output': output_path.relative_to(ROOT).as_posix(), 'sourceSha256': hashlib.sha256(original_raw).hexdigest(), 'outputSha256': hashlib.sha256(output_path.read_bytes()).hexdigest(), 'originalBinaryPrefixPreserved': True, 'originalMeshesSkinsImagesPreserved': True, 'materialChanges': changes}
    (ROOT / 'assets' / gender / 'game-material-adjustments.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    results.append(result)
print(json.dumps(results, ensure_ascii=False, indent=2))
