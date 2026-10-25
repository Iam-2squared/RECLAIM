"""Import only user-provided original skins into editable Blender files."""
import bpy, hashlib, json, math
from pathlib import Path
from mathutils import Vector, Quaternion
ROOT=Path(__file__).resolve().parent.parent
reports=[]
for gender,expected_meshes,expected_bones in [('male',5,123),('female',3,183)]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source=ROOT/'originals'/f'{gender}.glb'
    bpy.ops.import_scene.gltf(filepath=str(source))
    arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
    shapes={bone.custom_shape for arm in arms for bone in arm.pose.bones if bone.custom_shape}
    for arm in arms:
        for bone in arm.pose.bones:bone.custom_shape=None
    for shape in shapes:bpy.data.objects.remove(shape,do_unlink=True)
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    assert len(meshes)==expected_meshes
    assert len(arms)==1 and len(arms[0].data.bones)==expected_bones
    assert not any(o.name.startswith('Hair_') for o in meshes)
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get();pts=[]
    for obj in meshes:
        evaluated=obj.evaluated_get(deps)
        pts.extend(evaluated.matrix_world@v.co for v in evaluated.data.vertices)
    low=Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    high=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    height=high.z-low.z;center=(high+low)/2
    bpy.context.scene.unit_settings.system='METRIC'
    bpy.context.scene.unit_settings.scale_length=1.8/height
    for arm in arms:
        for bone in arm.pose.bones:bone.custom_shape=None
        arm.hide_set(True)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                space.region_3d.view_location=center
                space.region_3d.view_distance=height*1.65
                space.region_3d.view_rotation=Quaternion((1,0,0),math.pi/2)
                space.clip_start=height/10000;space.clip_end=height*1000
                space.shading.type='MATERIAL'
    bpy.ops.file.pack_all()
    output=ROOT/'assets'/gender/f'{gender}-original.blend'
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    reports.append({'gender':gender,'source':source.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'output':output.relative_to(ROOT).as_posix(),'meshCount':len(meshes),'bones':len(arms[0].data.bones),'customHairMeshes':0,'images':len(bpy.data.images),'animations':len(bpy.data.actions)})
(ROOT/'review').mkdir(parents=True,exist_ok=True)
(ROOT/'review'/'original-blend-report.json').write_text(json.dumps(reports,indent=2))
print(json.dumps(reports))
