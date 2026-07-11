from __future__ import annotations

import logging
import webbrowser

LOGGER = logging.getLogger(__name__)


def open_client_window(url: str, prefer_browser: bool = False) -> None:
    if prefer_browser:
        webbrowser.open(url)
        _wait_for_enter()
        return

    try:
        import webview  # type: ignore
    except Exception:
        LOGGER.info("pywebview is not installed; opening the system browser.")
        webbrowser.open(url)
        _wait_for_enter()
        return

    window = webview.create_window(
        "CooParticlesAPI Tools",
        url,
        width=1480,
        height=940,
        min_size=(1120, 720),
    )
    webview.start()
    del window


def _wait_for_enter() -> None:
    try:
        input("Press Enter to stop the local client...\n")
    except EOFError:
        return
