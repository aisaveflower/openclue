param(
  [string]$Tag = "latest",
  [switch]$PrepareOnly
)

$ErrorActionPreference = "Stop"
$distRoot = Join-Path $PSScriptRoot "packages\cli\dist"
$packRoot = Join-Path $distRoot "_manual-packed"

if (-not (Test-Path -LiteralPath $distRoot)) { throw "Build output not found: $distRoot" }

$platformPackages = Get-ChildItem -LiteralPath $distRoot -Directory |
  Where-Object { $_.Name -like "openclue-*" } |
  Sort-Object Name
if (-not $platformPackages) { throw "No OpenClue platform packages found. Run the CLI build first." }

New-Item -ItemType Directory -Force -Path $packRoot | Out-Null
$versions = @($platformPackages | ForEach-Object {
  (Get-Content -Raw -LiteralPath (Join-Path $_.FullName "package.json") | ConvertFrom-Json).version
} | Select-Object -Unique)
if ($versions.Count -ne 1) { throw "Platform package versions do not match." }

$optionalDependencies = [ordered]@{}
foreach ($directory in $platformPackages) {
  $platformManifest = Get-Content -Raw -LiteralPath (Join-Path $directory.FullName "package.json") | ConvertFrom-Json
  $optionalDependencies[$platformManifest.name] = if ($PrepareOnly) {
    "file:../$($directory.Name)"
  } else {
    $platformManifest.version
  }
}

$wrapper = Join-Path $distRoot "openclue"
$wrapperBin = Join-Path $wrapper "bin"
New-Item -ItemType Directory -Force -Path $wrapperBin | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "packages\cli\script\postinstall.mjs") -Destination (Join-Path $wrapper "postinstall.mjs") -Force
if ($PrepareOnly) {
  $localArch = if ($env:PROCESSOR_ARCHITECTURE -eq "AMD64") { "x64" } else { $env:PROCESSOR_ARCHITECTURE.ToLowerInvariant() }
  $localBinary = Join-Path $distRoot "openclue-windows-$localArch\bin\openclue.exe"
  if (-not (Test-Path -LiteralPath $localBinary)) { throw "Local OpenClue binary not found: $localBinary" }
  Copy-Item -LiteralPath $localBinary -Destination (Join-Path $wrapperBin "openclue.exe") -Force
} else {
  Set-Content -LiteralPath (Join-Path $wrapperBin "openclue.exe") -Value "OpenClue postinstall has not run." -Encoding Ascii
}
$wrapperManifest = [ordered]@{
  name = "openclue"
  version = $versions[0]
  description = "Autonomous parallel multi-agent coding CLI based on OpenCode"
  license = "MIT"
  repository = [ordered]@{ type = "git"; url = "git+https://github.com/aisaveflower/openclue.git" }
  bin = [ordered]@{ openclue = "./bin/openclue.exe" }
  os = @("darwin", "linux", "win32")
  cpu = @("arm64", "x64")
  optionalDependencies = $optionalDependencies
}
if (-not $PrepareOnly) { $wrapperManifest.scripts = [ordered]@{ postinstall = "node ./postinstall.mjs" } }
$wrapperJson = $wrapperManifest | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $wrapper "package.json"), $wrapperJson, [Text.UTF8Encoding]::new($false))

$packages = @($platformPackages.FullName)
$packages += $wrapper

if ($PrepareOnly) {
  Write-Host "Prepared local OpenClue npm packages in $distRoot" -ForegroundColor Green
  exit 0
}

npm whoami | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in to npm. Opening the npm login flow..."
  npm login
  if ($LASTEXITCODE -ne 0) { throw "npm login failed" }
}

foreach ($packageRoot in $packages) {
  $manifestPath = Join-Path $packageRoot "package.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Missing package manifest: $manifestPath" }
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $spec = "$($manifest.name)@$($manifest.version)"

  npm view $spec version --silent 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "SKIP  $spec (already published)" -ForegroundColor DarkGray
    continue
  }

  Write-Host "PACK  $spec" -ForegroundColor Cyan
  $tarball = npm pack $packageRoot --ignore-scripts --silent --pack-destination $packRoot | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0 -or -not $tarball) { throw "Packing failed: $spec" }

  Write-Host "PUBLISH $spec" -ForegroundColor Yellow
  npm publish (Join-Path $packRoot $tarball) --ignore-scripts --access public --tag $Tag --provenance=false
  if ($LASTEXITCODE -ne 0) { throw "Publishing failed: $spec" }
  Write-Host "DONE  $spec" -ForegroundColor Green
}

Write-Host "All available OpenClue npm packages are published." -ForegroundColor Green
