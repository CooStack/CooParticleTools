param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$electronRoot = Join-Path $repoRoot "apps\electron"
$webRoot = Join-Path $repoRoot "apps\web"
$pythonCommand = Get-Command py -ErrorAction SilentlyContinue
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue

if (-not $pythonCommand) {
  throw "Python launcher 'py' was not found. Install Python 3.10+ first."
}

$pythonVersion = [version](& $pythonCommand.Source -c "import sys; print('.'.join(map(str, sys.version_info[:3])))")
if ($pythonVersion -lt [version]"3.10.0") {
  throw "Python 3.10 or newer is required. Current version: $pythonVersion"
}

if (-not $nodeCommand) {
  throw "Node.js was not found. Install Node.js 22.12 or newer."
}

$nodeVersion = [version](& $nodeCommand.Source -p "process.versions.node")
if ($nodeVersion -lt [version]"22.12.0") {
  throw "Node.js 22.12 or newer is required. Current version: $nodeVersion"
}

if (-not $pnpmCommand) {
  throw "pnpm was not found. Install Node.js, then run: corepack enable"
}
$packageManager = $pnpmCommand.Source

$requiredFiles = @(
  (Join-Path $webRoot "package.json"),
  (Join-Path $electronRoot "package.json")
)
foreach ($requiredFile in $requiredFiles) {
  if (-not (Test-Path $requiredFile)) {
    throw "Required project file was not found: $requiredFile"
  }
}

if (-not $SkipInstall) {
  Write-Host "[package-windows] Installing frontend dependencies..."
  & $packageManager --dir $webRoot install
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend dependency installation failed with exit code $LASTEXITCODE."
  }

  Write-Host "[package-windows] Installing Electron build dependencies..."
  & $packageManager --dir $electronRoot install
  if ($LASTEXITCODE -ne 0) {
    throw "Electron dependency installation failed with exit code $LASTEXITCODE."
  }

  Write-Host "[package-windows] Installing Python build dependencies..."
  & $pythonCommand.Source -m pip install -r (Join-Path $repoRoot "requirements-build.txt")
  if ($LASTEXITCODE -ne 0) {
    throw "Python build dependency installation failed with exit code $LASTEXITCODE."
  }
} else {
  $requiredDependencies = @(
    (Join-Path $webRoot "node_modules\vite\package.json"),
    (Join-Path $electronRoot "node_modules\electron\package.json"),
    (Join-Path $electronRoot "node_modules\electron-builder\package.json")
  )
  foreach ($requiredDependency in $requiredDependencies) {
    if (-not (Test-Path $requiredDependency)) {
      throw "Build dependency is missing: $requiredDependency. Run without -SkipInstall first."
    }
  }
}

$electronPackage = Get-Content (Join-Path $electronRoot "package.json") -Raw | ConvertFrom-Json
$artifactName = "CooParticlesAPI-Tools-$($electronPackage.version)-Setup.exe"
$artifact = Join-Path $repoRoot "dist\windows\$artifactName"
$buildStartedAt = Get-Date

& $pythonCommand.Source -m PyInstaller --version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller is not installed. Run: py -m pip install -r requirements-build.txt"
}

Write-Host "[package-windows] Building the NSIS installer..."
& $packageManager --dir $electronRoot run dist:win
if ($LASTEXITCODE -ne 0) {
  throw "Windows packaging failed with exit code $LASTEXITCODE."
}

if (Test-Path $artifact) {
  $artifactInfo = Get-Item $artifact
  if ($artifactInfo.LastWriteTime -lt $buildStartedAt.AddSeconds(-2)) {
    throw "The installer was not refreshed by this build: $artifact"
  }
  Write-Host "[package-windows] Installer ready: $artifact"
} else {
  throw "Packaging completed, but the installer was not found at $artifact."
}
