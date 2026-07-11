from __future__ import annotations

import argparse
import logging
import signal
import sys
import time
from pathlib import Path

from .config import ClientConfig
from .desktop import open_client_window
from .runtime import ClientRuntime


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Launch the CooParticlesAPI Tools local client.")
    parser.add_argument("--web-root", type=Path, help="Path to the migrated web app root. Defaults to apps/web.")
    parser.add_argument("--blogs-root", type=Path, help="Deprecated alias for an external blogs repository root.")
    parser.add_argument("--data-dir", type=Path, help="Directory for local projects, plugins, and cache data.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host for the local HTTP server.")
    parser.add_argument("--port", type=int, default=3001, help="Preferred bind port.")
    parser.add_argument("--node", type=Path, help="Path to node.exe when Node.js is not on PATH.")
    parser.add_argument("--rebuild", action="store_true", help="Force rebuild of the Vue frontend into runtime/web-dist.")
    parser.add_argument("--skip-build", action="store_true", help="Skip frontend build and use existing dist if available.")
    parser.add_argument("--headless", action="store_true", help="Only run the local server.")
    parser.add_argument("--browser", action="store_true", help="Open in the system browser instead of pywebview.")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    config = ClientConfig.from_args(args)
    runtime = ClientRuntime(config)

    try:
        launch = runtime.start()
    except Exception as exc:  # pragma: no cover - startup errors are printed for CLI users.
        logging.getLogger(__name__).error("Failed to start local client: %s", exc)
        if args.log_level == "DEBUG":
            raise
        return 1

    print(f"CooParticlesAPI Tools client is running at {launch.url}")
    if launch.frontend.message:
        print(launch.frontend.message)

    should_stop = False

    def _request_stop(_signum, _frame):
        nonlocal should_stop
        should_stop = True

    signal.signal(signal.SIGINT, _request_stop)
    signal.signal(signal.SIGTERM, _request_stop)

    try:
        if args.headless:
            while not should_stop:
                time.sleep(0.2)
        else:
            open_client_window(launch.url, prefer_browser=args.browser)
    finally:
        runtime.stop()

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
