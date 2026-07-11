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


if __name__ == "__main__":
    unittest.main()
