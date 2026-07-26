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
          <label class="generator-settings-row"><span>主题</span><select v-model="project.settings.theme" class="input"><option v-for="theme in themeOptions" :key="theme.id" :value="theme.id">{{ theme.label }}</option></select></label>
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
          <div class="generator-settings-panel-head"><h3>快捷键</h3><button class="generator-settings-reset" type="button" @click="$emit('reset-hotkeys')">恢复默认</button></div>
          <div class="generator-hotkey-grid">
            <label v-for="item in hotkeyFields" :key="item.key" class="generator-hotkey-row">
              <span>{{ item.label }}</span>
              <input class="input" type="text" readonly :value="formatHotkey(project.settings.hotkeys[item.key])" @keydown="captureHotkey(item.key, $event)" />
            </label>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { hotkeyToHuman } from '../modules/pointsbuilder/hotkeys.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  project: { type: Object, required: true },
  themeOptions: { type: Array, default: () => [] },
  hotkeyFields: { type: Array, default: () => [] }
});

const emit = defineEmits(['close', 'record-hotkey', 'reset-hotkeys', 'lifecycle-change']);
const modalRef = ref(null);
let returnFocusElement = null;

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

function captureHotkey(key, event) {
  if (event.key === 'Tab' || event.key === 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  emit('record-hotkey', key, event);
}

function formatHotkey(value) {
  return hotkeyToHuman(value);
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
  background: rgb(2 5 13 / 52%);
}

.generator-settings-modal {
  width: min(980px, 100%);
  max-height: min(830px, calc(100vh - 32px));
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 2px solid var(--border);
  border-radius: 2px;
  background: var(--bg-panel-strong, #1f0e18);
  color: inherit;
  box-shadow: 0 22px 60px rgb(0 0 0 / 48%);
}

.generator-settings-head {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.generator-settings-head h2,
.generator-settings-panel h3 {
  margin: 0;
}

.generator-settings-head h2 {
  font-size: 20px;
}

.generator-settings-close {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 0;
  color: inherit;
  background: var(--bg-soft);
  font-size: 22px;
  line-height: 1;
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
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--bg-soft);
}

.generator-settings-panel-wide {
  grid-column: 1 / -1;
}

.generator-settings-panel h3 {
  padding-bottom: 7px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}

.generator-settings-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(105px, 0.7fr) minmax(0, 1.3fr);
  gap: 10px;
  align-items: center;
  color: var(--text-soft);
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
  border: 1px solid var(--border);
  color: var(--text-soft);
  font-size: 12px;
}

.generator-settings-toggle input {
  accent-color: var(--brand);
}

.generator-settings-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.generator-settings-reset {
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: inherit;
  background: transparent;
  font-size: 11px;
}

.generator-hotkey-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.generator-hotkey-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(84px, 110px);
  gap: 8px;
  align-items: center;
  color: var(--text-soft);
  font-size: 12px;
}

@media (max-width: 900px) {
  .generator-hotkey-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 680px) {
  .generator-settings-mask { padding: 10px; }
  .generator-settings-body,
  .generator-hotkey-grid { grid-template-columns: 1fr; }
  .generator-settings-panel-wide { grid-column: auto; }
  .generator-settings-row { grid-template-columns: 1fr; gap: 5px; }
}
</style>
