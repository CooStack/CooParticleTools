<template>
  <div v-if="open" class="generator-settings-mask" @click.self="$emit('close')">
    <section ref="modalRef" class="generator-settings-modal" role="dialog" aria-modal="true" aria-labelledby="generator-settings-title" tabindex="-1">
      <header class="generator-settings-head">
        <h2 id="generator-settings-title">设置</h2>
        <button class="generator-settings-close" type="button" title="关闭" @click="$emit('close')">×</button>
      </header>

      <div class="generator-settings-body">
        <section class="generator-settings-panel">
          <h3>数值</h3>
          <label class="generator-settings-row"><span>Tick / 秒</span><input v-model.number="project.ticksPerSecond" class="input" type="number" min="1" max="200" step="1" /></label>
          <label class="generator-settings-row"><span>预览 Tick</span><input v-model.number="project.previewTicks" class="input" type="number" min="1" max="2000" step="1" /></label>
          <label class="generator-settings-row"><span>点大小</span><input v-model.number="project.settings.pointSize" class="input" type="number" min="0.01" max="0.6" step="0.01" /></label>
          <label class="generator-settings-row"><span>粒子显示倍率</span><input v-model.number="project.settings.particleRenderScale" class="input" type="number" min="0.05" max="20" step="0.05" /></label>
        </section>

        <section class="generator-settings-panel">
          <h3>显示</h3>
          <label class="generator-settings-row"><span>主题</span><select :value="activeTheme" class="input" @change="$emit('update-theme', $event.target.value)"><template v-for="group in themeGroups" :key="group.name"><optgroup v-if="group.name" :label="group.name"><option v-for="theme in group.items" :key="theme.id" :value="theme.id">{{ theme.label }}</option></optgroup><option v-for="theme in group.name ? [] : group.items" :key="theme.id" :value="theme.id">{{ theme.label }}</option></template></select></label>
          <label class="generator-settings-toggle"><input v-model="project.settings.showSkybox" type="checkbox" /><span>显示天空背景</span></label>
          <label class="generator-settings-toggle"><input v-model="project.settings.showGrid" type="checkbox" /><span>显示网格</span></label>
          <label class="generator-settings-toggle"><input v-model="project.settings.showAxes" type="checkbox" /><span>显示坐标轴</span></label>
        </section>

        <section class="generator-settings-panel">
          <h3>项目</h3>
          <label class="generator-settings-row"><span>类名</span><input v-model="project.kotlin.className" class="input" type="text" /></label>
          <label class="generator-settings-row"><span>包名</span><input v-model="project.kotlin.packageName" class="input" type="text" placeholder="cn.coostack.generated.emitters" /></label>
          <label class="generator-settings-row"><span>映射</span><select v-model="project.kotlin.mapping" class="input"><option value="mojmap">Mojang / Mojmap</option><option value="yarn">Yarn / Fabric</option></select></label>
          <label class="generator-settings-row"><span>基类</span><input v-model="project.kotlin.baseClass" class="input" type="text" /></label>
        </section>

        <section class="generator-settings-panel">
          <h3>生命周期</h3>
          <label class="generator-settings-row"><span>运行模式</span><select v-model="project.rootLifecycle.mode" class="input" @change="$emit('lifecycle-change')"><option value="once">只运行一次</option><option value="interval">持续运行</option><option value="interval_n_tick">按总 Tick 运行</option></select></label>
          <label class="generator-settings-row"><span>发射间隔 Tick</span><input v-model.number="project.rootLifecycle.intervalTick" class="input" type="number" min="1" step="1" @change="$emit('lifecycle-change')" /></label>
          <label class="generator-settings-row"><span>运行时长 Tick</span><input v-model.number="project.rootLifecycle.maxTick" class="input" type="number" min="1" step="1" @change="$emit('lifecycle-change')" /></label>
          <label class="generator-settings-row"><span>死亡行为</span><select v-model="project.deathBehavior.mode" class="input"><option value="dissipate">直接消散</option><option value="respawn">重生粒子</option></select></label>
          <label class="generator-settings-toggle"><input v-model="project.deathBehavior.enabled" type="checkbox" /><span>启用死亡行为</span></label>
        </section>

        <section class="generator-settings-panel generator-settings-panel-wide">
          <h3>快捷键</h3>
          <div class="generator-settings-actions">
            <button class="generator-settings-btn primary" type="button" @click="$emit('open-hotkeys')">打开快捷键设置</button>
            <button class="generator-settings-btn" type="button" @click="$emit('export-settings')">导出设置</button>
            <button class="generator-settings-btn" type="button" @click="pickSettingsFile">导入设置</button>
            <input ref="settingsFileRef" type="file" accept="application/json,.json" hidden @change="onSettingsFileChange" />
          </div>
          <p v-if="message" class="generator-settings-message" :class="{ error: messageIsError }" role="status">{{ message }}</p>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  project: { type: Object, required: true },
  themeOptions: { type: Array, default: () => [] },
  // The app-wide theme; shared with every other tool rather than stored per project.
  activeTheme: { type: String, default: 'dark-1' },
  message: { type: String, default: '' },
  messageIsError: { type: Boolean, default: false }
});

