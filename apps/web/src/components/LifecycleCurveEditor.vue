<template>
  <div class="curve-editor" :class="{ expanded }" :style="expandedStyle" @dblclick.self="toggleExpanded">
    <div class="curve-head">
      <div class="curve-drag-handle" @pointerdown="startWindowDrag">
        <div class="curve-title">{{ title }}</div>
        <div class="curve-meta">{{ valueRangeText }}</div>
      </div>
      <div class="curve-actions" @dblclick.stop>
        <select v-model="curve.mode" class="curve-select">
          <option value="linear">线性</option>
          <option value="bezier">贝塞尔</option>
        </select>
        <button class="curve-btn" type="button" @click="addFrameAt(50)">+</button>
        <button class="curve-btn" type="button" :disabled="!canDeleteSelected" @click="deleteSelected">-</button>
        <button class="curve-btn" type="button" @click="toggleExpanded">{{ expanded ? '收起' : '展开' }}</button>
      </div>
    </div>

    <div class="curve-stage" @dblclick.stop="toggleExpanded">
      <svg
        ref="svgRef"
        class="curve-svg"
        :class="canvasPointerModeClass"
        viewBox="0 0 600 180"
        preserveAspectRatio="xMidYMid meet"
        @pointerdown="handleCanvasPointerDown"
        @pointerenter="updateCanvasPointerMode"
        @pointermove="updateCanvasPointerMode"
        @pointerleave="clearCanvasPointerMode"
      >
        <defs>
          <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--curve-fill-start)" />
            <stop offset="100%" stop-color="var(--curve-fill-end)" />
          </linearGradient>
        </defs>
        <g class="curve-grid">
          <line v-for="x in gridX" :key="`x_${x}`" :x1="x" y1="0" :x2="x" y2="180" />
          <line v-for="y in gridY" :key="`y_${y}`" x1="0" :y1="y" x2="600" :y2="y" />
        </g>
        <path class="curve-fill" :d="fillPath" :fill="`url(#${fillId})`" />
        <path class="curve-path" :d="linePath" />
        <g v-if="curve.mode === 'bezier'" class="curve-handles">
          <template v-for="segment in bezierHandleLines" :key="segment.key">
            <line :x1="segment.x1" :y1="segment.y1" :x2="segment.x2" :y2="segment.y2" />
            <line :x1="segment.x3" :y1="segment.y3" :x2="segment.x4" :y2="segment.y4" />
            <circle
              class="curve-handle"
              :cx="segment.x2"
              :cy="segment.y2"
              r="5"
              @pointerdown.stop="startHandleDrag(segment.prevId, 'out', $event)"
            />
            <circle
              class="curve-handle"
              :cx="segment.x4"
              :cy="segment.y4"
              r="5"
              @pointerdown.stop="startHandleDrag(segment.nextId, 'in', $event)"
            />
          </template>
        </g>
        <g>
          <circle
            v-for="(point, index) in plottedFrames"
            :key="point.id"
            class="curve-point"
            :class="{ selected: point.id === selectedId, locked: isEndpointFrame(point.id), deletable: canDeleteFrame(point.id) }"
            :cx="point.x"
            :cy="point.y"
            r="7"
            @pointerdown.stop="startPointDrag(point.id, $event)"
            @mousedown.stop="startPointMouseDrag(point.id, $event)"
            @click.stop="selectedId = point.id"
          />
        </g>
      </svg>
    </div>

    <div class="curve-frame-grid" @dblclick.stop>
      <div
        v-for="(frame, index) in sortedFrames"
        :key="frame.id"
        class="curve-frame-row"
        :class="{ selected: frame.id === selectedId }"
        @click="selectedId = frame.id"
      >
        <span class="frame-index">{{ index + 1 }}</span>
        <label>
          <span>%</span>
          <input class="curve-input" type="number" min="0" max="100" step="1" :value="frame.time" :disabled="isEndpointFrame(frame.id)" @input="updateFrame(frame.id, 'time', $event.target.value)" />
        </label>
        <label>
          <span>值</span>
          <input class="curve-input" type="number" :min="curve.min" :max="inputValueMax" step="0.01" :value="frame.value" @input="updateFrame(frame.id, 'value', $event.target.value)" />
        </label>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { clampNumber, clampPercent, createCurveKeyframe, getSortedKeyframes } from '../modules/generator/curves.js';

