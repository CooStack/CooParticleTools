import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import { deploymentProfile } from '../config/deployment.js';
import WorkbenchPage from '../pages/WorkbenchPage.vue';
import PointsBuilderPage from '../pages/PointsBuilderPage.vue';
import CompositionBuilderPage from '../pages/CompositionBuilderPage.vue';
import CompositionPointsBuilderPage from '../pages/CompositionPointsBuilderPage.vue';
import ShaderBuilderPage from '../pages/ShaderBuilderPage.vue';
import GeneratorPage from '../pages/GeneratorPage.vue';
import GeneratorPointsBuilderPage from '../pages/GeneratorPointsBuilderPage.vue';
import BezierToolPage from '../pages/BezierToolPage.vue';
import PluginsPage from '../pages/PluginsPage.vue';

const routes = [
  { path: '/', redirect: '/workbench' },
  { path: '/workbench', name: 'workbench', component: WorkbenchPage, meta: { title: 'CooParticlesAPI Tools', fullBleed: true } },
  { path: '/home', redirect: '/workbench' },
  { path: '/pointsbuilder', name: 'pointsbuilder', component: PointsBuilderPage, meta: { title: 'Points Builder', fullBleed: true } },
  { path: '/composition', name: 'composition', component: CompositionBuilderPage, meta: { title: 'Composition Builder', fullBleed: true } },
  { path: '/composition-pointsbuilder', name: 'composition-pointsbuilder', component: CompositionPointsBuilderPage, meta: { title: 'Composition Points Builder', fullBleed: true } },
  { path: '/shader-builder', name: 'shader-builder', component: ShaderBuilderPage, meta: { title: 'RendererAPI Shader Builder', fullBleed: true } },
  { path: '/generator', name: 'generator', component: GeneratorPage, meta: { title: 'Emitter Generator', fullBleed: true } },
  { path: '/generator-pointsbuilder', name: 'generator-pointsbuilder', component: GeneratorPointsBuilderPage, meta: { title: 'Emitter Points Builder', fullBleed: true } },
  { path: '/bezier', name: 'bezier', component: BezierToolPage, meta: { title: 'Bezier Tool', fullBleed: true } },
  { path: '/plugins', name: 'plugins', component: PluginsPage, meta: { title: 'Plugins', fullBleed: true } }
];

const history = deploymentProfile.usesHashRouter
  ? createWebHashHistory(deploymentProfile.appBase)
  : createWebHistory(deploymentProfile.appBase);

const router = createRouter({
  history,
  routes
});

router.afterEach((to) => {
  if (typeof document !== 'undefined') {
    document.title = to.meta?.title || 'CooParticlesAPI Tools';
  }
});

export default router;
