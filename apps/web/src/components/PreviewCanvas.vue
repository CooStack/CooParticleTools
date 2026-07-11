<template>
  <div v-if="bare" ref="hostRef" class="preview-host preview-host--bare" :class="{ 'preview-host--skybox-off': !showSkybox }">
    <canvas v-if="isLineMode" ref="canvasRef" class="preview-canvas"></canvas>
    <canvas v-else ref="threeCanvasRef" class="preview-canvas"></canvas>
  </div>
  <section v-else class="panel preview-panel">
    <div class="panel-head">
      <div>
        <div class="eyebrow">{{ eyebrow }}</div>
        <h3>{{ title }}</h3>
      </div>
      <small class="muted">{{ hint }}</small>
    </div>
    <div ref="hostRef" class="preview-host" :class="{ 'preview-host--skybox-off': !showSkybox }">
      <canvas v-if="isLineMode" ref="canvasRef" class="preview-canvas"></canvas>
      <canvas v-else ref="threeCanvasRef" class="preview-canvas"></canvas>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createThreePointsPreview } from '../modules/preview/three-points-preview.js';

const emit = defineEmits(['fps']);

const props = defineProps({
  title: { type: String, default: '预览' },
  eyebrow: { type: String, default: 'Preview' },
  hint: { type: String, default: '二维投影视图' },
  points: { type: [Array, Object], default: () => [] },
  line: { type: Array, default: () => [] },
  showGrid: { type: Boolean, default: true },
  showAxes: { type: Boolean, default: true },
  pointSize: { type: Number, default: 0.07 },
  interpolationMs: { type: Number, default: 50 },
  showSkybox: { type: Boolean, default: true },
  bare: { type: Boolean, default: false }
});

const canvasRef = ref(null);
const threeCanvasRef = ref(null);
const hostRef = ref(null);
const threePreview = ref(null);
let resizeObserver = null;
let lastShowGrid = null;
let lastShowAxes = null;
let lastPointSize = null;
let lastInterpolationMs = null;

const isLineMode = computed(() => Array.isArray(props.line) && props.line.length > 0 && (!props.points || props.points.length === 0));

function draw2d() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const width = canvas.clientWidth || 420;
  const height = canvas.clientHeight || 280;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#07111f';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  const all = [...(props.points || []), ...(props.line || [])];
  const maxAbs = Math.max(4, ...all.flatMap((point) => [Math.abs(point.x || 0), Math.abs(point.y || 0), Math.abs(point.z || 0)]));
  const scale = Math.min(width, height) / (maxAbs * 2.6);
  const project = (point) => ({
    x: width / 2 + (point.x || 0) * scale,
    y: height / 2 - (point.z ?? point.y ?? 0) * scale
  });

  if ((props.line || []).length > 1) {
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    props.line.forEach((point, index) => {
      const projected = project(point);
      if (index === 0) ctx.moveTo(projected.x, projected.y);
      else ctx.lineTo(projected.x, projected.y);
    });
    ctx.stroke();
  }

  (props.points || []).forEach((point) => {
    const projected = project(point);
    const size = Math.max(1, Math.round(Number(point?.size || props.pointSize || 0.07) * scale * 0.7));
    ctx.fillStyle = resolvePointFill(point);
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, size, 0, Math.PI * 2);
    ctx.fill();
  });
}

function resolvePointFill(point) {
  const color = /^#[0-9a-fA-F]{6}$/.test(String(point?.color || '')) ? point.color : '#22c55e';
  const alpha = Math.max(0, Math.min(1, Number(point?.alpha ?? 1)));
  const value = Number.parseInt(color.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${Number.isFinite(alpha) ? alpha : 1})`;
}

async function ensureThreePreview() {
  if (isLineMode.value) return;
  await nextTick();
  if (threePreview.value || !threeCanvasRef.value || !hostRef.value) return;
  threePreview.value = createThreePointsPreview({
    canvas: threeCanvasRef.value,
    host: hostRef.value,
    pointSize: props.pointSize,
    onFpsChange: (fps) => emit('fps', fps)
  });
  threePreview.value.setGridVisible(props.showGrid);
  threePreview.value.setAxesVisible(props.showAxes);
  threePreview.value.setPointSize(props.pointSize);
  threePreview.value.setInterpolationDuration(props.interpolationMs);
  lastShowGrid = props.showGrid;
  lastShowAxes = props.showAxes;
  lastPointSize = props.pointSize;
  lastInterpolationMs = props.interpolationMs;
  threePreview.value.updatePoints(props.points || []);
}

function syncPreview() {
  if (isLineMode.value) {
    draw2d();
    return;
  }
  if (!threePreview.value) return;
  if (lastShowGrid !== props.showGrid) {
    threePreview.value.setGridVisible(props.showGrid);
    lastShowGrid = props.showGrid;
  }
  if (lastShowAxes !== props.showAxes) {
    threePreview.value.setAxesVisible(props.showAxes);
    lastShowAxes = props.showAxes;
  }
  if (lastPointSize !== props.pointSize) {
    threePreview.value.setPointSize(props.pointSize);
    lastPointSize = props.pointSize;
  }
  if (lastInterpolationMs !== props.interpolationMs) {
    threePreview.value.setInterpolationDuration(props.interpolationMs);
    lastInterpolationMs = props.interpolationMs;
  }
  threePreview.value.updatePoints(props.points || []);
}

function resetCamera() {
  if (isLineMode.value) {
    draw2d();
    return;
  }
  threePreview.value?.resetCamera();
}

async function toggleFullscreen() {
  if (isLineMode.value) return;
  await threePreview.value?.toggleFullscreen();
}

defineExpose({ resetCamera, toggleFullscreen });

onMounted(async () => {
  await ensureThreePreview();
  syncPreview();
  resizeObserver = new ResizeObserver(() => {
    if (isLineMode.value) draw2d();
    else threePreview.value?.resize();
  });
  if (hostRef.value) resizeObserver.observe(hostRef.value);
});

watch(isLineMode, async () => {
  await ensureThreePreview();
  syncPreview();
});
watch(() => [props.points, props.line, props.showGrid, props.showAxes, props.pointSize, props.interpolationMs], syncPreview);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  threePreview.value?.dispose();
});
</script>
