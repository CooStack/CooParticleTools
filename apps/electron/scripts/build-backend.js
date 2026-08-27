'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const python = process.env.COO_PARTICLES_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
const distRoot = path.join(repoRoot, 'build', 'backend');
const workRoot = path.join(repoRoot, 'build', 'pyinstaller');
const outputRoot = path.join(distRoot, 'coo-particles-backend');
const executable = path.join(outputRoot, process.platform === 'win32'
  ? 'coo-particles-backend.exe'
  : 'coo-particles-backend');

const args = [
  '-m',
  'PyInstaller',
  '--noconfirm',
  '--clean',
  '--onedir',
  '--console',
  '--exclude-module',
  'webview',
  '--name',
  'coo-particles-backend',
  '--paths',
  path.join(repoRoot, 'src'),
  '--distpath',
  distRoot,
  '--workpath',
  path.join(workRoot, 'work'),
  '--specpath',
  path.join(workRoot, 'spec'),
  path.join(repoRoot, 'packaging', 'backend_entry.py'),
];

const child = spawn(python, args, {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});

child.once('error', (error) => {
  console.error(`Unable to start Python for the backend build: ${error.message}`);
  process.exitCode = 1;
});

child.once('exit', (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  if (!fs.existsSync(executable)) {
    console.error(`PyInstaller completed without producing ${executable}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[build-backend] Ready: ${executable}`);
});
