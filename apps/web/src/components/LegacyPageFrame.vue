<template>
  <div class="legacy-page-host" :class="hostClasses">
    <iframe v-if="projectReady" ref="frameRef" :key="frameKey" class="legacy-page-frame" :src="src" :title="title"></iframe>
    <div v-else class="legacy-page-loading" role="status">正在打开项目...</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { deploymentProfile } from '../config/deployment.js';
import { classifyProjectData } from '../modules/projects/project-types.js';
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
const frameNonce = ref(0);
const frameRef = ref(null);
const activeProjectId = ref('');
const activeProjectName = ref('');
const activeProjectPath = ref('');
const projectReady = ref(!props.manageProject || !String(route.query.projectId || ''));
let projectLoadToken = 0;
let saveQueue = Promise.resolve();
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

const legacyProjectPages = Object.freeze({
  'composition_builder.html': {
    type: 'composition',
    storageKey: 'cb_state_v1',
    serialize(payload) {
      return payload?.state || payload;
    }
  },
  'pointsbuilder.html': {
    type: 'pointsbuilder',
    storageKey: 'pb_state_v1',
    nameStorageKey: 'pb_project_name_v1',
    serialize(payload) {
      const state = payload?.state?.root ? payload.state : payload;
      return { state, ts: Date.now() };
    }
  },
  'shader_builder.html': {
    type: 'shader-builder',
    storageKey: 'sb_project_v1',
    serialize(payload) {
      return payload;
    }
  }
});

function getLegacyProjectTarget() {
  return props.manageProject ? legacyProjectPages[props.page] : null;
}

function applyPendingProject() {
  const target = getLegacyProjectTarget();
  if (!target) return false;
  const pending = consumePendingProject(target.type);
  if (!pending?.text) return false;
  try {
    const payload = JSON.parse(pending.text);
    window.localStorage.setItem(target.storageKey, JSON.stringify(target.serialize(payload)));
    if (target.nameStorageKey) {
      window.localStorage.setItem(
        target.nameStorageKey,
        String(pending.name || payload.projectName || 'PointsBuilderProject')
      );
    }
    activeProjectId.value = String(pending.projectId || route.query.projectId || '');
    activeProjectName.value = String(pending.name || '');
    activeProjectPath.value = activeProjectId.value ? '' : String(pending.filePath || '');
    projectReady.value = true;
    return true;
  } catch (error) {
    window.alert(error?.message || String(error));
    return false;
  }
}

function writeLegacyProjectPayload(target, payload, name = '') {
  window.localStorage.setItem(target.storageKey, JSON.stringify(target.serialize(payload)));
  if (target.nameStorageKey) {
    window.localStorage.setItem(
      target.nameStorageKey,
      String(name || payload.projectName || 'PointsBuilderProject')
    );
  }
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
  const { type, payload } = classifyProjectData(record || {});
  if (type !== target.type) {
    throw new Error(`项目类型不匹配：当前页面需要 ${target.type}，项目内容为 ${type}。`);
  }
  writeLegacyProjectPayload(target, payload, record?.name || '');
  activeProjectId.value = projectId;
  activeProjectName.value = String(record?.name || payload.projectName || '');
  activeProjectPath.value = '';
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
  const raw = window.localStorage.getItem(target.storageKey);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (target.type === 'pointsbuilder') {
    return parsed?.state?.root ? parsed.state : parsed;
  }
  return parsed;
}

function flushLegacyProjectState() {
  const frameWindow = frameRef.value?.contentWindow;
  if (!frameWindow?.CustomEvent) return;
  frameWindow.dispatchEvent(new frameWindow.CustomEvent('coo-legacy-before-route-leave'));
}

function readLegacyProjectName(target, payload) {
  if (target.nameStorageKey) {
    const storedName = String(window.localStorage.getItem(target.nameStorageKey) || '').trim();
    if (storedName) return storedName;
  }
  return String(payload?.projectName || activeProjectName.value || 'Untitled Project').trim();
}

function buildLegacyFilePayload(target, payload) {
  const projectName = readLegacyProjectName(target, payload);
  if (target.type === 'pointsbuilder') {
    return {
      ...payload,
      tool: target.type,
      schemaVersion: 1,
      projectName
    };
  }
  if (target.type === 'shader-builder') {
    return {
      ...payload,
      tool: target.type,
      schema: 'shader_builder_project_v1',
      projectName
    };
  }
  return {
    ...payload,
    tool: target.type,
    projectName
  };
}

function enqueueSave(operation) {
  const queued = saveQueue.then(operation);
  saveQueue = queued.catch(() => {});
  return queued;
}

async function saveIndexedProject() {
  const target = getLegacyProjectTarget();
  const projectId = activeProjectId.value;
  if (!target || !projectId || !projectReady.value) return true;
  flushLegacyProjectState();
  const payload = readLegacyProjectPayload(target);
  if (!payload) return true;
  const snapshot = JSON.parse(JSON.stringify(payload));
  const projectName = readLegacyProjectName(target, snapshot);
  await enqueueSave(() => projectRepository.save({
      id: projectId,
      tool: target.type,
      name: projectName,
      description: '',
      payload: snapshot
  }));
  return true;
}

async function saveLegacyProjectFile(forceDialog = false) {
  const target = getLegacyProjectTarget();
  const shell = getElectronShell();
  if (!target || !shell?.saveProjectFile) return false;
  flushLegacyProjectState();
  const payload = readLegacyProjectPayload(target);
  if (!payload) return false;
  const projectName = readLegacyProjectName(target, payload);
  const text = JSON.stringify(buildLegacyFilePayload(target, payload), null, 2);
  const indexedProject = Boolean(activeProjectId.value);
  const result = await enqueueSave(() => shell.saveProjectFile({
      title: '保存项目',
      filePath: forceDialog ? '' : activeProjectPath.value,
      forceDialog,
      defaultPath: `${sanitizeFileBase(projectName, 'project')}.json`,
      text
  }));
  if (result?.ok) {
    if (!indexedProject) {
      activeProjectPath.value = String(result.filePath || activeProjectPath.value);
      activeProjectName.value = String(result.name || projectName);
    }
    return true;
  }
  if (!result?.canceled && result?.message) window.alert(result.message);
  return false;
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
  void syncRouteProject();
});

watch(() => [route.query.shellOpen, route.query.shellNew, route.query.projectId], () => {
  void syncRouteProject();
});

onBeforeUnmount(() => {
  if (window.__cooLegacyNavigate === navigateFromLegacy) {
    delete window.__cooLegacyNavigate;
  }
  window.removeEventListener('message', handleLegacyMessage);
  window.removeEventListener('coo-shell-command', handleShellCommand);
});

onBeforeRouteLeave(async () => {
  try {
    flushLegacyProjectState();
    if (typeof props.beforeFrameLeave === 'function') {
      await props.beforeFrameLeave();
    }
    await saveIndexedProject();
  } catch (error) {
    window.alert(error?.message || String(error));
    return false;
  }
});

onBeforeRouteUpdate(async () => {
  try {
    flushLegacyProjectState();
    if (typeof props.beforeFrameLeave === 'function') {
      await props.beforeFrameLeave();
    }
    await saveIndexedProject();
  } catch (error) {
    window.alert(error?.message || String(error));
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
