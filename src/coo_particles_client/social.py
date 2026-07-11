from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BILIBILI_RELATION_URL = "https://api.bilibili.com/x/relation/stat?vmid=291397844"


class BilibiliStatService:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_file = cache_dir / "bilibili-stat.json"

    def fetch(self) -> dict:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        try:
            stat = self._fetch_remote()
            self.cache_file.write_text(json.dumps(stat, ensure_ascii=True, indent=2), encoding="utf-8")
            return stat
        except Exception as exc:
            cached = self._read_cache()
            if cached:
                cached["stale"] = True
                cached["error"] = str(exc)
                return cached
            return {"follower": None, "following": None, "stale": True, "error": str(exc), "updatedAt": _now_iso()}

    def _fetch_remote(self) -> dict:
        request = urllib.request.Request(BILIBILI_RELATION_URL, headers={"Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=2.0) as response:
            if response.status >= 400:
                raise urllib.error.HTTPError(BILIBILI_RELATION_URL, response.status, "request failed", response.headers, None)
            payload = json.loads(response.read().decode("utf-8"))
        follower = payload.get("data", {}).get("follower")
        following = payload.get("data", {}).get("following")
        if not isinstance(follower, int):
            raise ValueError("Bilibili stat response did not contain follower.")
        return {
            "follower": follower,
            "following": following if isinstance(following, int) else None,
            "stale": False,
            "updatedAt": _now_iso(),
        }

    def _read_cache(self) -> dict | None:
        try:
            data = json.loads(self.cache_file.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else None
        except Exception:
            return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
