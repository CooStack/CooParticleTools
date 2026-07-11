<template>
  <section class="panel stat-card">
    <span class="stat-card__label">{{ label }}</span>
    <strong>{{ value }}</strong>
    <small>{{ hint }}</small>
  </section>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  hint: { type: String, default: '' }
});
</script>
