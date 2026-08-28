<template>
  <div class="app-main pointsbuilder-workspace">
    <ProjectToolbar :eyebrow="toolKey" :title="title" :subtitle="subtitle">
      <button v-if="backLabel" class="btn secondary" type="button" @click="handleBack">{{ backLabel }}</button>
      <button class="btn secondary" type="button" @click="resetDraft">新建</button>
      <button class="btn secondary" type="button" :disabled="!canUndo" @click="undo">撤销</button>
      <button class="btn secondary" type="button" :disabled="!canRedo" @click="redo">重做</button>
      <button class="btn secondary" type="button" @click="openImportDialog">导入 JSON</button>
      <button class="btn secondary" type="button" @click="exportProjectJson">导出 JSON</button>
      <button class="btn secondary" type="button" @click="openSettings">设置</button>
      <button class="btn secondary" type="button" @click="toggleHotkeysPanel">快捷键</button>
      <button class="btn primary" type="button" @click="persistProject">{{ saveButtonLabel }}</button>
      <button class="btn secondary" type="button" @click="downloadExport">导出 Kotlin</button>
      <button class="btn secondary" type="button" @click="resetPreviewCamera">重置镜头</button>
      <button class="btn secondary" type="button" @click="alignPreviewCamera">对齐画面</button>
      <button class="btn secondary" type="button" @click="togglePreviewFullscreen">预览全屏</button>
    </ProjectToolbar>

    <input ref="importFileRef" type="file" accept="application/json" hidden @change="handleImportFileChange" />

    <div v-if="toastMessage" class="status-toast">{{ toastMessage }}</div>

    <div class="page-grid pointsbuilder-grid">
      <div class="list-column">
        <SectionCard title="项目设置" eyebrow="Project">
          <div class="form-grid">
            <label class="list-column">
              <span class="muted">项目名称</span>
              <input v-model="project.name" class="input" type="text" />
            </label>
            <label class="list-column">
              <span class="muted">描述</span>
              <textarea v-model="project.description" class="textarea"></textarea>
            </label>
            <label class="list-column">
              <span class="muted">结束模式</span>
              <select v-model="project.kotlinEndMode" class="select">
                <option value="builder">Builder</option>
                <option value="list">List</option>
                <option value="clone">Clone</option>
              </select>
            </label>
            <label class="list-column">
              <span class="muted">当前选中节点</span>
              <div class="project-item">{{ selectedNodeLabel }}</div>
            </label>
          </div>
        </SectionCard>

        <PointsNodeEditor
          title="Builder 节点"
          :nodes="rootNodes"
          :selected-node-id="selectedNodeId"
          @add-root="addRootNode"
          @add-child="addChildNode"
          @remove="removeNode"
          @select="selectNodeById"
          @update-param="updateNodeParam"
          @add-term="addFourierTerm"
          @remove-term="removeFourierTerm"
          @update-term="updateFourierTerm"
        />
      </div>

      <div class="list-column">
        <PreviewCanvas
          ref="previewRef"
          :title="previewTitle"
          eyebrow="Preview"
          :hint="previewHint"
          :points="previewPoints"
          :show-grid="settings.showGrid"
          :show-axes="settings.showAxes"
          :point-size="settings.pointSize"
        />
        <SectionCard title="预览设置" eyebrow="Preview HUD">
          <div class="badge-row">
            <span class="badge">点数：{{ previewPoints.length }}</span>
            <span class="badge">仓库：{{ repositoryModeText }}</span>
            <span class="badge">快键数：{{ hotkeyCount }}</span>
          </div>
        </SectionCard>
        <CodePanel v-if="showKotlin" eyebrow="Kotlin" title="PointsBuilder 输出" :code="kotlinCode" />
        <ServerProjectList v-if="showRepositoryList" title="项目仓库" :items="serverProjects" @load="loadServerProject" @remove="deleteServerProject" />
      </div>
    </div>

    <div v-if="showSettingsPanel" class="overlay-backdrop" @click.self="closeSettings">
      <section class="panel overlay-panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Settings</div>
            <h3>预览与编辑设置</h3>
          </div>
          <button class="btn secondary" type="button" @click="closeSettings">关闭</button>
        </div>
        <div class="kv-grid">
          <label class="list-column">
            <span class="muted">参数步长</span>
            <input v-model.number="settings.paramStep" class="input" type="number" min="0.001" step="0.01" />
          </label>
          <label class="list-column">
            <span class="muted">点大小</span>
            <input v-model.number="settings.pointSize" class="input" type="number" min="0.01" step="0.01" />
          </label>
          <label class="list-column">
            <span class="muted">显示网格</span>
            <input v-model="settings.showGrid" type="checkbox" />
          </label>
          <label class="list-column">
            <span class="muted">显示坐标轴</span>
            <input v-model="settings.showAxes" type="checkbox" />
          </label>
        </div>
      </section>
    </div>

    <div v-if="showHotkeysPanel" class="overlay-backdrop" @click.self="toggleHotkeysPanel(false)">
      <section class="panel overlay-panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Hotkeys</div>
            <h3>快捷键设置</h3>
          </div>
          <button class="btn secondary" type="button" @click="toggleHotkeysPanel(false)">关闭</button>
        </div>
        <div class="project-list">
          <article v-for="action in hotkeyActionDefs" :key="action.id" class="project-item">
            <div class="panel-head">
              <div>
                <strong>{{ action.title }}</strong>
                <p class="muted">{{ action.desc }}</p>
              </div>
              <span class="status-pill status-pill--info">{{ hotkeyToHuman(hotkeys.actions[action.id]) }}</span>
            </div>
            <div class="inline-actions">
              <button class="btn secondary" type="button" @click="startHotkeyCapture(action.id)">设置</button>
              <button class="btn secondary" type="button" @click="clearHotkey(action.id)">清空</button>
            </div>
          </article>
        </div>
        <div class="project-item muted">{{ captureHint }}</div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLocalDraft } from '../composables/useLocalDraft.js';
