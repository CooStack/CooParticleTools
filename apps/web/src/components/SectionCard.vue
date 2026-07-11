<template>
  <section class="panel section-card">
    <div class="panel-head">
      <div>
        <div class="eyebrow">{{ eyebrow }}</div>
        <h3>{{ title }}</h3>
      </div>
      <slot name="actions" />
    </div>
    <slot />
  </section>
</template>

<script setup>
defineProps({
  eyebrow: { type: String, default: '模块' },
  title: { type: String, required: true }
});
</script>
