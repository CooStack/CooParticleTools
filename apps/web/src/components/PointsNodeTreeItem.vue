<template>
  <article class="node-item" :class="{ active: node.id === selectedNodeId }">
    <div class="panel-head" @click="$emit('select', node.id)">
      <div class="list-column" style="gap: 0.15rem;">
        <strong>{{ definition?.title || node.kind }}</strong>
        <span class="muted">{{ definition?.description || '未命名节点' }}</span>
      </div>
      <div class="inline-actions">
        <button class="btn secondary" type="button" @click.stop="$emit('remove', node.id)">删除</button>
      </div>
    </div>

    <div class="kv-grid">
      <template v-for="field in definition?.fields || []" :key="field.key">
        <label v-if="field.type === 'checkbox'" class="list-column">
          <span class="muted">{{ field.label }}</span>
          <input
            type="checkbox"
            :checked="Boolean(node.params?.[field.key])"
            @change="$emit('update-param', { id: node.id, key: field.key, value: $event.target.checked })"
          />
        </label>

        <label v-else-if="field.type === 'select'" class="list-column">
          <span class="muted">{{ field.label }}</span>
          <select
            class="select"
            :value="node.params?.[field.key]"
            @change="$emit('update-param', { id: node.id, key: field.key, value: $event.target.value })"
          >
            <option v-for="option in field.options || []" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>

        <label v-else class="list-column">
          <span class="muted">{{ field.label }}</span>
          <input
            :type="field.type === 'number' ? 'text' : (field.type || 'text')"
            class="input"
            :inputmode="field.type === 'number' ? 'decimal' : undefined"
            :list="field.type === 'number' && numberDatalistId ? numberDatalistId : undefined"
            :step="field.step || 1"
            :min="field.min"
            :max="field.max"
            :value="node.params?.[field.key]"
            @input="$emit('update-param', { id: node.id, key: field.key, value: $event.target.value })"
          />
        </label>
      </template>
    </div>

    <div v-if="definition?.supportsTerms" class="list-column" style="margin-top: 0.9rem; gap: 0.8rem;">
      <div class="panel-head">
        <strong>傅里叶项</strong>
        <button class="btn secondary" type="button" @click.stop="$emit('add-term', node.id)">添加项</button>
      </div>
      <div v-if="!(node.terms || []).length" class="muted">当前还没有项。</div>
      <div v-for="term in node.terms || []" :key="term.id" class="node-item" style="background: rgba(255,255,255,0.02);">
        <div class="panel-head">
          <strong>Term {{ term.id.slice(-4) }}</strong>
          <button class="btn secondary" type="button" @click.stop="$emit('remove-term', { nodeId: node.id, termId: term.id })">删除</button>
        </div>
        <div class="kv-grid">
          <template v-for="field in fourierFields" :key="field.key">
            <label v-if="field.type === 'select'" class="list-column">
              <span class="muted">{{ field.label }}</span>
              <select
                class="select"
                :value="term[field.key]"
                @change="$emit('update-term', { nodeId: node.id, termId: term.id, key: field.key, value: $event.target.value })"
              >
                <option v-for="option in field.options || []" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label v-else class="list-column">
              <span class="muted">{{ field.label }}</span>
              <input
                :type="field.type === 'number' ? 'text' : (field.type || 'text')"
                class="input"
                :inputmode="field.type === 'number' ? 'decimal' : undefined"
                :list="field.type === 'number' && numberDatalistId ? numberDatalistId : undefined"
                :step="field.step || 1"
                :min="field.min"
                :value="term[field.key]"
                @input="$emit('update-term', { nodeId: node.id, termId: term.id, key: field.key, value: $event.target.value })"
              />
            </label>
          </template>
        </div>
      </div>
    </div>

    <div v-if="definition?.supportsChildren" class="list-column" style="margin-top: 0.9rem; gap: 0.8rem;">
      <div class="panel-head">
        <strong>子 Builder</strong>
        <div class="inline-actions">
          <select class="select" v-model="nextChildKind">
            <option v-for="item in kindOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
          <button class="btn secondary" type="button" @click.stop="$emit('add-child', { parentId: node.id, kind: nextChildKind })">添加子节点</button>
        </div>
      </div>
      <div v-if="!(node.children || []).length" class="muted">这个容器还没有子节点。</div>
      <PointsNodeTreeItem
        v-for="child in node.children || []"
        :key="child.id"
        :node="child"
        :selected-node-id="selectedNodeId"
        :number-datalist-id="numberDatalistId"
        @select="$emit('select', $event)"
        @remove="$emit('remove', $event)"
        @update-param="$emit('update-param', $event)"
        @add-child="$emit('add-child', $event)"
        @add-term="$emit('add-term', $event)"
        @remove-term="$emit('remove-term', $event)"
        @update-term="$emit('update-term', $event)"
      />
    </div>
  </article>
</template>

<script setup>
import { ref, computed } from 'vue';
import { FOURIER_TERM_FIELDS, POINTS_NODE_KIND_OPTIONS, getNodeKindDefinition } from '../modules/pointsbuilder/kinds.js';

defineOptions({
  name: 'PointsNodeTreeItem'
});

const props = defineProps({
  node: { type: Object, required: true },
  selectedNodeId: { type: String, default: '' },
  numberDatalistId: { type: String, default: '' }
});

defineEmits(['select', 'remove', 'update-param', 'add-child', 'add-term', 'remove-term', 'update-term']);

const nextChildKind = ref('add_point');
const kindOptions = POINTS_NODE_KIND_OPTIONS;
const definition = computed(() => getNodeKindDefinition(props.node.kind));
const fourierFields = FOURIER_TERM_FIELDS;
</script>
