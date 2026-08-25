'use strict';

const LEGACY_ROUTE_MAP = Object.freeze({
  'index.html': 'workbench',
  'generator.html': 'generator',
  'shader_builder.html': 'shader-builder',
  'composition_builder.html': 'composition',
  'pointsbuilder.html': 'pointsbuilder',
  'composition_pointsbuilder.html': 'composition-pointsbuilder',
  'bezier.html': 'bezier',
});

function mapLegacyUrlToAppUrl(rawUrl, backendUrl) {
  const raw = String(rawUrl || '');
  if (!raw || !backendUrl) return raw;

  try {
    const target = new URL(raw, backendUrl);
    const backend = new URL(backendUrl);
    if (target.origin !== backend.origin) return raw;

    const path = target.pathname.replace(/\/+$/, '');
    if (!path.toLowerCase().includes('/legacy/')) return raw;

    const pageName = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    const routeName = LEGACY_ROUTE_MAP[pageName];
    if (!routeName) return raw;

    const route = new URL(`/${routeName}`, backend.origin);
    route.search = target.search;
    route.hash = target.hash;
    return route.toString();
  } catch {
    return raw;
  }
}

module.exports = { mapLegacyUrlToAppUrl };
