function normalizeBase(rawBase = '/') {
  const text = String(rawBase || '/').trim();
  if (!text || text === '/') return '/';
  const withLeading = text.startsWith('/') ? text : `/${text}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export function getDeploymentProfile() {
  const deployTarget = String(import.meta.env.VITE_DEPLOY_TARGET || 'local').trim();
  const githubPages = deployTarget === 'github-pages';
  const appBase = normalizeBase(import.meta.env.VITE_APP_BASE || import.meta.env.BASE_URL || '/');
  const routerMode = String(import.meta.env.VITE_ROUTER_MODE || (githubPages ? 'hash' : 'history')).trim();
  const repositoryMode = String(import.meta.env.VITE_PROJECT_REPOSITORY_MODE || (githubPages ? 'local' : 'server')).trim();

  return {
    deployTarget,
    githubPages,
    appBase,
    routerMode,
    repositoryMode,
    usesHashRouter: routerMode === 'hash',
    usesLocalRepository: repositoryMode === 'local'
  };
}

export const deploymentProfile = getDeploymentProfile();
