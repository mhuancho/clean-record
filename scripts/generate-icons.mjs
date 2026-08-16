import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const workspace = process.cwd();
const source = path.join(workspace, 'public', 'favicon.svg');
const outputDirectory = path.join(workspace, 'build');
const svg = await readFile(source);
const sizes = [16, 24, 32, 48, 64, 128, 256];

await mkdir(outputDirectory, { recursive: true });
const pngBuffers = await Promise.all(sizes.map(size =>
  sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer()
));

await Promise.all([
  writeFile(path.join(outputDirectory, 'icon.ico'), await pngToIco(pngBuffers)),
  writeFile(path.join(outputDirectory, 'icon.png'), pngBuffers.at(-1))
]);
