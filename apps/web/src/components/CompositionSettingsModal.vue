<template>
  <div v-if="open" class="modal-mask" @click="$emit('close')"></div>
  <div v-if="open" class="modal" role="dialog" aria-modal="true">
    <div class="modal-head">
      <div class="modal-title">设置</div>
      <button class="btn icon" @click="$emit('close')">X</button>
    </div>
    <div class="modal-body">
      <div class="settings-layout">
        <div class="settings-panel">
          <div class="settings-panel-title">数值</div>
          <div class="settings-form">
            <div class="settings-row">
              <div class="settings-label">参数步长</div>
              <input v-model.number="uiSettings.paramStep" class="input" type="number" min="0.000001" step="0.01" />
            </div>
            <div class="settings-row">
              <div class="settings-label">点大小</div>
              <input v-model.number="projectSettings.pointSize" class="input" type="number" min="0.001" step="0.01" />
            </div>
            <div class="settings-row">
              <div class="settings-label">缓存线程</div>
              <input v-model.number="projectSettings.previewCacheWorkerCount" class="input" type="number" min="0" max="16" step="1" />
            </div>
          </div>
        </div>
        <div class="settings-panel">
          <div class="settings-panel-title">显示</div>
          <div class="settings-form">
            <div class="settings-row">
              <div class="settings-label">主题</div>
              <select v-model="projectSettings.theme" class="input">
                <option value="dark-1">夜岚</option>
                <option value="dark-2">深潮</option>
                <option value="dark-3">焰砂</option>
                <option value="light-1">雾蓝</option>
                <option value="light-2">杏露</option>
                <option value="light-3">薄荷</option>
              </select>
            </div>
            <label class="chk settings-toggle"><input v-model="projectSettings.showAxes" type="checkbox" /><span>显示坐标轴</span></label>
            <label class="chk settings-toggle"><input v-model="projectSettings.showGrid" type="checkbox" /><span>显示网格</span></label>
            <label class="chk settings-toggle"><input v-model="projectSettings.realtimeCode" type="checkbox" /><span>实时生成代码</span></label>
          </div>
        </div>
        <div class="settings-panel settings-panel-wide">
          <div class="settings-panel-title">快捷键</div>
          <div class="settings-form">
            <div class="settings-row">
              <div class="settings-label">网格吸附快捷键</div>
              <label class="chk settings-toggle"><input v-model="projectSettings.snapGridKeyToggleMode" type="checkbox" /><span>切换模式（单点切换）</span></label>
            </div>
            <div class="settings-row">
              <div class="settings-label">粒子吸附快捷键</div>
              <label class="chk settings-toggle"><input v-model="projectSettings.snapParticleKeyToggleMode" type="checkbox" /><span>切换模式（单点切换）</span></label>
            </div>
            <div class="settings-actions">
              <button class="btn primary" @click="$emit('open-hotkeys')">打开快捷键设置</button>
              <button class="btn" @click="$emit('export-settings')">导出设置</button>
              <button class="btn" @click="fileInputRef?.click()">导入设置</button>
              <input ref="fileInputRef" type="file" accept="application/json" hidden @change="$emit('import-settings', $event)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const fileInputRef = ref(null);

defineProps({
  open: { type: Boolean, default: false },
  projectSettings: { type: Object, required: true },
  uiSettings: { type: Object, required: true }
});

defineEmits(['close', 'open-hotkeys', 'export-settings', 'import-settings']);
</script>
