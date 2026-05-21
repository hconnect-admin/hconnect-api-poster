@echo off
:: Guided release — prompts for version bump type, then commits/tags/pushes to GitHub.
:: GitHub Actions will build the NSIS installer and publish a Release automatically.

cd /d "%~dp0"
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0release.ps1"
pause
