<template>
  <div class="workbench-page">
    <aside class="workbench-rail">
      <div class="rail-brand">
        <span class="rail-mark">CP</span>
        <div>
          <strong>CooParticles</strong>
          <small>Project Studio</small>
        </div>
      </div>

      <nav class="rail-nav" aria-label="项目导航">
        <RouterLink :to="{ name: 'workbench' }">项目</RouterLink>
        <RouterLink :to="{ name: 'plugins' }">插件</RouterLink>
      </nav>

      <div class="rail-status">
        <span :class="['status-dot', shellAvailable ? 'online' : '']"></span>
        <span>{{ shellAvailable ? 'Desktop runtime' : 'Web runtime' }}</span>
      </div>
    </aside>

    <main class="workbench-main">
      <header class="workbench-header">
        <div>
          <span class="workbench-kicker">Project Studio</span>
          <h1>项目</h1>
          <p>{{ projectItems.length }} 个已索引项目</p>
        </div>
        <div class="workbench-actions">
          <button class="primary-action" type="button" @click="showCreateDialog">新建项目</button>
          <button type="button" @click="openProject">打开文件</button>
          <input ref="fileInputRef" type="file" accept="application/json,.json" hidden @change="openBrowserFile" />
        </div>
      </header>

      <div v-if="pageError" class="error-banner" role="alert">
        <span>{{ pageError }}</span>
        <button type="button" aria-label="关闭" @click="pageError = ''">×</button>
      </div>

      <section class="project-section" aria-labelledby="project-index-title">
        <div class="section-head">
          <div>
            <h2 id="project-index-title">项目索引</h2>
            <small>项目文件与旧版本机项目</small>
          </div>
          <button type="button" class="text-button" @click="loadProjectIndex">刷新</button>
        </div>

        <div v-if="projectItems.length" class="project-list">
          <article v-for="item in projectItems" :key="`${item.tool}:${item.id}`" class="project-row">
            <button class="project-open" type="button" @click="openIndexedProject(item)">
              <span class="project-type-mark">{{ typeInitial(item.tool) }}</span>
              <span class="project-copy">
                <strong>{{ item.name }}</strong>
                <small>{{ typeLabel(item.tool) }} · {{ formatDateTime(item.updatedAt) }}</small>
                <small v-if="item.filePath" class="project-path">{{ item.filePath }}</small>
              </span>
            </button>
            <button class="row-action danger-action" type="button" @click="deleteIndexedProject(item)">
              {{ item.filePath ? '移除' : '删除' }}
            </button>
          </article>
        </div>
        <div v-else class="empty-state">
          <strong>还没有项目</strong>
          <button type="button" @click="showCreateDialog">新建项目</button>
        </div>
      </section>

      <section v-if="unindexedRecentFiles.length" class="project-section" aria-labelledby="recent-files-title">
        <div class="section-head">
          <div>
            <h2 id="recent-files-title">最近文件</h2>
            <small>从本机打开</small>
          </div>
          <button type="button" class="text-button" @click="loadRecentFiles">刷新</button>
        </div>

        <div class="recent-list">
          <button
            v-for="item in unindexedRecentFiles"
            :key="item.filePath"
            type="button"
            class="recent-row"
            @click="openRecentFile(item.filePath)"
          >
            <span class="file-mark">JSON</span>
            <span>
              <strong>{{ item.name }}</strong>
              <small>{{ item.filePath }}</small>
            </span>
          </button>
        </div>
      </section>
    </main>

    <div v-if="createDialogOpen" class="dialog-backdrop" @click.self="closeCreateDialog">
      <section class="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
        <header class="dialog-head">
          <div>
            <span class="workbench-kicker">New Project</span>
            <h2 id="create-project-title">新建项目</h2>
          </div>
          <button class="dialog-close" type="button" aria-label="关闭" @click="closeCreateDialog">×</button>
        </header>

        <div class="project-type-list" role="radiogroup" aria-label="项目类型">
          <button
            v-for="type in projectTypes"
            :key="type.id"
            type="button"
            class="project-type-option"
            :class="{ selected: selectedProjectType === type.id }"
            :aria-checked="selectedProjectType === type.id"
            role="radio"
            @click="selectProjectType(type.id)"
          >
            <span class="project-type-mark large">{{ typeInitial(type.id) }}</span>
            <span>
              <strong>{{ type.label }}</strong>
              <small>{{ type.description }}</small>
            </span>
          </button>
        </div>

        <label class="name-field">
          <span>项目名称</span>
          <input ref="nameInputRef" v-model.trim="projectName" type="text" @input="projectNameDirty = true" @keydown.enter="createProject" />
        </label>

        <label v-if="shellAvailable" class="name-field">
          <span>项目位置</span>
          <span class="project-location-control">
            <input
              :value="projectFilePath"
              type="text"
              readonly
              placeholder="请选择项目 JSON 文件的保存位置"
              @click="chooseProjectLocation"
            />
            <button type="button" :disabled="choosingProjectLocation" @click="chooseProjectLocation">
              {{ choosingProjectLocation ? '选择中...' : '选择' }}
            </button>
          </span>
        </label>

        <div v-if="supportsPackageConfig" class="project-config-fields">
          <label class="name-field">
            <span>包路径</span>
            <input v-model.trim="projectPackageName" type="text" placeholder="cn.coostack.generated" @keydown.enter="createProject" />
          </label>
          <label class="name-field">
            <span>映射</span>
            <select v-model="projectMapping">
              <option value="yarn">Yarn (Fabric)</option>
              <option value="mojmap">Mojang / Mojmap</option>
            </select>
          </label>
        </div>

        <footer class="dialog-actions">
          <button type="button" @click="closeCreateDialog">取消</button>
          <button class="primary-action" type="button" :disabled="creatingProject" @click="createProject">
            {{ creatingProject ? '创建中...' : '创建' }}
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  PROJECT_TYPES,
  classifyProjectData,
  createProjectPayload,
  getProjectRoute,
  getProjectType,
  normalizeProjectType,
  parseProjectText,
  projectNameForTypeChange
} from '../modules/projects/project-types.js';
import { getProjectRepository } from '../services/repositories/project-repository.js';
import {
  getElectronShell,
  isElectronShell,
  openProjectResult,
  sanitizeFileBase,
  stashPendingProject
} from '../services/shell/electron-shell.js';
import { formatDateTime } from '../utils/format.js';

