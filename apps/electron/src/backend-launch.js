'use strict';

const path = require('node:path');

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function resolveBackendLaunch({
  isPackaged,
  resourcesPath,
  repoRoot,
  port,
  platform = process.platform,
  env = process.env,
}) {
  const serviceArgs = [
    '--headless',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ];

  if (isPackaged) {
    const backendRoot = path.join(resourcesPath, 'backend');
    const executableName = platform === 'win32'
      ? 'coo-particles-backend.exe'
      : 'coo-particles-backend';
    return {
      command: path.join(backendRoot, executableName),
      args: [...serviceArgs, '--skip-build'],
      cwd: backendRoot,
      env: {
        ...env,
        PYTHONUNBUFFERED: '1',
      },
      webRoot: null,
    };
  }

  const defaultWebRoot = path.join(repoRoot, 'apps', 'web');
  const sourceRoot = path.join(repoRoot, 'src');
  const delimiter = platform === 'win32' ? ';' : ':';
  const existingPythonPath = env.PYTHONPATH || '';
  const args = ['-m', 'coo_particles_client', ...serviceArgs];
  const webRoot = env.COO_PARTICLES_WEB_ROOT || defaultWebRoot;

  if (webRoot) {
    args.push('--web-root', webRoot);
  }
  if (env.COO_PARTICLES_NODE) {
    args.push('--node', env.COO_PARTICLES_NODE);
  }
  if (isTruthy(env.COO_PARTICLES_REBUILD)) {
    args.push('--rebuild');
  } else if (isTruthy(env.COO_PARTICLES_SKIP_BUILD)) {
    args.push('--skip-build');
  }

  return {
    command: env.COO_PARTICLES_PYTHON || (platform === 'win32' ? 'py' : 'python3'),
    args,
    cwd: repoRoot,
    env: {
      ...env,
      PYTHONUNBUFFERED: '1',
      PYTHONPATH: existingPythonPath ? `${sourceRoot}${delimiter}${existingPythonPath}` : sourceRoot,
    },
    webRoot,
  };
}

module.exports = { resolveBackendLaunch };
