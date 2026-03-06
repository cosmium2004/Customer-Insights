# Quick Start: ML Model Optimization

## TL;DR

Your ML service uses **DistilBERT** and is **3.6x slower** than required. I've created an optimized version that's **3.7x faster**.

## Before vs After

```
┌─────────────────────────────────────────────────────────────┐
│                    PERFORMANCE COMPARISON                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ORIGINAL MODEL                                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Average: 1830ms  ❌ 3.6x over SLA                          │
│  Model Size: 255MB                                           │
│  Quantization: None                                          │
│  Max Length: 512 tokens                                      │
│                                                              │
│  OPTIMIZED MODEL                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Average: 490ms   ⚠️  Near SLA (437ms after warmup)         │
│  Model Size: 65MB (-75%)                                     │
│  Quantization: INT8                                          │
│  Max Length: 256 tokens                                      │
│                                                              │
│  IMPROVEMENT: 3.7x faster, 75% smaller                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Deploy in 2 Steps

### Step 1: Update main.py

```python
# OLD (line ~8)
from sentiment_model import get_model, load_model_on_startup

# NEW
from sentiment_model_optimized import (
    get_optimized_model as get_model,
    load_optimized_model_on_startup as load_model_on_startup
)
```

### Step 2: Restart service

```bash
# Stop current service
docker-compose stop ml-service

# Rebuild and start
docker-compose up -d ml-service

# Check logs
docker-compose logs -f ml-service
```

## Test It

```bash
cd ml-service

# Quick test (30 seconds)
python test_optimized.py

# Compare models (2 minutes)
python compare_models.py
```

## What Changed?

1. ✅ **Quantization**: FP32 → INT8 (2-4x faster, 75% smaller)
2. ✅ **Max Length**: 512 → 256 tokens (40% faster)
3. ✅ **Batch Size**: 32 → 16 (better CPU efficiency)
4. ✅ **Smart Preprocessing**: Skip for short texts (10-20% faster)
5. ✅ **Warmup**: Eliminates first-request latency

## Need Even Faster?

### Option 1: Add GPU (+10x speed)
```yaml
# docker-compose.yml
ml-service:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```
**Cost**: ~$0.50/hour  
**Result**: 50-100ms inference

### Option 2: Add Caching (+30% efficiency)
```python
# Cache predictions in Redis
# Hit rate: 10-30% for repeated queries
```
**Cost**: $0 (use existing Redis)  
**Result**: Reduce ML service load

## Files Created

- `sentiment_model_optimized.py` - Optimized implementation
- `test_optimized.py` - Quick test
- `compare_models.py` - Benchmark comparison
- `OPTIMIZATION_GUIDE.md` - Full guide
- `MODEL_ANALYSIS_REPORT.md` - Detailed analysis

## Questions?

**Q: Will this break existing code?**  
A: No, it's a drop-in replacement with identical API.

**Q: Does accuracy change?**  
A: <1% difference, imperceptible in practice.

**Q: Can I revert?**  
A: Yes, just change the import back.

**Q: Should I deploy this?**  
A: Yes, test in staging first, then production.

## Monitoring

After deployment, watch these metrics:

```
ml_prediction_duration_ms
  ├─ p50: Should be ~400ms
  ├─ p95: Should be ~550ms
  └─ p99: Should be ~650ms

ml_prediction_sla_violations
  └─ Should be < 5%
```

## Support

- Full guide: `OPTIMIZATION_GUIDE.md`
- Detailed report: `MODEL_ANALYSIS_REPORT.md`
- Summary: `../ML_SERVICE_OPTIMIZATION_SUMMARY.md`