const props = defineProps({
  title: { type: String, default: '曲线' },
  curve: { type: Object, required: true },
  hardMin: { type: Number, default: null },
  hardMax: { type: Number, default: null },
  valueSuffix: { type: String, default: '' }
});

const svgRef = ref(null);
const selectedId = ref('');
const dragging = ref(null);
const windowDragging = ref(null);
const windowOffset = ref({ x: 0, y: 0 });
const expanded = ref(false);
const displayMax = ref(resolveDisplayMax());
const canvasPointerMode = ref('');
const canvasHovering = ref(false);
const syncingEndpoints = ref(false);
const displayMin = computed(() => hasFinitePropNumber(props.hardMin) ? Number(props.hardMin) : Number(props.curve.min || 0));
const inputValueMax = computed(() => hasFinitePropNumber(props.hardMax) ? Number(props.hardMax) : null);
const fillId = `curve_fill_${Math.random().toString(16).slice(2)}`;
const gridX = [100, 200, 300, 400, 500];
const gridY = [45, 90, 135];

const sortedFrames = computed(() => getSortedKeyframes(props.curve));

const canDeleteSelected = computed(() => canDeleteFrame(selectedId.value));

const valueRangeText = computed(() => `${formatValue(displayMin.value)} .. ${formatValue(displayMax.value)}`);
const expandedStyle = computed(() => (expanded.value
  ? { transform: `translate(${windowOffset.value.x}px, ${windowOffset.value.y}px)` }
  : null));
const canvasPointerModeClass = computed(() => ({
  'add-mode': canvasPointerMode.value === 'add',
  'remove-mode': canvasPointerMode.value === 'remove'
}));

const plottedFrames = computed(() => sortedFrames.value.map((frame) => ({
  ...frame,
  x: frame.time * 6,
  y: valueToY(frame.value)
})));

const linePath = computed(() => {
  const points = plottedFrames.value;
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (props.curve.mode === 'bezier') {
    const parts = [`M ${points[0].x} ${points[0].y}`];
    for (let index = 1; index < points.length; index += 1) {
      const prev = sortedFrames.value[index - 1];
      const next = sortedFrames.value[index];
      const start = points[index - 1];
      const end = points[index];
      const c1 = frameHandleToPoint(prev, 'out');
      const c2 = frameHandleToPoint(next, 'in');
      parts.push(`C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`);
      if (!Number.isFinite(start.x)) return '';
    }
    return parts.join(' ');
  }
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
});

const fillPath = computed(() => {
  const points = plottedFrames.value;
  if (!points.length) return '';
  return `${linePath.value} L ${points[points.length - 1].x} 180 L ${points[0].x} 180 Z`;
});

const bezierHandleLines = computed(() => {
  if (props.curve.mode !== 'bezier') return [];
  const rows = [];
  const points = plottedFrames.value;
  for (let index = 1; index < points.length; index += 1) {
    const prev = sortedFrames.value[index - 1];
    const next = sortedFrames.value[index];
    const start = points[index - 1];
    const end = points[index];
    const c1 = frameHandleToPoint(prev, 'out');
    const c2 = frameHandleToPoint(next, 'in');
    rows.push({
      key: `${prev.id}_${next.id}`,
      prevId: prev.id,
      nextId: next.id,
      x1: start.x,
      y1: start.y,
      x2: c1.x,
      y2: c1.y,
      x3: end.x,
      y3: end.y,
      x4: c2.x,
      y4: c2.y
    });
  }
  return rows;
});

