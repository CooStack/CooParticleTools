import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import { installElectronShellBridge } from './services/shell/electron-shell.js';
import './assets/styles/base.css';
import './assets/styles/theme.css';
import './assets/styles/layout.css';
import './assets/styles/minecraft.css';

installElectronShellBridge(router);

createApp(App).use(router).mount('#app');
