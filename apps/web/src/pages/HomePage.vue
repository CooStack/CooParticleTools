<template>
  <div ref="homeRootRef" class="legacy-home" :data-theme="theme">
    <canvas ref="bgRef" class="bg-canvas" aria-hidden="true"></canvas>
    <canvas ref="fwRef" class="fw-canvas" aria-hidden="true"></canvas>
    <div class="grid-bg" aria-hidden="true"></div>
    <button ref="themeToggleRef" id="themeToggle" class="theme-toggle" type="button" aria-label="切换主题" @click="toggleTheme">
      <span class="theme-toggle-icon" aria-hidden="true"></span>
      <span id="themeToggleText" class="theme-toggle-text">{{ theme === 'light' ? '亮色' : '暗色' }}</span>
    </button>

    <main class="shell">
      <section class="grid">
        <article class="card card-profile" id="profileCard">
          <div class="profile-top profile-top--simple">
            <div class="profile-left profile-left--simple">
              <div class="intro-line" aria-label="你好，我是">
                <span class="intro-hello">你好，</span><span class="intro-iam">我是</span>
              </div>
              <div class="name-line" aria-label="名字">
                <span class="name-em--big">空栈</span>
              </div>
            </div>

            <div class="profile-avatar" aria-label="头像占位">
              <img id="avatarImg" :src="avatarUrl" alt="头像" />
            </div>
          </div>

          <div class="profile-links" aria-label="粉丝统计">
            <div class="subcard subcard--stat" aria-label="全网粉丝总数" aria-live="polite">
              <div class="subcard-live">
                <span class="subcard-live-dot" aria-hidden="true"></span>
                <span class="subcard-live-text">实时数据</span>
              </div>
              <div class="subcard-stat-title">全网粉丝总数</div>
              <div class="subcard-value subcard-value--stat follower-counter" :aria-label="bilibiliFollowerDisplay">
                <template v-for="char in bilibiliFollowerChars" :key="char.id">
                  <span v-if="char.isDigit" class="follower-digit-slot">
                    <Transition v-if="char.changed" name="follower-digit" mode="out-in">
                      <span :key="`${char.id}-${char.currentChar}`" class="follower-char follower-char--digit">{{ char.currentChar }}</span>
                    </Transition>
                    <span v-else class="follower-char follower-char--digit">{{ char.currentChar }}</span>
                  </span>
                  <span v-else class="follower-char follower-char--separator">{{ char.currentChar }}</span>
                </template>
              </div>
            </div>
          </div>
        </article>

        <article
          v-for="tool in tools"
          :key="tool.id"
          class="card card-tool"
          :class="tool.className"
          :aria-label="tool.title"
          role="link"
          tabindex="0"
          @click="openTool(tool.route)"
          @keydown.enter.prevent="openTool(tool.route)"
          @keydown.space.prevent="openTool(tool.route)"
        >
          <div class="tool-tag">工具</div>
          <h3>{{ tool.title }}</h3>
          <p>{{ tool.description }}</p>
          <div class="tool-hint">点击打开</div>
        </article>

        <section class="codeflow-host" id="codeflowCard" aria-label="代码流">
          <div class="code-window code-window--solo" aria-label="代码展示区域">
            <div class="code-window-bar">
              <div class="win-dots" aria-hidden="true">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
              </div>
              <div class="code-file" aria-label="文件名">Intellj IDEA- ClassParticleEmitters.kt</div>
            </div>

            <div ref="codeBoxRef" class="code-scroll codeflow-box" id="codeBox">
              <pre class="code-pre codeflow-pre"><code id="codeMain" v-html="highlightedCode"></code><span id="codeCursor" class="code-cursor"></span></pre>
            </div>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { canFetchBilibiliStat, fetchBilibiliStat } from '../services/api/social.js';
import { highlightKotlin } from '../utils/legacy-code-highlight.js';

