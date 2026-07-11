<template>
  <RouterLink :to="to" class="panel tool-card">
    <div class="tool-card__head">
      <div class="panel-tag">{{ tag }}</div>
      <span v-if="status" class="status-pill" :class="statusClass">{{ status }}</span>
    </div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <div v-if="meta" class="muted">{{ meta }}</div>
    <div class="tool-card__foot">{{ foot }}</div>
  </RouterLink>
</template>

<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

const props = defineProps({
  to: { type: String, required: true },
  tag: { type: String, default: '工具' },
  title: { type: String, required: true },
  description: { type: String, required: true },
  foot: { type: String, default: '点击进入' },
  meta: { type: String, default: '' },
  status: { type: String, default: '' },
  tone: { type: String, default: 'info' }
});

const statusClass = computed(() => `status-pill--${props.tone}`);
</script>
