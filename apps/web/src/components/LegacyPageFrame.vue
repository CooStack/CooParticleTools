<template>
  <div class="legacy-page-host" :class="hostClasses">
    <iframe v-if="frameReady" ref="frameRef" :key="frameKey" class="legacy-page-frame" :src="src" :title="title" @load="handleFrameLoad"></iframe>
    <div v-else class="legacy-page-loading" role="status">正在打开项目...</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { deploymentProfile } from '../config/deployment.js';
import {
  classifyProjectData,
  getLegacyProjectDefinition,
  parseProjectText
} from '../modules/projects/project-types.js';
import {
  hydrateLegacyPreferences,
  persistLegacyPreferences
} from '../modules/projects/legacy-preferences.js';
import { getProjectRepository } from '../services/repositories/project-repository.js';
import {
  consumePendingProject,
  getElectronShell,
  sanitizeFileBase
} from '../services/shell/electron-shell.js';

const props = defineProps({
  page: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  frameQuery: {
    type: Object,
    default: () => ({})
  },
  manageProject: {
    type: Boolean,
    default: true
  },
  returnRoute: {
    type: [String, Object],
    default: ''
  },
  beforeFrameLeave: {
    type: Function,
    default: null
  }
});

const route = useRoute();
const router = useRouter();
const projectRepository = getProjectRepository();
const AUTO_SAVE_DELAY_MS = 350;
const AUTO_SAVE_POLL_MS = 250;
const frameNonce = ref(0);
const frameRef = ref(null);
const activeProjectId = ref('');
const activeProjectName = ref('');
const activeProjectPath = ref('');
const projectReady = ref(!props.manageProject || !String(route.query.projectId || ''));
const legacyPreferencesReady = ref(false);
const frameReady = computed(() => projectReady.value && legacyPreferencesReady.value);
let projectLoadToken = 0;
let saveQueue = Promise.resolve();
let savedFileSnapshot = '';
let observedProjectSnapshot = '';
let autoSaveTimer = 0;
let autoSavePollTimer = 0;
const forwardedShellCommands = new Set([
  'export-kotlin'
]);
const seamlessFramePages = new Set([
  'composition_builder.html',
  'pointsbuilder.html',
  'composition_pointsbuilder.html',
  'shader_builder.html',
  'bezier.html'
]);
const hostClasses = computed(() => ({
  'legacy-page-host--seamless': seamlessFramePages.has(props.page)
}));

function getLegacyProjectTarget() {
  return props.manageProject ? getLegacyProjectDefinition(props.page) : null;
}

function applyPendingProject() {
  const target = getLegacyProjectTarget();
  if (!target) return false;
  const pending = consumePendingProject(target.type);
  if (!pending?.text) return false;
  try {
    const payload = JSON.parse(pending.text);
    writeLegacyProjectPayload(target, payload, pending.name || '');
    activeProjectId.value = String(pending.projectId || route.query.projectId || '');
    activeProjectName.value = String(pending.name || '');
    activeProjectPath.value = String(pending.filePath || '');
    markLegacyProjectSaved();
    projectReady.value = true;
    return true;
  } catch (error) {
    window.alert(error?.message || String(error));
    return false;
  }
}

function writeLegacyProjectPayload(target, payload, name = '') {
  const adapter = target.legacy;
  preserveLegacyPreferences(adapter, payload);
  window.localStorage.setItem(adapter.storageKey, JSON.stringify(adapter.toDraft(payload)));
  if (adapter.nameStorageKey) {
    window.localStorage.setItem(
      adapter.nameStorageKey,
      String(name || target.nameOf(payload, target.defaultName))
    );
  }
}