const router = useRouter();
const homeRootRef = ref(null);
const bgRef = ref(null);
const fwRef = ref(null);
const codeBoxRef = ref(null);
const themeToggleRef = ref(null);
const theme = ref('light');
const fullCode = ref('');
const typedLength = ref(0);
const bilibiliFollowerValue = ref(null);
const previousBilibiliFollowerDisplay = ref('--');
const avatarUrl = `${import.meta.env.BASE_URL}legacy-home/avatar.png`;
const codeUrl = `${import.meta.env.BASE_URL}legacy-home/code.kt`;
const codeAnchor = 'abstract class ClassParticleEmitters';
const tools = [
  { id: 'generator', className: 'card-generator', route: '/generator', title: '粒子发射器指令生成器', description: '直观看到粒子的运动轨迹与方向。' },
  { id: 'shader-builder', className: 'card-shader', route: '/shader-builder', title: '着色器编辑工具', description: '用于构建 RendererAPI 模型着色器、后处理管线并生成 Kotlin 代码。' },
  { id: 'composition', className: 'card-beizer', route: '/composition', title: '运动图形编辑器', description: '可视化编辑 Composition 与动画行为并生成 Kotlin 代码。' },
  { id: 'pointsbuilder', className: 'card-points', route: '/pointsbuilder', title: '粒子样式生成器', description: '高效构建一个粒子的图案。' }
];

const displayedCode = computed(() => fullCode.value.slice(0, typedLength.value));
const highlightedCode = computed(() => highlightKotlin(displayedCode.value));
const bilibiliFollowerDisplay = computed(() => formatFollowerCount(bilibiliFollowerValue.value));
const bilibiliFollowerChars = computed(() => buildFollowerChars(previousBilibiliFollowerDisplay.value, bilibiliFollowerDisplay.value));

let codeTimer = null;
let animationFrame = 0;
let particles = [];
let sparks = [];
let pointer = { x: 0, y: 0, active: false };
let resizeHandler = null;
let moveHandler = null;
let leaveHandler = null;
let downHandler = null;
let followerRefreshTimer = null;
let followerRequesting = false;
let themeTransitioning = false;
let themeMaskFrame = 0;
let themeSnapshotElement = null;

const FOLLOWER_REFRESH_MS = 1000;
const THEME_MASK_MS = 420;

function loadTheme() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      theme.value = saved;
      return;
    }
  } catch {
  }
  theme.value = 'light';
}

function saveTheme() {
  try {
    localStorage.setItem('theme', theme.value);
  } catch {
  }
}

function updateThemeMaskOrigin() {
  const buttonElement = themeToggleRef.value;
  if (!buttonElement) {
    document.documentElement.style.setProperty('--theme-mask-x', '50vw');
    document.documentElement.style.setProperty('--theme-mask-y', '32px');
    return { x: window.innerWidth / 2, y: 32 };
  }

  const rect = buttonElement.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  document.documentElement.style.setProperty('--theme-mask-x', `${x}px`);
  document.documentElement.style.setProperty('--theme-mask-y', `${y}px`);
  return { x, y };
}

function easeThemeMask(progress) {
  return 1 - ((1 - progress) ** 3);
}

function cleanupThemeSnapshot() {
  if (themeMaskFrame) {
    cancelAnimationFrame(themeMaskFrame);
    themeMaskFrame = 0;
  }
  if (themeSnapshotElement) {
    themeSnapshotElement.remove();
    themeSnapshotElement = null;
  }
}

function syncSnapshotCanvases(sourceRoot, snapshotRoot) {
  const sourceCanvases = sourceRoot.querySelectorAll('canvas');
  const snapshotCanvases = snapshotRoot.querySelectorAll('canvas');
  snapshotCanvases.forEach((canvas, index) => {
    const sourceCanvas = sourceCanvases[index];
    if (!sourceCanvas) return;
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    canvas.style.width = sourceCanvas.style.width;
    canvas.style.height = sourceCanvas.style.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(sourceCanvas, 0, 0);
  });
}

function applyThemeSnapshotMask(element, x, y, radius) {
  const hole = `radial-gradient(circle at ${x}px ${y}px, transparent 0, transparent ${radius}px, rgba(0, 0, 0, 1) ${radius + 1}px)`;
  element.style.webkitMaskImage = hole;
  element.style.maskImage = hole;
}

