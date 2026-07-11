<template>
  <section class="panel toolbar">
    <div>
      <div class="eyebrow">{{ eyebrow }}</div>
      <h2>{{ title }}</h2>
      <p class="muted">{{ subtitle }}</p>
    </div>
    <div class="toolbar-actions">
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  eyebrow: { type: String, default: '工作区' },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
});
</script>
