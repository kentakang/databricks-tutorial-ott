[CmdletBinding()]
param(
    [switch]$SkipDoctor
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$gitRoot = (& git -C $repositoryRoot rev-parse --show-toplevel 2>$null).Trim()

if ($LASTEXITCODE -ne 0 -or -not $gitRoot) {
    throw "The bootstrap script must run from inside a Git worktree."
}

if (-not $SkipDoctor) {
    & (Join-Path $PSScriptRoot "doctor.ps1")
}

git -C $gitRoot config --local core.hooksPath .githooks
if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure the repository Git hooks path."
}

git -C $gitRoot config --local commit.template .gitmessage
if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure the repository commit message template."
}

$hooksPath = git -C $gitRoot config --local --get core.hooksPath
$commitTemplate = git -C $gitRoot config --local --get commit.template

if ($hooksPath -ne ".githooks" -or $commitTemplate -ne ".gitmessage") {
    throw "Git workflow configuration verification failed."
}

Write-Host "Repository Git hooks and commit template are enabled." -ForegroundColor Cyan
