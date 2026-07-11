<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <div class="eyebrow">Nodes</div>
        <h3>{{ title }}</h3>
      </div>
      <div class="inline-actions">
        <select class="select" v-model="nextKind">
          <option v-for="item in kindOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
        <button class="btn primary" type="button" @click="emit('add-root', nextKind)">添加根节点</button>
      </div>
    </div>

    <div v-if="!nodes.length" class="muted">当前还没有节点。</div>
    <div class="node-list">
      <PointsNodeTreeItem
        v-for="node in nodes"
        :key="node.id"
        :node="node"
        :selected-node-id="selectedNodeId"
        :number-datalist-id="numberDatalistId"
        @select="emit('select', $event)"
        @remove="emit('remove', $event)"
        @update-param="emit('update-param', $event)"
        @add-child="emit('add-child', $event)"
        @add-term="emit('add-term', $event)"
        @remove-term="emit('remove-term', $event)"
        @update-term="emit('update-term', $event)"
      />
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { POINTS_NODE_KIND_OPTIONS } from '../modules/pointsbuilder/kinds.js';
import PointsNodeTreeItem from './PointsNodeTreeItem.vue';

defineProps({
  title: { type: String, default: '节点编辑器' },
  nodes: { type: Array, default: () => [] },
  selectedNodeId: { type: String, default: '' },
  numberDatalistId: { type: String, default: '' }
});

const emit = defineEmits(['add-root', 'add-child', 'remove', 'select', 'update-param', 'add-term', 'remove-term', 'update-term']);
const nextKind = ref('add_point');
const kindOptions = POINTS_NODE_KIND_OPTIONS;
</script>