function createThemeSnapshot() {
  const sourceRoot = homeRootRef.value;
  if (!sourceRoot) return null;
  const snapshot = sourceRoot.cloneNode(true);
  snapshot.removeAttribute('data-v-inspector');
  snapshot.setAttribute('aria-hidden', 'true');
  snapshot.classList.add('theme-transition-snapshot');
  syncSnapshotCanvases(sourceRoot, snapshot);
  document.body.appendChild(snapshot);
  return snapshot;
}

async function playThemeMask(nextTheme) {
  if (themeTransitioning || nextTheme === theme.value) {
    return;
  }

  const origin = updateThemeMaskOrigin();
  cleanupThemeSnapshot();
  const snapshot = createThemeSnapshot();

  themeTransitioning = true;
  try {
    theme.value = nextTheme;
    await nextTick();
    if (!snapshot) {
      return;
    }

    themeSnapshotElement = snapshot;
    const maxRadius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y)
    ) + 24;

    await new Promise((resolve) => {
      const startedAt = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / THEME_MASK_MS);
        const radius = maxRadius * easeThemeMask(progress);
        applyThemeSnapshotMask(snapshot, origin.x, origin.y, radius);
        if (progress >= 1) {
          resolve();
          return;
        }
        themeMaskFrame = requestAnimationFrame(tick);
      };
      applyThemeSnapshotMask(snapshot, origin.x, origin.y, 0);
      themeMaskFrame = requestAnimationFrame(tick);
    });
  } finally {
    cleanupThemeSnapshot();
    themeTransitioning = false;
  }
}

function toggleTheme() {
  const nextTheme = theme.value === 'light' ? 'dark' : 'light';
  void playThemeMask(nextTheme);
}

function formatFollowerCount(value) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return new Intl.NumberFormat('zh-CN').format(value);
}

function buildFollowerChars(previousValue, currentValue) {
  const previousText = previousValue || '--';
  const currentText = currentValue || '--';
  const maxLength = Math.max(previousText.length, currentText.length);
  const previousChars = previousText.padStart(maxLength, ' ');
  const currentChars = currentText.padStart(maxLength, ' ');
  const chars = [];

  for (let index = 0; index < maxLength; index += 1) {
    const previousChar = previousChars[index];
    const currentChar = currentChars[index];

    if (currentChar === ' ') {
      continue;
    }

    const isDigit = /\d/.test(currentChar);
    chars.push({
      id: `follower-char-${index}`,
      previousChar,
      currentChar,
      isDigit,
      changed: isDigit && previousChar !== currentChar
    });
  }

  return chars;
}

async function loadBilibiliFollowerCount() {
  if (!canFetchBilibiliStat() || followerRequesting) {
    return;
  }

  followerRequesting = true;
  try {
    const stat = await fetchBilibiliStat();
    if (bilibiliFollowerValue.value !== stat.follower) {
      const currentDisplay = bilibiliFollowerDisplay.value;
      const nextDisplay = formatFollowerCount(stat.follower);
      previousBilibiliFollowerDisplay.value = bilibiliFollowerValue.value == null ? nextDisplay : currentDisplay;
      bilibiliFollowerValue.value = stat.follower;
    }
  } catch {
    if (bilibiliFollowerValue.value == null) {
      bilibiliFollowerValue.value = null;
    }
  } finally {
    followerRequesting = false;
  }
}

async function loadCode() {
  try {
    const response = await fetch(codeUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    fullCode.value = (await response.text()).replaceAll('\r\n', '\n').replace(/^\n+/, '');
  } catch {
    fullCode.value = `package cn.coostack.cooparticlesapi.network.particle.emitters\n\nabstract class ClassParticleEmitters\n`;
  }
  const index = fullCode.value.indexOf(codeAnchor);
  const anchorStart = index === -1 ? 0 : (fullCode.value.lastIndexOf('\n', Math.max(0, index - 1)) + 1);
  typedLength.value = anchorStart;
}

function startCodeFlow() {
  if (codeTimer) window.clearTimeout(codeTimer);
  const step = () => {
    if (typedLength.value >= fullCode.value.length) {
      codeTimer = null;
      return;
    }
    const current = fullCode.value[typedLength.value];
    typedLength.value += 1;
    const delay = current === '\n'
      ? 110 + Math.random() * 120
      : (Math.random() < 0.07 ? 120 + Math.random() * 420 : 22 + Math.random() * 63);
    codeTimer = window.setTimeout(step, delay);
  };
  codeTimer = window.setTimeout(step, 80);
}

function openTool(route) {
  router.push(route);
}

function makeParticle(width, height, initial = true) {
  return {
    x: Math.random() * width,
    y: initial ? Math.random() * height : (-20 - Math.random() * 160),
    r: 1 + Math.random() * 1.4,
    vx: (Math.random() * 2 - 1) * 0.32,
    vy: 0.3 + Math.random() * 0.55,
    tw: Math.random() * Math.PI * 2,
    alpha: 0.85,
    life: 1000
  };
}

function resetParticle(particle, width, height, initial = false) {
  Object.assign(particle, makeParticle(width, height, initial));
}

function createSpark(x, y) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 2.2 + Math.random() * 3.6;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 40 + Math.floor(Math.random() * 30),
    max: 40 + Math.floor(Math.random() * 30)
  };
}

