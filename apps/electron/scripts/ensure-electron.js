const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const electronPackageRoot = path.dirname(require.resolve('electron/package.json'));
const installScript = path.join(electronPackageRoot, 'install.js');
const pathFile = path.join(electronPackageRoot, 'path.txt');
const timeoutMs = Number(process.env.COO_PARTICLES_ELECTRON_INSTALL_TIMEOUT_MS || 600000);

function readElectronPath() {
  if (!fs.existsSync(pathFile)) {
    return null;
  }
  const relativeExecutable = fs.readFileSync(pathFile, 'utf-8').trim();
  if (!relativeExecutable) {
    return null;
  }
  const distRoot = process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(electronPackageRoot, 'dist');
  return path.join(distRoot, relativeExecutable);
}

function isReady() {
  const executable = readElectronPath();
  return executable && fs.existsSync(executable) ? executable : null;
}

function installElectron() {
  return new Promise((resolve, reject) => {
    console.log('[electron-shell] Electron executable is missing; downloading Electron now.');
    console.log('[electron-shell] If this is slow in your network, set ELECTRON_MIRROR or npm_config_electron_mirror.');

    const child = spawn(process.execPath, [installScript], {
      cwd: electronPackageRoot,
      env: process.env,
      stdio: 'inherit',
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timed out downloading Electron after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Electron install failed with code ${code ?? 'null'} signal ${signal ?? 'null'}.`));
    });
  });
}

async function main() {
  const readyPath = isReady();
  if (readyPath) {
    console.log(`[electron-shell] Electron executable ready: ${path.normalize(readyPath)}`);
    return;
  }

  await installElectron();

  const installedPath = isReady();
  if (!installedPath) {
    throw new Error(`Electron install finished, but executable is still missing under ${electronPackageRoot}.`);
  }
  console.log(`[electron-shell] Electron executable ready: ${path.normalize(installedPath)}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
