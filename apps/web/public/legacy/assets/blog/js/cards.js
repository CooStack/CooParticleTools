// 让工具卡片整卡可点击（不使用 <a>，避免默认链接/visited 样式）
(() => {
  function navigate(href) {
    if (typeof window.__legacyNavigate === 'function') {
      window.__legacyNavigate(href);
      return;
    }
    window.location.href = href;
  }

  function bindCard(card) {
    const href = card.getAttribute('data-href');
    if (!href) return;

    if (!card.hasAttribute('role')) card.setAttribute('role', 'link');
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');

    card.addEventListener('click', (e) => {
      if (e.defaultPrevented) return;
      if (typeof e.button === 'number' && e.button !== 0) return;
      const sel = window.getSelection ? String(window.getSelection()) : '';
      if (sel && sel.length > 0) return;
      navigate(href);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate(href);
      }
    });
  }

  function init() {
    document.querySelectorAll('.card-tool[data-href]').forEach(bindCard);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
