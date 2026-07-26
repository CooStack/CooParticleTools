import tempfile
import unittest
from pathlib import Path

from coo_particles_client.project_store import ProjectStore


class ProjectStoreTests(unittest.TestCase):
    def test_save_list_get_and_delete_project(self):
        with tempfile.TemporaryDirectory() as temp:
            store = ProjectStore(Path(temp) / "projects")

            saved = store.save_project(
                {
                    "tool": "composition",
                    "name": "Meteorite",
                    "description": "Trail composition",
                    "tags": ["demo"],
                    "filePath": "D:/particles/Meteorite.json",
                    "payload": {"cards": []},
                }
            )

            self.assertEqual(saved["tool"], "composition")
            self.assertEqual(saved["storageMode"], "desktop")
            self.assertEqual(saved["filePath"], "D:/particles/Meteorite.json")
            self.assertEqual(len(store.list_projects({"tool": "composition"})), 1)
            self.assertEqual(store.list_projects({"tool": "composition"})[0]["filePath"], "D:/particles/Meteorite.json")
            self.assertEqual(store.list_projects({"q": "meteor"})[0]["id"], saved["id"])
            self.assertEqual(store.get_project("composition", saved["id"])["payload"], {"cards": []})
            self.assertEqual(store.recent_projects(1)[0]["id"], saved["id"])

            result = store.delete_project("composition", saved["id"])
            self.assertEqual(result, {"ok": True})
            self.assertEqual(store.list_projects({}), [])

    def test_rejects_missing_tool(self):
        with tempfile.TemporaryDirectory() as temp:
            store = ProjectStore(Path(temp) / "projects")
            with self.assertRaises(ValueError):
                store.save_project({"name": "No Tool"})


if __name__ == "__main__":
    unittest.main()