import {
  createPointsBuilderProject,
  normalizePointsBuilderProject,
  createNodeByKind,
  createFourierTerm,
  findNodeContext,
  findNodeById,
  removeNodeById,
  getProjectNodes
} from '../modules/pointsbuilder/defaults.js';
import { FOURIER_TERM_FIELDS, getNodeField } from '../modules/pointsbuilder/kinds.js';
import { generatePointsBuilderKotlin } from '../modules/pointsbuilder/codegen.js';
import { evaluatePointsProject } from '../modules/pointsbuilder/evaluator.js';
import {
  createPointsBuilderEditorState,
  disposeEditorState,
  recordProjectSnapshot,
  redoProject,
  resetProjectHistory,
  selectNode,
  syncEditorSelection,
  undoProject
} from '../modules/pointsbuilder/state.js';
import { exportJsonFile, parseJsonFile, saveKotlinEndMode, saveProjectName } from '../modules/pointsbuilder/io.js';
import {
  HOTKEY_ACTION_DEFS,
  eventToHotkey,
  hotkeyMatchEvent,
  hotkeyToHuman,
  loadHotkeys,
  saveHotkeys,
  shouldIgnoreHotkeys
} from '../modules/pointsbuilder/hotkeys.js';
import { fetchTemplates } from '../services/api/catalog.js';
import { exportTextArtifact } from '../services/export/exporter.js';
import { getProjectRepository } from '../services/repositories/project-repository.js';
import { downloadTextFile } from '../utils/download.js';
import ProjectToolbar from './ProjectToolbar.vue';
import SectionCard from './SectionCard.vue';
import PointsNodeEditor from './PointsNodeEditor.vue';
import PreviewCanvas from './PreviewCanvas.vue';
import CodePanel from './CodePanel.vue';
import ServerProjectList from './ServerProjectList.vue';

const props = defineProps({
  toolKey: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  storageKey: { type: String, required: true },
  previewTitle: { type: String, default: '点阵预览' },
  backLabel: { type: String, default: '' },
  backRoute: { type: [String, Object], default: '' },
  beforeBack: { type: Function, default: null },
  showKotlin: { type: Boolean, default: true },
  showRepositoryList: { type: Boolean, default: true },
  allowRepositorySave: { type: Boolean, default: true }
});

