<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <div class="eyebrow">Repository</div>
        <h3>{{ title }}</h3>
      </div>
      <small class="muted">{{ items.length }} 个项目</small>
    </div>
    <div class="project-list">
      <article v-for="item in items" :key="`${item.tool}-${item.id}`" class="project-item">
        <strong>{{ item.name }}</strong>
        <div class="badge-row">
          <span class="badge">{{ item.tool }}</span>
          <span v-if="item.storageMode" class="badge">{{ item.storageMode }}</span>
          <span class="badge">{{ formatDateTime(item.updatedAt) }}</span>
        </div>
        <p class="muted">{{ item.description || '无描述' }}</p>
        <div class="inline-actions">
          <button class="btn secondary" type="button" @click="$emit('load', item)">载入</button>
          <button class="btn secondary" type="button" @click="$emit('remove', item)">删除</button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { formatDateTime } from '../utils/format.js';

defineProps({
  title: { type: String, default: '项目仓库' },
  items: { type: Array, default: () => [] }
});

defineEmits(['load', 'remove']);
</script>