function preserveLegacyPreferences(adapter, incomingPayload) {
  if (!adapter.preferencesStorageKey || typeof adapter.preferencesFromDraft !== 'function') return;
  let storedPreferences = null;
  const storedPreferencesRaw = window.localStorage.getItem(adapter.preferencesStorageKey);
  if (storedPreferencesRaw) {
    try {
      storedPreferences = adapter.preferencesFromDraft(JSON.parse(storedPreferencesRaw));
    } catch {
    }
  }

  let currentPreferences = null;
  const currentDraft = window.localStorage.getItem(adapter.storageKey);
  if (currentDraft) {
    try {
      currentPreferences = adapter.preferencesFromDraft(JSON.parse(currentDraft));
    } catch {
    }
  }
  const incomingPreferences = adapter.preferencesFromDraft(incomingPayload);
  const preferences = mergeLegacyPreferences(
    incomingPreferences,
    currentPreferences,
    storedPreferences
  );
  if (preferences) {
    window.localStorage.setItem(adapter.preferencesStorageKey, JSON.stringify(preferences));
  }
}

function mergeLegacyPreferences(...sources) {
  const merged = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const previous = merged[key] || {};
      merged[key] = { ...previous, ...value };
      if (previous.actions || value.actions) {
        merged[key].actions = {
          ...(previous.actions || {}),
          ...(value.actions || {})
        };
      }
    }
  }
  return Object.keys(merged).length ? merged : null;
}

async function restoreDurableLegacyPreferences() {
  const adapter = getLegacyProjectTarget()?.legacy;
  try {
    await hydrateLegacyPreferences(adapter, window.localStorage, getElectronShell());
  } catch (error) {
    console.warn('restore legacy preferences failed:', error);
  } finally {
    legacyPreferencesReady.value = true;
  }
}

async function saveDurableLegacyPreferences() {
  const adapter = getLegacyProjectTarget()?.legacy;
  return persistLegacyPreferences(adapter, window.localStorage, getElectronShell());
}

async function restoreIndexedProject(projectId, token) {
  const target = getLegacyProjectTarget();
  if (!target || !projectId) return false;
  projectReady.value = false;
  const record = await projectRepository.get(target.type, projectId);
  if (token !== projectLoadToken) return false;
  if (!record?.payload) {
    throw new Error('找不到该项目，请返回项目页重新打开。');
  }
  const filePath = String(record.filePath || '');
  const shell = getElectronShell();
  let projectData = classifyProjectData(record || {});
  if (filePath && shell?.readTextFile) {
    const result = await shell.readTextFile(filePath, { addToRecent: false });
    if (token !== projectLoadToken) return false;
    if (!result?.ok) throw new Error(result?.message || '无法读取项目文件。');
    projectData = parseProjectText(result.text, filePath);
  }
  const { type, payload } = projectData;
  if (type !== target.type) {
    throw new Error(`项目类型不匹配：当前页面需要 ${target.type}，项目内容为 ${type}。`);
  }
  writeLegacyProjectPayload(target, payload, record?.name || '');
  activeProjectId.value = projectId;
  activeProjectName.value = String(record?.name || payload.projectName || '');
  activeProjectPath.value = shell?.saveProjectFile ? filePath : '';
  savedFileSnapshot = '';
  projectReady.value = true;
  return true;
}

async function syncRouteProject() {
  const token = ++projectLoadToken;
  const target = getLegacyProjectTarget();
  if (!target) {
    activeProjectId.value = '';
    projectReady.value = true;
    return;
  }
  if (applyPendingProject()) {
    frameNonce.value += 1;
    return;
  }
  const projectId = String(route.query.projectId || '');
  if (!projectId) {
    activeProjectId.value = '';
    projectReady.value = true;
    return;
  }
  if (projectReady.value && activeProjectId.value === projectId) return;
  try {
    if (!await restoreIndexedProject(projectId, token)) return;
    frameNonce.value += 1;
  } catch (error) {
    if (token !== projectLoadToken) return;
    projectReady.value = true;
    window.alert(error?.message || String(error));
    await router.replace({
      name: 'workbench',
      query: { projectError: error?.message || String(error) }
    });
  }
}

function readLegacyProjectPayload(target) {
  const adapter = target.legacy;
  const raw = window.localStorage.getItem(adapter.storageKey);
  if (!raw) return null;
  return adapter.fromDraft(JSON.parse(raw));
}

