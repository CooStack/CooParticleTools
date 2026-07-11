from __future__ import annotations

import re
from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sanitize_base_name(raw: object, fallback: str = "export") -> str:
    text = str(raw or "").strip()
    text = re.sub(r"[^a-zA-Z0-9_-]+", "-", text)
    return text or fallback


def build_kotlin_export(payload: dict) -> dict:
    tool = payload.get("tool")
    name = payload.get("name")
    filename = f"{sanitize_base_name(name or tool or 'project')}.kt"
    return {
        "tool": tool,
        "filename": filename,
        "content": str(payload.get("content") or ""),
        "generatedAt": now_iso(),
        "summary": f"Kotlin export generated for {tool or 'unknown'}.",
        "storageMode": "desktop",
    }
