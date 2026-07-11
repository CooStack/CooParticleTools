param(
  [string]$WebRoot = "",
  [string]$BlogsRoot = "",
  [string]$Python = "py",
  [string]$Node = "",
  [int]$Port = 0,
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$electronRoot = Join-Path $repoRoot "apps\electron"
if (-not $WebRoot) {
  $WebRoot = Join-Path $repoRoot "apps\web"
}
if (-not (Test-Path (Join-Path $WebRoot "package.json"))) {
  throw "Web app root was not found: $WebRoot"
}

$codexRuntimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$codexNode = Join-Path $codexRuntimeRoot "node\bin\node.exe"
$codexPnpm = Join-Path $codexRuntimeRoot "bin\pnpm.cmd"

if (-not $Node -and (Test-Path $codexNode)) {
  $Node = $codexNode
}
if ($Node) {
  $nodePath = Resolve-Path $Node
  $env:PATH = "$(Split-Path $nodePath);$env:PATH"
}

$packageManager = Get-Command npm -ErrorAction SilentlyContinue
if (-not $packageManager) {
  $packageManager = Get-Command pnpm -ErrorAction SilentlyContinue
}
if (-not $packageManager -and (Test-Path $codexPnpm)) {
  $packageManager = Get-Item $codexPnpm
}
if (-not $packageManager) {
  throw "Neither npm nor pnpm was found. Install Node.js first, or pass -Node C:\Path\To\node.exe and make npm/pnpm available."
}
$packageManagerPath = if ($packageManager.Source) { $packageManager.Source } else { $packageManager.FullName }

if (-not (Test-Path (Join-Path $electronRoot "node_modules\electron"))) {
  Push-Location $electronRoot
  try {
    & $packageManagerPath install
  } finally {
    Pop-Location
  }
}

$env:COO_PARTICLES_WEB_ROOT = (Resolve-Path $WebRoot)
if ($BlogsRoot) {
  $env:COO_PARTICLES_BLOGS_ROOT = $BlogsRoot
} else {
  Remove-Item Env:\COO_PARTICLES_BLOGS_ROOT -ErrorAction SilentlyContinue
}
$env:COO_PARTICLES_PYTHON = $Python
if ($Node) {
  $env:COO_PARTICLES_NODE = $Node
}
if ($Port -gt 0) {
  $env:COO_PARTICLES_PORT = [string]$Port
}
if ($Rebuild) {
  $webVite = Join-Path $WebRoot "node_modules\vite\bin\vite.js"
  if (-not (Test-Path $webVite)) {
    Push-Location $WebRoot
    try {
      & $packageManagerPath install
    } finally {
      Pop-Location
    }
  }
  $env:COO_PARTICLES_REBUILD = "1"
} else {
  Remove-Item Env:\COO_PARTICLES_REBUILD -ErrorAction SilentlyContinue
}

Push-Location $electronRoot
try {
  & $packageManagerPath run ensure
  & $packageManagerPath run dev
} finally {
  Pop-Location
}
