import {
  clearCParticleTexturePreview,
  setCParticleTexturePreview
} from './cparticle-forces.js';

const textureUploadRequests = new WeakMap();
let textureUploadRequestSeed = 0;

function beginTextureUpload(resource) {
  textureUploadRequestSeed += 1;
  textureUploadRequests.set(resource, textureUploadRequestSeed);
  return textureUploadRequestSeed;
}

function isCurrentTextureUpload(resource, requestId) {
  return textureUploadRequests.get(resource) === requestId;
}

function invalidateTextureUpload(resource) {
  if (!resource || typeof resource !== 'object') return;
  beginTextureUpload(resource);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(reader.error || new Error('纹理文件读取失败。')));
    reader.readAsDataURL(file);
  });
}

function decodeImageDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => {
      const width = Math.max(1, image.naturalWidth || image.width || 1);
      const height = Math.max(1, image.naturalHeight || image.height || 1);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        reject(new Error('当前浏览器无法读取纹理像素。'));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve({ width, height, pixels: context.getImageData(0, 0, width, height).data });
    });
    image.addEventListener('error', () => reject(new Error('纹理格式无法解码。')));
    image.src = dataUrl;
  });
}

export async function hydrateCParticleTexturePreview(resource) {
  const dataUrl = String(resource?.dataUrl || '');
  if (resource?.kind !== 'texture' || !dataUrl.startsWith('data:image/')) {
    clearCParticleTexturePreview(resource);
    return false;
  }
  const preview = await decodeImageDataUrl(dataUrl);
  if (resource.kind !== 'texture' || String(resource.dataUrl || '') !== dataUrl) return false;
  resource.imageWidth = preview.width;
  resource.imageHeight = preview.height;
  setCParticleTexturePreview(resource, preview);
  return true;
}

export async function uploadCParticleTexturePreview(resource, file) {
  if (!resource || typeof resource !== 'object') throw new Error('纹理资源不存在。');
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('请选择图片文件。');
  const requestId = beginTextureUpload(resource);
  const dataUrl = await readFileAsDataUrl(file);
  if (!isCurrentTextureUpload(resource, requestId)) return false;
  resource.fileName = String(file.name || 'texture');
  resource.mimeType = String(file.type || '');
  resource.dataUrl = dataUrl;
  const hydrated = await hydrateCParticleTexturePreview(resource);
  return hydrated && isCurrentTextureUpload(resource, requestId);
}

export function removeCParticleTexturePreview(resource) {
  if (!resource || typeof resource !== 'object') return;
  invalidateTextureUpload(resource);
  clearCParticleTexturePreview(resource);
  resource.fileName = '';
  resource.mimeType = '';
  resource.dataUrl = '';
  resource.imageWidth = 0;
  resource.imageHeight = 0;
}

export async function hydrateCParticleTexturePreviews(resources) {
  const results = await Promise.allSettled((Array.isArray(resources) ? resources : [])
    .filter((resource) => resource?.kind === 'texture' && resource.dataUrl)
    .map((resource) => hydrateCParticleTexturePreview(resource)));
  return results.filter((result) => result.status === 'rejected').map((result) => result.reason);
}
