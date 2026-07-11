from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Launch the Electron shell.")
    parser.add_argument("--web-root", "-WebRoot", type=Path, default=None)
    parser.add_argument("--blogs-root", "-BlogsRoot", type=Path, default=None)
    parser.add_argument("--python", "-Python", default=sys.executable)
    parser.add_argument("--node", "-Node", type=Path, default=None)
    parser.add_argument("--port", "-Port", type=int, default=0)
    parser.add_argument("--rebuild", "-Rebuild", action="store_true")
    return parser


def codex_runtime_root() -> Path:
    return Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies"


def prepend_path(env: dict[str, str], directory: Path) -> None:
    current = env.get("PATH", "")
    env["PATH"] = f"{directory}{os.pathsep}{current}" if current else str(directory)


def resolve_node(args: argparse.Namespace, env: dict[str, str]) -> Path | None:
    node = args.node
    if node is None:
        local_node = Path("D:/nodejs/node.exe")
        if local_node.exists():
            node = local_node
    codex_node = codex_runtime_root() / "node" / "bin" / "node.exe"
    if node is None and codex_node.exists():
        node = codex_node
    if node is None:
        return None
    resolved = node.expanduser().resolve()
    if not resolved.exists():
        raise FileNotFoundError(f"Node executable was not found: {resolved}")
    prepend_path(env, resolved.parent)
    return resolved


def find_package_manager(env: dict[str, str]) -> str:
    for name in ("npm", "pnpm"):
        path = shutil.which(name, path=env.get("PATH"))
        if path:
            return path

    codex_pnpm = codex_runtime_root() / "bin" / "pnpm.cmd"
    if codex_pnpm.exists():
        prepend_path(env, codex_pnpm.parent)
        return str(codex_pnpm)

    raise FileNotFoundError(
        "Neither npm nor pnpm was found. Install Node.js first, or pass --node C:\\Path\\To\\node.exe."
    )


def run(command: list[str], *, cwd: Path, env: dict[str, str]) -> None:
    print(f"[run-electron] {cwd}> {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=cwd, env=env, check=True)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    root = repo_root()
    electron_root = root / "apps" / "electron"
    web_root = (args.web_root or root / "apps" / "web").expanduser().resolve()
    if not (web_root / "package.json").exists():
        raise FileNotFoundError(f"Web app root was not found: {web_root}")

    env = os.environ.copy()
    node = resolve_node(args, env)
    package_manager = find_package_manager(env)

    electron_package = electron_root / "node_modules" / "electron"
    if not electron_package.exists():
        run([package_manager, "install"], cwd=electron_root, env=env)

    env["COO_PARTICLES_WEB_ROOT"] = str(web_root)
    if args.blogs_root:
        env["COO_PARTICLES_BLOGS_ROOT"] = str(args.blogs_root.expanduser().resolve())
    else:
        env.pop("COO_PARTICLES_BLOGS_ROOT", None)

    env["COO_PARTICLES_PYTHON"] = str(args.python)
    if node:
        env["COO_PARTICLES_NODE"] = str(node)
    if args.port > 0:
        env["COO_PARTICLES_PORT"] = str(args.port)
    else:
        env.pop("COO_PARTICLES_PORT", None)

    if args.rebuild:
        vite_bin = web_root / "node_modules" / "vite" / "bin" / "vite.js"
        if not vite_bin.exists():
            run([package_manager, "install"], cwd=web_root, env=env)
        env["COO_PARTICLES_REBUILD"] = "1"
    else:
        env.pop("COO_PARTICLES_REBUILD", None)

    run([package_manager, "run", "ensure"], cwd=electron_root, env=env)
    run([package_manager, "run", "dev"], cwd=electron_root, env=env)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
