from __future__ import annotations

import json
import os
import random
import re
import string
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ProjectStore:
    def __init__(self, root: Path):
        self.root = root
        self.index_file = root / "index.json"
        self._lock = threading.RLock()

    def list_projects(self, options: dict | None = None) -> list[dict]:
        options = options or {}
        tool = str(options.get("tool") or "").strip()
        keyword = str(options.get("q") or "").strip().lower()
        with self._lock:
            items = list(self._read_index())
        if tool:
            items = [item for item in items if item.get("tool") == tool]
        if keyword:
            items = [
                item
                for item in items
                if any(keyword in str(item.get(field) or "").lower() for field in ("name", "description", "tool"))
            ]
        return sorted(items, key=lambda item: str(item.get("updatedAt") or ""), reverse=True)

    def recent_projects(self, limit: int = 8) -> list[dict]:
        return self.list_projects({})[:limit]

    def get_project(self, tool: str, project_id: str) -> dict | None:
        path = self._project_file(tool, project_id)
        with self._lock:
            return _read_json(path, None)

    def save_project(self, payload: dict[str, Any]) -> dict:
        tool = str(payload.get("tool") or "").strip()
        if not tool:
            raise ValueError("tool cannot be empty")

        project_id = str(payload.get("id") or make_id())
        now = now_iso()
        with self._lock:
            current = self.get_project(tool, project_id)
            file_path = str(payload.get("filePath") or (current or {}).get("filePath") or "").strip()
            project = {
                "id": project_id,
                "tool": tool,
                "name": str(payload.get("name") or "Untitled Project").strip(),
                "description": str(payload.get("description") or "").strip(),
                "tags": payload.get("tags") if isinstance(payload.get("tags"), list) else [],
                "filePath": file_path,
                "payload": payload.get("payload") or {},
                "createdAt": (current or {}).get("createdAt") or now,
                "updatedAt": now,
                "storageMode": "desktop",
            }
            self.root.mkdir(parents=True, exist_ok=True)
            _write_json_atomic(self._project_file(tool, project_id), project)

            metadata = {
                key: project[key]
                for key in ("id", "tool", "name", "description", "tags", "filePath", "createdAt", "updatedAt", "storageMode")
            }
            index = [
                item
                for item in self._read_index()
                if not (item.get("tool") == tool and item.get("id") == project_id)
            ]
            index.append(metadata)
            _write_json_atomic(self.index_file, index)
            return project

    def delete_project(self, tool: str, project_id: str) -> dict:
        with self._lock:
            target = self._project_file(tool, project_id)
            try:
                target.unlink()
            except FileNotFoundError:
                pass
            index = [
                item
                for item in self._read_index()
                if not (item.get("tool") == tool and item.get("id") == project_id)
            ]
            _write_json_atomic(self.index_file, index)
        return {"ok": True}

    def count(self) -> int:
        with self._lock:
            return len(self._read_index())

    def _read_index(self) -> list[dict]:
        self.root.mkdir(parents=True, exist_ok=True)
        data = _read_json(self.index_file, [])
        return data if isinstance(data, list) else []

    def _project_file(self, tool: str, project_id: str) -> Path:
        return self.root / f"{safe_file_part(tool)}--{safe_file_part(project_id)}.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def make_id() -> str:
    suffix = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(8))
    millis = int(datetime.now(timezone.utc).timestamp() * 1000)
    return f"proj_{suffix}{base36(millis)}"


def base36(number: int) -> str:
    chars = string.digits + string.ascii_lowercase
    if number == 0:
        return "0"
    result = ""
    while number:
        number, index = divmod(number, 36)
        result = chars[index] + result
    return result


def safe_file_part(raw: object) -> str:
    text = str(raw or "").strip()
    text = re.sub(r"[^a-zA-Z0-9_.-]+", "_", text)
    return text or "item"


def _read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return fallback
    except json.JSONDecodeError:
        return fallback


def _write_json_atomic(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)