const route = useRoute();
const router = useRouter();
const projectRepository = getProjectRepository();
const projectTypes = PROJECT_TYPES;
const projectItems = ref([]);
const recentFiles = ref([]);
const pageError = ref('');
const fileInputRef = ref(null);
const nameInputRef = ref(null);
const createDialogOpen = ref(false);
const creatingProject = ref(false);
const choosingProjectLocation = ref(false);
const selectedProjectType = ref('generator');
const projectName = ref(getProjectType('generator').defaultName);
const projectNameDirty = ref(false);
const projectFilePath = ref('');
const projectPackageName = ref('');
const projectMapping = ref('yarn');
const shellAvailable = computed(() => isElectronShell());
const supportsPackageConfig = computed(() => ['generator', 'composition'].includes(selectedProjectType.value));
const unindexedRecentFiles = computed(() => {
  const indexedPaths = new Set(
    projectItems.value
      .map((item) => String(item.filePath || '').toLowerCase())
      .filter(Boolean)
  );
  return recentFiles.value.filter((item) => !indexedPaths.has(String(item.filePath || '').toLowerCase()));
});

function typeLabel(rawType) {
  return getProjectType(rawType)?.label || String(rawType || '未知类型');
}

function typeInitial(rawType) {
  return getProjectType(rawType)?.initial || '?';
}

function setError(error) {
  pageError.value = error?.message || String(error || '操作失败。');
}

