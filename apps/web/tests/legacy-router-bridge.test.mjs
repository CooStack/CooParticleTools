import assert from 'node:assert/strict';
import test from 'node:test';

test('legacy route bridge emits Vue route names', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.window = {
    location: {
      search: [
        '?spa_workbench=%2Fworkbench',
        'spa_shader_builder=%2Fshader-builder',
        'spa_pointsbuilder=%2Fpointsbuilder',
        'spa_composition_pointsbuilder=%2Fcomposition-pointsbuilder'
      ].join('&')
    },
    top: null
  };
  globalThis.document = {
    readyState: 'complete',
    querySelectorAll() {
      return [];
    }
  };

  try {
    await import(`../public/legacy/assets/src/js/compat/spa-router-bridge.js?test=${Date.now()}`);
    assert.equal(window.__legacySpaRoutes.workbench, '/workbench');
    assert.equal(window.__legacySpaRoutes['shader-builder'], '/shader-builder');
    assert.equal(window.__legacySpaRoutes.pointsbuilder, '/pointsbuilder');
    assert.equal(window.__legacySpaRoutes['composition-pointsbuilder'], '/composition-pointsbuilder');
    assert.equal(window.__legacySpaRoutes.shaderBuilder, undefined);
    assert.equal(window.__legacySpaRoutes.pointsBuilder, undefined);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});
