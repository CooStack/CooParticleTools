import { spawn } from 'node:child_process';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const webRoot = path.resolve(scriptDir, '..');
const distDir = path.join(webRoot, 'dist');
const tempDir = path.join(webRoot, '.dist-build-temp');

async function removeTempDir() {
  await rm(tempDir, { recursive: true, force: true });
}

async function runViteBuild(extraArgs = []) {
  const vitePkgPath = require.resolve('vite/package.json');
  const viteBin = path.join(path.dirname(vitePkgPath), 'bin', 'vite.js');
  const args = [viteBin, 'build', '--outDir', tempDir, '--emptyOutDir', 'true', ...extraArgs];

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: webRoot,
      env: {
        ...process.env,
        VITE_DEPLOY_TARGET: process.env.VITE_DEPLOY_TARGET || 'local',
        VITE_APP_BASE: process.env.VITE_APP_BASE || '/',
        VITE_ROUTER_MODE: process.env.VITE_ROUTER_MODE || 'history',
        VITE_PROJECT_REPOSITORY_MODE: process.env.VITE_PROJECT_REPOSITORY_MODE || 'server',
        VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || '/api'
      },
      stdio: 'inherit'
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Vite build failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

async function pruneDistRoot() {
  await mkdir(distDir, { recursive: true });
  const entries = await readdir(distDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'legacy') continue;
    await rm(path.join(distDir, entry.name), { recursive: true, force: true });
  }
}

async function syncTempToDist() {
  const entries = await readdir(tempDir, { withFileTypes: true });

  for (const entry of entries) {
    const source = path.join(tempDir, entry.name);
    const target = path.join(distDir, entry.name);
    await cp(source, target, { recursive: true, force: true });
  }
}

async function main() {
  const extraArgs = process.argv.slice(2);
  await removeTempDir();

  try {
    console.log('[build-safe] Building to temporary output...');
    await runViteBuild(extraArgs);

    console.log('[build-safe] Refreshing dist (preserving dist/legacy to avoid Windows EPERM during emptyDir)...');
    await pruneDistRoot();
    await syncTempToDist();
    console.log('[build-safe] Build output synced to dist.');
  } finally {
    await removeTempDir();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