function showCreateDialog() {
  pageError.value = '';
  createDialogOpen.value = true;
  nextTick(() => nameInputRef.value?.select());
}

function closeCreateDialog() {
  createDialogOpen.value = false;
  projectFilePath.value = '';
  if (route.query.create) {
    const query = { ...route.query };
    delete query.create;
    delete query.projectType;
    router.replace({ name: 'workbench', query }).catch(() => {});
  }
}

function selectProjectType(type) {
  const definition = getProjectType(type);
  const previousType = selectedProjectType.value;
  const previousPackageDefault = previousType === 'composition' ? 'cn.coostack.compositions' : '';
  selectedProjectType.value = definition?.type || type;
  projectName.value = projectNameForTypeChange(
    projectName.value,
    selectedProjectType.value,
    projectNameDirty.value
  );
  if (!projectPackageName.value || projectPackageName.value === previousPackageDefault) {
    projectPackageName.value = selectedProjectType.value === 'composition' ? 'cn.coostack.compositions' : '';
  }
  nextTick(() => nameInputRef.value?.select());
}

async function chooseProjectLocation() {
  if (choosingProjectLocation.value) return false;
  const shell = getElectronShell();
  if (!shell?.chooseProjectFile) return false;
  choosingProjectLocation.value = true;
  try {
    const result = await shell.chooseProjectFile({
      title: '选择项目位置',
      defaultPath: `${sanitizeFileBase(projectName.value, 'project')}.json`
    });
    if (result?.ok && result.filePath) {
      projectFilePath.value = String(result.filePath);
      return true;
    }
    if (!result?.canceled) setError(result);
    return false;
  } catch (error) {
    setError(error);
    return false;
  } finally {
    choosingProjectLocation.value = false;
  }
}

async function createProject() {
  if (creatingProject.value) return;
  creatingProject.value = true;
  pageError.value = '';
  try {
    const type = normalizeProjectType(selectedProjectType.value);
    const definition = getProjectType(type);
    const payload = createProjectPayload(type, projectName.value, {
      packageName: projectPackageName.value,
      mapping: projectMapping.value
    });
    const name = String(projectName.value || definition.defaultName).trim();
    const shell = getElectronShell();
    let filePath = '';
    if (shell?.saveProjectFile) {
      if (!projectFilePath.value && !await chooseProjectLocation()) return;
      const fileResult = await shell.saveProjectFile({
        title: '创建项目',
        filePath: projectFilePath.value,
        text: JSON.stringify(payload, null, 2)
      });
      if (!fileResult?.ok) {
        if (!fileResult?.canceled) setError(fileResult);
        return;
      }
      filePath = String(fileResult.filePath || projectFilePath.value);
      projectFilePath.value = filePath;
    }
    const saved = await projectRepository.save({
      tool: type,
      name,
      description: '',
      filePath,
      payload
    });
    stashPendingProject({
      action: 'new',
      projectType: type,
      projectId: saved?.id || '',
      filePath,
      name,
      text: JSON.stringify(payload)
    });
    createDialogOpen.value = false;
    await router.push({
      name: getProjectRoute(type),
      query: { projectId: saved?.id || '', projectType: type, shellNew: String(Date.now()) }
    });
  } catch (error) {
    setError(error);
  } finally {
    creatingProject.value = false;
  }
}

