import sharp from 'sharp';
import { join } from 'node:path';
const bg = {r:255,g:255,b:255,alpha:1};
for (const [source, target, width, height] of [
  ['dm-logo-original.png','dm-logo.png',640,360],
  ['dm-icon-original.png','dm-icon.png',512,512]
]) {
  const sourcePath = join('assets','brand','original',source);
  const targetPath = join('web','public',target);
  await sharp(sourcePath)
    .resize(width,height,{fit:'contain', background:bg})
    .flatten({background:bg})
    .png({compressionLevel:9})
    .toFile(targetPath);
  const metadata=await sharp(targetPath).metadata();
  if(metadata.width!==width || metadata.height!==height || metadata.hasAlpha) {
    throw new Error('Bad brand image format: '+target);
  }
  console.log(target+': '+width+'x'+height+' white background');
}
