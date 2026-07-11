<template>
  <div v-if="open" class="modal-mask" @click="$emit('close')"></div>
  <div v-if="open" class="modal modal-xl" role="dialog" aria-modal="true">
    <div class="modal-head">
      <div class="modal-title">Builder 编辑器</div>
      <div class="modal-head-actions">
        <button class="btn small" @click="$emit('reload')">重载</button>
        <button class="btn small primary" @click="$emit('pull')">拉取并返回</button>
        <button class="btn icon" @click="$emit('close')">X</button>
      </div>
    </div>
    <div class="modal-body no-pad">
      <iframe :src="src" class="builder-frame" title="PointsBuilder 编辑器"></iframe>
    </div>
    <div class="modal-foot">
      <div class="hint-line">使用独立存储前缀，与 pointsbuilder 数据隔离。</div>
      <span class="flex-spacer"></span>
      <button class="btn" @click="$emit('close')">取消</button>
      <button class="btn primary" @click="$emit('pull')">拉取并返回</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  open: { type: Boolean, default: false },
  src: { type: String, default: '' }
});

defineEmits(['close', 'reload', 'pull']);
</script>