const router = useRouter();
const { draft, replace } = useLocalDraft(props.storageKey, () => createPointsBuilderProject(props.toolKey));
const project = draft;
const normalizedProject = normalizePointsBuilderProject(project.value, props.toolKey);
replace(normalizedProject);
const editorState = ref(createPointsBuilderEditorState(normalizedProject));
resetProjectHistory(editorState.value, normalizedProject);

const settings = ref({
  paramStep: Number(project.value.settings?.paramStep || 0.1),
  pointSize: Number(project.value.settings?.pointSize || 0.07),
  showGrid: project.value.settings?.showGrid !== false,
  showAxes: project.value.settings?.showAxes !== false
});

const previewRef = ref(null);
const importFileRef = ref(null);
const serverProjects = ref([]);
const templates = ref([]);
const toastMessage = ref('');
const showSettingsPanel = ref(false);
const showHotkeysPanel = ref(false);
const captureActionId = ref('');
const captureHint = ref('点击“设置”后按下新按键；Esc 取消；Backspace 清空。');
const hotkeys = ref(loadHotkeys());
const hotkeyActionDefs = HOTKEY_ACTION_DEFS;
const projectRepository = getProjectRepository();

let toastTimer = null;

const rootNodes = computed(() => getProjectNodes(project.value));
const selectedNodeId = computed(() => editorState.value.selectedNodeId);
const previewPoints = computed(() => evaluatePointsProject(project.value));
const kotlinCode = computed(() => generatePointsBuilderKotlin(project.value));
const canUndo = computed(() => editorState.value.history.undoStack.length > 0);
const canRedo = computed(() => editorState.value.history.redoStack.length > 0);
const repositoryModeText = computed(() => projectRepository.preferredMode === 'local' ? '本地仓库' : '服务端优先');
const selectedNodeLabel = computed(() => {
  const node = findNodeById(rootNodes.value, selectedNodeId.value);
  return node?.kind || '无';
});
const previewHint = computed(() => `Three.js 预览 · 网格 ${settings.value.showGrid ? '开' : '关'} · 坐标轴 ${settings.value.showAxes ? '开' : '关'}`);
const hotkeyCount = computed(() => Object.values(hotkeys.value.actions || {}).filter(Boolean).length);
const saveButtonLabel = computed(() => props.allowRepositorySave ? '保存到仓库' : '保存到发射器');
function showToast(message) {
  toastMessage.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}

function syncSelection() {
  const next = syncEditorSelection(editorState.value, project.value);
  project.value.state.selection.focusedNodeId = next;
}

function coerceValue(field, rawValue) {
  if (field?.type === 'checkbox') return Boolean(rawValue);
  if (field?.type === 'number') {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return '';
    const next = Number(rawValue);
    return Number.isFinite(next) ? next : rawValue;
  }
  return rawValue;
}

function applyProject(nextProject, options = {}) {
  const normalized = normalizePointsBuilderProject(nextProject, props.toolKey);
  replace(normalized);
  settings.value = {
    paramStep: Number(normalized.settings?.paramStep || 0.1),
    pointSize: Number(normalized.settings?.pointSize || 0.07),
    showGrid: normalized.settings?.showGrid !== false,
    showAxes: normalized.settings?.showAxes !== false
  };
  syncEditorSelection(editorState.value, normalized);
  project.value.state.selection.focusedNodeId = editorState.value.selectedNodeId;
  if (options.resetHistory !== false) {
    resetProjectHistory(editorState.value, normalized);
  }
}

function selectNodeById(nodeId) {
  selectNode(editorState.value, project.value, nodeId);
  project.value.state.selection.focusedNodeId = editorState.value.selectedNodeId;
}

function addRootNode(kind) {
  const node = createNodeByKind(kind);
  rootNodes.value.push(node);
  selectNodeById(node.id);
}

function addChildNode({ parentId, kind }) {
  const context = findNodeContext(rootNodes.value, parentId);
  if (!context?.node || !Array.isArray(context.node.children)) return;
  const child = createNodeByKind(kind);
  context.node.children.push(child);
  selectNodeById(child.id);
}

function removeNode(nodeId) {
  removeNodeById(rootNodes.value, nodeId);
  syncSelection();
}

function updateNodeParam({ id, key, value }) {
  const node = findNodeById(rootNodes.value, id);
  if (!node) return;
  const field = getNodeField(node.kind, key);
  node.params[key] = coerceValue(field, value);
}

