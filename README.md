# CooParticlesAPI Tools Client

Local Electron client for the migrated CooParticlesAPI composition and generator
tools. The migrated web app lives in `apps/web`; the Python runtime serves it
locally, provides compatible APIs for projects and exports, and leaves a small
plugin surface for local extensions. Electron launches that Python runtime inside
a desktop window.

## Quick Start

Run the Electron shell:

```powershell
cd D:\CodeSources\web\CooParticlesAPITools
py scripts\run_electron.py
```

Normal desktop use starts from this Python launcher. It prepares Node/Electron,
then Electron starts the Python runtime inside the desktop window.

If you prefer package scripts:

```powershell
npm run electron
```

## Electron Shell

The Electron shell is in `apps/electron`. It starts the Python backend, waits for
`/api/health`, then opens the local app in a native Electron window.
Electron 43 requires Node.js 22.12 or newer.

The window launches into the project index. New projects choose an editor type,
and opened JSON files are routed to the matching editor. Native menus provide
project new/open/save/save-as, Kotlin export, recent files, plugins, reload,
DevTools, zoom, and fullscreen controls.

```powershell
cd D:\CodeSources\web\CooParticlesAPITools
py scripts\run_electron.py
```

Equivalent manual commands:

```powershell
cd D:\CodeSources\web\CooParticlesAPITools\apps\electron
npm install
$env:COO_PARTICLES_WEB_ROOT = "D:\CodeSources\web\CooParticlesAPITools\apps\web"
$env:COO_PARTICLES_PYTHON = "py"
npm run dev
```

`pnpm install` / `pnpm run dev` also works.

Optional Electron shell environment:

```powershell
$env:COO_PARTICLES_REBUILD = "1"
$env:COO_PARTICLES_SKIP_BUILD = "1"
$env:COO_PARTICLES_WEB_ROOT = "D:\CodeSources\web\CooParticlesAPITools\apps\web"
$env:COO_PARTICLES_NODE = "C:\Path\To\node.exe"
$env:COO_PARTICLES_PORT = "39920"
```

If Node is installed but not on `PATH`, pass it to the launcher:

```powershell
py scripts\run_electron.py --node "C:\Path\To\node.exe"
```

Electron now rebuilds the frontend when the source signature changes. Set
`COO_PARTICLES_SKIP_BUILD=1` only when an existing frontend build should be
used unchanged.

If Electron binary download is slow or blocked, configure an Electron mirror
before running the launcher:

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
```

## Python Runtime

The Python app still provides the local HTTP runtime used by Electron. You can
run it directly for debugging:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .
```

Useful runtime modes:

```powershell
python -m coo_particles_client --headless
python -m coo_particles_client --browser
python -m coo_particles_client --skip-build
python -m coo_particles_client --node C:\Path\To\node.exe --rebuild
```

By default the server tries `http://127.0.0.1:3001`. If the port is busy, it
uses the next free port.

## What This Provides

- A Python local runtime around the existing Vue tools.
- A local static server with history fallback for the Vue router.
- Compatible `/api/projects`, `/api/catalog`, `/api/export`, `/api/health`, and
  `/api/social/bilibili/stat` endpoints.
- Local project persistence under the user data directory.
- Frontend build caching with local-client environment variables.
- Static asset cache headers for local runtime performance.
- Plugin discovery from `plugins/` and the user data plugin directory.
- Optimization endpoints for prewarming indexes and asset metadata.

## Data And Runtime Paths

Runtime build output is written to `runtime/web-dist`.

User data defaults to:

```text
%LOCALAPPDATA%\CooParticlesAPITools
```

Override with:

```powershell
$env:COO_PARTICLES_CLIENT_DATA_DIR = "D:\Somewhere\CooParticlesToolsData"
$env:COO_PARTICLES_WEB_ROOT = "D:\CodeSources\web\CooParticlesAPITools\apps\web"
$env:COO_PARTICLES_NODE = "C:\Path\To\node.exe"
```

## Plugin Shape

Create a folder under `plugins/` or under the user data `plugins/` directory:

```text
plugins/my-plugin/
  plugin.json
  plugin.py
```

`plugin.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "enabled": true,
  "entrypoint": "plugin.py"
}
```

`plugin.py`:
  
```python
def register(context):
    @context.route("GET", "/ping")
    def ping(request):
        return {"ok": True, "plugin": context.plugin_id}
```

The route is exposed as:

```text
GET /api/plugins/my-plugin/ping
```

## Verification

```powershell
py -m unittest discover
```
