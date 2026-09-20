param(
  [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"
$distRoot = Join-Path $PSScriptRoot "packages\opencode\dist"
$packRoot = Join-Path $distRoot "_manual-packed"
$packages = @(
  "openclue-linux-arm64",
  "openclue-linux-x64",
  "openclue-linux-x64-baseline",
  "openclue-linux-arm64-musl",
  "openclue-linux-x64-musl",
  "openclue-linux-x64-baseline-musl",
  "openclue-darwin-arm64",
  "openclue-darwin-x64",
  "openclue-darwin-x64-baseline",
  "openclue-windows-arm64",
  "openclue-windows-x64",
  "openclue-windows-x64-baseline",
  "openclue"
)

if (-not (Test-Path -LiteralPath $distRoot)) {
  throw "Build output not found: $distRoot"
}

npm whoami | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in to npm. Opening the npm login flow..."
  npm login
  if ($LASTEXITCODE -ne 0) {
    throw "npm login failed"
  }
}

New-Item -ItemType Directory -Force -Path $packRoot | Out-Null

foreach ($directory in $packages) {
  $packageRoot = Join-Path $distRoot $directory
  $manifestPath = Join-Path $packageRoot "package.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Missing package manifest: $manifestPath"
  }

  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $spec = "$($manifest.name)@$($manifest.version)"

  npm view $spec version --silent 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "SKIP  $spec (already published)" -ForegroundColor DarkGray
    continue
  }

  Write-Host "PACK  $spec" -ForegroundColor Cyan
  $tarball = npm pack $packageRoot --ignore-scripts --silent --pack-destination $packRoot | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0 -or -not $tarball) {
    throw "Packing failed: $spec"
  }

  $tarballPath = Join-Path $packRoot $tarball
  Write-Host "PUBLISH $spec" -ForegroundColor Yellow
  npm publish $tarballPath --ignore-scripts --access public --tag $Tag --provenance=false
  if ($LASTEXITCODE -ne 0) {
    throw "Publishing failed: $spec"
  }

  Write-Host "DONE  $spec" -ForegroundColor Green
}

Write-Host "All OpenClue npm packages are published." -ForegroundColor Green
