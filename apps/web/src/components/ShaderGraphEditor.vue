<template>
  <div class="shader-graph-editor">
    <div class="graph-wrap">
      <div class="graph-canvas">
        <button
          v-for="(pass, index) in nodes"
          :key="pass.id"
          class="graph-node"
          :class="{ active: pass.id === selectedId }"
          :style="nodeStyle(pass, index)"
          type="button"
          @click="$emit('select-pass', pass.id)"
        >
          <span class="graph-node-title">{{ pass.name }}</span>
          <span class="graph-node-sub">{{ pass.fragmentPath }}</span>
          <span class="graph-node-iter">×{{ pass.iterations || 1 }}</span>
          <span class="graph-node-remove" @click.stop="$emit('remove-pass', pass.id)">×</span>
        </button>
      </div>
    </div>

    <div class="link-editor">
      <label class="field">
        <span>起点</span>
        <select v-model="draft.from" class="input">
          <option value="">选择起点</option>
          <option v-for="pass in nodes" :key="pass.id" :value="pass.id">{{ pass.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>终点</span>
        <select v-model="draft.to" class="input">
          <option value="">选择终点</option>
          <option v-for="pass in nodes" :key="pass.id" :value="pass.id">{{ pass.name }}</option>
        </select>
      </label>
      <button class="btn" type="button" @click="createLink">添加连线</button>
    </div>

    <div class="graph-link-list">
      <article v-for="link in links" :key="link.id" class="graph-link-item">
        <strong>{{ resolveName(link.from) }} → {{ resolveName(link.to) }}</strong>
        <button class="btn" type="button" @click="$emit('remove-link', link.id)">删除</button>
      </article>
      <div v-if="!links.length" class="hint">当前还没有后处理连线。</div>
    </div>

    <div class="hint">
      左键选中后处理卡片；上方添加连线；自动布局会重新排列卡片位置。
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue';

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' }
});

const emit = defineEmits(['select-pass', 'remove-pass', 'add-link', 'remove-link']);
const draft = reactive({ from: '', to: '' });

function createLink() {
  if (!draft.from || !draft.to) return;
  emit('add-link', { from: draft.from, to: draft.to });
  draft.from = '';
  draft.to = '';
}

function resolveName(id) {
  return props.nodes.find((item) => item.id === id)?.name || id || '未选择';
}

function nodeStyle(pass, index) {
  const x = Number(pass.x ?? 24 + (index % 2) * 210);
  const y = Number(pass.y ?? 24 + Math.floor(index / 2) * 118);
  return {
    left: `${x}px`,
    top: `${y}px`
  };
}
</script>

<style scoped>
.shader-graph-editor {
  display: grid;
  gap: 12px;
}

.graph-wrap {
  position: relative;
  min-height: 320px;
  overflow: auto;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    rgba(7, 12, 18, 0.45);
  background-size: 24px 24px, 24px 24px, auto;
}

.graph-canvas {
  position: relative;
  min-width: 440px;
  min-height: 320px;
}

.graph-node {
  position: absolute;
  width: 180px;
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(22, 30, 42, 0.95);
  color: inherit;
  text-align: left;
}

.graph-node.active {
  border-color: rgba(111, 168, 255, 0.8);
  box-shadow: 0 0 0 2px rgba(111, 168, 255, 0.16);
}

.graph-node-title {
  font-weight: 700;
}

.graph-node-sub,
.graph-node-iter,
.hint,
.field > span {
  font-size: 12px;
  color: rgba(169, 183, 204, 0.72);
}

.graph-node-remove {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 14px;
}

.link-editor,
.graph-link-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.link-editor {
  flex-wrap: wrap;
}

.field {
  display: grid;
  gap: 6px;
  min-width: 180px;
}

.input {
  min-width: 180px;
}

.graph-link-list {
  display: grid;
  gap: 10px;
}

.graph-link-item {
  justify-content: space-between;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}
</style>
