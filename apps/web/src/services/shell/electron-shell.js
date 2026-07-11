import { getProjectRoute, normalizeProjectType, parseProjectText } from '../../modules/projects/project-types.js';

export const PENDING_PROJECT_KEY = 'coo-particles-shell:pending-project';
export const PENDING_GENERATOR_PROJECT_KEY = PENDING_PROJECT_KEY;

const routeCommandMap = Object.freeze({
  workbench: 'workbench',
  composition: 'composition',
  generator: 'generator',
  plugins: 'plugins',
  pointsbuilder: 'pointsbuilder',
  'shader-builder': 'shader-builder',
  bezier: 'bezier'
});

export function getElectronShell() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.cooParticlesShell || null;
}

export function isElectronShell() {
  return Boolean(getElectronShell()?.isElectron);
}

export function stashPendingProject(project = {}) {
  if (typeof window === 'undefined') {
    return false;
  }
  const projectType = normalizeProjectType(project.projectType || project.tool);
  if (!projectType) {
    return false;
  }
  window.sessionStorage.setItem(PENDING_PROJECT_KEY, JSON.stringify({
    ...project,
    projectType,
    loadedAt: Date.now()
  }));
  return true;
}

export function consumePendingProject(expectedType = '') {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.sessionStorage.getItem(PENDING_PROJECT_KEY);
  if (!raw) {
    return null;
  }
  try {
    const pending = JSON.parse(raw);
    const projectType = normalizeProjectType(pending?.projectType || pending?.tool);
    const expected = normalizeProjectType(expectedType);
    if (expected && projectType !== expected) {
      return null;
    }
    window.sessionStorage.removeItem(PENDING_PROJECT_KEY);
    return { ...pending, projectType };
  } catch {
    window.sessionStorage.removeItem(PENDING_PROJECT_KEY);
    return null;
  }
}

export function sanitizeFileBase(raw, fallback = 'project') {
  const text = String(raw || '').trim();
  const safe = text.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
  return safe || fallback;
}

export function consumePendingGeneratorProject() {
  return consumePendingProject('generator');
}

function dispatchShellCommand(command) {
  if (typeof window === 'undefined') {
    return false;
  }
  const event = new CustomEvent('coo-shell-command', {
    cancelable: true,
    detail: command
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function routeNameFromCommand(command) {
  if (command?.type !== 'navigate') {
    return '';
  }
  const routeName = String(command.routeName || '').trim();
  return routeCommandMap[routeName] || '';
}

export async function openProjectResult(router, result) {
  if (!result?.ok || !result.text) {
    return null;
  }
  const { type, payload } = parseProjectText(result.text, result.filePath || result.name || '');
  const routeName = getProjectRoute(type);
  stashPendingProject({
    action: 'open',
    projectType: type,
    filePath: result.filePath || '',
    name: result.name || '',
    text: JSON.stringify(payload)
  });
  await router.push({
    name: routeName,
    query: { shellOpen: String(Date.now()), projectType: type }
  });
  return { type, payload };
}

async function fallbackOpenProject(router, command) {
  const shell = getElectronShell();
  if (!shell) {
    return;
  }

  if (command.type === 'open-recent-project' && command.filePath && shell.readTextFile) {
    const result = await shell.readTextFile(command.filePath);
    await openProjectResult(router, result);
    return;
  }

  if (command.type === 'open-project' && shell.openProjectFile) {
    const result = await shell.openProjectFile();
    await openProjectResult(router, result);
  }
}

async function returnToProjectPage(router, error = null) {
  const query = error
    ? { projectError: error?.message || String(error), at: String(Date.now()) }
    : {};
  await router.push({ name: 'workbench', query });
}

export function installElectronShellBridge(router) {
  const shell = getElectronShell();
  if (!shell?.onCommand) {
    return () => {};
  }

  return shell.onCommand(async (payload) => {
    const command = payload && typeof payload === 'object' ? payload : {};

    if (command.type === 'new-project') {
      await router.push({ name: 'workbench', query: { create: String(Date.now()) } });
      return;
    }

    if (command.type === 'open-project' || command.type === 'open-recent-project') {
      try {
        await fallbackOpenProject(router, command);
      } catch (error) {
        await returnToProjectPage(router, error);
      }
      return;
    }

    const routeName = routeNameFromCommand(command);
    if (routeName) {
      await router.push({ name: routeName });
      return;
    }

    if (dispatchShellCommand(command)) {
      return;
    }

  });
}