function flushLegacyProjectState() {
  const frameWindow = frameRef.value?.contentWindow;
  if (!frameWindow?.CustomEvent) return;
  frameWindow.dispatchEvent(new frameWindow.CustomEvent('coo-legacy-before-route-leave'));
}

function readLegacyProjectName(target, payload) {
  const adapter = target.legacy;
  if (adapter.nameStorageKey) {
    const storedName = String(window.localStorage.getItem(adapter.nameStorageKey) || '').trim();
    if (storedName) return storedName;
  }
  return target.nameOf(payload, activeProjectName.value || 'Untitled Project');
}

function buildLegacyFilePayload(target, payload) {
  const projectName = readLegacyProjectName(target, payload);
  return target.legacy.toFile(payload, projectName);
}

function legacyFileSnapshot() {
  const target = getLegacyProjectTarget();
  if (!target) return '';
  const payload = readLegacyProjectPayload(target);
  if (!payload) return '';
  return JSON.stringify(buildLegacyFilePayload(target, payload));
}

function legacyObservedSnapshot() {
  const target = getLegacyProjectTarget();
  const preferencesKey = target?.legacy?.preferencesStorageKey;
  const preferences = preferencesKey
    ? String(window.localStorage.getItem(preferencesKey) || '')
    : '';
  return `${legacyFileSnapshot()}\n${preferences}`;
}

function markLegacyProjectSaved() {
  savedFileSnapshot = legacyFileSnapshot();
}

function enqueueSave(operation) {
  const queued = saveQueue.then(operation);
  saveQueue = queued.catch(() => {});
  return queued;
}

async function saveIndexedProject() {
  const target = getLegacyProjectTarget();
  const projectId = activeProjectId.value;
  const filePath = activeProjectPath.value;
  flushLegacyProjectState();
  await saveDurableLegacyPreferences();
  if (!target || (!projectId && !filePath) || !projectReady.value) return true;
  const payload = readLegacyProjectPayload(target);
  if (!payload) return true;
  const snapshot = JSON.parse(JSON.stringify(payload));
  const projectName = readLegacyProjectName(target, snapshot);
  const filePayload = buildLegacyFilePayload(target, snapshot);
  const fileSnapshot = JSON.stringify(filePayload);
  await enqueueSave(async () => {
    const shell = getElectronShell();
    if (filePath && !shell?.saveProjectFile) {
      throw new Error('当前环境无法自动保存这个项目文件。');
    }
    if (filePath) {
      const text = JSON.stringify(filePayload, null, 2);
      if (shell.autoSaveProjectFile) {
        const backup = await shell.autoSaveProjectFile({ filePath, text });
        if (!backup?.ok) throw new Error(backup?.message || '项目自动备份失败。');
      }
      const result = await shell.saveProjectFile({
        title: '自动保存项目',
        filePath,
        addToRecent: false,
        text
      });
      if (!result?.ok) throw new Error(result?.message || '项目自动保存失败。');
    }
    if (projectId) {
      await projectRepository.save({
        id: projectId,
        tool: target.type,
        name: projectName,
        description: '',
        filePath,
        payload: snapshot
      });
    }
    savedFileSnapshot = fileSnapshot;
  });
  return true;
}

async function saveActiveProject() {
  if (activeProjectId.value) return saveIndexedProject();
  if (activeProjectPath.value) {
    const result = await saveLegacyProjectFile(false);
    if (!result?.ok) throw new Error(result?.message || '项目自动保存失败。');
    return true;
  }
  return true;
}

function scheduleProjectAutoSave() {
  window.clearTimeout(autoSaveTimer);
  if (!activeProjectId.value && !activeProjectPath.value) return;
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = 0;
    saveActiveProject().catch((error) => window.alert(error?.message || String(error)));
  }, AUTO_SAVE_DELAY_MS);
}

function observeLegacyProjectChanges() {
  if (!projectReady.value || !frameReady.value) return;
  let snapshot = '';
  try {
    snapshot = legacyObservedSnapshot();
  } catch {
    return;
  }
  if (!snapshot || snapshot === observedProjectSnapshot) return;
  observedProjectSnapshot = snapshot;
  scheduleProjectAutoSave();
}

