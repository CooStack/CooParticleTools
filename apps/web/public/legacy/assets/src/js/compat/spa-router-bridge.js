(function installLegacySpaRouterBridge() {
  const params = new URLSearchParams(window.location.search || '');
  const routes = {
    home: params.get('spa_home') || '',
    workbench: params.get('spa_workbench') || '',
    generator: params.get('spa_generator') || '',
    'shader-builder': params.get('spa_shader_builder') || '',
    composition: params.get('spa_composition') || '',
    pointsbuilder: params.get('spa_pointsbuilder') || '',
    'composition-pointsbuilder': params.get('spa_composition_pointsbuilder') || '',
    bezier: params.get('spa_bezier') || ''
  };

  const aliasMap = {
    './index.html': 'workbench',
    '../index.html': 'workbench',
    'index.html': 'workbench',
    './generator.html': 'generator',
    'generator.html': 'generator',
    './shader_builder.html': 'shader-builder',
    'shader_builder.html': 'shader-builder',
    './composition_builder.html': 'composition',
    'composition_builder.html': 'composition',
    './pointsbuilder.html': 'pointsbuilder',
    'pointsbuilder.html': 'pointsbuilder',
    './composition_pointsbuilder.html': 'composition-pointsbuilder',
    'composition_pointsbuilder.html': 'composition-pointsbuilder',
    './bezier.html': 'bezier',
    'bezier.html': 'bezier'
  };

  function getRouteKey(rawHref) {
    const text = String(rawHref || '').trim();
    if (!text) return '';
    const noHash = text.split('#')[0] || '';
    const noQuery = noHash.split('?')[0] || '';
    return aliasMap[noQuery] || '';
  }

  function getAnchorRouteKey(anchor) {
    const routeKey = String(anchor?.dataset?.spaRoute || '').trim();
    return routeKey && routes[routeKey] ? routeKey : '';
  }

  function getSuffix(rawHref) {
    const text = String(rawHref || '').trim();
    if (!text) return '';
    const queryIndex = text.indexOf('?');
    const hashIndex = text.indexOf('#');
    const indexes = [queryIndex, hashIndex].filter((value) => value >= 0);
    if (!indexes.length) return '';
    return text.slice(Math.min(...indexes));
  }

  function resolveHref(rawHref, options = {}) {
    const routeKey = options.routeKey || getRouteKey(rawHref);
    if (!routeKey || !routes[routeKey]) return rawHref;
    return `${routes[routeKey]}${getSuffix(rawHref)}`;
  }

  function navigate(rawHref, options = {}) {
    const targetWindow = options.targetTop !== false && window.top ? window.top : window;
    targetWindow.location.href = resolveHref(rawHref);
  }

  function patchAnchors() {
    document.querySelectorAll('a[href]').forEach((anchor) => {
      const rawHref = anchor.getAttribute('href');
      const routeKey = getAnchorRouteKey(anchor) || getRouteKey(rawHref);
      if (!routeKey || !routes[routeKey]) return;
      const resolved = resolveHref(rawHref, { routeKey });
      if (resolved && resolved !== rawHref) {
        anchor.setAttribute('href', resolved);
      }
      anchor.dataset.spaResolvedRoute = routeKey;
      if (anchor.dataset.spaNavigationBound !== 'true') {
        anchor.dataset.spaNavigationBound = 'true';
        anchor.addEventListener('click', handleSpaNavigation, true);
      }
    });
  }

  function handleSpaNavigation(event) {
    if (!window.top || window.top === window) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.currentTarget?.matches?.('a[data-spa-resolved-route]')
      ? event.currentTarget
      : event.target?.closest?.('a[data-spa-resolved-route]');
    const routeName = String(anchor?.dataset?.spaResolvedRoute || '').trim();
    if (!routeName || !routes[routeName]) return;
    event.preventDefault();
    try {
      if (typeof window.top.__cooLegacyNavigate === 'function') {
        window.top.__cooLegacyNavigate(routeName);
        return;
      }
    } catch (_error) {
      // Cross-origin parents can only use postMessage.
    }
    window.top.postMessage({ type: 'coo-legacy-navigate', routeName }, window.location.origin);
  }

  window.__legacySpaRoutes = routes;
  window.__legacyResolveHref = resolveHref;
  window.__legacyNavigate = navigate;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchAnchors, { once: true });
  } else {
    patchAnchors();
  }
})();
