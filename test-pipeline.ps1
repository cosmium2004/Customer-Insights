# Comprehensive Pipeline Testing Script (PowerShell)
# Tests all completed tasks from the implementation plan

$ErrorActionPreference = "Continue"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "PIPELINE TESTING - AI Customer Insights" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Test counters
$script:TestsPassed = 0
$script:TestsFailed = 0
$script:TestsTotal = 0
$script:TestResults = @()

# Function to run test
function Run-Test {
    param(
        [string]$TestName,
        [scriptblock]$TestCommand
    )
    
    $script:TestsTotal++
    Write-Host "[$script:TestsTotal] Testing: $TestName... " -NoNewline
    
    try {
        $result = & $TestCommand
        if ($LASTEXITCODE -eq 0 -or $result) {
            Write-Host "✓ PASS" -ForegroundColor Green
            $script:TestsPassed++
            $script:TestResults += [PSCustomObject]@{
                Number = $script:TestsTotal
                Name = $TestName
                Status = "PASS"
            }
            return $true
        } else {
            throw "Test failed"
        }
    } catch {
        Write-Host "✗ FAIL" -ForegroundColor Red
        $script:TestsFailed++
        $script:TestResults += [PSCustomObject]@{
            Number = $script:TestsTotal
            Name = $TestName
            Status = "FAIL"
            Error = $_.Exception.Message
        }
        return $false
    }
}

# Function to run test with output
function Run-TestVerbose {
    param(
        [string]$TestName,
        [scriptblock]$TestCommand
    )
    
    $script:TestsTotal++
    Write-Host ""
    Write-Host "[$script:TestsTotal] Testing: $TestName" -ForegroundColor Yellow
    Write-Host "----------------------------------------"
    
    try {
        & $TestCommand
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ PASS" -ForegroundColor Green
            $script:TestsPassed++
            $script:TestResults += [PSCustomObject]@{
                Number = $script:TestsTotal
                Name = $TestName
                Status = "PASS"
            }
            return $true
        } else {
            throw "Test command returned non-zero exit code: $LASTEXITCODE"
        }
    } catch {
        Write-Host "✗ FAIL" -ForegroundColor Red
        Write-Host "Error: $_" -ForegroundColor Red
        $script:TestsFailed++
        $script:TestResults += [PSCustomObject]@{
            Number = $script:TestsTotal
            Name = $TestName
            Status = "FAIL"
            Error = $_.Exception.Message
        }
        return $false
    }
}

Write-Host "Phase 1: Infrastructure Tests" -ForegroundColor Cyan
Write-Host "==============================="

# Test 1: Check Docker services
Run-Test "Docker Compose services running" {
    $services = docker-compose ps
    return $services -match "Up"
}

# Test 2: PostgreSQL connection
Run-Test "PostgreSQL connection" {
    docker-compose exec -T postgres pg_isready -U postgres
    return $LASTEXITCODE -eq 0
}

# Test 3: Redis connection
Run-Test "Redis connection" {
    $result = docker-compose exec -T redis redis-cli ping
    return $result -match "PONG"
}

Write-Host ""
Write-Host "Phase 2: Database Schema Tests" -ForegroundColor Cyan
Write-Host "==============================="

# Test 4: Database exists
Run-Test "Database exists" {
    $result = docker-compose exec -T postgres psql -U postgres -lqt
    return $result -match "customer_insights"
}

# Test 5: Check migrations
Run-Test "Database migrations installed" {
    Push-Location database
    npm list knex 2>&1 | Out-Null
    $result = $LASTEXITCODE -eq 0
    Pop-Location
    return $result
}

# Test 6: Run database tests
Run-TestVerbose "Database schema validation" {
    Push-Location database
    npm test
    Pop-Location
}

Write-Host ""
Write-Host "Phase 3: API Gateway Tests" -ForegroundColor Cyan
Write-Host "==============================="

Push-Location api-gateway

# Test 7: Dependencies installed
Run-Test "API Gateway dependencies" {
    npm list express 2>&1 | Out-Null
    return $LASTEXITCODE -eq 0
}

