<template>
  <SectionCard title="当前卡片" eyebrow="Editor">
    <div v-if="card" class="form-grid">
      <div class="kv-grid">
        <label class="list-column">
          <span class="muted">卡片名称</span>
          <input v-model="card.name" class="input" type="text" />
        </label>
        <label class="list-column">
          <span class="muted">分组</span>
          <input v-model="card.group" class="input" type="text" />
        </label>
      </div>

      <div class="kv-grid">
        <label class="list-column">
          <span class="muted">绑定模式</span>
          <select v-model="card.bindMode" class="select">
            <option value="point">Point</option>
            <option value="builder">Builder</option>
          </select>
        </label>
        <label class="list-column">
          <span class="muted">粒子效果类</span>
          <input v-model="card.particleEffect" class="input" type="text" />
        </label>
      </div>

      <div v-if="card.bindMode === 'point'" class="kv-grid">
        <label class="list-column"><span class="muted">X</span><input v-model.number="card.point.x" class="input" type="number" step="0.1" /></label>
        <label class="list-column"><span class="muted">Y</span><input v-model.number="card.point.y" class="input" type="number" step="0.1" /></label>
        <label class="list-column"><span class="muted">Z</span><input v-model.number="card.point.z" class="input" type="number" step="0.1" /></label>
      </div>

      <div v-else class="project-item">
        <div class="panel-head">
          <div>
            <strong>Builder 绑定</strong>
            <p class="muted">当前卡片绑定独立 Composition PointsBuilder 草稿。</p>
          </div>
          <div class="inline-actions">
            <button class="btn secondary" type="button" @click="$emit('pull-builder')">拉取最新草稿</button>
            <button class="btn primary" type="button" @click="$emit('open-builder')">打开独立 Builder</button>
          </div>
        </div>
        <div class="badge-row">
          <span class="badge">根节点 {{ builderNodeCount }}</span>
          <span class="badge">目标 {{ card.targetPreset }}</span>
        </div>
      </div>

      <div class="kv-grid">
        <label class="list-column"><span class="muted">延迟</span><input v-model.number="card.delay" class="input" type="number" step="1" /></label>
        <label class="list-column"><span class="muted">持续</span><input v-model.number="card.duration" class="input" type="number" step="1" min="1" /></label>
      </div>

      <div class="panel-head">
        <div>
          <strong>缩放 Helper</strong>
          <p class="muted">支持线性和贝塞尔两种模式。</p>
        </div>
        <button class="btn secondary" type="button" @click="$emit('open-bezier')">Bezier 工具</button>
      </div>
      <div class="kv-grid">
        <label class="list-column">
          <span class="muted">模式</span>
          <select v-model="card.scaleHelper.type" class="select">
            <option value="linear">linear</option>
            <option value="bezier">bezier</option>
          </select>
        </label>
        <label class="list-column"><span class="muted">持续</span><input v-model.number="card.scaleHelper.duration" class="input" type="number" step="1" min="1" /></label>
        <label class="list-column"><span class="muted">from</span><input v-model.number="card.scaleHelper.from" class="input" type="number" step="0.01" /></label>
        <label class="list-column"><span class="muted">to</span><input v-model.number="card.scaleHelper.to" class="input" type="number" step="0.01" /></label>
      </div>
      <div v-if="card.scaleHelper.type === 'bezier'" class="kv-grid">
        <label class="list-column"><span class="muted">P1</span><input :value="`${card.scaleHelper.p1.x}, ${card.scaleHelper.p1.y}`" class="input" type="text" readonly /></label>
        <label class="list-column"><span class="muted">P2</span><input :value="`${card.scaleHelper.p2.x}, ${card.scaleHelper.p2.y}`" class="input" type="text" readonly /></label>
      </div>

      <label class="list-column">
        <span class="muted">表达式脚本</span>
        <textarea v-model="card.script" class="textarea"></textarea>
      </label>
      <label class="list-column">
        <span class="muted">备注</span>
        <textarea v-model="card.notes" class="textarea"></textarea>
      </label>
    </div>
    <div v-else class="project-item muted">请先选择一张卡片。</div>
  </SectionCard>
</template>

<script setup>
import { computed } from 'vue';
import SectionCard from './SectionCard.vue';

const props = defineProps({
  card: { type: Object, default: null }
});

defineEmits(['open-builder', 'pull-builder', 'open-bezier']);

const builderNodeCount = computed(() => props.card?.builderState?.state?.root?.children?.length || 0);
</script>
