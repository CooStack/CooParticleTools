<template>
  <SectionCard title="动态预览" eyebrow="Preview">
    <template #actions>
      <div class="inline-actions">
        <button class="btn secondary" type="button" @click="$emit('toggle-play')">{{ playing ? '暂停' : '播放' }}</button>
        <button class="btn secondary" type="button" @click="$emit('replay')">重播</button>
        <button class="btn secondary" type="button" @click="$emit('jump-end')">跳到末尾</button>
        <button class="btn secondary" type="button" @click="resetCamera">重置镜头</button>
        <button class="btn secondary" type="button" @click="toggleFullscreen">全屏</button>
      </div>
    </template>

    <div class="badge-row">
      <span class="badge">tick {{ previewState.tick }} / {{ previewState.totalTicks }}</span>
      <span class="badge">活动卡片 {{ previewState.activeCards.length }}</span>
      <span class="badge">点数 {{ previewState.pointCount }}</span>
    </div>

    <div class="timeline-strip">
      <input :value="tick" class="timeline-slider" type="range" min="0" :max="previewState.totalTicks || 1" @input="$emit('seek', Number($event.target.value))" />
    </div>

    <PreviewCanvas
      ref="previewRef"
      title="Composition 预览"
      eyebrow="Runtime"
      :hint="hint"
      :points="previewState.points"
      :show-grid="showGrid"
      :show-axes="showAxes"
      :point-size="pointSize"
    />

    <div class="project-list">
      <article v-for="item in previewState.activeCards" :key="item.id" class="project-item">
        <div class="panel-head">
          <strong>{{ item.name }}</strong>
          <span class="status-pill status-pill--info">{{ item.bindMode }}</span>
        </div>
        <div class="badge-row">
          <span class="badge">点数 {{ item.pointCount }}</span>
          <span class="badge">{{ item.particleEffect }}</span>
        </div>
      </article>
    </div>
  </SectionCard>
</template>

<script setup>
import { computed, ref } from 'vue';
import SectionCard from './SectionCard.vue';
import PreviewCanvas from './PreviewCanvas.vue';

const props = defineProps({
  previewState: {
    type: Object,
    default: () => ({ tick: 0, totalTicks: 1, points: [], activeCards: [], pointCount: 0 })
  },
  playing: { type: Boolean, default: false },
  tick: { type: Number, default: 0 },
  showGrid: { type: Boolean, default: true },
  showAxes: { type: Boolean, default: true },
  pointSize: { type: Number, default: 0.08 }
});

defineEmits(['toggle-play', 'replay', 'jump-end', 'seek']);

const previewRef = ref(null);
const hint = computed(() => props.playing ? '动态预览运行中' : '动态预览已暂停');

function resetCamera() {
  previewRef.value?.resetCamera();
}

async function toggleFullscreen() {
  await previewRef.value?.toggleFullscreen();
}
</script>

<style scoped>
.timeline-strip {
  margin: 8px 0 12px;
}

.timeline-slider {
  width: 100%;
}
</style>
