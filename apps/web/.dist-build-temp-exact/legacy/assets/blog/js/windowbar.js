// 代码框左上角“窗口按钮”（装饰 + 简单交互）
(() => {
  function init() {
    const win = document.querySelector('.code-window');
    if (!win) return;

    const dots = win.querySelectorAll('.win-dots .dot');
    dots.forEach((b) => {
      b.addEventListener('click', (e) => {
        const act = b.getAttribute('data-win');
        if (act === 'zoom') {
          win.classList.toggle('is-zoom');
          win.classList.remove('is-min');
        } else if (act === 'min') {
          win.classList.toggle('is-min');
          win.classList.remove('is-zoom');
        } else if (act === 'close') {
          // “关闭”按键：做成最小化，避免真的把内容关掉
          win.classList.toggle('is-min');
          win.classList.remove('is-zoom');
        }
        e.stopPropagation();
      });
    });

    // 双击标题栏：切换放大
    const bar = win.querySelector('.code-window-bar');
    if (bar) {
      bar.addEventListener('dblclick', () => {
        win.classList.toggle('is-zoom');
        win.classList.remove('is-min');
      });
    }
  }

  window.CodeWindowBar = { init };
})();