watch(sortedFrames, (frames) => {
  if (!frames.length) return;
  syncEndpointTimes(frames);
  if (!selectedId.value || !frames.some((frame) => frame.id === selectedId.value)) {
    selectedId.value = frames[0].id;
  }
}, { immediate: true });

watch(() => props.curve, () => {
  if (dragging.value) return;
  displayMax.value = resolveDisplayMax();
}, { deep: true });

function toggleExpanded() {
  expanded.value = !expanded.value;
  if (!expanded.value) windowOffset.value = { x: 0, y: 0 };
}

function startWindowDrag(event) {
  if (!expanded.value || event.button !== 0) return;
  windowDragging.value = {
    startX: event.clientX,
    startY: event.clientY,
    originX: windowOffset.value.x,
    originY: windowOffset.value.y
  };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', handleWindowDrag);
  window.addEventListener('pointerup', stopWindowDrag, { once: true });
}

function handleWindowDrag(event) {
  if (!windowDragging.value) return;
  windowOffset.value = {
    x: windowDragging.value.originX + event.clientX - windowDragging.value.startX,
    y: windowDragging.value.originY + event.clientY - windowDragging.value.startY
  };
}

function stopWindowDrag() {
  windowDragging.value = null;
  window.removeEventListener('pointermove', handleWindowDrag);
}

function resolveDisplayMax() {
  if (hasFinitePropNumber(props.hardMax)) return Number(props.hardMax);
  const maxFrame = Math.max(...getSortedKeyframes(props.curve).map((frame) => Number(frame.value || 0)), Number(props.curve.max || 1));
  return Math.max(Number(props.curve.min || 0) + 0.0001, niceMax(maxFrame));
}

function hasFinitePropNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function niceMax(value) {
  if (value <= 1) return 1;
  if (value <= 2) return 2;
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  return Math.ceil(value / 5) * 5;
}

function valueToY(value) {
  const min = displayMin.value;
  const max = displayMax.value;
  const span = Math.max(0.0001, max - min);
  return 180 - ((Number(value || 0) - min) / span) * 180;
}

function clientToSvgPoint(clientX, clientY) {
  const svg = svgRef.value;
  if (!svg) return { x: 0, y: 0 };
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const mapped = point.matrixTransform(matrix.inverse());
  return { x: mapped.x, y: mapped.y };
}

function pointToValue(clientX, clientY) {
  const point = clientToSvgPoint(clientX, clientY);
  const rawY = point.y / 180;
  return displayMax.value - rawY * (displayMax.value - displayMin.value);
}

function pointToTime(clientX, clientY) {
  const point = clientToSvgPoint(clientX, clientY);
  return clampPercent(point.x / 6);
}

function frameHandleToPoint(frame, role) {
  const handle = frame?.[role] || { x: 0, y: 0 };
  return {
    x: clampPercent(Number(frame.time || 0) + Number(handle.x || 0)) * 6,
    y: valueToY(Number(frame.value || 0) + Number(handle.y || 0))
  };
}

function handleCanvasPointerDown(event) {
  updateCanvasPointerMode(event);
  if (event.button !== 0) return;
  if (event.altKey) {
    event.preventDefault();
    deleteNearestFrame(event);
    return;
  }
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const time = editableFrameTime(pointToTime(event.clientX, event.clientY));
  const value = clampCurveValue(pointToValue(event.clientX, event.clientY), { allowExpand: true });
  const frame = createCurveKeyframe({
    time,
    value: Number(value.toFixed(3))
  });
  props.curve.keyframes.push(frame);
  props.curve.keyframes.sort((a, b) => a.time - b.time);
  selectedId.value = frame.id;
  commitDisplayRange();
}

function addFrameAt(time) {
  const value = sortedFrames.value.length
    ? sortedFrames.value[Math.floor(sortedFrames.value.length / 2)].value
    : Number(props.curve.defaultValue || 0);
  const frame = createCurveKeyframe({ time: editableFrameTime(time), value });
  props.curve.keyframes.push(frame);
  props.curve.keyframes.sort((a, b) => a.time - b.time);
  selectedId.value = frame.id;
  commitDisplayRange();
}