const emit = defineEmits([
  'close',
  'lifecycle-change',
  'open-hotkeys',
  'export-settings',
  'import-settings'
, 'update-theme']);
const modalRef = ref(null);
const settingsFileRef = ref(null);
let returnFocusElement = null;

// Preserve declaration order while collapsing consecutive same-group entries
// into one <optgroup>; entries without a group render as bare options.
const themeGroups = computed(() => {
  const groups = [];
  for (const theme of props.themeOptions) {
    const name = theme.group || '';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(theme);
    else groups.push({ name, items: [theme] });
  }
  return groups;
});

watch(() => props.open, async (open) => {
  if (open) {
    returnFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    modalRef.value?.querySelector('button, input, select')?.focus();
  } else if (returnFocusElement?.isConnected) {
    await nextTick();
    returnFocusElement.focus();
    returnFocusElement = null;
  }
});

function pickSettingsFile() {
  settingsFileRef.value?.click();
}

function onSettingsFileChange(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) emit('import-settings', file);
}
</script>

<style scoped>
.generator-settings-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: var(--scrim, rgb(2 5 13 / 58%));
  backdrop-filter: blur(3px);
}

.generator-settings-modal {
  width: min(980px, 100%);
  max-height: min(830px, calc(100vh - 32px));
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid var(--line2, rgba(255, 255, 255, 0.14));
  border-radius: var(--radius, 14px);
  background: var(--panel, #171d23);
  color: var(--text, #ecf0f5);
  box-shadow: var(--shadow, 0 12px 30px rgba(0, 0, 0, 0.35));
}

.generator-settings-head {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.08));
}

.generator-settings-head h2,
.generator-settings-panel h3 {
  margin: 0;
}

.generator-settings-head h2 {
  font-size: 16px;
}

.generator-settings-close {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius2, 10px);
  color: inherit;
  background: var(--card, #1d242b);
  font-size: 18px;
  line-height: 1;
}

.generator-settings-close:hover {
  border-color: var(--line2, rgba(255, 255, 255, 0.14));
}

.generator-settings-body {
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 10px;
  padding: 14px;
}

.generator-settings-panel {
  min-width: 0;
  display: grid;
  gap: 10px;
  align-content: start;
  padding: 10px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius2, 10px);
  background: color-mix(in srgb, var(--panel2, #12171d) 72%, transparent);
}

.generator-settings-panel-wide {
  grid-column: 1 / -1;
}

.generator-settings-panel h3 {
  color: var(--muted, rgba(152, 166, 181, 0.68));
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.generator-settings-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(105px, 0.7fr) minmax(0, 1.3fr);
  gap: 10px;
  align-items: center;
  color: var(--muted, rgba(152, 166, 181, 0.68));
  font-size: 12px;
}

.generator-settings-row > span {
  min-width: 0;
}

.generator-settings-row .input {
  min-width: 0;
  width: 100%;
}

.generator-settings-toggle {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius3, 8px);
  background: color-mix(in srgb, var(--panel2, #12171d) 55%, transparent);
  color: var(--muted, rgba(152, 166, 181, 0.68));
  font-size: 12px;
}

.generator-settings-toggle input {
  accent-color: var(--accent, #8fa7b8);
}

.generator-settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.generator-settings-btn {
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius2, 10px);
  color: var(--text, #ecf0f5);
  background: var(--card, #1d242b);
  font-size: 12px;
  transition: border-color 140ms ease, background 140ms ease;
}

.generator-settings-btn:hover {
  border-color: var(--line2, rgba(255, 255, 255, 0.14));
  background: color-mix(in srgb, var(--card, #1d242b) 88%, var(--hover-veil, rgba(255, 255, 255, 0.04)));
}

.generator-settings-btn.primary {
  border-color: color-mix(in srgb, var(--accent, #8fa7b8) 52%, transparent);
  background: var(--accent, #8fa7b8);
  color: var(--accent-ink, #171513);
  font-weight: 600;
}

.generator-settings-btn.primary:hover {
  background: color-mix(in srgb, var(--accent, #8fa7b8) 88%, white 12%);
}

.generator-settings-btn:focus-visible,
.generator-settings-close:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--accent, #8fa7b8) 58%, transparent);
  box-shadow: var(--focus-ring, 0 0 0 3px rgba(143, 167, 184, 0.22));
}

.generator-settings-message {
  margin: 0;
  color: var(--muted, rgba(152, 166, 181, 0.68));
  font-size: 12px;
}

.generator-settings-message.error {
  color: color-mix(in srgb, var(--danger, #c96f62) 78%, white 22%);
}

@media (max-width: 680px) {
  .generator-settings-mask { padding: 10px; }
  .generator-settings-body { grid-template-columns: 1fr; }
  .generator-settings-panel-wide { grid-column: auto; }
  .generator-settings-row { grid-template-columns: 1fr; gap: 5px; }
}
</style>
