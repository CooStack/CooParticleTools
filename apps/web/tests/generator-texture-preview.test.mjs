import assert from 'node:assert/strict';
import test from 'node:test';

import { getCParticleTexturePreview } from '../src/modules/generator/cparticle-forces.js';
import {
  removeCParticleTexturePreview,
  uploadCParticleTexturePreview
} from '../src/modules/generator/cparticle-texture-preview.js';

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function installTextureDomMocks(images) {
  const previous = {
    FileReader: globalThis.FileReader,
    Image: globalThis.Image,
    document: globalThis.document
  };

  class FakeFileReader {
    constructor() {
      this.listeners = new Map();
      this.result = '';
      this.error = null;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    readAsDataURL(file) {
      setTimeout(() => {
        this.result = file.dataUrl;
        this.listeners.get('load')?.();
      }, file.readDelay || 0);
    }
  }

  class FakeImage {
    constructor() {
      this.listeners = new Map();
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.pixels = null;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    set src(dataUrl) {
      const image = images.get(dataUrl);
      setTimeout(() => {
        if (!image) {
          this.listeners.get('error')?.();
          return;
        }
        this.naturalWidth = image.width;
        this.naturalHeight = image.height;
        this.pixels = image.pixels;
        this.listeners.get('load')?.();
      }, image?.decodeDelay || 0);
    }
  }

  globalThis.FileReader = FakeFileReader;
  globalThis.Image = FakeImage;
  globalThis.document = {
    createElement(type) {
      assert.equal(type, 'canvas');
      let drawnImage = null;
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage(image) {
              drawnImage = image;
            },
            getImageData() {
              return { data: drawnImage.pixels };
            }
          };
        }
      };
    }
  };

  return () => {
    globalThis.FileReader = previous.FileReader;
    globalThis.Image = previous.Image;
    globalThis.document = previous.document;
  };
}

test('a slower earlier texture decode cannot overwrite the latest upload', async () => {
  const firstDataUrl = 'data:image/png;base64,first';
  const secondDataUrl = 'data:image/png;base64,second';
  const restore = installTextureDomMocks(new Map([
    [firstDataUrl, { width: 1, height: 1, decodeDelay: 30, pixels: new Uint8ClampedArray([255, 0, 0, 255]) }],
    [secondDataUrl, { width: 1, height: 1, decodeDelay: 0, pixels: new Uint8ClampedArray([0, 255, 0, 255]) }]
  ]));
  const resource = { id: 'texture', kind: 'texture', dataUrl: '' };

  try {
    const firstUpload = uploadCParticleTexturePreview(resource, {
      name: 'first.png',
      type: 'image/png',
      dataUrl: firstDataUrl
    });
    await delay(5);
    const secondUpload = uploadCParticleTexturePreview(resource, {
      name: 'second.png',
      type: 'image/png',
      dataUrl: secondDataUrl
    });

    assert.deepEqual(await Promise.all([firstUpload, secondUpload]), [false, true]);
    assert.equal(resource.fileName, 'second.png');
    assert.equal(resource.dataUrl, secondDataUrl);
    assert.deepEqual(Array.from(getCParticleTexturePreview(resource).pixels), [0, 255, 0, 255]);
  } finally {
    removeCParticleTexturePreview(resource);
    restore();
  }
});

test('clearing a texture invalidates an upload that is still reading', async () => {
  const dataUrl = 'data:image/png;base64,pending';
  const restore = installTextureDomMocks(new Map([
    [dataUrl, { width: 1, height: 1, decodeDelay: 0, pixels: new Uint8ClampedArray([1, 2, 3, 255]) }]
  ]));
  const resource = { id: 'texture', kind: 'texture', dataUrl: '' };

  try {
    const upload = uploadCParticleTexturePreview(resource, {
      name: 'pending.png',
      type: 'image/png',
      dataUrl,
      readDelay: 20
    });
    removeCParticleTexturePreview(resource);

    assert.equal(await upload, false);
    assert.equal(resource.dataUrl, '');
    assert.equal(getCParticleTexturePreview(resource), null);
  } finally {
    removeCParticleTexturePreview(resource);
    restore();
  }
});