function deleteSelected() {
  deleteFrame(selectedId.value);
}

function deleteFrame(id) {
  if (!canDeleteFrame(id)) return;
  const index = props.curve.keyframes.findIndex((frame) => frame.id === id);
  if (index < 0) return;
  props.curve.keyframes.splice(index, 1);
  selectedId.value = sortedFrames.value[0]?.id || '';
  commitDisplayRange();
}

function startPointDrag(id, event) {
  if (dragging.value || event.button !== 0) return;
  event.preventDefault();
  selectedId.value = id;
  updateCanvasPointerMode(event);
  if (event.altKey) {
    deleteFrame(id);
    return;
  }
  if (event.ctrlKey || event.metaKey) return;
  dragging.value = { kind: 'point', id, pointerId: event.pointerId, lockedTime: endpointTimeForFrame(id) };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', stopPointDrag, { once: true });
}

function startHandleDrag(id, role, event) {
  if (dragging.value || event.button !== 0) return;
  selectedId.value = id;
  dragging.value = { kind: 'handle', id, role, pointerId: event.pointerId };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', stopPointDrag, { once: true });
}

function startPointMouseDrag(id, event) {
  if (dragging.value || event.button !== 0) return;
  event.preventDefault();
  selectedId.value = id;
  updateCanvasPointerMode(event);
  if (event.altKey) {
    deleteFrame(id);
    return;
  }
  if (event.ctrlKey || event.metaKey) return;
  dragging.value = { kind: 'point', id, pointerId: null, lockedTime: endpointTimeForFrame(id) };
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', stopMouseDrag, { once: true });
}

function handlePointerMove(event) {
  if (!dragging.value) return;
  updateDraggedFrame(event.clientX, event.clientY);
}

function handleMouseMove(event) {
  if (!dragging.value) return;
  updateDraggedFrame(event.clientX, event.clientY);
}

function updateDraggedFrame(clientX, clientY) {
  const frame = props.curve.keyframes.find((item) => item.id === dragging.value.id);
  if (!frame) return;
  if (dragging.value.kind === 'handle') {
    const point = clientToSvgPoint(clientX, clientY);
    const time = clampPercent(point.x / 6);
    const role = dragging.value.role === 'in' ? 'in' : 'out';
    const minX = role === 'in' ? -Number(frame.time || 0) : 0;
    const maxX = role === 'in' ? 0 : 100 - Number(frame.time || 0);
    frame[role] = {
      x: Number(clampNumber(time - Number(frame.time || 0), minX, maxX, 0).toFixed(3)),
      y: Number((pointToValue(clientX, clientY) - Number(frame.value || 0)).toFixed(3))
    };
    return;
  }
  frame.time = dragging.value.lockedTime ?? editableFrameTime(pointToTime(clientX, clientY));
  frame.value = Number(clampCurveValue(pointToValue(clientX, clientY), { allowExpand: true }).toFixed(3));
}

function stopPointDrag() {
  dragging.value = null;
  props.curve.keyframes.sort((a, b) => a.time - b.time);
  commitDisplayRange();
  window.removeEventListener('pointermove', handlePointerMove);
}

function stopMouseDrag() {
  dragging.value = null;
  props.curve.keyframes.sort((a, b) => a.time - b.time);
  commitDisplayRange();
  window.removeEventListener('mousemove', handleMouseMove);
}

function updateFrame(id, key, value) {
  const frame = props.curve.keyframes.find((item) => item.id === id);
  if (!frame) return;
  if (key === 'time') frame.time = endpointTimeForFrame(id) ?? editableFrameTime(value);
  if (key === 'value') frame.value = Number(clampCurveValue(Number(value), { allowExpand: true }).toFixed(3));
  props.curve.keyframes.sort((a, b) => a.time - b.time);
  commitDisplayRange();
}

