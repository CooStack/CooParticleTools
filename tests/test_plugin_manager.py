import json
import tempfile
import unittest
from pathlib import Path

from coo_particles_client.plugin_manager import PluginManager


class DummyProjectStore:
    pass


class PluginManagerTests(unittest.TestCase):
    def test_loads_plugin_route(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            plugin = root / "plugins" / "sample"
            plugin.mkdir(parents=True)
            (plugin / "plugin.json").write_text(
                json.dumps({"id": "sample", "name": "Sample", "enabled": True, "entrypoint": "plugin.py"}),
                encoding="utf-8",
            )
            (plugin / "plugin.py").write_text(
                "def register(context):\n"
                "    @context.route('GET', '/ping')\n"
                "    def ping(request):\n"
                "        return {'ok': True, 'query': request.query}\n",
                encoding="utf-8",
            )

            manager = PluginManager((root / "plugins",), root / "data", DummyProjectStore())
            plugins = manager.reload()
            result = manager.dispatch("GET", "sample", "/ping", {"x": ["1"]}, {}, {})

            self.assertEqual(plugins[0]["id"], "sample")
            self.assertIsNotNone(result)
            self.assertEqual(result.body["ok"], True)
            self.assertEqual(result.body["query"]["x"], ["1"])


if __name__ == "__main__":
    unittest.main()