async function saveLegacyProjectFile(forceDialog = false) {
  const target = getLegacyProjectTarget();
  const shell = getElectronShell();
  if (!target || !shell?.saveProjectFile) {
    return { ok: false, message: '当前环境无法保存项目文件。' };
  }
  flushLegacyProjectState();
  await saveDurableLegacyPreferences();
  const payload = readLegacyProjectPayload(target);
  if (!payload) return { ok: false, message: '当前项目没有可保存的内容。' };
  const projectName = readLegacyProjectName(target, payload);
  const filePayload = buildLegacyFilePayload(target, payload);
  const fileSnapshot = JSON.stringify(filePayload);
  const text = JSON.stringify(filePayload, null, 2);
  const indexedProject = Boolean(activeProjectId.value);
  const result = await enqueueSave(() => shell.saveProjectFile({
      title: '保存项目',
      filePath: forceDialog ? '' : activeProjectPath.value,
      forceDialog,
      defaultPath: `${sanitizeFileBase(projectName, 'project')}.json`,
      text
  }));
  if (result?.ok) {
    activeProjectPath.value = String(result.filePath || activeProjectPath.value);
    activeProjectName.value = String(result.name || projectName);
    if (indexedProject) {
      await enqueueSave(() => projectRepository.save({
        id: activeProjectId.value,
        tool: target.type,
        name: projectName,
        description: '',
        filePath: activeProjectPath.value,
        payload
      }));
    }
    sendProjectContextToFrame();
    savedFileSnapshot = fileSnapshot;
    return result;
  }
  if (!result?.canceled && result?.message) window.alert(result.message);
  return result || { ok: false, message: '项目保存失败。' };
}

function routeHref(name) {
  const href = router.resolve({ name }).href;
  if (href.startsWith('#')) {
    return `${deploymentProfile.appBase}${href}`;
  }
  return href;
}

const src = computed(() => {
  const params = new URLSearchParams();
  const frameQuery = {
    ...(route.query || {}),
    ...(props.frameQuery || {})
  };
  Object.entries(frameQuery).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
      return;
    }
    if (value == null) return;
    params.set(key, String(value));
  });
  params.set('spa_home', routeHref('workbench'));
  params.set('spa_workbench', routeHref('workbench'));
  params.set('spa_generator', routeHref('generator'));
  params.set('spa_shader_builder', routeHref('shader-builder'));
  params.set('spa_composition', routeHref('composition'));
  params.set('spa_pointsbuilder', routeHref('pointsbuilder'));
  params.set('spa_composition_pointsbuilder', routeHref('composition-pointsbuilder'));
  params.set('spa_bezier', routeHref('bezier'));
  params.set('shell_frame_version', '20260710_6');
  const search = params.toString();
  return `${deploymentProfile.appBase}legacy/${props.page}${search ? `?${search}` : ''}`;
});

const frameKey = computed(() => `${props.page}:${frameNonce.value}:${src.value}`);

const messageRouteMap = Object.freeze({
  'cpb-builder-return': 'composition',
  'egpb-builder-return': 'generator'
});
const allowedLegacyRoutes = new Set(['workbench']);

async function navigateFromLegacy(targetName) {
  const resolvedName = String(targetName || '').trim();
  if (!allowedLegacyRoutes.has(resolvedName)) return false;
  try {
    await saveIndexedProject();
  } catch (error) {
    window.alert(error?.message || String(error));
    return false;
  }
  activeProjectId.value = '';
  await router.push({ name: resolvedName });
  return true;
}

