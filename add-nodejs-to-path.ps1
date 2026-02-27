# Script to permanently add Node.js to system PATH
# Run this in PowerShell as Administrator

$nodePath = "C:\Program Files\nodejs"

# Get current system PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")

# Check if Node.js path is already in PATH
if ($currentPath -notlike "*$nodePath*") {
    # Add Node.js to PATH
    $newPath = $currentPath + ";" + $nodePath
    [Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")
    Write-Host "Node.js has been added to system PATH successfully!" -ForegroundColor Green
    Write-Host "Please restart PowerShell for changes to take effect." -ForegroundColor Yellow
} else {
    Write-Host "Node.js is already in system PATH." -ForegroundColor Green
}
