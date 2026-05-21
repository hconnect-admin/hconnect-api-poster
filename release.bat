@echo off
:: Release script — increments version, commits, tags, and pushes to GitHub.
:: GitHub Actions will build the NSIS installer and publish a Release automatically.
::
:: Usage:
::   release.bat           → patch bump (1.0.1 → 1.0.2)
::   release.bat minor     → minor bump (1.0.1 → 1.1.0)
::   release.bat major     → major bump (1.0.1 → 2.0.0)

cd /d "%~dp0"

if "%1"=="" (
    powershell -ExecutionPolicy Bypass -File "%~dp0release.ps1"
) else (
    powershell -ExecutionPolicy Bypass -File "%~dp0release.ps1" -Bump %1
)
