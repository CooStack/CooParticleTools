<template>
  <SectionCard title="卡片列表" eyebrow="Cards">
    <template #actions>
      <button class="btn primary" type="button" @click="$emit('add')">添加卡片</button>
    </template>
    <div class="card-list">
      <article
        v-for="card in cards"
        :key="card.id"
        class="card-item"
        :class="{ active: card.id === selectedCardId }"
        @click="$emit('select', card.id)"
      >
        <div class="panel-head">
          <div>
            <strong>{{ card.name }}</strong>
            <p class="muted">{{ card.group }} · {{ card.bindMode === 'builder' ? 'Builder 绑定' : '单点绑定' }}</p>
          </div>
          <div class="inline-actions">
            <button class="btn secondary" type="button" @click.stop="$emit('clone', card.id)">复制</button>
            <button class="btn secondary" type="button" @click.stop="$emit('remove', card.id)">删除</button>
          </div>
        </div>
        <div class="badge-row">
          <span class="badge">{{ card.particleEffect }}</span>
          <span class="badge">delay {{ card.delay }}</span>
          <span class="badge">duration {{ card.duration }}</span>
        </div>
      </article>
    </div>
  </SectionCard>
</template>

<script setup>
import SectionCard from './SectionCard.vue';

defineProps({
  cards: { type: Array, default: () => [] },
  selectedCardId: { type: String, default: '' }
});

defineEmits(['add', 'select', 'remove', 'clone']);
</script>
