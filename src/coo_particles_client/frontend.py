from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class FrontendResult:
    dist_dir: Path
    built: bool
    source: str
    message: str = ""


class FrontendManager:
    def __init__(self, web_root: Path | None, target_dist: Path, runtime_dir: Path, node_binary: Path | None = None):
        self.web_root = web_root
        self.target_dist = target_dist
        self.runtime_dir = runtime_dir
        self.node_binary = node_binary
        self.cache_file = runtime_dir / "frontend-cache.json"

    def ensure_ready(self, *, rebuild: bool = False, skip_build: bool = False) -> FrontendResult:
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        signature = self._source_signature()

        if not rebuild and self._target_index().exists() and self._cache_matches(signature):
            return FrontendResult(self.target_dist, built=False, source="cache")

        if not skip_build and self.web_root:
            try:
                self._build_with_vite()
                self._write_cache(signature, source="vite")
                return FrontendResult(self.target_dist, built=True, source="vite")
            except Exception as exc:
                LOGGER.warning("Frontend build failed: %s", exc)

        if self.web_root:
            source_dist = self.web_root / "dist"
            if (source_dist / "index.html").exists():
                self._copy_dist(source_dist, self.target_dist)
                self._write_cache(signature, source="source-dist")
                return FrontendResult(
                    self.target_dist,
                    built=False,
                    source="source-dist",
                    message="Copied existing apps/web/dist. For best API routing, run again with --rebuild.",
                )

        if self._target_index().exists():
            return FrontendResult(
                self.target_dist,
                built=False,
                source="existing-target",
                message="Using existing runtime/web-dist because build was skipped or failed.",
            )

        raise FileNotFoundError(
            "No frontend dist is available. Ensure apps/web exists and run without --skip-build, or build apps/web first."
        )

    def _target_index(self) -> Path:
        return self.target_dist / "index.html"

    def _build_with_vite(self) -> None:
        if not self.web_root:
            raise FileNotFoundError("web_root is not configured.")

        if not (self.web_root / "package.json").exists():
            raise FileNotFoundError(f"Missing web package.json under {self.web_root}")

        node = self._resolve_node()
        if not node:
            raise FileNotFoundError("node executable was not found on PATH.")

        vite_bin = self._find_vite_bin()
        if not vite_bin:
            raise FileNotFoundError("vite/bin/vite.js was not found. Run npm install in apps/web.")

        self.target_dist.mkdir(parents=True, exist_ok=True)
        env = os.environ.copy()
        env.update(
            {
                "VITE_DEPLOY_TARGET": "local",
                "VITE_APP_BASE": "/",
                "VITE_ROUTER_MODE": "history",
                "VITE_PROJECT_REPOSITORY_MODE": "server",
                "VITE_API_BASE_URL": "/api",
            }
        )

        command = [
            node,
            str(vite_bin),
            "build",
            "--outDir",
            str(self.target_dist),
            "--emptyOutDir",
            "true",
        ]
        LOGGER.info("Building frontend with Vite into %s", self.target_dist)
        subprocess.run(command, cwd=self.web_root, env=env, check=True)

    def _resolve_node(self) -> str | None:
        if self.node_binary:
            if self.node_binary.exists():
                return str(self.node_binary)
            raise FileNotFoundError(f"Configured node binary does not exist: {self.node_binary}")
        return shutil.which("node")

    def _find_vite_bin(self) -> Path | None:
        if not self.web_root:
            return None
        candidates = [
            self.web_root / "node_modules" / "vite" / "bin" / "vite.js",
            self.web_root.parent.parent / "node_modules" / "vite" / "bin" / "vite.js",
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return None

    def _source_signature(self) -> dict:
        if not self.web_root:
            return {"source": None}

        roots = [
            self.web_root / "index.html",
            self.web_root / "package.json",
            self.web_root / "vite.config.js",
            self.web_root / "src",
            self.web_root / "public",
            self.web_root / "package-lock.json",
            self.web_root / "pnpm-lock.yaml",
        ]
        digest = hashlib.sha256()
        file_count = 0
        total_size = 0

        for root in roots:
            if not root.exists():
                continue
            if root.is_file():
                files = [root]
            else:
                files = sorted(path for path in root.rglob("*") if path.is_file())
            for path in files:
                try:
                    stat = path.stat()
                except OSError:
                    continue
                rel = path.relative_to(self.web_root).as_posix()
                digest.update(rel.encode("utf-8"))
                digest.update(str(stat.st_size).encode("ascii"))
                digest.update(str(stat.st_mtime_ns).encode("ascii"))
                file_count += 1
                total_size += stat.st_size

        return {
            "source": str(self.web_root),
            "hash": digest.hexdigest(),
            "files": file_count,
            "bytes": total_size,
            "env": {
                "VITE_API_BASE_URL": "/api",
                "VITE_PROJECT_REPOSITORY_MODE": "server",
                "VITE_ROUTER_MODE": "history",
            },
        }

    def _cache_matches(self, signature: dict) -> bool:
        try:
            data = json.loads(self.cache_file.read_text(encoding="utf-8"))
        except Exception:
            return False
        return data.get("signature") == signature

    def _write_cache(self, signature: dict, *, source: str) -> None:
        payload = {
            "signature": signature,
            "source": source,
            "distDir": str(self.target_dist),
            "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        self.cache_file.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")

    @staticmethod
    def _copy_dist(source: Path, target: Path) -> None:
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)
