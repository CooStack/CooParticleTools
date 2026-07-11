from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

APP_NAME = "CooParticlesAPITools"


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def default_web_root() -> Path | None:
    configured = os.environ.get("COO_PARTICLES_WEB_ROOT")
    if configured:
        return Path(configured).expanduser()

    candidates = [
        project_root() / "apps" / "web",
    ]
    for candidate in candidates:
        if (candidate / "package.json").exists():
            return candidate

    legacy_configured = os.environ.get("COO_PARTICLES_BLOGS_ROOT") or os.environ.get("BLOGS_ROOT")
    if legacy_configured:
        legacy = Path(legacy_configured).expanduser()
        if (legacy / "apps" / "web" / "package.json").exists():
            return legacy / "apps" / "web"
    return None


def default_data_dir() -> Path:
    configured = os.environ.get("COO_PARTICLES_CLIENT_DATA_DIR")
    if configured:
        return Path(configured).expanduser()

    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / APP_NAME
    return Path.home() / ".coo-particles-api-tools"


def default_node_binary() -> Path | None:
    configured = os.environ.get("COO_PARTICLES_NODE") or os.environ.get("NODE_BINARY")
    return Path(configured).expanduser() if configured else None


@dataclass(frozen=True)
class ClientConfig:
    root_dir: Path
    data_dir: Path
    runtime_dir: Path
    web_dist_dir: Path
    web_root: Path | None
    plugin_dirs: tuple[Path, ...]
    node_binary: Path | None = None
    host: str = "127.0.0.1"
    port: int = 3001
    rebuild: bool = False
    skip_build: bool = False

    @classmethod
    def from_args(cls, args) -> "ClientConfig":
        root = project_root()
        data = (args.data_dir or default_data_dir()).resolve()
        runtime = root / "runtime"
        web_root = args.web_root if args.web_root else default_web_root()
        if web_root is None and args.blogs_root:
            web_root = args.blogs_root / "apps" / "web"
        if web_root is not None:
            web_root = web_root.expanduser().resolve()
        node_binary = args.node if args.node else default_node_binary()
        if node_binary is not None:
            node_binary = node_binary.expanduser().resolve()

        return cls(
            root_dir=root,
            data_dir=data,
            runtime_dir=runtime,
            web_dist_dir=runtime / "web-dist",
            web_root=web_root,
            plugin_dirs=(root / "plugins", data / "plugins"),
            node_binary=node_binary,
            host=args.host,
            port=args.port,
            rebuild=bool(args.rebuild),
            skip_build=bool(args.skip_build),
        )
