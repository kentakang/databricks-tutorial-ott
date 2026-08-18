[CmdletBinding()]
param(
    [switch]$SkipDatabricksAuth
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$failures = 0

function Test-RequiredCommand {
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        Write-Host "[missing] $Name" -ForegroundColor Red
        $script:failures += 1
        return $null
    }

    $output = @(& $Name @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
    $summary = ($output | Out-String).Trim()

    if ($exitCode -ne 0) {
        Write-Host "[failed]  $Name ($exitCode)" -ForegroundColor Red
        if ($summary) {
            Write-Host $summary
        }
        $script:failures += 1
        return $null
    }

    $firstLine = ($summary -split "`r?`n")[0]
    Write-Host "[ok]      $Name - $firstLine" -ForegroundColor Green
    return $summary
}

function Test-OptionalCommand {
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "[optional] $Name is not installed" -ForegroundColor Yellow
        return
    }

    $output = @(& $Name @Arguments 2>&1)
    $summary = ($output | Out-String).Trim()
    $firstLine = ($summary -split "`r?`n")[0]
    Write-Host "[ok]      $Name - $firstLine" -ForegroundColor Green
}

Write-Host "Checking Databricks App development tools..." -ForegroundColor Cyan

$null = Test-RequiredCommand -Name "git" -Arguments @("--version")
$databricksVersion = Test-RequiredCommand -Name "databricks" -Arguments @("version")
$null = Test-RequiredCommand -Name "uv" -Arguments @("--version")
$null = Test-RequiredCommand -Name "node" -Arguments @("--version")
$null = Test-RequiredCommand -Name "npm" -Arguments @("--version")
$null = Test-RequiredCommand -Name "npx" -Arguments @("--version")
Test-OptionalCommand -Name "docker" -Arguments @("--version")

if ($databricksVersion) {
    $appsHelp = @(& databricks apps --help 2>&1) | Out-String
    $requiredAppCommands = @("init", "run-local", "validate", "deploy")
    $missingAppCommands = @($requiredAppCommands | Where-Object { $appsHelp -notmatch "(?m)^\s+$([regex]::Escape($_))\s" })

    if ($missingAppCommands.Count -gt 0) {
        Write-Host "[failed]  Databricks CLI is missing app commands: $($missingAppCommands -join ', ')" -ForegroundColor Red
        $failures += 1
    }
    else {
        Write-Host "[ok]      Databricks App CLI commands are available" -ForegroundColor Green
    }
}

if (-not $SkipDatabricksAuth -and $databricksVersion) {
    $profilesOutput = @(& databricks auth profiles 2>&1) | Out-String
    if ($LASTEXITCODE -eq 0 -and $profilesOutput -match "(?m)\sYES\s*$") {
        Write-Host "[ok]      At least one valid Databricks authentication profile is available" -ForegroundColor Green
    }
    else {
        Write-Host "[warning] No valid Databricks authentication profile was detected" -ForegroundColor Yellow
        Write-Host "          Run: databricks auth login --host https://<workspace-host>"
    }
}

$context7Config = Join-Path $PSScriptRoot "..\.codex\config.toml"
if (Test-Path -LiteralPath $context7Config) {
    Write-Host "[ok]      Project-scoped Codex MCP configuration exists" -ForegroundColor Green
}
else {
    Write-Host "[failed]  .codex/config.toml is missing" -ForegroundColor Red
    $failures += 1
}

if ($failures -gt 0) {
    throw "Development environment check failed with $failures error(s)."
}

Write-Host "Development environment is ready." -ForegroundColor Cyan
