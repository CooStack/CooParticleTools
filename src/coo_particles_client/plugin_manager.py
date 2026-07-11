from __future__ import annotations

import importlib.util
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Any, Callable

from .http_utils import HttpResult, json_result

Handler = Callable[["PluginRequest"], Any]


@dataclass(frozen=True)
class PluginRequest:
    method: str
    path: str
    query: dict[str, list[str]]
    body: Any
    headers: dict[str, str]
    plugin_data_dir: Path


@dataclass
class PluginInfo:
    id: str
    name: str
    version: str
    enabled: bool
    root: Path
    manifest: dict
    error: str | None = None
    routes: list[str] = field(default_factory=list)


class PluginContext:
    def __init__(self, manager: "PluginManager", plugin: PluginInfo):
        self._manager = manager
        self._plugin = plugin
        self.plugin_id = plugin.id
        self.data_dir = manager.data_dir / plugin.id
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.project_store = manager.project_store

    def route(self, method: str, path: str):
        def decorator(handler: Handler):
            self.add_route(method, path, handler)
            return handler

        return decorator

    def add_route(self, method: str, path: str, handler: Handler) -> None:
        self._manager.add_route(self._plugin.id, method, path, handler)
        self._plugin.routes.append(f"{method.upper()} {normalize_plugin_path(path)}")


class PluginManager:
    def __init__(self, plugin_dirs: tuple[Path, ...], data_dir: Path, project_store):
        self.plugin_dirs = plugin_dirs
        self.data_dir = data_dir / "plugin-data"
        self.project_store = project_store
        self._plugins: dict[str, PluginInfo] = {}
        self._routes: dict[tuple[str, str, str], Handler] = {}

    def reload(self) -> list[dict]:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._plugins = {}
        self._routes = {}
        for root in self._iter_plugin_roots():
            plugin = self._load_manifest(root)
            if not plugin:
                continue
            self._plugins[plugin.id] = plugin
            if plugin.enabled:
                self._load_entrypoint(plugin)
        return self.list_plugins()

    def list_plugins(self) -> list[dict]:
        return [
            {
                "id": plugin.id,
                "name": plugin.name,
                "version": plugin.version,
                "enabled": plugin.enabled,
                "root": str(plugin.root),
                "error": plugin.error,
                "routes": plugin.routes,
            }
            for plugin in sorted(self._plugins.values(), key=lambda item: item.id)
        ]

    def add_route(self, plugin_id: str, method: str, path: str, handler: Handler) -> None:
        self._routes[(plugin_id, method.upper(), normalize_plugin_path(path))] = handler

    def dispatch(
        self,
        method: str,
        plugin_id: str,
        path: str,
        query: dict[str, list[str]],
        body: Any,
        headers: dict[str, str],
    ) -> HttpResult | None:
        route_path = normalize_plugin_path(path)
        handler = self._routes.get((plugin_id, method.upper(), route_path))
        if not handler:
            return None

        request = PluginRequest(
            method=method.upper(),
            path=route_path,
            query=query,
            body=body,
            headers=headers,
            plugin_data_dir=self.data_dir / plugin_id,
        )
        return coerce_plugin_result(handler(request))

    def _iter_plugin_roots(self):
        seen = set()
        for plugin_dir in self.plugin_dirs:
            if not plugin_dir.exists():
                continue
            for child in sorted(plugin_dir.iterdir()):
                if not child.is_dir() or not (child / "plugin.json").exists():
                    continue
                resolved = child.resolve()
                if resolved in seen:
                    continue
                seen.add(resolved)
                yield child

    def _load_manifest(self, root: Path) -> PluginInfo | None:
        try:
            manifest = json.loads((root / "plugin.json").read_text(encoding="utf-8"))
        except Exception:
            return PluginInfo(
                id=safe_plugin_id(root.name),
                name=root.name,
                version="0.0.0",
                enabled=False,
                root=root,
                manifest={},
                error="Invalid plugin.json",
            )

        plugin_id = safe_plugin_id(manifest.get("id") or root.name)
        return PluginInfo(
            id=plugin_id,
            name=str(manifest.get("name") or plugin_id),
            version=str(manifest.get("version") or "0.0.0"),
            enabled=bool(manifest.get("enabled", True)),
            root=root,
            manifest=manifest,
        )

    def _load_entrypoint(self, plugin: PluginInfo) -> None:
        entrypoint = str(plugin.manifest.get("entrypoint") or "plugin.py")
        target = (plugin.root / entrypoint).resolve()
        try:
            if not _is_inside(target, plugin.root.resolve()):
                raise ValueError("Entrypoint escapes plugin root.")
            if not target.exists():
                return
            module = _load_module(f"coo_particles_plugin_{plugin.id.replace('-', '_')}", target)
            register = getattr(module, "register", None)
            if callable(register):
                register(PluginContext(self, plugin))
        except Exception as exc:
            plugin.error = str(exc)


def normalize_plugin_path(path: str) -> str:
    text = "/" + str(path or "").strip().lstrip("/")
    return text.rstrip("/") or "/"


def safe_plugin_id(raw: object) -> str:
    text = str(raw or "").strip().lower()
    text = re.sub(r"[^a-z0-9_.-]+", "-", text).strip("-")
    return text or "plugin"


def coerce_plugin_result(value: Any) -> HttpResult:
    if isinstance(value, HttpResult):
        return value
    if isinstance(value, tuple):
        if len(value) == 2:
            status, body = value
            return json_result(body, status=int(status))
        if len(value) == 3:
            status, headers, body = value
            return json_result(body, status=int(status), headers=dict(headers or {}))
    return json_result(value)


def _load_module(name: str, path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    if not spec or not spec.loader:
        raise ImportError(f"Cannot load plugin module at {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _is_inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False