function burst(x, y) {
  const count = 60 + Math.floor(Math.random() * 50);
  for (let index = 0; index < count; index += 1) {
    sparks.push(createSpark(x, y));
  }
}

function resizeCanvases() {
  const bgCanvas = bgRef.value;
  const fwCanvas = fwRef.value;
  if (!bgCanvas || !fwCanvas) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  [bgCanvas, fwCanvas].forEach((canvas) => {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  });

  particles = Array.from({ length: 42 }, () => makeParticle(width, height, true));
}

function renderBackground() {
  const bgCanvas = bgRef.value;
  const fwCanvas = fwRef.value;
  if (!bgCanvas || !fwCanvas) return;
  const bg = bgCanvas.getContext('2d', { alpha: true });
  const fw = fwCanvas.getContext('2d', { alpha: true });
  if (!bg || !fw) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const maxLinkDistance = 120 * 120;

  bg.clearRect(0, 0, width, height);
  fw.clearRect(0, 0, width, height);

  if (theme.value === 'light') {
    sparks = [];
    animationFrame = requestAnimationFrame(renderBackground);
    return;
  }

  const linkCounts = new Array(particles.length).fill(0);

  particles.forEach((particle) => {
    if (pointer.active) {
      const dx = pointer.x - particle.x;
      const dy = pointer.y - particle.y;
      const distance2 = dx * dx + dy * dy;
      const maxDistance = 300 * 300;
      if (distance2 < maxDistance) {
        const distance = Math.sqrt(distance2) || 1;
        const strength = (1 - distance / 300) * 0.02;
        particle.vx += (dx / distance) * strength;
        particle.vy += (dy / distance) * strength;
        if (particle.life > 0) particle.life -= 1;
        else resetParticle(particle, width, height, false);
      }
    }

    particle.vx *= 0.985;
    particle.vy *= 0.985;
    particle.vy += 0.004;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.tw += 0.05;
    particle.alpha = 0.7 + 0.2 * Math.sin(particle.tw);

    if (particle.x < -10) particle.x = width + 10;
    if (particle.x > width + 10) particle.x = -10;
    if (particle.y > height + 40) resetParticle(particle, width, height, false);
  });

  bg.lineWidth = 1;
  for (let i = 0; i < particles.length; i += 1) {
    if (linkCounts[i] >= 4) continue;
    const current = particles[i];
    for (let j = i + 1; j < particles.length; j += 1) {
      if (linkCounts[i] >= 4) break;
      if (linkCounts[j] >= 4) continue;
      const next = particles[j];
      const dx = current.x - next.x;
      const dy = current.y - next.y;
      const distance2 = dx * dx + dy * dy;
      if (distance2 < maxLinkDistance) {
        const alpha = 0.16 * (1 - distance2 / maxLinkDistance) * Math.min(current.alpha, next.alpha);
        bg.strokeStyle = `rgba(132, 163, 255, ${alpha})`;
        bg.beginPath();
        bg.moveTo(current.x, current.y);
        bg.lineTo(next.x, next.y);
        bg.stroke();
        linkCounts[i] += 1;
        linkCounts[j] += 1;
      }
    }
  }

  particles.forEach((particle) => {
    bg.fillStyle = `rgba(132, 163, 255, ${0.7 * particle.alpha})`;
    bg.beginPath();
    bg.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
    bg.fill();
  });

  fw.save();
  fw.globalCompositeOperation = 'destination-out';
  fw.fillStyle = 'rgba(0,0,0,0.18)';
  fw.fillRect(0, 0, width, height);
  fw.restore();
  fw.globalCompositeOperation = 'source-over';
  fw.lineWidth = 2;

  for (let index = sparks.length - 1; index >= 0; index -= 1) {
    const spark = sparks[index];
    spark.life -= 1;
    spark.vx *= 0.985;
    spark.vy *= 0.985;
    spark.vy += 0.03;
    spark.x += spark.vx;
    spark.y += spark.vy;
    if (spark.life <= 0) {
      sparks.splice(index, 1);
      continue;
    }
    const alpha = 0.9 * Math.max(0, spark.life / spark.max);
    fw.strokeStyle = `rgba(132, 163, 255, ${alpha})`;
    fw.beginPath();
    fw.moveTo(spark.x, spark.y);
    fw.lineTo(spark.x - spark.vx * 2, spark.y - spark.vy * 2);
    fw.stroke();
  }

  animationFrame = requestAnimationFrame(renderBackground);
}

