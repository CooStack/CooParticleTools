// 个人主页数据：B站头像（定时刷新）
// 粉丝数量功能已移除：请在 index.html 中自行填写平台主页的 href
(() => {
  const VMID = 291397844;

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function placeholderAvatarDataURI() {
    return "./assets/blog/img/img.png";
  }

  async function refreshOnce() {

    const avatarEl = $("#avatarImg");
    if (!avatarEl) return;

    avatarEl.src = placeholderAvatarDataURI();
  }

  const Profile = {
    init({ intervalMs = 60000 } = {}) {
      refreshOnce();
      window.setInterval(refreshOnce, clamp(intervalMs, 10000, 300000));
    },
  };

  window.Profile = Profile;
})();