async function openIndexedProject(item) {
  pageError.value = '';
  try {
    const record = await projectRepository.get(item.tool, item.id);
    const filePath = String(record?.filePath || item.filePath || '');
    let projectData = classifyProjectData(record || item);
    if (filePath) {
      const shell = getElectronShell();
      if (shell?.readTextFile) {
        const result = await shell.readTextFile(filePath);
        if (!result?.ok) throw new Error(result?.message || '无法读取项目文件。');
        projectData = parseProjectText(result.text, filePath);
      }
    }
    const { type, payload } = projectData;
    const indexedType = normalizeProjectType(item.tool);
    if (type !== indexedType) {
      throw new Error(`项目文件类型为 ${type}，与索引类型 ${indexedType} 不一致。请移除旧索引后重新打开文件。`);
    }
    stashPendingProject({
      action: 'open',
      projectType: type,
      projectId: item.id,
      filePath,
      name: record?.name || item.name,
      text: JSON.stringify(payload)
    });
    await router.push({
      name: getProjectRoute(type),
      query: { projectId: item.id, projectType: type, shellOpen: String(Date.now()) }
    });
  } catch (error) {
    setError(error);
  }
}

async function deleteIndexedProject(item) {
  const prompt = item.filePath
    ? `从索引中移除项目“${item.name}”？项目文件会保留。`
    : `删除项目“${item.name}”？`;
  if (!window.confirm(prompt)) return;
  try {
    await projectRepository.remove(item.tool, item.id);
    await loadProjectIndex();
  } catch (error) {
    setError(error);
  }
}

async function openProject() {
  pageError.value = '';
  const shell = getElectronShell();
  if (!shell?.openProjectFile) {
    fileInputRef.value?.click();
    return;
  }
  try {
    const result = await shell.openProjectFile();
    await openProjectResult(router, result);
    await loadRecentFiles();
  } catch (error) {
    setError(error);
  }
}

async function openBrowserFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const { type, payload } = parseProjectText(text, file.name);
    const definition = getProjectType(type);
    const fallbackName = String(file.name || '').replace(/\.json$/i, '') || definition.defaultName;
    const name = definition.nameOf(payload, fallbackName);
    const saved = await projectRepository.save({
      tool: type,
      name,
      description: '',
      payload
    });
    stashPendingProject({
      action: 'open',
      projectType: type,
      projectId: saved?.id || '',
      name,
      text: JSON.stringify(payload)
    });
    await router.push({
      name: getProjectRoute(type),
      query: { projectId: saved?.id || '', projectType: type, shellOpen: String(Date.now()) }
    });
  } catch (error) {
    setError(error);
  }
}

async function openRecentFile(filePath) {
  const shell = getElectronShell();
  if (!shell?.readTextFile) return;
  try {
    const result = await shell.readTextFile(filePath);
    await openProjectResult(router, result);
  } catch (error) {
    setError(error);
  }
}

async function loadProjectIndex() {
  try {
    projectItems.value = (await projectRepository.list())
      .filter((item) => normalizeProjectType(item.tool));
  } catch (error) {
    projectItems.value = [];
    setError(error);
  }
}

async function loadRecentFiles() {
  const shell = getElectronShell();
  if (!shell?.getRecentProjects) {
    recentFiles.value = [];
    return;
  }
  try {
    const result = await shell.getRecentProjects();
    recentFiles.value = Array.isArray(result?.items) ? result.items : [];
  } catch {
    recentFiles.value = [];
  }
}

function syncRouteIntent() {
  if (route.query.projectError) {
    pageError.value = String(route.query.projectError);
  }
  if (route.query.create) {
    const requestedType = normalizeProjectType(route.query.projectType);
    if (requestedType) selectProjectType(requestedType);
    showCreateDialog();
  }
}

watch(() => [route.query.create, route.query.projectError, route.query.projectType], syncRouteIntent);

onMounted(() => {
  syncRouteIntent();
  loadProjectIndex();
  loadRecentFiles();
});
</script>

