<template>
  <div class="cparticle-resource-editor">
    <article v-for="resource in project.forceResources" :key="resource.id" class="resource-card">
      <div class="resource-fields">
        <label class="field"><span>名称</span><input v-model="resource.name" class="input" type="text" placeholder="wind_texture" /></label>
        <label class="field">
          <span>类型</span>
          <select v-model="resource.kind" class="input" @change="changeResourceKind(resource)">
            <option value="texture">Texture（二维纹理）</option>
            <option value="fluid">FluidFlow（三维流场）</option>
          </select>
        </label>
        <label class="field resource-location-field"><span>ResourceLocation</span><input v-model="resource.location" class="input" type="text" :placeholder="resource.kind === 'fluid' ? 'examplemod:flow/wind_tunnel' : 'examplemod:textures/force/wind.png'" /></label>
        <button class="btn small danger" type="button" @click="removeForceResource(resource.id)">删除</button>
      </div>

      <div v-if="resource.kind === 'texture'" class="texture-upload">
        <input :ref="(element) => setFileInput(resource.id, element)" type="file" accept="image/*" hidden @change="uploadTexture(resource, $event)" />
        <div class="inline-actions">
          <button class="btn small" type="button" @click="openTexturePicker(resource.id)">{{ resource.dataUrl ? '更换纹理' : '上传纹理' }}</button>
          <button v-if="resource.dataUrl" class="btn small" type="button" @click="clearTexture(resource)">移除上传</button>
          <span v-if="resource.fileName" class="sub">{{ resource.fileName }} · {{ resource.imageWidth }} × {{ resource.imageHeight }}</span>
        </div>
        <img v-if="resource.dataUrl" class="texture-preview" :src="resource.dataUrl" :alt="resource.name || resource.fileName" />
        <div v-if="uploadErrors[resource.id]" class="compatibility-note compatibility-note--error">{{ uploadErrors[resource.id] }}</div>
      </div>
      <div v-else class="compatibility-note">FluidFlow 是三维速度/密度数据，不能用上传的二维 PNG 替代。</div>
    </article>
  </div>
</template>

<script setup>
import { reactive } from 'vue';
import {
  removeCParticleTexturePreview,
  uploadCParticleTexturePreview
} from '../modules/generator/cparticle-texture-preview.js';

const props = defineProps({
  project: { type: Object, required: true }
});
const emit = defineEmits(['preview-change']);
const fileInputs = new Map();
const uploadErrors = reactive({});

function setFileInput(id, element) {
  if (element) fileInputs.set(id, element);
  else fileInputs.delete(id);
}

function openTexturePicker(id) {
  fileInputs.get(id)?.click();
}

function removeForceResource(id) {
  const index = props.project.forceResources.findIndex((item) => item.id === id);
  if (index >= 0) removeCParticleTexturePreview(props.project.forceResources[index]);
  if (index >= 0) props.project.forceResources.splice(index, 1);
  props.project.forceCommands.forEach((command) => {
    if (command.force?.parameters?.resourceRef === id) command.force.parameters.resourceRef = '';
  });
  emit('preview-change');
}

function changeResourceKind(resource) {
  if (resource.kind === 'fluid') removeCParticleTexturePreview(resource);
  uploadErrors[resource.id] = '';
  emit('preview-change');
}

async function uploadTexture(resource, event) {
  const file = event.target?.files?.[0];
  if (event.target) event.target.value = '';
  if (!file) return;
  uploadErrors[resource.id] = '';
  try {
    const applied = await uploadCParticleTexturePreview(resource, file);
    if (applied) emit('preview-change');
  } catch (error) {
    uploadErrors[resource.id] = error?.message || String(error);
  }
}

function clearTexture(resource) {
  removeCParticleTexturePreview(resource);
  uploadErrors[resource.id] = '';
  emit('preview-change');
}
</script>

<style scoped>
.cparticle-resource-editor,
.resource-card,
.texture-upload {
  display: grid;
  gap: 10px;
}

.cparticle-resource-editor {
  gap: 16px;
}

.resource-card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius2, 12px);
  background: color-mix(in srgb, var(--bg-soft) 92%, var(--brand) 8%);
}

.resource-fields {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(150px, 0.45fr) minmax(0, 1.4fr) auto;
  gap: 8px;
  align-items: end;
}

.texture-preview {
  width: min(100%, 320px);
  max-height: 220px;
  object-fit: contain;
  image-rendering: pixelated;
  border: 1px solid var(--border);
  border-radius: var(--radius3, 10px);
  background: rgba(0, 0, 0, 0.2);
}

.compatibility-note {
  border-radius: var(--radius3, 10px);
}

@media (max-width: 900px) {
  .resource-fields {
    grid-template-columns: 1fr;
  }
}
</style>
