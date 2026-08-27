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

也可以直接运行根目录入口：

```powershell
python run_electron.py
```

这个入口只用于开发调试：它准备 Node/Electron，然后启动源码 Python
运行时。发布版不需要执行 Python 脚本。

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

## Windows 安装包

先安装构建依赖：

```powershell
py -m pip install -r requirements-build.txt
cd apps\electron
pnpm install
```

生成 Windows NSIS 安装包：

```powershell
.\scripts\package-windows.ps1
```

也可以双击 `scripts\package-windows.bat`，或在已安装 pnpm 的环境中运行：

```powershell
npm run package:win
```

`npm run package:win` 只是调用外层脚本，实际构建仍使用 pnpm。脚本会检查
Node.js 22.12+、`py` 和 `pnpm`，自动安装 Web、Electron、PyInstaller 构建依赖，
随后构建前端、冻结 Python 后端并生成安装包。已经安装好依赖时，可跳过安装步骤：

```powershell
.\scripts\package-windows.ps1 -SkipInstall
```

产物位于 `dist\windows\CooParticlesAPI-Tools-<version>-Setup.exe`。安装包内含
Electron、预构建前端和冻结后的 Python 后端，目标电脑不需要安装 Python 或
Node.js。重复运行同一个安装包或安装更高版本时，会覆盖程序文件并保留用户数据。
项目、插件和缓存位于 `%LOCALAPPDATA%\CooParticlesAPITools`；Electron 偏好设置
和最近项目记录位于 `%APPDATA%\coo-particles-api-tools`。

修改发布版本号时，同时修改根目录 `package.json` 和
`apps/electron/package.json` 中的 `version`，例如从 `0.1.0` 改为 `0.2.0`：

```powershell
npm pkg set version=0.2.0
npm pkg set --prefix apps/electron version=0.2.0
.\scripts\package-windows.ps1 -SkipInstall
```

也可以直接编辑这两个 JSON 文件。`apps/electron/package.json` 的版本会自动用于
安装包文件名；不要修改 `build.appId`，否则 NSIS 可能把它识别成另一款应用，无法执行覆盖升级。

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

## Editor UI Components

Emitter、Composition 和 PointsBuilder 的编辑控件入口位于 `apps/web/src/components/`，共享 legacy 页面入口位于 `apps/web/public/legacy/assets/shared/`。

- `apps/web/src/components/NumericInput.vue`：Vue 数值、整数和 Long 输入入口。正文区域保持可编辑和可框选；只有右侧窄 rail 支持垂直 numeric scrubbing，表达式或空值时自动禁用。
- `apps/web/src/components/VectorInput.vue`：Vue Vec3、RelativeLocation、Vector3f 输入入口，固定使用横向三列；颜色模式提供调色板、HEX 输入和 RGB 通道。
- `apps/web/src/components/CollapsibleCard.vue`：Vue 卡片骨架入口，提供统一边界、header actions、键盘语义和展开/折叠动画。
- `CParticleForceEditor.vue`：GPU 粒子处理力编辑器；Emitter 的 CPU 粒子处理力仍由 `GeneratorPage.vue` 的命令队列分支承载。
- `CParticleMaskEditor.vue`、`CParticleResourceEditor.vue`：CParticle 掩码和资源编辑器。
- `apps/web/src/modules/theme/custom-select.js`：Vue shell 安装入口，负责加载并刷新共享选择框实现。
- `apps/web/public/legacy/assets/shared/js/custom-select.js`：legacy 与 Vue shell 共用的选择框和 legacy 数值增强入口。原生元素只作为值同步和无脚本回退契约保留；可见选择面板由主题化 listbox 接管，支持键盘操作、动态 DOM 刷新和展开动画。
- `apps/web/public/legacy/assets/shared/css/custom-select.css`：custom select、numeric scrubbing rail 的共享主题样式入口。

Vue 组件从对应文件直接导入；Vue shell 在 `apps/web/src/main.js` 中安装 shared custom-select。legacy 页面通过其页面入口脚本调用 `installCustomSelects()`，动态生成的控件由同一 MutationObserver 自动接管。

入口页面：

- Emitter：`apps/web/src/pages/GeneratorPage.vue`
- Composition：`apps/web/src/pages/CompositionBuilderPage.vue`，运行时加载 `apps/web/public/legacy/composition_builder.html`
- PointsBuilder：`apps/web/src/pages/PointsBuilderPage.vue`，运行时加载 `apps/web/public/legacy/pointsbuilder.html`

新增编辑字段时必须复用这些入口，并遵守仓库根目录 `AGENTS.md` 中的 UI 规则；业务页面不得直接新增可见原生 `<select>` 或 `<input type="number">`。

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
