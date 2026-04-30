param(
  [switch]$SkipBuild,
  [string]$EnvFile = ".deploy.env"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

function Import-DotEnv([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }

  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith("#")) { continue }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { continue }
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Require-Env([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    Fail "Missing $Name in .deploy.env"
  }
  return $value.Trim()
}

$envPath = Join-Path $repoRoot $EnvFile
Import-DotEnv $envPath

$deployHost = Require-Env "DEPLOY_HOST"
$deployUser = Require-Env "DEPLOY_USER"
$deployPath = Require-Env "DEPLOY_PATH"
$distPath = Join-Path $repoRoot "dist"

if (-not $SkipBuild) {
  Write-Step "Build dist"
  npm run build
  if ($LASTEXITCODE -ne 0) {
    Fail "npm run build failed"
  }
}

if (-not (Test-Path -LiteralPath $distPath)) {
  Fail "dist directory not found"
}

[Environment]::SetEnvironmentVariable("LOCAL_DIST", $distPath, "Process")

Write-Step "Deploy dist to ${deployUser}@${deployHost}:$deployPath"
python (Join-Path $PSScriptRoot 'deploy_via_paramiko.py')
if ($LASTEXITCODE -ne 0) {
  Fail "Deploy failed"
}

Write-Host "Deploy completed: ${deployUser}@${deployHost}:$deployPath" -ForegroundColor Green