function handleLegacyMessage(event) {
  if (event.origin && event.origin !== window.location.origin) return;
  const type = String(event?.data?.type || '').trim();
  if (type === 'coo-request-project-context') {
    if (event.source !== frameRef.value?.contentWindow) return;
    sendProjectContextToFrame(event.source, event?.data?.requestId);
    return;
  }
  if (type === 'coo-legacy-navigate') {
    void navigateFromLegacy(event?.data?.routeName);
    return;
  }
  if (type === 'coo-legacy-new-project') {
    const projectType = String(event?.data?.projectType || '').trim();
    router.push({
      name: 'workbench',
      query: { create: String(Date.now()), projectType }
    });
    return;
  }
  const targetName = messageRouteMap[type];
  if (!targetName) return;
  if (route.name === targetName) {
    frameNonce.value += 1;
    return;
  }
  router.push(props.returnRoute || { name: targetName });
}

function sendProjectContextToFrame(targetWindow = frameRef.value?.contentWindow, requestId = '') {
  if (!targetWindow?.postMessage) return false;
  targetWindow.postMessage({
    type: 'coo-project-context',
    requestId: String(requestId || ''),
    projectFilePath: activeProjectPath.value,
    projectId: activeProjectId.value,
    projectType: getLegacyProjectTarget()?.type || '',
    projectName: activeProjectName.value
  }, window.location.origin);
  return true;
}

function handleFrameLoad() {
  sendProjectContextToFrame();
  observedProjectSnapshot = legacyObservedSnapshot();
  if (activeProjectId.value || savedFileSnapshot) return;
  flushLegacyProjectState();
  markLegacyProjectSaved();
}

async function inspectProjectBeforeClose() {
  flushLegacyProjectState();
  await saveDurableLegacyPreferences();
  if (activeProjectId.value || activeProjectPath.value) {
    try {
      await saveIndexedProject();
      return { handled: true, dirty: false, autoSaved: true };
    } catch (error) {
      return {
        handled: true,
        dirty: true,
        autoSaved: false,
        projectName: activeProjectName.value || '当前项目',
        message: error?.message || String(error)
      };
    }
  }
  const snapshot = legacyFileSnapshot();
  return {
    handled: true,
    dirty: Boolean(snapshot) && snapshot !== savedFileSnapshot,
    autoSaved: false,
    projectName: activeProjectName.value || '当前项目',
    filePath: activeProjectPath.value
  };
}

async function saveProjectBeforeClose() {
  if (activeProjectId.value || activeProjectPath.value) {
    try {
      await saveActiveProject();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || String(error) };
    }
  }
  return saveLegacyProjectFile(false);
}

function handleProjectCloseRequest(event) {
  const request = event?.detail;
  if (!request?.respondWith) return;
  if (request.action === 'inspect') {
    request.respondWith(inspectProjectBeforeClose());
  } else if (request.action === 'save') {
    request.respondWith(saveProjectBeforeClose());
  }
}

async function handleShellCommand(event) {
  const command = event?.detail || {};
  if (command.type === 'save-project' || command.type === 'save-as-project') {
    const target = getLegacyProjectTarget();
    if (!target) return;
    event.preventDefault();
    try {
      if (activeProjectId.value) {
        await saveIndexedProject();
      }
      if (command.type === 'save-as-project' || !activeProjectId.value) {
        await saveLegacyProjectFile(command.type === 'save-as-project');
      }
    } catch (error) {
      window.alert(error?.message || String(error));
    }
    return;
  }
  if (!forwardedShellCommands.has(command.type)) {
    return;
  }
  const frameWindow = frameRef.value?.contentWindow;
  if (!frameWindow) {
    return;
  }
  event.preventDefault();
  frameWindow.postMessage({ type: 'coo-shell-command', command }, window.location.origin);
}

onMounted(() => {
  window.__cooLegacyNavigate = navigateFromLegacy;
  window.addEventListener('message', handleLegacyMessage);
  window.addEventListener('coo-shell-command', handleShellCommand);
  window.addEventListener('coo-project-close-request', handleProjectCloseRequest);
  autoSavePollTimer = window.setInterval(observeLegacyProjectChanges, AUTO_SAVE_POLL_MS);
  void restoreDurableLegacyPreferences().then(syncRouteProject);
});

watch(() => [route.query.shellOpen, route.query.shellNew, route.query.projectId], () => {
  void syncRouteProject();
});

