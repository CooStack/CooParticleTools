from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

from .config import ClientConfig
from .frontend import FrontendManager, FrontendResult
from .optimizer import OptimizationService
from .plugin_manager import PluginManager
from .project_store import ProjectStore
from .server import LocalServer
from .social import BilibiliStatService

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class LaunchInfo:
    url: str
    frontend: FrontendResult


class ClientRuntime:
    def __init__(self, config: ClientConfig):
        self.config = config
        self.frontend = FrontendManager(config.web_root, config.web_dist_dir, config.runtime_dir, config.node_binary)
        self.projects = ProjectStore(config.data_dir / "projects")
        self.plugins = PluginManager(config.plugin_dirs, config.data_dir, self.projects)
        self.social = BilibiliStatService(config.data_dir / "cache")
        self.optimizer = OptimizationService(self)
        self.server: LocalServer | None = None

    def start(self) -> LaunchInfo:
        self.config.data_dir.mkdir(parents=True, exist_ok=True)
        frontend_result = self.frontend.ensure_ready(rebuild=self.config.rebuild, skip_build=self.config.skip_build)
        self.plugins.reload()
        self.server = LocalServer(self)
        address = self.server.start(self.config.host, self.config.port)
        threading.Thread(target=self._prewarm_background, name="coo-particles-client-prewarm", daemon=True).start()
        return LaunchInfo(url=f"http://{address[0]}:{address[1]}/", frontend=frontend_result)

    def stop(self) -> None:
        if self.server:
            self.server.stop()
            self.server = None

    def _prewarm_background(self) -> None:
        try:
            self.optimizer.prewarm()
        except Exception as exc:
            LOGGER.debug("Background prewarm failed: %s", exc)
