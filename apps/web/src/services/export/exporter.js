import { deploymentProfile } from '../../config/deployment.js';
import { exportKotlin as exportKotlinViaApi } from '../api/export.js';

function sanitizeFileBase(raw, fallback = 'export') {
  const text = String(raw || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
  return text || fallback;
}

function buildLocalExport({ tool, name, content, extension = '.kt' }) {
  const filename = `${sanitizeFileBase(name || tool || 'project')}${extension}`;
  return {
    tool,
    filename,
    content: String(content || ''),
    generatedAt: new Date().toISOString(),
    storageMode: 'local'
  };
}

export async function exportTextArtifact({ tool, name, content, extension = '.kt' }) {
  if (deploymentProfile.usesLocalRepository) {
    return buildLocalExport({ tool, name, content, extension });
  }
  try {
    const item = await exportKotlinViaApi({ tool, name, content });
    if (extension && extension !== '.kt') {
      return {
        ...item,
        filename: item.filename.replace(/\.kt$/i, extension)
      };
    }
    return item;
  } catch {
    return buildLocalExport({ tool, name, content, extension });
  }
}