onBeforeUnmount(() => {
  projectLoadToken += 1;
  window.clearTimeout(autoSaveTimer);
  window.clearInterval(autoSavePollTimer);
  if (window.__cooLegacyNavigate === navigateFromLegacy) {
    delete window.__cooLegacyNavigate;
  }
  window.removeEventListener('message', handleLegacyMessage);
  window.removeEventListener('coo-shell-command', handleShellCommand);
  window.removeEventListener('coo-project-close-request', handleProjectCloseRequest);
});

onBeforeRouteLeave(async () => {
  projectLoadToken += 1;
  try {
    window.clearTimeout(autoSaveTimer);
    flushLegacyProjectState();
    await saveDurableLegacyPreferences();
    if (typeof props.beforeFrameLeave === 'function') {
      await props.beforeFrameLeave();
    }
    await saveActiveProject();
  } catch (error) {
    window.alert(error?.message || String(error));
    void syncRouteProject();
    return false;
  }
});

onBeforeRouteUpdate(async () => {
  projectLoadToken += 1;
  try {
    window.clearTimeout(autoSaveTimer);
    flushLegacyProjectState();
    await saveDurableLegacyPreferences();
    if (typeof props.beforeFrameLeave === 'function') {
      await props.beforeFrameLeave();
    }
    await saveActiveProject();
  } catch (error) {
    window.alert(error?.message || String(error));
    void syncRouteProject();
    return false;
  }
});
</script>

<style scoped>
.legacy-page-host {
  --mc-frame-line: #56313e;
  --mc-frame-shadow: #3a2330;
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  height: 100vh;
  overflow: hidden;
  padding: clamp(8px, 1.1vw, 16px);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.2), transparent 34%),
    url('../assets/textures/skybox.svg'),
    linear-gradient(180deg, #83c8f2 0%, #bfe6fb 54%, #f7dbe1 100%);
  background-repeat: no-repeat;
  background-size: auto, cover, auto;
  image-rendering: pixelated;
  isolation: isolate;
}

.legacy-page-host::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, transparent 0 68%, rgba(239, 158, 190, 0.16) 68% 100%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0 8px, transparent 8px 16px);
  opacity: 0.34;
}

.legacy-page-frame {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  border: 4px solid var(--mc-frame-line);
  border-radius: 0;
  background:
    url('../assets/textures/sakura-planks.svg'),
    #8d5361;
  background-size: 48px 48px, auto;
  box-shadow: 0 6px 0 var(--mc-frame-shadow), 0 16px 28px rgba(69, 38, 49, 0.34);
}

.legacy-page-host--seamless {
  padding: 0;
  background: #170812;
  image-rendering: auto;
}

.legacy-page-host--seamless::before {
  display: none;
}

.legacy-page-host--seamless .legacy-page-frame {
  border: 0 !important;
  background: #170812;
  box-shadow: none !important;
}

.legacy-page-loading {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: 100%;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  color: #dec0cf;
  background:
    linear-gradient(180deg, rgba(255, 116, 176, 0.08), transparent 34%),
    linear-gradient(180deg, #1b0a15 0%, #12070e 60%, #080408 100%);
  font-size: 13px;
  font-weight: 700;
}

.legacy-page-loading::before {
  content: "";
  width: 10px;
  height: 10px;
  background: #f06aa7;
  box-shadow: -18px 0 0 rgba(240, 106, 167, 0.28), 18px 0 0 rgba(240, 106, 167, 0.28);
  animation: legacy-loading-pulse 900ms steps(2, end) infinite;
}

@keyframes legacy-loading-pulse {
  50% {
    background: rgba(240, 106, 167, 0.28);
    box-shadow: -18px 0 0 #f06aa7, 18px 0 0 #f06aa7;
  }
}

@media (prefers-reduced-motion: reduce) {
  .legacy-page-loading::before {
    animation: none;
  }
}

@media (max-width: 768px) {
  .legacy-page-host {
    padding: 8px;
  }

  .legacy-page-frame {
    border-radius: 0;
  }
}
</style>
