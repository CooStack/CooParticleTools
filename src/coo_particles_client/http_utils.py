from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class HttpResult:
    body: Any = None
    status: int = 200
    headers: dict[str, str] = field(default_factory=dict)
    content_type: str = "application/json; charset=utf-8"

    def to_bytes(self) -> bytes:
        if isinstance(self.body, bytes):
            return self.body
        if self.content_type.startswith("application/json"):
            return json.dumps(self.body if self.body is not None else {}, ensure_ascii=False).encode("utf-8")
        return str(self.body or "").encode("utf-8")


def json_result(body: Any, status: int = 200, headers: dict[str, str] | None = None) -> HttpResult:
    return HttpResult(body=body, status=status, headers=headers or {})
