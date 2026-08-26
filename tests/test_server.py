import json
import tempfile
import unittest
import urllib.request
from pathlib import Path
from types import SimpleNamespace

from coo_particles_client.config import ClientConfig
from coo_particles_client.optimizer import OptimizationService
from coo_particles_client.plugin_manager import PluginManager
from coo_particles_client.project_store import ProjectStore
from coo_particles_client.server import LocalServer, _cache_control_for


class DummySocial:
    def fetch(self):
        return {"follower": None, "following": None, "stale": True}


class ServerTests(unittest.TestCase):
    def test_local_asset_responses_are_revalidated(self):
        root = Path("C:/tmp/coo-particles-cache-test")
        for asset in (
            root / "assets" / "legacy" / "builder.js",
            root / "legacy" / "assets" / "composition_builder" / "js" / "main.js",
        ):
            self.assertEqual(_cache_control_for(asset, root), "no-cache")

    def test_health_and_project_api(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            web = root / "web"
            web.mkdir()
            (web / "index.html").write_text("<html>ok</html>", encoding="utf-8")
            config = ClientConfig(
                root_dir=root,
                data_dir=root / "data",
                runtime_dir=root / "runtime",
                web_dist_dir=web,
                web_root=None,
                plugin_dirs=(root / "plugins",),
            )
            runtime = SimpleNamespace(config=config)
            runtime.projects = ProjectStore(config.data_dir / "projects")
            runtime.plugins = PluginManager(config.plugin_dirs, config.data_dir, runtime.projects)
            runtime.plugins.reload()
            runtime.social = DummySocial()
            runtime.optimizer = OptimizationService(runtime)
            server = LocalServer(runtime)
            host, port = server.start("127.0.0.1", 39800)
            base = f"http://{host}:{port}"
            try:
                with urllib.request.urlopen(f"{base}/api/health", timeout=2) as response:
                    health = json.loads(response.read().decode("utf-8"))
                self.assertTrue(health["ok"])

                payload = json.dumps({"tool": "generator", "name": "Pulse", "payload": {"count": 4}}).encode("utf-8")
                request = urllib.request.Request(
                    f"{base}/api/projects/save",
                    data=payload,
                    method="POST",
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(request, timeout=2) as response:
                    saved = json.loads(response.read().decode("utf-8"))
                self.assertEqual(saved["tool"], "generator")

                with urllib.request.urlopen(f"{base}/api/projects?tool=generator", timeout=2) as response:
                    items = json.loads(response.read().decode("utf-8"))["items"]
                self.assertEqual(items[0]["id"], saved["id"])
            finally:
                server.stop()


if __name__ == "__main__":
    unittest.main()
