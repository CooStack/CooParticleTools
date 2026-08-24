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
  min-height: var(--app-vh);
  color: var(--text);
  background:
    radial-gradient(1100px 760px at 6% -6%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 56%),
    var(--bg);
}

.plugins-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 28px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}

.plugins-header h1 {
  margin: 6px 0 0;
}

.plugins-header p {
  margin: 8px 0 0;
  color: var(--muted);
}

.back-link {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: color var(--speed) ease;
}

.back-link:hover {
  color: var(--text);
}

.plugins-header button {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius2);
  background: var(--card);
  color: var(--text);
  transition: background var(--speed) ease, border-color var(--speed) ease;
}

.plugins-header button:hover {
  border-color: var(--line2);
  background: color-mix(in srgb, var(--card) 88%, var(--hover-veil));
}

.plugins-header button:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 58%, transparent);
  box-shadow: var(--focus-ring);
}

.plugins-main {
  width: min(1120px, 100%);
  padding: 28px;
}

.plugins-section {
  border: 1px solid var(--line);
  border-radius: var(--radius2);
  background: var(--card);
  box-shadow: var(--shadow2);
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
  font-size: 17px;
}

.plugins-section-head small,
.plugin-main small,
.plugin-path {
  color: var(--muted);
}

.plugin-list {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.plugin-row {
  border: 1px solid var(--line);
  border-radius: var(--radius2);
  background: var(--panel2);
  padding: 14px;
  transition: background var(--speed) ease, border-color var(--speed) ease;
}

.plugin-row:hover {
  border-color: var(--line2);
  background: color-mix(in srgb, var(--panel2) 88%, var(--hover-veil));
}

.plugin-main small {
  display: block;
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.plugin-status {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 9px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
}

.plugin-status.enabled {
  color: color-mix(in srgb, var(--ok) 80%, white 20%);
  border-color: color-mix(in srgb, var(--ok) 30%, transparent);
  background: color-mix(in srgb, var(--ok) 12%, transparent);
}

.plugin-status.disabled {
  color: var(--muted);
  background: var(--card2);
}

.plugin-error {
  color: color-mix(in srgb, var(--danger) 78%, white 22%);
}

.plugin-path {
  margin-top: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11px;
}

.route-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.route-list span {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card2);
  color: var(--muted);
  padding: 3px 9px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.empty-state {
  margin-top: 14px;
  color: var(--muted);
}

.empty-state.error {
  color: color-mix(in srgb, var(--danger) 78%, white 22%);
}

@media (max-width: 760px) {
  .plugins-header,
  .plugin-main {
    display: grid;
  }
}

/* Glass variants — see the note in WorkbenchPage.vue about :global() placement. */
/* Must not paint: body carries the field the panels refract. */
:global(body[data-theme^='glass-'] .plugins-page) {
  background: transparent;
}

:global(body[data-theme^='glass-'] .plugins-header),
:global(body[data-theme^='glass-'] .plugins-section) {
  border: 0;
  background:
    linear-gradient(157deg, var(--glass-sheen-1) 0%, transparent 30%, transparent 68%, var(--glass-sheen-2) 100%),
    var(--glass-fill-2);
  backdrop-filter: var(--glass-blur);
  box-shadow:
    inset 0 1px 0 0 var(--glass-rim-top),
    inset 1px 0 0 0 var(--glass-rim-side),
    inset -1px 0 0 0 var(--glass-rim-side),
    inset 0 -1px 0 0 var(--glass-rim-bottom),
    var(--glass-shadow);
}

:global(body[data-theme^='glass-'] .plugin-row),
:global(body[data-theme^='glass-'] .plugins-header button) {
  border: 0;
  background:
    linear-gradient(157deg, var(--glass-sheen-2) 0%, transparent 42%),
    var(--glass-fill);
  backdrop-filter: var(--glass-blur-2);
  box-shadow:
    inset 0 1px 0 0 var(--glass-rim-side),
    inset 0 -1px 0 0 var(--glass-rim-bottom);
}
</style>
