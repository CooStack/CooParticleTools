<template>
  <div class="plugins-page">
    <header class="plugins-header">
      <div>
        <RouterLink class="back-link" :to="{ name: 'workbench' }">工作台</RouterLink>
        <h1>插件</h1>
        <p>本地插件目录与已注册路由。</p>
      </div>
      <button type="button" @click="reloadPlugins">重新加载</button>
    </header>

    <main class="plugins-main">
      <section class="plugins-section">
        <div class="plugins-section-head">
          <h2>插件列表</h2>
          <small>{{ plugins.length }} loaded</small>
        </div>

        <div v-if="loading" class="empty-state">加载中...</div>
        <div v-else-if="error" class="empty-state error">{{ error }}</div>
        <div v-else-if="!plugins.length" class="empty-state">暂无插件。</div>

        <div v-else class="plugin-list">
          <article v-for="plugin in plugins" :key="plugin.id" class="plugin-row">
            <div class="plugin-main">
              <div>
                <strong>{{ plugin.name || plugin.id }}</strong>
                <small>{{ plugin.id }} · {{ plugin.version || '0.0.0' }}</small>
              </div>
              <span :class="['plugin-status', plugin.enabled ? 'enabled' : 'disabled']">
                {{ plugin.enabled ? 'enabled' : 'disabled' }}
              </span>
            </div>

            <p v-if="plugin.error" class="plugin-error">{{ plugin.error }}</p>
            <div class="plugin-path">{{ plugin.root }}</div>
            <div v-if="plugin.routes?.length" class="route-list">
              <span v-for="route in plugin.routes" :key="route">{{ route }}</span>
            </div>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { http } from '../services/api/http.js';

const plugins = ref([]);
const loading = ref(false);
const error = ref('');

async function loadPlugins() {
  loading.value = true;
  error.value = '';
  try {
    const result = await http('/plugins');
    plugins.value = Array.isArray(result?.items) ? result.items : [];
  } catch (caught) {
    error.value = caught?.message || String(caught);
  } finally {
    loading.value = false;
  }
}

async function reloadPlugins() {
  loading.value = true;
  error.value = '';
  try {
    const result = await http('/plugins/reload', { method: 'POST', body: '{}' });
    plugins.value = Array.isArray(result?.items) ? result.items : [];
  } catch (caught) {
    error.value = caught?.message || String(caught);
  } finally {
    loading.value = false;
  }
}

onMounted(loadPlugins);
</script>

<style scoped>
.plugins-page {
  min-height: 100vh;
  background:
    linear-gradient(180deg, rgba(255, 116, 176, 0.08), transparent 34%),
    linear-gradient(180deg, #1b0a15 0%, #12070e 60%, #080408 100%);
  color: #fff3f8;
}

.plugins-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 28px;
  border-bottom: 1px solid rgba(255, 214, 232, 0.14);
  background: rgba(20, 8, 17, 0.96);
}

.plugins-header h1 {
  margin: 6px 0 0;
}

.plugins-header p {
  margin: 8px 0 0;
  color: #dec0cf;
}

.back-link {
  color: #f06aa7;
  font-size: 13px;
}

.plugins-header button {
  border: 1px solid rgba(255, 214, 232, 0.26);
  border-radius: 0;
  background: #321621;
  color: #fff3f8;
  padding: 9px 12px;
  box-shadow: 0 2px 0 #090408;
}

.plugins-main {
  width: min(1120px, 100%);
  padding: 28px;
}

.plugins-section {
  border: 1px solid rgba(255, 214, 232, 0.14);
  border-radius: 0;
  background: rgba(36, 16, 27, 0.72);
  padding: 18px;
}

.plugins-section-head,
.plugin-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.plugins-section-head h2 {
  margin: 0;
}

.plugins-section-head small,
.plugin-main small,
.plugin-path {
  color: #dec0cf;
}

.plugin-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.plugin-row {
  border: 1px solid rgba(255, 214, 232, 0.14);
  border-radius: 0;
  background: rgba(31, 14, 24, 0.78);
  padding: 14px;
}

.plugin-main small {
  display: block;
  margin-top: 3px;
}

.plugin-status {
  border: 1px solid rgba(255, 214, 232, 0.22);
  border-radius: 0;
  padding: 4px 9px;
  font-size: 12px;
}

.plugin-status.enabled {
  color: #8ee7ef;
  border-color: rgba(142, 231, 239, 0.34);
}

.plugin-status.disabled,
.plugin-error {
  color: #ffb4c8;
}

.plugin-path {
  margin-top: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.route-list span {
  border-radius: 0;
  background: rgba(240, 106, 167, 0.1);
  color: #f7a6c9;
  padding: 4px 8px;
  font-size: 12px;
}

.empty-state {
  margin-top: 14px;
  color: #dec0cf;
}

.empty-state.error {
  color: #ffb4c8;
}

@media (max-width: 760px) {
  .plugins-header,
  .plugin-main {
    display: grid;
  }
}
</style>
