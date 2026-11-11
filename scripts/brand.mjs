// Renders PNG app icons and the social preview image from public/icon.svg.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg');
for (const size of [192, 512]) {
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(`public/icon-${size}.png`);
}
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs><radialGradient id="a" cx="0.8" cy="0" r="1"><stop offset="0" stop-color="#5b21c9"/><stop offset="1" stop-color="#07050f"/></radialGradient>
<radialGradient id="b" cx="0" cy="0.3" r="0.7"><stop offset="0" stop-color="#00a9d6" stop-opacity="0.45"/><stop offset="1" stop-color="#00a9d6" stop-opacity="0"/></radialGradient></defs>
<rect width="1200" height="630" fill="url(#a)"/><rect width="1200" height="630" fill="url(#b)"/></svg>`);
const icon = await sharp(svg, { density: 600 }).resize(340, 340).png().toBuffer();
await sharp(bg).composite([{ input: icon, top: 145, left: 430 }]).png().toFile('public/og.png');
console.log('brand assets written');
