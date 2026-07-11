from __future__ import annotations

import mimetypes
import socket
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .catalog import list_templates, list_tools
from .exporter import build_kotlin_export
from .http_utils import HttpResult, json_result


class LocalServer:
    def __init__(self, runtime):
        self.runtime = runtime
        self.httpd: ThreadingHTTPServer | None = None
        self.thread: threading.Thread | None = None

    def start(self, host: str, preferred_port: int) -> tuple[str, int]:
        port = find_free_port(host, preferred_port)
        handler = make_handler(self.runtime)
        self.httpd = ThreadingHTTPServer((host, port), handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, name="coo-particles-client-http", daemon=True)
        self.thread.start()
        return host, port

    def stop(self) -> None:
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)


def find_free_port(host: str, preferred_port: int) -> int:
    for port in range(preferred_port, preferred_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind((host, port))
            except OSError:
                continue
            return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind((host, 0))
        return int(probe.getsockname()[1])


def make_handler(runtime):
    class CooToolsRequestHandler(BaseHTTPRequestHandler):
        server_version = "CooParticlesToolsClient/0.1"

        def do_OPTIONS(self):
            self.send_response(HTTPStatus.NO_CONTENT)
            self._send_common_headers()
            self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_HEAD(self):
            self._handle(send_body=False)

        def do_GET(self):
            self._handle()

        def do_POST(self):
            self._handle()

        def do_DELETE(self):
            self._handle()

        def log_message(self, format, *args):  # noqa: A002 - stdlib signature.
            return

        def _handle(self, send_body: bool = True):
            parsed = urlparse(self.path)
            if parsed.path == "/api" or parsed.path.startswith("/api/"):
                self._send_result(self._handle_api(parsed), send_body=send_body)
                return
            self._send_static(parsed.path, send_body=send_body)

        def _handle_api(self, parsed) -> HttpResult:
            path = parsed.path
            query = parse_qs(parsed.query, keep_blank_values=True)
            method = self.command.upper()
            body = self._read_json_body()

            try:
                if method == "GET" and path == "/api/health":
                    return json_result({"ok": True, "service": "coo-particles-client", "mode": "desktop"})

                if method == "GET" and path == "/api/catalog/tools":
                    return json_result({"items": list_tools()})

                if method == "GET" and path == "/api/catalog/templates":
                    return json_result({"items": list_templates(_first(query.get("tool")))})

                if method == "GET" and path == "/api/projects":
                    return json_result({"items": runtime.projects.list_projects({"tool": _first(query.get("tool")), "q": _first(query.get("q"))})})

                if method == "GET" and path == "/api/projects/recent/list":
                    return json_result({"items": runtime.projects.recent_projects()})

                if method == "POST" and path == "/api/projects/save":
                    return json_result(runtime.projects.save_project(body if isinstance(body, dict) else {}))

                project_match = _match_project_path(path)
                if project_match:
                    tool, project_id = project_match
                    if method == "GET":
                        item = runtime.projects.get_project(tool, project_id)
                        if not item:
                            return json_result({"message": "Project not found."}, status=404)
                        return json_result(item)
                    if method == "DELETE":
                        return json_result(runtime.projects.delete_project(tool, project_id))

                if method == "POST" and path == "/api/export/kotlin":
                    return json_result(build_kotlin_export(body if isinstance(body, dict) else {}))

                if method == "GET" and path == "/api/social/bilibili/stat":
                    return json_result(runtime.social.fetch())

                if method == "GET" and path == "/api/plugins":
                    return json_result({"items": runtime.plugins.list_plugins()})

                if method == "POST" and path == "/api/plugins/reload":
                    return json_result({"items": runtime.plugins.reload()})

                plugin_match = _match_plugin_path(path)
                if plugin_match:
                    plugin_id, plugin_path = plugin_match
                    result = runtime.plugins.dispatch(method, plugin_id, plugin_path, query, body, dict(self.headers))
                    if result:
                        return result
                    return json_result({"message": "Plugin route not found."}, status=404)

                if method == "GET" and path == "/api/local/status":
                    return json_result(
                        {
                            "dataDir": str(runtime.config.data_dir),
                            "webRoot": str(runtime.config.web_root) if runtime.config.web_root else None,
                            "webDist": str(runtime.config.web_dist_dir),
                        }
                    )

                if method == "GET" and path == "/api/optimize/status":
                    return json_result(runtime.optimizer.status())

                if method == "POST" and path == "/api/optimize/prewarm":
                    return json_result(runtime.optimizer.prewarm())

                return json_result({"message": "API route not found."}, status=404)
            except ValueError as exc:
                return json_result({"message": str(exc)}, status=400)
            except Exception as exc:
                return json_result({"message": str(exc)}, status=500)

        def _read_json_body(self):
            length = int(self.headers.get("Content-Length") or "0")
            if length <= 0:
                return {}
            raw = self.rfile.read(length)
            if not raw:
                return {}
            import json

            try:
                return json.loads(raw.decode("utf-8"))
            except Exception:
                return {}

        def _send_result(self, result: HttpResult, send_body: bool = True) -> None:
            data = result.to_bytes()
            self.send_response(result.status)
            self._send_common_headers()
            self.send_header("Content-Type", result.content_type)
            for key, value in result.headers.items():
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if send_body:
                self.wfile.write(data)

        def _send_static(self, request_path: str, send_body: bool = True) -> None:
            root = runtime.config.web_dist_dir.resolve()
            relative = unquote(request_path).lstrip("/")
            target = (root / relative).resolve() if relative else root / "index.html"

            if not _is_inside(target, root):
                self._send_result(json_result({"message": "Forbidden."}, status=403), send_body=send_body)
                return

            if target.is_dir():
                target = target / "index.html"
            if not target.exists() or not target.is_file():
                target = root / "index.html"
            if not target.exists():
                self._send_result(json_result({"message": "Frontend build is missing."}, status=503), send_body=send_body)
                return

            stat = target.stat()
            etag = f'W/"{stat.st_mtime_ns:x}-{stat.st_size:x}"'
            if self.headers.get("If-None-Match") == etag:
                self.send_response(HTTPStatus.NOT_MODIFIED)
                self._send_common_headers()
                self.send_header("ETag", etag)
                self.end_headers()
                return

            content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
            data = target.read_bytes() if send_body else b""
            self.send_response(HTTPStatus.OK)
            self._send_common_headers()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(stat.st_size))
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", _cache_control_for(target, root))
            self.end_headers()
            if send_body:
                self.wfile.write(data)

        def _send_common_headers(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cross-Origin-Opener-Policy", "same-origin-allow-popups")

    return CooToolsRequestHandler


def _first(values):
    if not values:
        return ""
    return values[0]


def _match_project_path(path: str) -> tuple[str, str] | None:
    prefix = "/api/projects/"
    if not path.startswith(prefix):
        return None
    rest = path[len(prefix) :]
    if "/" not in rest or rest == "recent/list":
        return None
    tool, project_id = rest.split("/", 1)
    return unquote(tool), unquote(project_id)


def _match_plugin_path(path: str) -> tuple[str, str] | None:
    prefix = "/api/plugins/"
    if not path.startswith(prefix):
        return None
    rest = path[len(prefix) :]
    if not rest or "/" not in rest:
        return None
    plugin_id, plugin_path = rest.split("/", 1)
    return unquote(plugin_id), "/" + unquote(plugin_path)


def _is_inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _cache_control_for(path: Path, root: Path) -> str:
    try:
        relative = path.relative_to(root).as_posix()
    except ValueError:
        return "no-store"
    if relative == "index.html" or relative.endswith(".html"):
        return "no-cache"
    if relative.startswith("assets/"):
        return "public, max-age=31536000, immutable"
    return "public, max-age=600"
