# Push campus-ops to GitHub via git
# Usage: .\push.ps1 "commit message"
param([string]$Message = "Update campus-ops")

cd $PSScriptRoot
git add index.html
git commit -m $Message
git push origin main
Write-Host "✅ Push completed!" -ForegroundColor Green