<style scoped>
.workbench-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
  color: var(--mc-text, #fff3f8);
  background:
    linear-gradient(180deg, rgba(255, 116, 176, 0.08), transparent 34%),
    linear-gradient(180deg, #1b0a15 0%, #12070e 60%, #080408 100%);
}

.workbench-rail {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 22px 18px;
  border-right: 1px solid rgba(255, 214, 232, 0.14);
  background: rgba(20, 8, 17, 0.96);
}

.rail-brand,
.section-head,
.workbench-header,
.dialog-head,
.dialog-actions,
.rail-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.rail-brand {
  justify-content: flex-start;
}

.rail-brand > div {
  min-width: 0;
}

.rail-brand strong,
.rail-brand small {
  display: block;
}

.rail-brand small {
  margin-top: 3px;
}

.rail-brand small,
.workbench-header p,
.section-head small,
.project-copy small,
.recent-row small,
.project-type-option small,
.rail-status {
  color: #dec0cf;
}

.rail-mark,
.project-type-mark,
.file-mark {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 214, 232, 0.28);
  color: #fff3f8;
  background: #321621;
  font-weight: 800;
}

.rail-mark {
  width: 42px;
  height: 42px;
}

.rail-nav {
  display: grid;
  gap: 6px;
}

.rail-nav a {
  min-height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-left: 3px solid transparent;
  color: #dec0cf;
}

.rail-nav a.router-link-active,
.rail-nav a:hover {
  border-left-color: #f06aa7;
  color: #fff3f8;
  background: rgba(240, 106, 167, 0.1);
}

.rail-status {
  justify-content: flex-start;
  margin-top: auto;
  font-size: 12px;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: #6b5360;
}

.status-dot.online {
  background: #f06aa7;
  box-shadow: 0 0 0 3px rgba(240, 106, 167, 0.12);
}

.workbench-main {
  width: min(1120px, 100%);
  padding: 28px 32px 48px;
  display: grid;
  align-content: start;
  gap: 26px;
}

.workbench-header {
  align-items: flex-start;
  padding-bottom: 22px;
  border-bottom: 1px solid rgba(255, 214, 232, 0.14);
}

