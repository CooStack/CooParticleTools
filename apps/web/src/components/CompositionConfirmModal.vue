<template>
  <div v-if="open" class="modal-mask modal-mask-confirm" @click="$emit('cancel')"></div>
  <div v-if="open" class="modal modal-confirm" role="dialog" aria-modal="true">
    <div class="modal-head">
      <div class="modal-title">{{ title }}</div>
      <button class="btn icon" @click="$emit('cancel')">X</button>
    </div>
    <div class="modal-body">
      <div class="project-block">{{ message }}</div>
    </div>
    <div class="modal-foot">
      <span class="flex-spacer"></span>
      <button class="btn" @click="$emit('cancel')">取消</button>
      <button class="btn primary" @click="$emit('confirm')">确定</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '请确认' },
  message: { type: String, default: '确认执行该操作？' }
});

defineEmits(['cancel', 'confirm']);
</script>