watch(highlightedCode, async () => {
  await nextTick();
  const box = codeBoxRef.value;
  if (!box) return;
  box.scrollTop = Math.max(0, box.scrollHeight - box.clientHeight * 0.5);
});

watch(theme, () => {
  saveTheme();
});

onMounted(async () => {
  loadTheme();
  updateThemeMaskOrigin();
  await Promise.all([loadCode(), loadBilibiliFollowerCount()]);
  followerRefreshTimer = window.setInterval(() => {
    loadBilibiliFollowerCount();
  }, FOLLOWER_REFRESH_MS);
  startCodeFlow();
  resizeCanvases();
  renderBackground();

  resizeHandler = () => {
    resizeCanvases();
    updateThemeMaskOrigin();
  };
  moveHandler = (event) => {
    pointer = { x: event.clientX, y: event.clientY, active: true };
  };
  leaveHandler = () => {
    pointer = { ...pointer, active: false };
  };
  downHandler = (event) => {
    if (event.button !== 0) return;
    pointer = { x: event.clientX, y: event.clientY, active: true };
    burst(event.clientX, event.clientY);
  };

  window.addEventListener('resize', resizeHandler);
  window.addEventListener('pointermove', moveHandler);
  window.addEventListener('pointerleave', leaveHandler);
  window.addEventListener('pointerout', leaveHandler);
  window.addEventListener('pointerdown', downHandler);
});

onBeforeUnmount(() => {
  cleanupThemeSnapshot();
  if (codeTimer) window.clearTimeout(codeTimer);
  if (followerRefreshTimer) window.clearInterval(followerRefreshTimer);
  if (animationFrame) cancelAnimationFrame(animationFrame);
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  if (moveHandler) window.removeEventListener('pointermove', moveHandler);
  if (leaveHandler) {
    window.removeEventListener('pointerleave', leaveHandler);
    window.removeEventListener('pointerout', leaveHandler);
  }
  if (downHandler) window.removeEventListener('pointerdown', downHandler);
});
</script>

<style scoped>
.legacy-home {
  --font-sans: "Space Grotesk", "Noto Sans SC", "MiSans", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  --avatar-size: clamp(124px, 16vw, 148px);
  --code-bg: #33302f;
  --code-stroke: rgba(255,255,255,.12);
  --bg: #05060a;
  --card: rgba(18,20,28,.78);
  --card2: rgba(18,20,28,.62);
  --stroke: rgba(255,255,255,.10);
  --text: rgba(255,255,255,.92);
  --muted: rgba(255,255,255,.66);
  --shadow: 0 12px 40px rgba(0,0,0,.45);
  --radius: 18px;
  position: relative;
  min-height: 100vh;
  color: var(--text);
  background: var(--bg);
  font-family: var(--font-sans);
  overflow: hidden;
  transition: background .32s ease, color .32s ease;
}

