import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import { installElectronShellBridge } from './services/shell/electron-shell.js';
import { applyAppTheme, hydrateAppTheme } from './modules/theme/app-theme.js';
import {
  applyGlassSurface,
  hydrateGlassSurface,
  installGlassReveal,
  watchGlassSurface
} from './modules/theme/glass-surface.js';
import { installShellCustomSelects } from './modules/theme/custom-select.js';
import { hydrateAutoSaveIntervals, hydrateCurrentBackupEnabled } from './modules/preferences/auto-save.js';
import './assets/styles/base.css';
import './assets/styles/theme.css';
import './assets/styles/layout.css';

// Apply the cached theme synchronously so the shell never flashes the default,
// then reconcile with the durable copy from the desktop shell. The reconcile has
// to happen because the renderer's origin changes every launch (random backend
// port), which empties localStorage.
applyAppTheme();
void hydrateAppTheme();
void hydrateCurrentBackupEnabled();
void hydrateAutoSaveIntervals();

// Same two steps for the glass material's blur / frost, then the pointer rim
// light. watchGlassSurface also carries changes made inside a builder iframe
// through to the durable store — the iframes have no Electron bridge of their
// own, so the shell is what makes those survive a restart.
applyGlassSurface();
void hydrateGlassSurface();
watchGlassSurface();
installGlassReveal();

installElectronShellBridge(router);

createApp(App).use(router).mount('#app');
// Enhance the mounted Vue controls with the same listbox used by legacy pages.
// The observer keeps newly-rendered tab/editor fields in the same theme.
installShellCustomSelects();
