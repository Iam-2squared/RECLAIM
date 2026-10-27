import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function collectSapporoMapAssets(dist){
 const directory=resolve(dist,'sapporo-map'),manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
 const [bytes,physicsBytes,photo]=await Promise.all([readFile(resolve(directory,'city.glb.gz')),readFile(resolve(directory,'physics.json')),readFile(resolve(directory,'deployment.webp'))]);
 if(bytes.length!==manifest.runtimeBytes||hash(bytes)!==manifest.runtimeSha256||hash(physicsBytes)!==manifest.physicsSha256)throw Error('Sapporo delivery assets differ from their verified manifest.');
 const metadata=JSON.parse(physicsBytes);if(metadata.sourceGlbSha256!==manifest.sourceGlbSha256||!metadata.colliders.length||!metadata.floors.length)throw Error('Sapporo source geometry/physics mismatch.');
 return {payload:{glbGzipBase64:bytes.toString('base64'),metadata,photoDataUrl:`data:image/webp;base64,${photo.toString('base64')}`},record:{...manifest,photoBytes:photo.length,photoSha256:hash(photo),externalDependencies:0,sourceModelModified:false}};
}
