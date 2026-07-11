<template>
  <section class="panel right preview-workspace">
    <div class="panel-title preview-title-row">
      <span>预览</span>
      <div class="preview-actions">
        <button class="btn small" @click="$emit('toggle-preview')">{{ playing ? '暂停' : '继续' }}</button>
        <button class="btn small" @click="$emit('replay-preview')">重播</button>
        <button class="btn small" @click="$emit('compile-expressions')">编译表达式</button>
        <button class="btn small" @click="$emit('jump-preview-end')">跳到消散前</button>
        <button class="btn small" @click="resetCamera">重置镜头</button>
        <button class="btn small" @click="toggleFullscreen">全屏</button>
      </div>
    </div>
    <div class="viewer-hud">
      <div class="hud-left">
        <div class="badge">点数: {{ previewState.pointCount }}</div>
        <div class="badge hidden">吸附: 无</div>
        <div class="badge">选中卡片: {{ currentCardName || '无' }}</div>
        <div class="badge">FPS: {{ fpsText }}</div>
      </div>
      <div class="hud-right">
        <div class="badge">中键旋转 / 右键平移 / 滚轮缩放</div>
        <div class="badge">左键框选</div>
      </div>
    </div>
    <div class="viewer-wrap">
      <PreviewCanvas
        ref="previewCanvasRef"
        class="three-host"
        :bare="true"
        :points="previewState.points"
        :show-grid="showGrid"
        :show-axes="showAxes"
        :point-size="pointSize"
        @fps="$emit('fps', $event)"
      />
      <div class="select-box hidden"></div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import PreviewCanvas from './PreviewCanvas.vue';

const previewCanvasRef = ref(null);

defineProps({
  previewState: { type: Object, required: true },
  previewTick: { type: Number, default: 0 },
  previewTotal: { type: Number, default: 0 },
  currentCardName: { type: String, default: '' },
  playing: { type: Boolean, default: true },
  fpsText: { type: String, default: '--' },
  showGrid: { type: Boolean, default: true },
  showAxes: { type: Boolean, default: true },
  pointSize: { type: Number, default: 0.08 }
});

defineEmits(['toggle-preview', 'replay-preview', 'compile-expressions', 'jump-preview-end', 'fps']);

function resetCamera() {
  previewCanvasRef.value?.resetCamera?.();
}

async function toggleFullscreen() {
  await previewCanvasRef.value?.toggleFullscreen?.();
}

defineExpose({
  resetCamera,
  toggleFullscreen
});
</script>

<style scoped>
.preview-workspace {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.preview-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.preview-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.viewer-hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px 0;
  flex-wrap: wrap;
}

.hud-left,
.hud-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.viewer-wrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  margin: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--panel2) 82%, transparent);
}

.three-host,
.viewer-wrap :deep(.preview-host),
.viewer-wrap :deep(.preview-host--bare),
.viewer-wrap :deep(.preview-canvas) {
  width: 100%;
  height: 100%;
  min-height: 260px;
  border-radius: 0;
  background: transparent;
}

.viewer-wrap :deep(.preview-host),
.viewer-wrap :deep(.preview-host--bare) {
  display: block;
  min-height: 100%;
}

.select-box {
  position: absolute;
  border: 1px dashed color-mix(in srgb, var(--accent) 65%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  pointer-events: none;
}

.hidden {
  display: none !important;
}
</style>
