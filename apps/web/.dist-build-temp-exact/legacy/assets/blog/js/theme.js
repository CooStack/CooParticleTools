// 主题切换：light（默认）/ dark
(() => {
  const KEY = 'theme';
  const body = document.body;
  const btn = document.getElementById('themeToggle');
  const textEl = document.getElementById('themeToggleText');

  function setTheme(theme) {
    body.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    if (textEl) textEl.textContent = theme === 'light' ? '亮色' : '暗色';
  }

  function getInitial() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (_) {}
    // 默认亮色（用户要求）
    return 'light';
  }

  function toggle() {
    const cur = body.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(cur === 'light' ? 'dark' : 'light');
  }

  function init() {
    setTheme(getInitial());
    if (btn) btn.addEventListener('click', toggle);
  }

  window.Theme = { init, setTheme };
})();
