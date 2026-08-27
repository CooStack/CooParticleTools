export function toggleFullscreen() {
    const host = document.querySelector(".viewer");
    if (!host) return;

    // 进入全屏后浏览器会创建 ::backdrop（默认黑色）。
    // 若全屏态背景因 CSS 兼容性变为透明，就会看到“黑底”。
    // 这里把“进入全屏前”的背景（computed）固化为 inline，确保全屏前后背景一致。
    installFullscreenBackgroundFix(host);

    const fsEl = getFullscreenElement();
    if (!fsEl) {
        capturePreFullscreenBackground(host);
        const req = host.requestFullscreen || host.webkitRequestFullscreen || host.mozRequestFullScreen || host.msRequestFullscreen;
        const p = req ? req.call(host) : null;
        if (p && typeof p.catch === "function") {
            p.catch(() => {
                // requestFullscreen 失败时恢复（例如未在用户手势触发等）
                restoreInlineBackground(host);
            });
        }
    } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
        const p = exit ? exit.call(document) : null;
        if (p && typeof p.catch === "function") p.catch(() => {});
    }
}

let _fsFixBound = false;

function installFullscreenBackgroundFix(host) {
    if (_fsFixBound) return;
    _fsFixBound = true;

    const onFsChange = () => {
        const el = getFullscreenElement();

        // 进入全屏：把进入前捕获到的背景应用到 inline（覆盖 :fullscreen 样式）
        if (el === host) {
            applyCapturedBackground(host);
        } else {
            // 退出全屏（包括按 ESC 退出）：恢复原本的 inline 背景
            restoreInlineBackground(host);
        }

        // 部分浏览器 fullscreenchange 不一定触发 window.resize，强制让 three 走一次 resize
        try {
            requestAnimationFrame(() => {
                window.dispatchEvent(new Event("resize"));
            });
        } catch {}
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    document.addEventListener("mozfullscreenchange", onFsChange);
    document.addEventListener("MSFullscreenChange", onFsChange);
}

function getFullscreenElement() {
    return document.fullscreenElement
        || document.webkitFullscreenElement
        || document.mozFullScreenElement
        || document.msFullscreenElement
        || null;
}

function capturePreFullscreenBackground(host) {
    // 仅保存一次“原始 inline”，避免反复覆盖
    if (!host.dataset.pbBgSaved) {
        host.dataset.pbBgSaved = "1";
        host.dataset.pbBgInline = host.style.background || "";
        host.dataset.pbBgImageInline = host.style.backgroundImage || "";
        host.dataset.pbBgColorInline = host.style.backgroundColor || "";
    }

    const cs = getComputedStyle(host);
    host.dataset.pbFsBgImage = cs.backgroundImage || "";
    host.dataset.pbFsBgColor = cs.backgroundColor || "";
}

function applyCapturedBackground(host) {
    // 如果捕获值为空，至少兜底一个不透明背景色，避免露出 backdrop 黑底
    const bgColor = host.dataset.pbFsBgColor || "";
    const bgImage = host.dataset.pbFsBgImage || "";

    // 先清空 background，避免 background-image/background-color 被 background 覆盖
    host.style.background = "";
    host.style.backgroundColor = isTransparentColor(bgColor) ? "var(--bg)" : bgColor;
    host.style.backgroundImage = bgImage && bgImage !== "none" ? bgImage : "";
}

function isTransparentColor(v) {
    if (!v) return true;
    const s = String(v).trim().toLowerCase();
    if (!s) return true;
    if (s === "transparent") return true;
    if (s.startsWith("rgba(")) {
        const m = s.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
        if (m) {
            const a = Number(m[4]);
            if (Number.isFinite(a) && a <= 0) return true;
        }
    }
    return false;
}

function restoreInlineBackground(host) {
    if (!host.dataset.pbBgSaved) return;

    host.style.background = host.dataset.pbBgInline || "";
    host.style.backgroundImage = host.dataset.pbBgImageInline || "";
    host.style.backgroundColor = host.dataset.pbBgColorInline || "";
}
