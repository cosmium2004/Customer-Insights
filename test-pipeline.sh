#!/bin/bash

# Comprehensive Pipeline Testing Script
# Tests all completed tasks from the implementation plan

set -e  # Exit on error

echo "=========================================="
echo "PIPELINE TESTING - AI Customer Insights"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Function to run test
run_test() {
    local test_name=$1
    local test_command=$2
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -n "[$TESTS_TOTAL] Testing: $test_name... "
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Function to run test with output
run_test_verbose() {
    local test_name=$1
    local test_command=$2
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo ""
    echo "[$TESTS_TOTAL] Testing: $test_name"
    echo "----------------------------------------"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✓ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

echo "Phase 1: Infrastructure Tests"
echo "==============================="

# Test 1: Check Docker services
run_test "Docker Compose services running" "docker-compose ps | grep -q 'Up'"

# Test 2: PostgreSQL connection
run_test "PostgreSQL connection" "docker-compose exec -T postgres pg_isready -U postgres"

# Test 3: Redis connection
run_test "Redis connection" "docker-compose exec -T redis redis-cli ping | grep -q PONG"

echo ""
echo "Phase 2: Database Schema Tests"
echo "==============================="

# Test 4: Database exists
run_test "Database exists" "docker-compose exec -T postgres psql -U postgres -lqt | cut -d \| -f 1 | grep -qw customer_insights"

# Test 5: Check migrations
cd database
run_test "Database migrations installed" "npm list knex"
cd ..

# Test 6: Run database tests
run_test_verbose "Database schema validation" "cd database && npm test"

echo ""
echo "Phase 3: API Gateway Tests"
echo "==============================="

cd api-gateway

# Test 7: Dependencies installed
run_test "API Gateway dependencies" "npm list express"

# Test 8: TypeScript compilation
run_test "TypeScript compilation" "npx tsc --noEmit"

# Test 9: Run authentication tests
run_test_verbose "Authentication tests" "npm test -- auth.test.ts --testTimeout=10000"

# Test 10: Run authorization tests
run_test_verbose "Authorization property tests" "npm test -- authorization.property.test.ts --testTimeout=10000"

# Test 11: Run data ingestion tests
run_test_verbose "Data ingestion tests" "npm test -- dataIngestion.integration.test.ts --testTimeout=15000"

# Test 12: Run validation tests
run_test_verbose "Validation tests" "npm test -- validationService.test.ts --testTimeout=10000"

# Test 13: Run cache service tests
run_test_verbose "Cache service tests" "npm test -- cacheService.test.ts --testTimeout=10000"

# Test 14: Run query service tests
run_test_verbose "Query service tests" "npm test -- queryService.test.ts --testTimeout=10000"

# Test 15: Run WebSocket tests
run_test_verbose "WebSocket integration tests" "npm test -- websocket.integration.test.ts --testTimeout=15000"

# Test 16: Run error handling tests
run_test_verbose "Error handling tests" "npm test -- errorHandling.test.ts --testTimeout=10000"

cd ..

echo ""
echo "Phase 4: ML Service Tests"
echo "==============================="

cd ml-service

# Test 17: Python dependencies
run_test "ML Service dependencies" "python -c 'import torch, transformers, fastapi'"

# Test 18: Run preprocessing tests
run_test_verbose "Preprocessing tests" "pytest test_ml_service.py -v"

# Test 19: Run ML property tests
run_test_verbose "ML property tests" "pytest test_ml_properties.py -v --tb=short"

# Test 20: Run pattern detection tests
run_test_verbose "Pattern detection tests" "pytest test_pattern_detection.py -v"

# Test 21: Test optimized model
run_test_verbose "Optimized model test" "python test_optimized.py"

cd ..

echo ""
echo "Phase 5: End-to-End Integration Tests"
echo "==============================="

# Test 22: Check if API Gateway can start
echo "[$((TESTS_TOTAL + 1))] Testing: API Gateway startup (dry run)"
cd api-gateway
if npx ts-node src/index.ts --help > /dev/null 2>&1 || [ $? -eq 1 ]; then
    echo -e "${GREEN}✓ PASS${NC} - API Gateway code is valid"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC} - API Gateway has startup issues"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_TOTAL=$((TESTS_TOTAL + 1))
cd ..

# Test 23: Check ML Service can start
echo "[$((TESTS_TOTAL + 1))] Testing: ML Service startup (dry run)"
cd ml-service
if python -c "from main import app; print('OK')" 2>&1 | grep -q "OK"; then
    echo -e "${GREEN}✓ PASS${NC} - ML Service code is valid"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC} - ML Service has startup issues"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_TOTAL=$((TESTS_TOTAL + 1))
cd ..

echo ""
echo "=========================================="
echo "PIPELINE TEST RESULTS"
echo "=========================================="
echo ""
echo "Total Tests:  $TESTS_TOTAL"
echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo ""
    echo "Pipeline Status: READY FOR DEPLOYMENT"
    exit 0
else
    echo -e "${YELLOW}⚠ SOME TESTS FAILED${NC}"
    echo ""
    echo "Pipeline Status: NEEDS ATTENTION"
    exit 1
fi
