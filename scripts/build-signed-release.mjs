import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const updateUrl = process.env.CLEANRECORD_UPDATE_URL?.trim();
const certificate = process.env.CSC_LINK?.trim();
const certificatePassword = process.env.CSC_KEY_PASSWORD?.trim();

if (!updateUrl || !/^https:\/\//i.test(updateUrl)) {
  throw new Error('CLEANRECORD_UPDATE_URL debe contener la URL HTTPS del canal de actualizaciones.');
}
if (!certificate || !certificatePassword) {
  throw new Error('La publicación firmada requiere CSC_LINK y CSC_KEY_PASSWORD.');
}

const workspace = process.cwd();
const updateConfig = path.join(workspace, 'electron', 'update-config.json');
const builderCli = path.join(workspace, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');

await writeFile(updateConfig, JSON.stringify({ url: updateUrl }, null, 2), 'utf8');

try {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      builderCli,
      '--win',
      '--publish',
      'never',
      '--config.publish.provider=generic',
      `--config.publish.url=${updateUrl}`
    ], {
      cwd: workspace,
      env: process.env,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`electron-builder terminó con código ${exitCode}.`);
} finally {
  await rm(updateConfig, { force: true });
}
