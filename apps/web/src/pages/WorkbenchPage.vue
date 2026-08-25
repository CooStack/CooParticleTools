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

      <label class="rail-theme">
        <span>主题</span>
        <select v-model="appTheme" class="rail-theme-select">
          <template v-for="group in themeGroups" :key="group.name">
            <optgroup v-if="group.name" :label="group.name">
              <option v-for="theme in group.items" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
            </optgroup>
          </template>
        </select>
      </label>

      <label class="rail-theme glass-pref-row">
        <span>玻璃模糊度</span>
        <div class="glass-pref-field">
          <input
            v-model.number="glassBlur"
            type="range"
            :min="glassLimits.blur.min"
            :max="glassLimits.blur.max"
            step="1"
            aria-label="玻璃模糊度"
          />
          <span class="glass-pref-value">{{ glassBlur }}px</span>
        </div>
      </label>

      <label class="rail-theme glass-pref-row">
        <span>玻璃磨砂度</span>
        <div class="glass-pref-field">
          <input
            v-model.number="glassFrost"
            type="range"
            :min="glassLimits.frost.min"
            :max="glassLimits.frost.max"
            step="1"
            aria-label="玻璃磨砂度"
          />
          <span class="glass-pref-value">{{ glassFrost }}%</span>
        </div>
      </label>

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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import { groupThemeOptions } from '../modules/theme/options.js';
import { onAppThemeChange, readAppTheme, watchAppTheme, writeAppTheme } from '../modules/theme/app-theme.js';
import {
  GLASS_SURFACE_LIMITS,
  onGlassSurfaceChange,
  readGlassSurface,
  writeGlassSurface
} from '../modules/theme/glass-surface.js';

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
const themeGroups = groupThemeOptions();
const appTheme = ref(readAppTheme());
/*
 * `syncingTheme` stops the round trip: an external change sets the ref, which
 * would otherwise fire the watcher and write the same value straight back out.
 */
let syncingTheme = false;
watch(appTheme, (next) => {
  if (syncingTheme) return;
  writeAppTheme(next);
});

function adoptTheme(next) {
  if (next === appTheme.value) return;
  syncingTheme = true;
  appTheme.value = next;
  nextTick(() => {
    syncingTheme = false;
  });
}

// A builder iframe can change the theme too; keep the picker in step with it.
const disposeThemeWatch = watchAppTheme(adoptTheme);
// And the durable theme arrives asynchronously at startup (the renderer's origin
// changes every launch, so the cache the ref was seeded from may be empty).
const disposeThemeApplied = onAppThemeChange(adoptTheme);

/*
 * The glass material's blur / frost. Same shape as the theme above, including
 * the round-trip guard — a builder iframe's own sliders reach us through the
 * storage event main.js listens on, which then notifies through
 * onGlassSurfaceChange.
 */
const glassLimits = GLASS_SURFACE_LIMITS;
const initialGlassSurface = readGlassSurface();
const glassBlur = ref(initialGlassSurface.blur);
const glassFrost = ref(initialGlassSurface.frost);

let syncingGlass = false;
watch([glassBlur, glassFrost], ([blur, frost]) => {
  if (syncingGlass) return;
  writeGlassSurface({ blur, frost });
});

const disposeGlassApplied = onGlassSurfaceChange((value) => {
  if (value.blur === glassBlur.value && value.frost === glassFrost.value) return;
  syncingGlass = true;
  glassBlur.value = value.blur;
  glassFrost.value = value.frost;
  nextTick(() => {
    syncingGlass = false;
  });
});

onBeforeUnmount(() => {
  disposeThemeWatch();
  disposeThemeApplied();
  disposeGlassApplied();
});

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
  min-height: var(--app-vh);
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
  color: var(--text);
  background:
    radial-gradient(1100px 760px at 6% -6%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 56%),
    var(--bg);
}

.workbench-rail {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 22px 18px;
  border-right: 1px solid var(--line);
  background: var(--panel);
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
  color: var(--muted);
}

.rail-mark,
.project-type-mark,
.file-mark {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid var(--line);
  border-radius: var(--radius3);
  color: var(--text);
  background: var(--card2);
  font-family: var(--font-mono);
  font-weight: 700;
}

.rail-mark {
  width: 42px;
  height: 42px;
  border-color: color-mix(in srgb, var(--accent) 34%, transparent);
  color: color-mix(in srgb, var(--accent) 82%, white 18%);
  background: color-mix(in srgb, var(--accent) 12%, var(--card2));
}

.rail-nav {
  display: grid;
  gap: 4px;
}

.rail-nav a {
  min-height: 36px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-radius: var(--radius2);
  color: var(--muted);
  transition: background var(--speed) ease, color var(--speed) ease;
}

