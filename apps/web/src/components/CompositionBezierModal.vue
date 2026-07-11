<template>
  <div v-if="open" class="modal-mask" @click="$emit('close')"></div>
  <div v-if="open" class="modal modal-bezier" role="dialog" aria-modal="true">
    <div class="modal-head">
      <div class="modal-title">Bezier 工具</div>
      <button class="btn icon" @click="$emit('close')">X</button>
    </div>
    <div class="modal-body no-pad">
      <iframe :src="src" class="bezier-frame" title="Bezier 工具"></iframe>
    </div>
    <div class="modal-foot">
      <div class="hint-line">点击“应用到当前缩放”将读取工具输出并写回当前 scale helper。</div>
      <span class="flex-spacer"></span>
      <button class="btn" @click="$emit('close')">取消</button>
      <button class="btn primary" @click="$emit('apply')">应用到当前缩放</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  open: { type: Boolean, default: false },
  src: { type: String, default: '' }
});

defineEmits(['close', 'apply']);
</script>
