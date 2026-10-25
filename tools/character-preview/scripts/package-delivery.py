"""Package the local review and editable sources without publishing anywhere."""
from pathlib import Path
import shutil, zipfile, hashlib, json
ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'delivery'
DEST.mkdir(parents=True,exist_ok=True)
html=ROOT/'dist/RECLAIM_Character_Studio.html'
shutil.copy2(html,DEST/html.name)
with zipfile.ZipFile(DEST/'RECLAIM_Original_Skins_Preview.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for p in [html,ROOT/'README.md',ROOT/'ATTRIBUTION.md',ROOT/'THIRD_PARTY_LICENSES.txt']:
        archive.write(p,p.name)
with zipfile.ZipFile(DEST/'RECLAIM_Original_Skins_Source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for pattern in ['index.html','package.json','package-lock.json','README.md','ATTRIBUTION.md','THIRD_PARTY_LICENSES.txt','src/*','scripts/*','assets/*/*','originals/*.glb','review/FINAL_VERIFICATION.md','review/*report*.json','review/originals/*.json']:
        for p in ROOT.glob(pattern):
            if p.is_file() and p.suffix not in ['.blend1','.pyc']:
                archive.write(p,Path('RECLAIM_Original_Skins_Source')/p.relative_to(ROOT))
result=[]
for p in DEST.iterdir():
    if p.is_file():result.append({'name':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(DEST/'manifest.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