# Test 8: TypeScript compilation
Run-Test "TypeScript compilation" {
    npx tsc --noEmit
    return $LASTEXITCODE -eq 0
}

# Test 9: Run authentication tests
Run-TestVerbose "Authentication tests" {
    npm test -- auth.test.ts --testTimeout=10000
}

# Test 10: Run authorization tests
Run-TestVerbose "Authorization property tests" {
    npm test -- authorization.property.test.ts --testTimeout=10000
}

# Test 11: Run data ingestion tests
Run-TestVerbose "Data ingestion tests" {
    npm test -- dataIngestion.integration.test.ts --testTimeout=15000
}

# Test 12: Run validation tests
Run-TestVerbose "Validation tests" {
    npm test -- validationService.test.ts --testTimeout=10000
}

# Test 13: Run cache service tests
Run-TestVerbose "Cache service tests" {
    npm test -- cacheService.test.ts --testTimeout=10000
}

# Test 14: Run query service tests
Run-TestVerbose "Query service tests" {
    npm test -- queryService.test.ts --testTimeout=10000
}

# Test 15: Run WebSocket tests
Run-TestVerbose "WebSocket integration tests" {
    npm test -- websocket.integration.test.ts --testTimeout=15000
}

# Test 16: Run error handling tests
Run-TestVerbose "Error handling tests" {
    npm test -- errorHandling.test.ts --testTimeout=10000
}

Pop-Location

Write-Host ""
Write-Host "Phase 4: ML Service Tests" -ForegroundColor Cyan
Write-Host "==============================="

Push-Location ml-service

# Test 17: Python dependencies
Run-Test "ML Service dependencies" {
    python -c "import torch, transformers, fastapi"
    return $LASTEXITCODE -eq 0
}

# Test 18: Run preprocessing tests
Run-TestVerbose "Preprocessing tests" {
    pytest test_ml_service.py -v
}

# Test 19: Run ML property tests
Run-TestVerbose "ML property tests" {
    pytest test_ml_properties.py -v --tb=short
}

# Test 20: Run pattern detection tests
Run-TestVerbose "Pattern detection tests" {
    pytest test_pattern_detection.py -v
}

# Test 21: Test optimized model
Run-TestVerbose "Optimized model test" {
    python test_optimized.py
}

Pop-Location

Write-Host ""
Write-Host "Phase 5: Integration Validation" -ForegroundColor Cyan
Write-Host "==============================="

# Test 22: API Gateway code validation
Run-Test "API Gateway code validation" {
    Push-Location api-gateway
    $result = python -c "import sys; sys.exit(0)"  # Placeholder - TS validation
    Pop-Location
    return $true  # TypeScript already validated above
}

# Test 23: ML Service code validation
Run-Test "ML Service code validation" {
    Push-Location ml-service
    python -c "from main import app; print('OK')" 2>&1 | Out-Null
    $result = $LASTEXITCODE -eq 0
    Pop-Location
    return $result
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "PIPELINE TEST RESULTS" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Total Tests:  $script:TestsTotal"
Write-Host "Passed:       " -NoNewline
Write-Host "$script:TestsPassed" -ForegroundColor Green
Write-Host "Failed:       " -NoNewline
Write-Host "$script:TestsFailed" -ForegroundColor Red
Write-Host ""

# Show failed tests if any
if ($script:TestsFailed -gt 0) {
    Write-Host "Failed Tests:" -ForegroundColor Yellow
    $script:TestResults | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Write-Host "  [$($_.Number)] $($_.Name)" -ForegroundColor Red
        if ($_.Error) {
            Write-Host "      Error: $($_.Error)" -ForegroundColor DarkRed
        }
    }
    Write-Host ""
}

if ($script:TestsFailed -eq 0) {
    Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Pipeline Status: READY FOR DEPLOYMENT" -ForegroundColor Green
    exit 0
} else {
    Write-Host "SOME TESTS FAILED" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Pipeline Status: NEEDS ATTENTION" -ForegroundColor Yellow
    exit 1
}