function syncEndpointTimes(frames = sortedFrames.value) {
  if (syncingEndpoints.value || frames.length < 2) return;
  const first = frames[0];
  const last = frames[frames.length - 1];
  const firstChanged = Number(first.time) !== 0;
  const lastChanged = Number(last.time) !== 100;
  if (!firstChanged && !lastChanged) return;
  syncingEndpoints.value = true;
  if (firstChanged) first.time = 0;
  if (lastChanged) last.time = 100;
  props.curve.keyframes.sort((a, b) => a.time - b.time);
  syncingEndpoints.value = false;
}

function isEndpointFrame(id) {
  return endpointTimeForFrame(id) !== null;
}

function endpointTimeForFrame(id) {
  const frames = sortedFrames.value;
  if (frames.length < 2 || !id) return null;
  const index = frames.findIndex((frame) => frame.id === id);
  if (index === 0) return 0;
  if (index === frames.length - 1) return 100;
  return null;
}

function canDeleteFrame(id) {
  return Boolean(id) && sortedFrames.value.length > 2 && !isEndpointFrame(id);
}

function editableFrameTime(value) {
  return Math.round(clampNumber(value, 1, 99, 50));
}

function deleteNearestFrame(event) {
  const point = clientToSvgPoint(event.clientX, event.clientY);
  const nearest = plottedFrames.value
    .filter((frame) => canDeleteFrame(frame.id))
    .map((frame) => ({
      id: frame.id,
      distance: Math.hypot(frame.x - point.x, frame.y - point.y)
    }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (nearest && nearest.distance <= 16) deleteFrame(nearest.id);
}

function updateCanvasPointerMode(event) {
  canvasHovering.value = true;
  canvasPointerMode.value = resolveCanvasPointerMode(event);
}

function clearCanvasPointerMode() {
  canvasHovering.value = false;
  canvasPointerMode.value = '';
}

function resolveCanvasPointerMode(event) {
  if (event?.altKey) return 'remove';
  if (event?.ctrlKey || event?.metaKey) return 'add';
  return '';
}

function handleCanvasModifierChange(event) {
  if (!canvasHovering.value) return;
  canvasPointerMode.value = resolveCanvasPointerMode(event);
}

function clampCurveValue(value, options = {}) {
  const hasHardMin = hasFinitePropNumber(props.hardMin);
  const hasHardMax = hasFinitePropNumber(props.hardMax);
  const hardMin = Number(props.hardMin);
  const hardMax = Number(props.hardMax);
  const min = hasHardMin ? hardMin : displayMin.value;
  const max = hasHardMax ? hardMax : Number.POSITIVE_INFINITY;
  const next = clampNumber(value, min, max, Number(props.curve.defaultValue || 0));
  if (options.allowExpand && !hasHardMax && next > displayMax.value) {
    displayMax.value = niceMax(next);
  }
  return next;
}

function commitDisplayRange() {
  if (hasFinitePropNumber(props.hardMax)) return;
  displayMax.value = resolveDisplayMax();
}

function formatValue(value) {
  const numeric = Number(value);
  const text = Number.isFinite(numeric) ? Number(numeric.toFixed(3)).toString() : '0';
  return props.valueSuffix ? `${text}${props.valueSuffix}` : text;
}

onMounted(() => {
  window.addEventListener('keydown', handleCanvasModifierChange, true);
  window.addEventListener('keyup', handleCanvasModifierChange, true);
  window.addEventListener('blur', clearCanvasPointerMode);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('pointermove', handleWindowDrag);
  window.removeEventListener('keydown', handleCanvasModifierChange, true);
  window.removeEventListener('keyup', handleCanvasModifierChange, true);
  window.removeEventListener('blur', clearCanvasPointerMode);
});
</script>

<style scoped>
.curve-editor {
  --curve-canvas-bg: var(--bg-panel-strong);
  --curve-grid-color: rgba(148, 163, 184, 0.16);
  --curve-line-color: var(--brand-2);
  --curve-fill-start: rgba(56, 189, 248, 0.34);
  --curve-fill-end: rgba(56, 189, 248, 0.04);
  --curve-handle-color: var(--warning);
  --curve-handle-line-color: rgba(245, 158, 11, 0.6);
  --curve-point-color: #e2e8f0;
  --curve-point-stroke: #020617;
  --curve-selected-color: var(--warning);
  --curve-selected-border: rgba(245, 158, 11, 0.5);
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-soft);
  padding: 10px;
  display: grid;
  gap: 10px;
}

.curve-editor.expanded {
  position: fixed;
  inset: 44px;
  z-index: 80;
  background: var(--bg-panel-strong);
  box-shadow: 0 32px 120px rgba(0, 0, 0, 0.56);
  padding: 18px;
  grid-template-rows: auto minmax(280px, 1fr) auto;
}

.curve-head,
.curve-actions,
.curve-frame-row,
.curve-frame-row label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.curve-head {
  justify-content: space-between;
}

.curve-drag-handle {
  cursor: default;
}

.expanded .curve-drag-handle {
  cursor: move;
}

.curve-title {
  font-weight: 700;
}

.curve-meta {
  color: var(--text-soft);
  font-size: 12px;
}

.curve-select,
.curve-btn,
.curve-input {
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: inherit;
  border-radius: 8px;
  min-height: 30px;
}

.curve-select {
  padding: 0 8px;
}

.curve-btn {
  min-width: 34px;
  padding: 0 8px;
}

.curve-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.curve-stage {
  min-height: 164px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--curve-canvas-bg);
}