.legacy-home[data-theme='light'] {
  --bg:#f5f7ff;
  --card:rgba(255,255,255,.78);
  --card2:rgba(255,255,255,.62);
  --stroke:rgba(10,14,22,.10);
  --text:rgba(10,14,22,.88);
  --muted:rgba(10,14,22,.60);
}

.bg-canvas,
.fw-canvas,
.grid-bg {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
}

.bg-canvas { z-index: 0; }
.fw-canvas { z-index: 1; pointer-events: none; }

.grid-bg {
  z-index: 0;
  pointer-events: none;
  opacity: 0;
  background-image:
    linear-gradient(rgba(40,60,110,.10) 1px, transparent 1px),
    linear-gradient(90deg, rgba(40,60,110,.10) 1px, transparent 1px);
  background-size: 64px 64px;
  transform: translateZ(0);
}

.legacy-home[data-theme='light'] .grid-bg {
  opacity: 1;
  animation: gridMove 16s linear infinite;
}

:global(::view-transition-group(root)),
:global(::view-transition-image-pair(root)),
:global(::view-transition-old(root)),
.theme-transition-snapshot {
  position: fixed;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  overflow: hidden;
}

.theme-toggle {
  position: fixed;
  top: 16px;
  left: 50%;
  right: auto;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(18,20,28,.55);
  color: rgba(255,255,255,.90);
  box-shadow: 0 12px 40px rgba(0,0,0,.35);
  cursor: pointer;
  user-select: none;
  font-family: var(--font-sans);
  font-weight: 700;
  transform: translateX(-50%);
  transition: background .28s ease, color .28s ease, border-color .28s ease, box-shadow .28s ease, transform .18s ease;
}

.legacy-home[data-theme='light'] .theme-toggle {
  background: rgba(255,255,255,.70);
  border-color: rgba(10,14,22,.14);
  color: rgba(10,14,22,.85);
}

.theme-toggle:active { transform: translateX(-50%) translateY(1px); }

.theme-toggle-icon {
  width:10px;
  height:10px;
  border-radius:999px;
  background: rgba(255,255,255,.9);
  box-shadow: 0 0 0 3px rgba(255,255,255,.12);
}

.legacy-home[data-theme='light'] .theme-toggle-icon {
  background: rgba(10,14,22,.8);
  box-shadow: 0 0 0 3px rgba(10,14,22,.10);
}

.shell {
  position: relative;
  z-index: 2;
  height: 100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:24px;
}

.grid {
  width:min(52vw, 980px);
  min-width: 720px;
  display:grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: 170px;
  grid-template-rows: 170px 170px 340px;
  gap:14px;
  grid-template-areas:
    "profile profile generator shader"
    "profile profile beizer pointsbuilder"
    "codeflow codeflow codeflow codeflow";
}

.card {
  background:linear-gradient(180deg, var(--card), var(--card2));
  border:1px solid var(--stroke);
  border-radius:var(--radius);
  box-shadow:var(--shadow);
  padding:14px 16px;
  backdrop-filter: blur(10px);
  overflow:hidden;
  transform: translateZ(0);
  will-change: transform;
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease, filter .18s ease;
}

.card:hover {
  transform: translate3d(0,-12px,0);
  box-shadow: 0 22px 60px rgba(0,0,0,.22);
  border-color: rgba(120,150,255,.28);
  filter: brightness(1.02);
}

.card h3 {
  margin:0 0 6px 0;
  font-size:16px;
  letter-spacing:.2px;
}

.card p {
  margin:0 0 10px 0;
  color:var(--muted);
  font-size:13px;
  line-height:1.45;
}

.card-tool {
  position:relative;
  cursor:pointer;
  background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(245,247,252,.82));
  border-color: rgba(20,30,60,.10);
}

.legacy-home[data-theme='dark'] .card-tool {
  background:linear-gradient(180deg, var(--card), var(--card2));
}

.card-tool::before {
  content:"";
  position:absolute;
  inset:0;
  border-radius:inherit;
  pointer-events:none;
  box-shadow: inset 0 0 0 1px rgba(120,150,255,.10);
}

.tool-tag {
  position:absolute;
  top:12px;
  right:12px;
  font-size:11px;
  font-weight:800;
  padding:2px 8px;
  border-radius:999px;
  background: rgba(120,150,255,.14);
  border:1px solid rgba(120,150,255,.18);
}

