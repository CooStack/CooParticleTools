<template>
  <div class="shader-texture-library">
    <div class="field-inline texture-toolbar">
      <button class="btn" type="button" @click="inputRef?.click()">上传纹理</button>
      <input ref="inputRef" type="file" accept="image/*" hidden multiple @change="onFilesChange" />
    </div>
    <div class="texture-list">
      <article v-for="item in textures" :key="item.id" class="texture-item">
        <div class="texture-head">
          <strong>{{ item.name }}</strong>
          <button class="btn" type="button" @click="$emit('remove', item.id)">删除</button>
        </div>
        <div class="texture-meta">
          <span class="badge">{{ item.type }}</span>
          <span class="badge">{{ item.previewUrl ? '已缓存预览' : '仅元数据' }}</span>
        </div>
        <img v-if="item.previewUrl" :src="item.previewUrl" :alt="item.name" class="texture-preview" />
      </article>
      <div v-if="!textures.length" class="hint">当前还没有纹理资源。</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  textures: { type: Array, default: () => [] }
});

const emit = defineEmits(['files', 'remove']);
const inputRef = ref(null);

function onFilesChange(event) {
  const files = Array.from(event.target?.files || []);
  if (files.length) emit('files', files);
  if (event.target) event.target.value = '';
}
</script>

<style scoped>
.shader-texture-library,
.texture-list {
  display: grid;
  gap: 10px;
}

.texture-toolbar,
.texture-meta,
.texture-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.texture-head {
  justify-content: space-between;
}

.texture-meta {
  flex-wrap: wrap;
}

.texture-item {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.texture-preview {
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: 12px;
}

.badge {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(111, 168, 255, 0.12);
  color: #b8d6ff;
  font-size: 12px;
}

.hint {
  font-size: 12px;
  color: rgba(169, 183, 204, 0.72);
}
</style>
