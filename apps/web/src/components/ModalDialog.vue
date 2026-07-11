<template>
  <div v-if="open" class="overlay-backdrop" @click.self="$emit('close')">
    <section class="panel overlay-panel" :class="sizeClass">
      <div class="panel-head">
        <div>
          <div class="eyebrow">{{ eyebrow }}</div>
          <h3>{{ title }}</h3>
        </div>
        <button class="btn secondary" type="button" @click="$emit('close')">关闭</button>
      </div>
      <div class="dialog-body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="dialog-footer">
        <slot name="footer" />
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  eyebrow: { type: String, default: 'Dialog' },
  size: { type: String, default: 'md' }
});

defineEmits(['close']);

const sizeClass = computed(() => `overlay-panel--${props.size}`);
</script>

<style scoped>
.overlay-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(2, 8, 23, 0.68);
  display: grid;
  place-items: center;
  padding: 24px;
}

.overlay-panel {
  width: min(920px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
}

.overlay-panel--sm {
  width: min(560px, 100%);
}

.overlay-panel--lg {
  width: min(1160px, 100%);
}

.dialog-body,
.dialog-footer {
  display: grid;
  gap: 12px;
}

.dialog-footer {
  margin-top: 16px;
}
</style>