.tool-hint {
  margin-top:10px;
  font-size:12px;
  color:var(--muted);
}

.card-profile { grid-area: profile; }
.card-generator { grid-area: generator; }
.card-shader { grid-area: shader; }
.card-beizer { grid-area: beizer; }
.card-points { grid-area: pointsbuilder; }
.codeflow-host { grid-area: codeflow; padding:0; margin:0; display:flex; align-items:stretch; }
.codeflow-host .code-window { width:100%; }

.profile-top {
  display:grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 6px 18px;
  align-items:start;
}

.profile-left {
  min-width:0;
  display:flex;
  flex-direction:column;
  gap:8px;
}

.intro-line {
  display:flex;
  align-items:baseline;
  gap:6px;
  font-size: clamp(28px, 2.8vw, 36px);
  font-weight:850;
  letter-spacing:.2px;
}

.intro-hello {
  color: rgba(255,255,255,.92);
  text-shadow: 0 10px 28px rgba(0,0,0,.22);
}

.legacy-home[data-theme='light'] .intro-hello {
  color: rgba(18,20,30,.92);
  text-shadow:none;
}

.intro-iam {
  color: var(--muted);
  font-weight:800;
}

.name-line { display:block; }

.card-profile {
  display: flex;
  flex-direction: column;
  background: radial-gradient(120% 160% at 10% 0%, rgba(255,255,255,.96) 0%, rgba(255,220,245,.88) 26%, rgba(210,240,255,.78) 62%, rgba(255,255,255,.70) 100%);
  border-color: rgba(160,90,220,.24);
}

.legacy-home[data-theme='dark'] .card-profile {
  background:linear-gradient(180deg, var(--card), var(--card2));
  border-color: var(--stroke);
}

.name-em--big {
  display:inline-block;
  padding:0;
  border:none;
  border-radius:0;
  background:none;
  box-shadow:none;
  font-weight:900;
  font-size: clamp(56px, 5.6vw, 78px);
  line-height:1;
  color:transparent;
  background-image: linear-gradient(90deg, rgba(255,110,210,1), rgba(110,190,255,1));
  -webkit-background-clip:text;
  background-clip:text;
}

.profile-avatar {
  grid-column: 2;
  grid-row: 1 / span 2;
  justify-self:end;
  align-self:center;
  width: var(--avatar-size);
  height: var(--avatar-size);
  border-radius:22px;
  overflow:hidden;
  border:1px solid rgba(255,255,255,.12);
  box-shadow: 0 18px 46px rgba(0,0,0,.22);
  background: linear-gradient(135deg, rgba(255,255,255,.12), rgba(120,150,255,.10));
}

.profile-avatar img {
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}

.profile-links {
  margin-top: 14px;
  flex: 1;
  display: grid;
  grid-template-columns: 1fr;
}

.subcard {
  text-decoration:none;
  color:var(--text);
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
  border-radius:14px;
  padding:10px 10px;
  min-height:56px;
  display:flex;
  flex-direction:column;
  justify-content:center;
  transition: transform .12s ease, background .12s ease, border-color .12s ease;
}

.subcard:hover {
  background:rgba(255,255,255,.10);
  border-color:rgba(255,255,255,.22);
  transform: translateY(-1px);
}

.subcard-title {
  font-weight:800;
  font-size:13px;
  letter-spacing:.2px;
}

.subcard-sub {
  margin-top:4px;
  font-size:12px;
  color:var(--muted);
}

.subcard--stat {
  cursor: default;
  min-height: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  padding: 18px 16px;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.legacy-home[data-theme='dark'] .subcard--stat {
  background: transparent;
  border-color: transparent;
}

.subcard-live {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.subcard-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #ff4d5f;
  box-shadow: 0 0 0 4px rgba(255,77,95,.12);
  animation: pulseDot 1.6s ease-in-out infinite;
}

.subcard-stat-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: .4px;
}

.subcard-value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 900;
  line-height: 1.1;
  letter-spacing: .2px;
}

.subcard-value--stat {
  margin-top: 0;
  font-size: clamp(36px, 2.6vw, 54px);
  font-weight: 900;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}

