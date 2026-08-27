'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { resolveBackendLaunch } = require('../src/backend-launch');

test('development launch keeps the source Python workflow', () => {
  const repoRoot = path.resolve('D:/workspace/coo-tools');
  const launch = resolveBackendLaunch({
    isPackaged: false,
    resourcesPath: '',
    repoRoot,
    port: 43123,
    platform: 'win32',
    env: {
      COO_PARTICLES_PYTHON: 'C:/Python/python.exe',
      COO_PARTICLES_NODE: 'C:/Node/node.exe',
      PYTHONPATH: 'C:/shared-python',
    },
  });

  assert.equal(launch.command, 'C:/Python/python.exe');
  assert.equal(launch.cwd, repoRoot);
  assert.deepEqual(launch.args, [
    '-m',
    'coo_particles_client',
    '--headless',
    '--host',
    '127.0.0.1',
    '--port',
    '43123',
    '--web-root',
    path.join(repoRoot, 'apps', 'web'),
    '--node',
    'C:/Node/node.exe',
  ]);
  assert.equal(launch.env.PYTHONPATH, `${path.join(repoRoot, 'src')};C:/shared-python`);
});

test('packaged launch uses the bundled backend and skips frontend builds', () => {
  const resourcesPath = path.resolve('C:/Program Files/CooParticlesAPI Tools/resources');
  const launch = resolveBackendLaunch({
    isPackaged: true,
    resourcesPath,
    repoRoot: path.resolve('D:/workspace/coo-tools'),
    port: 43124,
    platform: 'win32',
    env: { COO_PARTICLES_REBUILD: '1', PYTHONPATH: 'C:/source-only' },
  });

  assert.equal(
    launch.command,
    path.join(resourcesPath, 'backend', 'coo-particles-backend.exe')
  );
  assert.equal(launch.cwd, path.join(resourcesPath, 'backend'));
  assert.deepEqual(launch.args, [
    '--headless',
    '--host',
    '127.0.0.1',
    '--port',
    '43124',
    '--skip-build',
  ]);
  assert.equal(launch.webRoot, null);
  assert.equal(launch.env.PYTHONPATH, 'C:/source-only');
});