.rail-nav a.router-link-active,
.rail-nav a:hover {
  color: var(--text);
  background: var(--hover-veil);
}

.rail-nav a.router-link-active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  box-shadow: inset 2px 0 0 var(--accent);
}

.rail-status {
  justify-content: flex-start;
  margin-top: auto;
  font-size: 12px;
}

.rail-theme {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
}

.rail-theme-select {
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius2);
  color: var(--text);
  background: var(--input-bg);
  outline: 0;
}

.rail-theme-select:focus {
  border-color: color-mix(in srgb, var(--accent) 58%, transparent);
  box-shadow: var(--focus-ring);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted2);
}

.status-dot.online {
  background: var(--ok);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 18%, transparent);
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
  border-bottom: 1px solid var(--line);
}

.workbench-kicker {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
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
  border-radius: var(--radius2);
}

button {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--line);
  color: var(--text);
  background: var(--card);
  transition: background var(--speed) ease, border-color var(--speed) ease, color var(--speed) ease;
}

button:hover {
  border-color: var(--line2);
  background: color-mix(in srgb, var(--card) 88%, var(--hover-veil));
}

button:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 58%, transparent);
  box-shadow: var(--focus-ring);
}

button:disabled {
  cursor: default;
  opacity: 0.55;
}

.primary-action {
  border-color: color-mix(in srgb, var(--accent) 52%, transparent);
  color: var(--accent-ink, #171513);
  background: var(--accent);
  font-weight: 600;
}

.primary-action:hover {
  color: var(--accent-ink, #171513);
  background: color-mix(in srgb, var(--accent) 88%, white 12%);
}

.text-button,
.row-action {
  min-height: 30px;
  padding: 0 9px;
  border-color: transparent;
  color: var(--muted);
  background: transparent;
}

.text-button:hover,
.row-action:hover {
  border-color: var(--line);
  color: var(--text);
  background: var(--hover-veil);
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
  min-height: 66px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: var(--radius2);
  background: var(--card);
  box-shadow: var(--elev-1);
  transition: background var(--speed) ease, border-color var(--speed) ease, box-shadow var(--speed) ease;
}

.project-row:hover {
  border-color: var(--line2);
  background: color-mix(in srgb, var(--card) 90%, var(--hover-veil));
}

.project-row:focus-within {
  border-color: color-mix(in srgb, var(--accent) 58%, transparent);
  box-shadow: inset 2px 0 0 var(--accent), var(--elev-1);
}

.project-open,
.recent-row {
  width: 100%;
  min-width: 0;
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--radius2);
  text-align: left;
  background: transparent;
}

.project-open:hover,
.recent-row:hover {
  background: var(--hover-veil);
}

.project-type-mark {
  width: 36px;
  height: 36px;
  font-size: 13px;
}

.project-type-mark.large {
  width: 40px;
  height: 40px;
  font-size: 14px;
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
  color: color-mix(in srgb, var(--danger) 78%, white 22%);
}

.danger-action:hover {
  border-color: color-mix(in srgb, var(--danger) 46%, transparent);
  color: color-mix(in srgb, var(--danger) 86%, white 14%);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.file-mark {
  width: 44px;
  height: 28px;
  font-size: 10px;
}

.recent-row {
  border: 1px solid var(--line);
  background: var(--panel2);
  transition: background var(--speed) ease, border-color var(--speed) ease;
}

.recent-row:hover {
  border-color: var(--line2);
  background: color-mix(in srgb, var(--panel2) 88%, var(--hover-veil));
}

.empty-state {
  min-height: 160px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  border: 1px dashed var(--line2);
  border-radius: var(--radius2);
  color: var(--muted);
  background: color-mix(in srgb, var(--panel2) 60%, transparent);
}

.error-banner {
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px 8px 14px;
  border: 1px solid color-mix(in srgb, var(--danger) 42%, transparent);
  border-radius: var(--radius2);
  color: color-mix(in srgb, var(--danger) 74%, white 26%);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.error-banner button {
  width: 28px;
  min-height: 26px;
  padding: 0;
  border-color: transparent;
  color: inherit;
  background: transparent;
}

.error-banner button:hover {
  border-color: color-mix(in srgb, var(--danger) 42%, transparent);
  background: color-mix(in srgb, var(--danger) 16%, transparent);
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--scrim, rgba(8, 10, 13, 0.66));
  backdrop-filter: blur(3px);
}

.create-dialog {
  width: min(620px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 20px;
  border: 1px solid var(--line2);
  border-radius: var(--radius);
  color: var(--text);
  background: var(--panel);
  box-shadow: var(--shadow);
}

.dialog-head {
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
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
  color: var(--muted2);
  font-family: var(--font-mono);
  font-size: 11px;
}

.project-config-fields {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.project-type-option {
  min-width: 0;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 11px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius2);
  text-align: left;
  background: var(--card);
}

.project-type-option:hover {
  border-color: var(--line2);
  background: color-mix(in srgb, var(--card) 90%, var(--hover-veil));
}

.project-type-option.selected {
  border-color: color-mix(in srgb, var(--accent) 70%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, var(--card));
  box-shadow:
    inset 2px 0 0 var(--accent),
    0 0 0 1px color-mix(in srgb, var(--accent) 26%, transparent);
}

.project-type-option.selected .project-type-mark {
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  color: color-mix(in srgb, var(--accent) 84%, white 16%);
  background: color-mix(in srgb, var(--accent) 16%, var(--card2));
}

.name-field {
  display: grid;
  gap: 7px;
  color: var(--muted);
  font-size: 13px;
}

.name-field input,
.name-field select {
  width: 100%;
  height: 38px;
  padding: 0 11px;
  border: 1px solid var(--line);
  outline: 0;
  color: var(--text);
  background: var(--input-bg);
  transition: border-color var(--speed) ease, box-shadow var(--speed) ease, background var(--speed) ease;
}

.name-field input::placeholder {
  color: var(--muted2);
}

.name-field input:focus,
.name-field select:focus {
  border-color: color-mix(in srgb, var(--accent) 58%, transparent);
  background: var(--input-bg-focus);
  box-shadow: var(--focus-ring);
}

.project-location-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.project-location-control input {
  min-width: 0;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12px;
}

.project-location-control button {
  min-height: 38px;
}

.dialog-actions {
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

/*
 * Glass variants. The tokens already arrive through <body data-theme>, so these
 * rules only add what a token cannot express: the blur and the top highlight.
 *
 * The whole selector must sit inside :global() — Vue's scoped compiler drops the
 * descendant part of `:global(a) .b`, which would apply these to <body> itself.
 */
/*
 * The page container must not paint under glass: body carries the colour field
 * that the panels refract, and an opaque --bg here would bury it (which is
 * exactly what made the glass read as flat frosted plastic).
 */
:global(body[data-theme^='glass-'] .workbench-page) {
  background: transparent;
}

/*
 * Blurred surfaces carry no pointer light in their background: a custom property
 * used in `background` invalidates paint, and re-painting an element with a
 * backdrop-filter re-runs the filter — tens of milliseconds a frame at the 48px
 * the slider allows. See the long note in glass-theme.css. The rail and dialog
 * are large and mostly chrome, so they keep static paint only; the moving light
 * lives on the rows and buttons below, which carry no filter.
 */
:global(body[data-theme^='glass-'] .workbench-rail),
:global(body[data-theme^='glass-'] .create-dialog) {
  border: 1px solid transparent;
  background:
    linear-gradient(157deg, var(--glass-sheen-1) 0%, transparent 30%, transparent 68%, var(--glass-sheen-2) 100%) padding-box,
    linear-gradient(var(--glass-fill-2), var(--glass-fill-2)) padding-box,
    linear-gradient(148deg,
      var(--glass-rim-hi) 0%,
      var(--glass-rim-lo) 24%,
      var(--glass-rim-lo) 56%,
      var(--glass-rim-mid) 78%,
      var(--glass-rim-hi) 100%) border-box;
  backdrop-filter: var(--glass-blur);
  box-shadow:
    inset 0 1px 0 0 var(--glass-inner-hi),
    inset 0 -24px 36px -30px var(--glass-inner-lo),
    var(--glass-shadow);
}

:global(body[data-theme^='glass-'] .project-row),
:global(body[data-theme^='glass-'] .recent-row),
:global(body[data-theme^='glass-'] .project-type-option) {
  border: 1px solid transparent;
  background:
    radial-gradient(300px circle at var(--cp-glass-mx) var(--cp-glass-my),
      var(--glass-reveal-face) 0%,
      var(--glass-reveal-soft) 32%,
      var(--glass-reveal-faint) 58%,
      transparent 100%) padding-box,
    linear-gradient(157deg, var(--glass-sheen-2) 0%, transparent 42%) padding-box,
    linear-gradient(var(--glass-fill), var(--glass-fill)) padding-box,
    radial-gradient(200px circle at var(--cp-glass-mx) var(--cp-glass-my),
      var(--glass-reveal-rim) 0%,
      color-mix(in srgb, var(--glass-reveal-rim) 32%, transparent) 46%,
      transparent 100%) border-box,
    linear-gradient(148deg,
      var(--glass-rim-mid) 0%,
      var(--glass-rim-lo) 28%,
      var(--glass-rim-lo) 62%,
      var(--glass-rim-mid) 100%) border-box;
  box-shadow: inset 0 1px 0 0 var(--glass-inner-hi);
}

:global(body[data-theme^='glass-'] .project-row:hover),
:global(body[data-theme^='glass-'] .recent-row:hover),
:global(body[data-theme^='glass-'] .project-type-option:hover) {
  background:
    radial-gradient(300px circle at var(--cp-glass-mx) var(--cp-glass-my),
      var(--glass-reveal-face) 0%,
      var(--glass-reveal-soft) 32%,
      var(--glass-reveal-faint) 58%,
      transparent 100%) padding-box,
    linear-gradient(157deg, var(--glass-sheen-1) 0%, transparent 46%) padding-box,
    linear-gradient(var(--glass-fill-2), var(--glass-fill-2)) padding-box,
    radial-gradient(200px circle at var(--cp-glass-mx) var(--cp-glass-my),
      var(--glass-reveal-rim) 0%,
      color-mix(in srgb, var(--glass-reveal-rim) 32%, transparent) 46%,
      transparent 100%) border-box,
    linear-gradient(148deg,
      var(--glass-rim-hi) 0%,
      var(--glass-rim-lo) 28%,
      var(--glass-rim-lo) 62%,
      var(--glass-rim-mid) 100%) border-box;
  box-shadow:
    inset 0 1px 0 0 var(--glass-inner-hi),
    var(--glass-shadow-2);
}

/*
 * Ordinary buttons only.
 *
 * This rule used to match every `button` in the page, which outranked
 * `.primary-action`'s own accent background (a bare class cannot beat
 * `body[attr] .page button`). The result was 新建项目 painted on --glass-fill-2
 * while still carrying the near-black ink meant for an accent fill: a measured
 * contrast of 1.15, i.e. invisible. The text-style buttons are excluded for the
 * same reason — they are deliberately transparent.
 *
 * No backdrop-filter either. Every blurred element is its own compositing layer
 * resampling the page behind it, which is what made the builders stutter; a
 * button sitting on an already-blurred panel gains nothing from a second blur.
 */
:global(body[data-theme^='glass-'] .workbench-page button:not(.primary-action):not(.text-button):not(.row-action):not(.dialog-close)) {
  border: 1px solid transparent;
  background:
    radial-gradient(150px circle at var(--cp-glass-mx) var(--cp-glass-my),
      var(--glass-reveal-face) 0%,
      var(--glass-reveal-soft) 32%,
      var(--glass-reveal-faint) 58%,
      transparent 100%) padding-box,
    linear-gradient(180deg, var(--glass-sheen-2) 0%, transparent 58%) padding-box,
    linear-gradient(var(--glass-fill-2), var(--glass-fill-2)) padding-box,
    radial-gradient(110px circle at var(--cp-glass-mx) var(--cp-glass-my),
      var(--glass-reveal-rim) 0%,
      color-mix(in srgb, var(--glass-reveal-rim) 32%, transparent) 46%,
      transparent 100%) border-box,
    linear-gradient(148deg,
      var(--glass-rim-mid) 0%,
      var(--glass-rim-lo) 34%,
      var(--glass-rim-lo) 66%,
      var(--glass-rim-mid) 100%) border-box;
  box-shadow: inset 0 1px 0 var(--glass-inner-hi);
}

/*
 * The primary action keeps its accent fill, with --accent-ink for the label —
 * that token is already solved per mode (dark ink on the light dark-mode accent,
 * white on the darker light-mode accent), so it does not need a mode override.
 * `button.primary-action` rather than `.primary-action` so this still wins if
 * Vue's scoped styles are injected after this stylesheet.
 */
:global(body[data-theme^='glass-'] button.primary-action) {
  border: 1px solid transparent;
  color: var(--accent-ink);
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--accent) 94%, white 6%),
      color-mix(in srgb, var(--accent) 86%, transparent)) padding-box,
    linear-gradient(148deg,
      color-mix(in srgb, white 46%, var(--accent)) 0%,
      color-mix(in srgb, var(--accent) 90%, transparent) 40%,
      color-mix(in srgb, white 24%, var(--accent)) 100%) border-box;
  font-weight: 600;
}

/*
 * The theme picker is a plain <select>, so it gets the same sunken fill and lens
 * border as every other select in the app rather than the button treatment it
 * used to borrow — which is what made it look like a different control.
 */
:global(body[data-theme^='glass-'] .rail-theme-select) {
  border: 1px solid transparent;
  color: var(--glass-text);
  background:
    linear-gradient(var(--glass-sunken), var(--glass-sunken)) padding-box,
    linear-gradient(148deg, var(--glass-rim-lo) 0%, var(--glass-rim-mid) 100%) border-box;
  box-shadow: inset 0 1px 2px rgba(2, 5, 12, 0.12);
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
    border-bottom: 1px solid var(--line);
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