.follower-counter {
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  flex-wrap: nowrap;
  gap: 0;
}

.follower-digit-slot {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: .56em;
  height: 1.1em;
  overflow: hidden;
}

.follower-char {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.follower-char--digit {
  width: 100%;
}

.follower-char--separator {
  min-width: .16em;
  opacity: .72;
}

.follower-digit-enter-active,
.follower-digit-leave-active {
  transition: transform .38s cubic-bezier(.22, 1, .36, 1), opacity .38s ease;
}

.follower-digit-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.follower-digit-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

.code-window {
  position:relative;
  border:1px solid var(--code-stroke);
  border-radius:14px;
  background: var(--code-bg);
  height: 340px;
  overflow:hidden;
  box-shadow: 0 16px 46px rgba(0,0,0,.35);
}

.code-window-bar {
  height:28px;
  display:flex;
  align-items:center;
  padding:0 10px;
  border-bottom:1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.04);
}

.code-file {
  margin-left:auto;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: rgba(255,255,255,.72);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  max-width: 72%;
}

.win-dots { display:flex; gap:8px; }
.win-dots .dot {
  display:inline-block;
  width:12px;
  height:12px;
  border-radius:999px;
  border:1px solid rgba(0,0,0,.25);
  pointer-events:none;
}
.win-dots .red{ background: #ff5f57; }
.win-dots .yellow{ background: #febc2e; }
.win-dots .green{ background: #28c840; }

.code-scroll {
  height: calc(100% - 28px);
  overflow:auto;
  padding:10px 12px;
  overscroll-behavior: contain;
  user-select:none;
  -webkit-user-select:none;
  -ms-user-select:none;
  pointer-events:none;
  touch-action:none;
  scrollbar-width:none;
}
.code-scroll::-webkit-scrollbar{ width:0; height:0; }

.code-pre {
  margin:0;
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.7;
  color:rgba(255,255,255,.88);
  white-space:pre;
  user-select:none;
  -webkit-user-select:none;
}

.code-pre code { display:inline; }

.code-cursor {
  display:inline-block;
  width:0;
  height:1.15em;
  margin-left:2px;
  border-left:2px solid rgba(255,255,255,.82);
  animation: blink 1s steps(1,end) infinite;
  vertical-align: -2px;
}

:deep(.tok-kw){ color: rgba(255,200,130,.95); }
:deep(.tok-str){ color: rgba(160,230,180,.95); }
:deep(.tok-com){ color: rgba(180,180,200,.55); font-style: italic; }
:deep(.tok-num){ color: rgba(160,200,255,.92); }
:deep(.tok-fn){ color: rgba(255,170,210,.92); }
:deep(.tok-type){ color: rgba(140,220,255,.92); }

@keyframes blink { 50% { opacity:0; } }
@keyframes pulseDot {
  0%, 100% { transform: scale(1); opacity: .92; }
  50% { transform: scale(1.18); opacity: 1; }
}
@keyframes gridMove {
  0%{ background-position: 0 0, 0 0; }
  100%{ background-position: 240px 160px, 240px 160px; }
}

@media (max-width: 980px) {
  .grid {
    width:min(92vw, 980px);
    min-width:0;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: 170px;
    grid-template-rows: 170px 170px 170px 340px;
    grid-template-areas:
      "profile profile"
      "generator shader"
      "beizer pointsbuilder"
      "codeflow codeflow";
  }
}

@media (max-width: 760px) {
  .shell { padding-top: 76px; align-items:flex-start; }
  .grid {
    width:min(94vw, 980px);
    grid-template-columns: 1fr;
    grid-template-rows: none;
    grid-auto-rows: minmax(170px, auto);
    grid-template-areas:
      "profile"
      "generator"
      "shader"
      "beizer"
      "pointsbuilder"
      "codeflow";
  }
  .profile-top { grid-template-columns: 1fr; }
  .profile-avatar {
    grid-column: 1;
    grid-row: auto;
    justify-self: start;
    width: min(var(--avatar-size), 46vw);
    height: min(var(--avatar-size), 46vw);
  }
  .profile-links { grid-template-columns: 1fr; }
}
</style>