.workbench-kicker {
  color: #f06aa7;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.workbench-header h1,
.section-head h2,
.dialog-head h2 {
  margin: 0;
  letter-spacing: 0;
}

.workbench-header h1 {
  margin-top: 4px;
  font-size: 30px;
}

.workbench-header p {
  margin: 7px 0 0;
  font-size: 13px;
}

.workbench-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button,
input,
select {
  border-radius: 0;
}

button {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(255, 214, 232, 0.26);
  color: #fff3f8;
  background: #321621;
  box-shadow: 0 2px 0 #090408;
}

button:hover {
  border-color: rgba(255, 214, 232, 0.46);
  background: #421b2f;
}

button:disabled {
  cursor: default;
  opacity: 0.58;
}

.primary-action {
  border-color: rgba(255, 214, 232, 0.5);
  color: #170812;
  background: #f06aa7;
  box-shadow: 0 2px 0 #8e2d58;
  font-weight: 700;
}

.primary-action:hover {
  color: #170812;
  background: #ff7db5;
}

.text-button,
.row-action {
  min-height: 32px;
  padding: 0 9px;
  box-shadow: none;
  background: transparent;
}

.project-section {
  display: grid;
  gap: 14px;
}

.section-head {
  align-items: flex-end;
}

.section-head h2 {
  font-size: 17px;
}

.section-head small {
  display: block;
  margin-top: 4px;
  font-size: 12px;
}

.project-list,
.recent-list {
  display: grid;
  gap: 8px;
}

.project-row {
  min-height: 68px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  border: 1px solid rgba(255, 214, 232, 0.14);
  background: rgba(36, 16, 27, 0.7);
}

.project-row:hover {
  border-color: rgba(240, 106, 167, 0.42);
  background: rgba(48, 20, 35, 0.82);
}

.project-open,
.recent-row {
  width: 100%;
  min-width: 0;
  min-height: 66px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  text-align: left;
  background: transparent;
  box-shadow: none;
}

.project-open:hover,
.recent-row:hover {
  background: rgba(240, 106, 167, 0.05);
}

.project-type-mark {
  width: 38px;
  height: 38px;
}

.project-type-mark.large {
  width: 42px;
  height: 42px;
}

.project-copy,
.recent-row > span:last-child,
.project-type-option > span:last-child {
  min-width: 0;
}

.project-copy small,
.recent-row small,
.project-type-option small {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.danger-action {
  margin-right: 10px;
  color: #ffb4c8;
}

.file-mark {
  width: 46px;
  height: 30px;
  font-size: 10px;
}

.recent-row {
  border: 1px solid rgba(255, 214, 232, 0.12);
  background: rgba(31, 14, 24, 0.54);
}

.empty-state {
  min-height: 160px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  border: 1px dashed rgba(255, 214, 232, 0.2);
  color: #dec0cf;
  background: rgba(31, 14, 24, 0.4);
}

.error-banner {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px 8px 14px;
  border: 1px solid rgba(255, 116, 140, 0.45);
  color: #ffd6df;
  background: rgba(112, 25, 48, 0.38);
}

.error-banner button {
  width: 30px;
  min-height: 28px;
  padding: 0;
  box-shadow: none;
  background: transparent;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(7, 4, 9, 0.78);
}

.create-dialog {
  width: min(620px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 20px;
  border: 3px solid #10070c;
  color: #fff3f8;
  background:
    linear-gradient(180deg, rgba(255, 218, 235, 0.07), transparent 20%),
    #24101b;
  box-shadow: 0 6px 0 #090408, 0 20px 60px rgba(0, 0, 0, 0.5);
}

.dialog-head {
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 214, 232, 0.16);
}

.dialog-head h2 {
  margin-top: 4px;
  font-size: 20px;
}

.dialog-close {
  width: 34px;
  min-height: 34px;
  padding: 0;
}

.project-type-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 18px 0;
}

.project-copy .project-path {
  color: #bd99aa;
  font-family: Consolas, "Courier New", monospace;
}

.project-config-fields {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.project-type-option {
  min-width: 0;
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 11px;
  padding: 10px;
  text-align: left;
  box-shadow: none;
  background: rgba(31, 14, 24, 0.82);
}

.project-type-option.selected {
  border-color: #f06aa7;
  background: rgba(240, 106, 167, 0.13);
  box-shadow: inset 0 0 0 1px rgba(240, 106, 167, 0.28);
}

.name-field {
  display: grid;
  gap: 7px;
  color: #dec0cf;
  font-size: 13px;
}

.name-field input,
.name-field select {
  width: 100%;
  height: 42px;
  padding: 0 11px;
  border: 1px solid rgba(255, 214, 232, 0.3);
  outline: 0;
  color: #fff3f8;
  background: #21101a;
}

.name-field input:focus,
.name-field select:focus {
  border-color: #f06aa7;
  box-shadow: 0 0 0 2px rgba(240, 106, 167, 0.16);
}

.project-location-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.project-location-control input {
  min-width: 0;
  cursor: pointer;
}

.project-location-control button {
  min-height: 42px;
}

.dialog-actions {
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 214, 232, 0.16);
}

@media (max-width: 820px) {
  .workbench-page {
    grid-template-columns: 1fr;
  }

  .workbench-rail {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-right: 0;
    border-bottom: 1px solid rgba(255, 214, 232, 0.14);
  }

  .rail-nav {
    display: flex;
  }

  .rail-nav a {
    min-height: 36px;
  }

  .rail-status {
    margin-top: 0;
  }

  .workbench-main {
    padding: 22px 18px 40px;
  }
}

@media (max-width: 580px) {
  .workbench-rail {
    grid-template-columns: 1fr auto;
  }

  .rail-nav {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .rail-status {
    justify-self: end;
  }

  .workbench-header {
    display: grid;
  }

  .workbench-actions {
    width: 100%;
  }

  .workbench-actions button {
    flex: 1 1 140px;
  }

  .project-type-list {
    grid-template-columns: 1fr;
  }

  .project-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .danger-action {
    width: calc(100% - 20px);
    margin: 0 10px 10px;
  }
}
</style>
