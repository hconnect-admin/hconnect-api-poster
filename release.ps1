Set-Location $PSScriptRoot

# ── Read current version ─────────────────────────────────────────────────────
$pkgPath = Join-Path $PSScriptRoot "package.json"
$pkg     = Get-Content $pkgPath -Raw | ConvertFrom-Json
$current = $pkg.version

$parts = $current.Split(".")
$maj   = [int]$parts[0]
$min   = [int]$parts[1]
$pat   = [int]$parts[2]

# ── Guard: require a clean working tree ──────────────────────────────────────
$dirty = git status --porcelain 2>&1
if ($dirty) {
    Write-Host ""
    Write-Host "  Uncommitted changes detected — commit or stash them first." -ForegroundColor Red
    Write-Host ""
    git status --short
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

# ── Prompt: bump type ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │      hconnect API Client  — Release      │" -ForegroundColor Cyan
Write-Host "  └─────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Current version : $current" -ForegroundColor White
Write-Host ""
Write-Host "  Select version bump:" -ForegroundColor Yellow
Write-Host "    [1]  patch  →  $maj.$min.$($pat+1)   (bug fixes)"    -ForegroundColor Gray
Write-Host "    [2]  minor  →  $maj.$($min+1).0   (new features)" -ForegroundColor Gray
Write-Host "    [3]  major  →  $($maj+1).0.0   (breaking changes)" -ForegroundColor Gray
Write-Host "    [Q]  quit"
Write-Host ""

do {
    $choice = Read-Host "  Enter choice (1/2/3/Q)"
    switch ($choice.Trim().ToUpper()) {
        "1" { $Bump = "patch" }
        "2" { $Bump = "minor" }
        "3" { $Bump = "major" }
        "Q" { Write-Host "  Cancelled." -ForegroundColor Yellow; exit 0 }
        default { Write-Host "  Invalid — enter 1, 2, 3, or Q." -ForegroundColor Red; $Bump = $null }
    }
} while (-not $Bump)

# ── Calculate new version ────────────────────────────────────────────────────
switch ($Bump) {
    "major" { $maj++;          $min = 0; $pat = 0 }
    "minor" {                  $min++;   $pat = 0 }
    "patch" {                            $pat++   }
}

$newVersion = "$maj.$min.$pat"
$tag        = "v$newVersion"

Write-Host ""
Write-Host "  New version : $current  →  $newVersion  ($tag)" -ForegroundColor Cyan
Write-Host ""

# ── Confirm ──────────────────────────────────────────────────────────────────
$confirm = Read-Host "  Commit, tag, and push to GitHub? (Y/N)"
if ($confirm.Trim().ToUpper() -ne "Y") {
    Write-Host "  Cancelled." -ForegroundColor Yellow
    exit 0
}

# ── Update package.json ───────────────────────────────────────────────────────
$raw     = Get-Content $pkgPath -Raw
$updated = $raw -replace '("version":\s*")[^"]+(")', "`${1}$newVersion`${2}"
[System.IO.File]::WriteAllText($pkgPath, $updated)
Write-Host ""
Write-Host "  package.json updated" -ForegroundColor Green

# ── Commit, tag, push ────────────────────────────────────────────────────────
git add package.json
git commit -m "Release $tag"
if ($LASTEXITCODE -ne 0) { Write-Host "  git commit failed." -ForegroundColor Red; exit 1 }

git tag $tag

Write-Host "  Pushing to GitHub..." -ForegroundColor Yellow
git -c http.sslVerify=false push origin main --tags
if ($LASTEXITCODE -ne 0) { Write-Host "  git push failed." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Done! $tag pushed — GitHub Actions is building the installer." -ForegroundColor Green
Write-Host "  https://github.com/hconnect-admin/hconnect-api-poster/actions"  -ForegroundColor DarkCyan
Write-Host ""
