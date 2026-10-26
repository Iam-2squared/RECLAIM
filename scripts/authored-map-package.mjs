import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

/** Kept outside the normal application bundle; only standalone HTML carries it. */
export async function collectAuthoredMapAssets(dist) {
  const manifest=JSON.parse(await readFile(resolve(dist,'home-map/manifest.json'),'utf8'));
  const html=await readFile(resolve(dist,manifest.runtimeViewer.path));
  const preview=await readFile(resolve(dist,manifest.runtimePreview.path));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  if(hash(html)!==manifest.runtimeViewer.sha256||html.length!==manifest.runtimeViewer.bytes)throw new Error('Authored map viewer differs from manifest');
  if(hash(preview)!==manifest.runtimePreview.sha256)throw new Error('Authored map preview differs from manifest');
  if(!manifest.viewerUnmodified||!manifest.embeddedDataMatchesSource||manifest.externalResources!==0)throw new Error('Authored map source validation missing');
  const compressed=gzipSync(html,{level:9});
  return {
    payload:{htmlGzipBase64:compressed.toString('base64'),previewUrl:`data:image/webp;base64,${preview.toString('base64')}`},
    record:{id:manifest.id,revision:manifest.revision,htmlBytes:html.length,htmlSha256:hash(html),gzipBytes:compressed.length,sourceDataSha256:manifest.sourceData.sha256,sourceModelSha256:manifest.sourceModel.sha256,features:manifest.features},
  };
}