function addFourierTerm(nodeId) {
  const node = findNodeById(rootNodes.value, nodeId);
  if (!node || !Array.isArray(node.terms)) return;
  node.terms.push(createFourierTerm());
}

function removeFourierTerm({ nodeId, termId }) {
  const node = findNodeById(rootNodes.value, nodeId);
  if (!node || !Array.isArray(node.terms)) return;
  node.terms = node.terms.filter((term) => term.id !== termId);
}

function updateFourierTerm({ nodeId, termId, key, value }) {
  const node = findNodeById(rootNodes.value, nodeId);
  if (!node || !Array.isArray(node.terms)) return;
  const term = node.terms.find((item) => item.id === termId);
  if (!term) return;
  const field = FOURIER_TERM_FIELDS.find((item) => item.key === key);
  term[key] = coerceValue(field, value);
}

async function handleBack() {
  if (typeof props.beforeBack === 'function') {
    await props.beforeBack(project.value);
  }
  if (props.backRoute) {
    await router.push(props.backRoute);
  }
}

function resetDraft() {
  applyProject(createPointsBuilderProject(props.toolKey));
  showToast('已新建项目');
}

function undo() {
  const snapshot = undoProject(editorState.value);
  if (!snapshot) return;
  applyProject(snapshot, { resetHistory: false });
}

function redo() {
  const snapshot = redoProject(editorState.value);
  if (!snapshot) return;
  applyProject(snapshot, { resetHistory: false });
}

async function persistProject() {
  if (!props.allowRepositorySave) {
    if (typeof props.beforeBack === 'function') {
      await props.beforeBack(project.value);
    }
    showToast('已保存到发射器');
    return;
  }
  const saved = await projectRepository.save({
    id: project.value.id,
    tool: props.toolKey,
    name: project.value.name,
    description: project.value.description,
    payload: project.value
  });
  project.value.id = saved.id;
  await refreshProjects();
  showToast('项目已保存');
}

async function refreshProjects() {
  serverProjects.value = await projectRepository.list({ tool: props.toolKey });
}

async function loadServerProject(item) {
  const loaded = await projectRepository.get(item.tool, item.id);
  applyProject({ ...(loaded?.payload || {}), id: loaded?.id || loaded?.payload?.id || '' });
  showToast(`已加载项目：${item.name}`);
}

async function deleteServerProject(item) {
  await projectRepository.remove(item.tool, item.id);
  await refreshProjects();
  showToast(`已删除项目：${item.name}`);
}

function applyFirstTemplate() {
  const template = templates.value[0];
  if (!template) return;
  applyProject(template.payload || template);
  showToast('已应用模板');
}

async function downloadExport() {
  const exported = await exportTextArtifact({
    tool: props.toolKey,
    name: project.value.name,
    content: kotlinCode.value,
    extension: '.kt'
  });
  downloadTextFile(exported.filename, exported.content);
  showToast('Kotlin 已导出');
}

function exportProjectJson() {
  const fileBase = project.value.name || props.toolKey || 'pointsbuilder';
  exportJsonFile(`${fileBase}.json`, project.value);
  showToast('JSON 已导出');
}

function openImportDialog() {
  importFileRef.value?.click();
}

async function handleImportFileChange(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  try {
    const payload = await parseJsonFile(file);
    applyProject(payload);
    showToast('JSON 导入成功');
  } catch {
    showToast('JSON 导入失败');
  } finally {
    if (event.target) event.target.value = '';
  }
}

function openSettings() {
  showSettingsPanel.value = true;
}

function closeSettings() {
  showSettingsPanel.value = false;
}

function toggleHotkeysPanel(force) {
  showHotkeysPanel.value = typeof force === 'boolean' ? force : !showHotkeysPanel.value;
  captureActionId.value = '';
  captureHint.value = '点击“设置”后按下新按键；Esc 取消；Backspace 清空。';
}

function startHotkeyCapture(actionId) {
  captureActionId.value = actionId;
  const title = hotkeyActionDefs.find((item) => item.id === actionId)?.title || actionId;
  captureHint.value = `正在设置：${title}。按下新按键；Esc 取消；Backspace 清空。`;
}

