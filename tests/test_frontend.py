from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from coo_particles_client.frontend import FrontendManager


class FrontendManagerTests(unittest.TestCase):
    def test_source_signature_tracks_entry_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            web_root = root / "web"
            web_root.mkdir()
            entry = web_root / "index.html"
            entry.write_text("<title>before</title>", encoding="utf-8")
            manager = FrontendManager(web_root, root / "dist", root / "runtime")

            before = manager._source_signature()
            entry.write_text("<title>after</title>", encoding="utf-8")
            after = manager._source_signature()

            self.assertNotEqual(before["hash"], after["hash"])

    def test_cache_hit_refreshes_public_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            web_root = root / "web"
            public_legacy = web_root / "public" / "legacy" / "nested"
            public_legacy.mkdir(parents=True)
            (web_root / "index.html").write_text("<title>app</title>", encoding="utf-8")
            source_file = public_legacy / "preview.js"
            source_file.write_text("new", encoding="utf-8")
            (public_legacy.parent / "conflict").mkdir()
            (public_legacy.parent / "conflict" / "next.js").write_text("next", encoding="utf-8")

            target = root / "dist"
            target.mkdir()
            (target / "index.html").write_text("<title>app</title>", encoding="utf-8")
            target_file = target / "legacy" / "nested" / "preview.js"
            target_file.parent.mkdir(parents=True)
            target_file.write_text("old", encoding="utf-8")
            (target / "legacy" / "stale.js").write_text("stale", encoding="utf-8")
            (target / "legacy" / "conflict").write_text("old conflict", encoding="utf-8")

            manager = FrontendManager(web_root, target, root / "runtime")
            manager.runtime_dir.mkdir()
            signature = manager._source_signature()
            manager._write_cache(signature, source="source-dist")

            result = manager.ensure_ready(skip_build=True)

            self.assertEqual(result.source, "cache")
            self.assertEqual(target_file.read_text(encoding="utf-8"), "new")
            self.assertFalse((target / "legacy" / "stale.js").exists())
            self.assertEqual(
                (target / "legacy" / "conflict" / "next.js").read_text(encoding="utf-8"),
                "next",
            )

            manager.cache_file.write_text("{}", encoding="utf-8")
            result = manager.ensure_ready(skip_build=True)
            self.assertEqual(result.source, "existing-target")


if __name__ == "__main__":
    unittest.main()
