// 入口：初始化主题、背景粒子、烟花、代码流、个人头像、UI 行为
(() => {
  // 主题
  window.Theme?.init();

  const bg = document.getElementById('bg');

  // 上层烟花画布
  const fwCanvas = document.createElement('canvas');
  fwCanvas.id = 'fw';
  fwCanvas.style.position = 'fixed';
  fwCanvas.style.inset = '0';
  fwCanvas.style.width = '100%';
  fwCanvas.style.height = '100%';
  fwCanvas.style.zIndex = '1';
  fwCanvas.style.pointerEvents = 'none';
  document.body.appendChild(fwCanvas);

  // 背景粒子（底层）
  const field = new window.ParticleField(bg);
  function loop() {
    field.step();
    field.render();
    requestAnimationFrame(loop);
  }
  loop();

  // 烟花（上层）
  const fw = new window.Fireworks(fwCanvas);

  // 点击：在鼠标点击位置爆炸
  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    fw.burst(e.clientX, e.clientY);
  });

  // 禁止在代码框内用滚轮手动滚动（但脚本自动滚动保留）
  const codeBox = document.getElementById('codeBox');
  if (codeBox) {
    codeBox.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  }

  // 代码流
  const code = new window.CodeFlow({
    url: 'assets/blog/code.kt',
    boxEl: codeBox,
    codeEl: document.getElementById('codeMain'),
    cursorEl: document.getElementById('codeCursor'),
    minDelay: 22,
    maxDelay: 85,
    typoChance: 0.055,
    pauseChance: 0.07,
    // 默认从这一行开始（找不到就从文件开头）
    startAnchor: 'abstract class ClassParticleEmitters',
    startFromAnchor: true,
    // 不做“每行双回车”的伪行距；改为让光标保持在展示框中间
    doubleEnter: false,
  });
  code.start();

  // 头像（B站）
  window.Profile?.init({ intervalMs: 60000 });
})();
