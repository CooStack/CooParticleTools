from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path


class OptimizationService:
    def __init__(self, runtime):
        self.runtime = runtime
        self._asset_snapshot = None

    def status(self) -> dict:
        return {
            "webDistReady": (self.runtime.config.web_dist_dir / "index.html").exists(),
            "webDist": str(self.runtime.config.web_dist_dir),
            "dataDir": str(self.runtime.config.data_dir),
            "projectCount": self.runtime.projects.count(),
            "plugins": self.runtime.plugins.list_plugins(),
            "assetSnapshot": self._asset_snapshot,
            "generatedAt": _now_iso(),
        }

    def prewarm(self) -> dict:
        self.runtime.projects.list_projects({})
        self.runtime.plugins.reload()
        self._asset_snapshot = self._scan_assets(self.runtime.config.web_dist_dir)
        return {
            "ok": True,
            "projectCount": self.runtime.projects.count(),
            "pluginCount": len(self.runtime.plugins.list_plugins()),
            "assetSnapshot": self._asset_snapshot,
            "generatedAt": _now_iso(),
        }

    @staticmethod
    def _scan_assets(root: Path) -> dict:
        count = 0
        total_size = 0
        largest = []
        if root.exists():
            for path in root.rglob("*"):
                if not path.is_file():
                    continue
                try:
                    size = path.stat().st_size
                except OSError:
                    continue
                count += 1
                total_size += size
                largest.append({"path": path.relative_to(root).as_posix(), "bytes": size})
        largest.sort(key=lambda item: item["bytes"], reverse=True)
        return {"files": count, "bytes": total_size, "largest": largest[:8]}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
