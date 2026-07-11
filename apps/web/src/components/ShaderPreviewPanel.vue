<template>
  <div class="shader-preview-panel">
    <div class="badge-row">
      <span class="badge">Primitive {{ project.model?.primitive }}</span>
      <span class="badge">纹理 {{ project.textures?.length || 0 }}</span>
      <span class="badge">Pass {{ project.post?.nodes?.length || 0 }}</span>
      <span class="badge">Links {{ project.post?.links?.length || 0 }}</span>
    </div>
    <div class="preview-wrap">
      <PreviewCanvas
        ref="previewRef"
        title="渲染预览"
        eyebrow="Renderer"
        hint="当前使用轻量 Three.js 代理预览 ShaderBuilder 的渲染状态"
        :points="points"
        :show-grid="showGrid"
        :show-axes="showAxes"
        :point-size="pointSize"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import PreviewCanvas from './PreviewCanvas.vue';

const props = defineProps({
  project: { type: Object, required: true },
  points: { type: Array, default: () => [] },
  showGrid: { type: Boolean, default: true },
  showAxes: { type: Boolean, default: true },
  pointSize: { type: Number, default: 0.08 }
});

const previewRef = ref(null);

function resetCamera() {
  previewRef.value?.resetCamera();
}

async function toggleFullscreen() {
  await previewRef.value?.toggleFullscreen();
}

defineExpose({ resetCamera, toggleFullscreen });
</script>

<style scoped>
.shader-preview-panel,
.preview-wrap {
  display: grid;
  gap: 10px;
}

.badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.badge {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(111, 168, 255, 0.12);
  color: #b8d6ff;
  font-size: 12px;
}

.preview-wrap :deep(.preview-panel) {
  background: transparent;
  border: none;
  padding: 0;
  box-shadow: none;
}

.preview-wrap :deep(.panel-head) {
  display: none;
}

.preview-wrap :deep(.preview-host),
.preview-wrap :deep(.preview-canvas) {
  min-height: 340px;
  height: 340px;
  border-radius: 12px;
}
</style>