function clearHotkey(actionId) {
  hotkeys.value.actions[actionId] = '';
  saveHotkeys(hotkeys.value);
  captureHint.value = '已清空快捷键。';
}

function resetPreviewCamera() {
  previewRef.value?.resetCamera();
}

function alignPreviewCamera() {
  previewRef.value?.alignCameraToPoints();
}

async function togglePreviewFullscreen() {
  await previewRef.value?.toggleFullscreen();
}

function handleWorkspaceKeydown(event) {
  if (captureActionId.value) {
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape') {
      captureActionId.value = '';
      captureHint.value = '已取消设置。';
      return;
    }
    if (event.code === 'Backspace' || event.code === 'Delete') {
      clearHotkey(captureActionId.value);
      captureActionId.value = '';
      return;
    }
    const nextHotkey = eventToHotkey(event);
    if (!nextHotkey || nextHotkey === 'Mod' || nextHotkey === 'Shift' || nextHotkey === 'Alt') return;
    hotkeys.value.actions[captureActionId.value] = nextHotkey;
    saveHotkeys(hotkeys.value);
    captureHint.value = `已保存：${hotkeyToHuman(nextHotkey)}`;
    captureActionId.value = '';
    return;
  }

  if (shouldIgnoreHotkeys(event.target)) return;

  const actions = hotkeys.value.actions || {};
  const matches = (actionId) => hotkeyMatchEvent(event, actions[actionId]);

  if (matches('undo')) {
    event.preventDefault();
    undo();
  } else if (matches('redo')) {
    event.preventDefault();
    redo();
  } else if (matches('openImport')) {
    event.preventDefault();
    openImportDialog();
  } else if (matches('exportJson')) {
    event.preventDefault();
    exportProjectJson();
  } else if (matches('exportKotlin')) {
    event.preventDefault();
    downloadExport();
  } else if (matches('newProject')) {
    event.preventDefault();
    resetDraft();
  } else if (matches('toggleFullscreen')) {
    event.preventDefault();
    togglePreviewFullscreen();
  } else if (matches('resetCamera')) {
    event.preventDefault();
    resetPreviewCamera();
  } else if (matches('toggleSettings')) {
    event.preventDefault();
    showSettingsPanel.value = !showSettingsPanel.value;
  } else if (matches('toggleHotkeys')) {
    event.preventDefault();
    toggleHotkeysPanel();
  } else if (matches('saveProject')) {
    event.preventDefault();
    persistProject();
  }
}

watch(project, (value) => {
  recordProjectSnapshot(editorState.value, value);
  syncSelection();
  saveProjectName(value.name || '');
  saveKotlinEndMode(value.kotlinEndMode || 'builder');
}, { deep: true });

watch(settings, (value) => {
  project.value.settings.paramStep = Number(value.paramStep || 0.1);
  project.value.settings.pointSize = Number(value.pointSize || 0.07);
  project.value.settings.showGrid = Boolean(value.showGrid);
  project.value.settings.showAxes = Boolean(value.showAxes);
}, { deep: true });

onMounted(async () => {
  window.addEventListener('keydown', handleWorkspaceKeydown);
  try {
    const response = await fetchTemplates(props.toolKey);
    templates.value = response.items || [];
  } catch {
    templates.value = [];
  }

  if (props.allowRepositorySave) {
    try {
      await refreshProjects();
    } catch {
      serverProjects.value = [];
    }
  }
});

onBeforeUnmount(() => {
  clearTimeout(toastTimer);
  window.removeEventListener('keydown', handleWorkspaceKeydown);
  disposeEditorState(editorState.value);
});
</script>

<style scoped>
.pointsbuilder-workspace {
  position: relative;
}

.pointsbuilder-grid {
  align-items: start;
}

.preview-host {
  min-height: 320px;
}

.status-toast {
  position: sticky;
  top: 12px;
  z-index: 12;
  margin-bottom: 12px;
  padding: 12px 16px;
  border-radius: 14px;
  background: rgba(34, 197, 94, 0.16);
  border: 1px solid rgba(34, 197, 94, 0.28);
  color: #bbf7d0;
}

.overlay-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(2, 8, 23, 0.64);
  display: grid;
  place-items: center;
  padding: 24px;
}

.overlay-panel {
  width: min(920px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
}
</style>
