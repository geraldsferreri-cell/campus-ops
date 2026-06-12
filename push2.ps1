# Push all campus-ops changes to GitHub via git
# Usage: .\push2.ps1 "commit message"
param([string]$Message = "Update campus-ops (full)")

cd $PSScriptRoot
git add -A
git commit -m $Message
git push origin main
Write-Host "✅ Full push completed!" -ForegroundColor Green
