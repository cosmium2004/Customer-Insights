# Add Docker to PATH for current PowerShell session
# Run this script if Docker commands are not recognized

$dockerPath = "C:\Program Files\Docker\Docker\resources\bin"

if (Test-Path $dockerPath) {
    $env:Path += ";$dockerPath"
    Write-Host "✅ Docker added to PATH for this session" -ForegroundColor Green
    Write-Host "Docker version: $(docker --version)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "You can now run Docker commands like:" -ForegroundColor Yellow
    Write-Host "  docker compose up -d" -ForegroundColor White
    Write-Host "  docker ps" -ForegroundColor White
    Write-Host "  docker compose logs" -ForegroundColor White
} else {
    Write-Host "❌ Docker not found at expected location" -ForegroundColor Red
    Write-Host "Please ensure Docker Desktop is installed" -ForegroundColor Yellow
}
