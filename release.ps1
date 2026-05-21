<#
.SYNOPSIS
    Bump version, commit, tag, and push to GitHub — triggers the GitHub Actions release build.

.PARAMETER Bump
    Which part of the version to increment: major, minor, or patch (default: patch)

.EXAMPLE
    .\release.ps1              # 1.0.1 → 1.0.2
    .\release.ps1 -Bump minor  # 1.0.1 → 1.1.0
    .\release.ps1 -Bump major  # 1.0.1 → 2.0.0
#>
param(
    [ValidateSet("major", "minor", "patch")]
    [string]$Bump = "patch"
)

Set-Location $PSScriptRoot

# ── Guard: require a clean working tree ──────────────────────────────────────
$dirty = git status --porcelain 2>&1
if ($dirty) {
    Write-Host ""
    Write-Host "ERROR: Uncommitted changes detected. Commit or stash them first." -ForegroundColor Red
    Write-Host ""
    git status --short
    exit 1
}

# ── Read current version from package.json ───────────────────────────────────
$pkgPath = Join-Path $PSScriptRoot "package.json"
$pkg     = Get-Content $pkgPath -Raw | ConvertFrom-Json
$current = $pkg.version

$parts = $current.Split(".")
$major = [int]$parts[0]
$minor = [int]$parts[1]
$patch = [int]$parts[2]

switch ($Bump) {
    "major" { $major++; $minor = 0; $patch = 0 }
    "minor" { $minor++;             $patch = 0 }
    "patch" {                       $patch++   }
}

$newVersion = "$major.$minor.$patch"
$tag        = "v$newVersion"

Write-Host ""
Write-Host "  Version : $current  →  $newVersion" -ForegroundColor Cyan
Write-Host "  Tag     : $tag"                      -ForegroundColor Cyan
Write-Host "  Bump    : $Bump"                     -ForegroundColor Cyan
Write-Host ""

# ── Update version in package.json (preserves file formatting) ───────────────
$raw     = Get-Content $pkgPath -Raw
$updated = $raw -replace '("version":\s*")[^"]+(")', "`${1}$newVersion`${2}"
[System.IO.File]::WriteAllText($pkgPath, $updated)

Write-Host "  package.json updated" -ForegroundColor Green

# ── Commit, tag, push ─────────────────────────────────────────────────────────
git add package.json
git commit -m "Release $tag"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git commit failed." -ForegroundColor Red
    exit 1
}

git tag $tag

Write-Host ""
Write-Host "  Pushing to GitHub (SSL verify disabled for corporate proxy)..." -ForegroundColor Yellow
git -c http.sslVerify=false push origin main --tags

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git push failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Released $tag — GitHub Actions build triggered." -ForegroundColor Green
Write-Host "  https://github.com/hconnect-admin/hconnect-api-poster/actions" -ForegroundColor DarkCyan
Write-Host ""