.expanded .curve-stage {
  min-height: 280px;
}

.curve-svg {
  display: block;
  width: 100%;
  height: 180px;
  touch-action: none;
}

.expanded .curve-svg {
  height: 100%;
  min-height: 280px;
}

.curve-grid line {
  stroke: var(--curve-grid-color);
  stroke-width: 1;
}

.curve-fill {
  pointer-events: none;
}

.curve-path {
  fill: none;
  stroke: var(--curve-line-color);
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.curve-handles line {
  stroke: var(--curve-handle-line-color);
  stroke-dasharray: 4 4;
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}

.curve-handle {
  fill: var(--curve-handle-color);
  stroke: var(--curve-point-stroke);
  stroke-width: 2;
  cursor: grab;
  vector-effect: non-scaling-stroke;
}

.curve-point {
  fill: var(--curve-point-color);
  stroke: var(--curve-point-stroke);
  stroke-width: 2;
  cursor: grab;
  vector-effect: non-scaling-stroke;
}

.curve-point.selected {
  fill: var(--curve-selected-color);
}

.curve-frame-grid {
  display: grid;
  gap: 6px;
  max-height: 170px;
  overflow: auto;
}

.curve-frame-row {
  justify-content: space-between;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 6px;
  background: var(--bg-soft);
}

.curve-frame-row.selected {
  border-color: var(--curve-selected-border);
}

.frame-index {
  width: 24px;
  color: var(--text-soft);
}

.curve-input {
  width: 86px;
  padding: 4px 6px;
}

.curve-input:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.curve-svg.add-mode {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='%230f172a' fill-opacity='0.92'/%3E%3Cpath d='M12 6v12M6 12h12' stroke='%2338bdf8' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E") 12 12, copy;
}

.curve-svg.remove-mode {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='%230f172a' fill-opacity='0.92'/%3E%3Cpath d='M6 12h12' stroke='%23f59e0b' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E") 12 12, not-allowed;
}

.curve-svg.remove-mode .curve-point.deletable {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='%230f172a' fill-opacity='0.92'/%3E%3Cpath d='M6 12h12' stroke='%23f59e0b' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E") 12 12, pointer;
}

.curve-svg.remove-mode .curve-point.locked {
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .curve-editor.expanded {
    inset: 16px;
  }

  .curve-head,
  .curve-actions,
  .curve-frame-row {
    flex-wrap: wrap;
  }
}
</style>
