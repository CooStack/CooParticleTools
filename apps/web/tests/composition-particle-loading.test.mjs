import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Composition particle metadata can load without eagerly decoding every texture', async () => {
  const previousFetch = globalThis.fetch;
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const imageSources = [];

  globalThis.fetch = async (url) => ({
    ok: true,
    async json() {
      return String(url).endsWith('index.json')
        ? ['demo.json']
        : { name: 'DemoEffect', displayName: 'Demo', textures: ['assets/particles/one.png', 'assets/particles/two.png'] };
    }
  });
  globalThis.document = {
    createElement(name) {
      assert.equal(name, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext: () => ({ imageSmoothingEnabled: true, drawImage() {} })
      };
    }
  };
  globalThis.Image = class FakeImage {
    set src(value) {
      imageSources.push(value);
      queueMicrotask(() => this.onload?.());
    }
  };

  try {
    const loader = await import(`../public/legacy/assets/particles/particle_data_loader.js?lazy-test=${Date.now()}`);
    await loader.loadAllParticleData({ lazyAtlases: true });
    assert.deepEqual(imageSources, []);

    await loader.ensureParticleAtlas('DemoEffect');
    assert.deepEqual(imageSources, ['assets/particles/one.png', 'assets/particles/two.png']);
    assert.equal(loader.getParticleDataByName('DemoEffect').atlasReady, true);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.document = previousDocument;
    globalThis.Image = previousImage;
  }
});

test('Composition preview syncs texture uniforms when the shader is first compiled', () => {
  const source = readFileSync(
    new URL('../public/legacy/assets/composition_builder/js/main.js', import.meta.url),
    'utf8'
  );
  const shaderRefIndex = source.indexOf('this._pointsShaderRef = shader;');
  const syncIndex = source.indexOf('this.syncTextureUniforms?.();', shaderRefIndex);
  assert.ok(shaderRefIndex >= 0);
  assert.ok(syncIndex > shaderRefIndex);
});
