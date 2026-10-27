from pathlib import Path
import bpy
base=Path(__file__).resolve().parents[2]
source=base/'日本各地/札幌/札幌_3D/preview/03_札幌駅_南側から.png'
out=base/'repo/public/sapporo-map/deployment.webp'
image=bpy.data.images.load(str(source),check_existing=False)
w,h=image.size
if w>1280: image.scale(1280,round(h*1280/w))
scene=bpy.context.scene
scene.render.image_settings.file_format='WEBP'
scene.render.image_settings.color_mode='RGB'
scene.render.image_settings.quality=80
image.save_render(str(out),scene=scene)
print('SAPPORO_PHOTO',tuple(image.size),out.stat().st_size)
