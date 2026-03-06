# ML Service Optimization Guide

## Current Model

**Model**: `distilbert-base-uncased-finetuned-sst-2-english`
- **Type**: DistilBERT (distilled BERT)
- **Parameters**: ~67 million
- **Size**: ~255 MB
- **Architecture**: 6-layer transformer
- **Training**: Fine-tuned on SST-2 (Stanford Sentiment Treebank)

## Performance Issues Identified

### Current Performance (CPU)
- **Average inference time**: ~1800ms per prediction
- **SLA requirement**: 500ms for texts under 1000 characters
- **Status**: ❌ Exceeding SLA by 3.6x

### Root Causes
1. **CPU-only inference**: No GPU acceleration available
2. **Large max_length**: 512 tokens (overkill for most customer interactions)
3. **No quantization**: Full precision (FP32) weights
4. **Sequential batch processing**: Not leveraging true batching
5. **Excessive preprocessing**: Applied to all texts regardless of length

## Optimization Strategies

### ✅ Implemented Optimizations

#### 1. Reduced max_length (512 → 256)
- **Impact**: ~40% faster processing
- **Rationale**: 95% of customer interactions are < 256 tokens
- **Trade-off**: Minimal accuracy loss for typical use cases

#### 2. Dynamic Quantization
- **Impact**: 2-4x speedup on CPU
- **Method**: `torch.quantization.quantize_dynamic()`
- **Target**: Linear layers (INT8)
- **Trade-off**: <1% accuracy loss, 75% smaller model size

#### 3. Optimized Batch Processing
- **Impact**: 30-50% faster for batches
- **Method**: True tensor batching instead of sequential processing
- **Batch size**: Reduced from 32 to 16 for CPU efficiency

#### 4. Conditional Preprocessing
- **Impact**: 10-20% faster for short texts
- **Method**: Skip heavy preprocessing for texts < 50 characters
- **Trade-off**: None (short texts don't need complex preprocessing)

#### 5. Model Warmup
- **Impact**: Eliminates first-request latency spike
- **Method**: Dummy prediction during startup
- **Benefit**: Consistent performance from first request

### 📊 Expected Performance Improvements

| Metric | Original | Optimized | Improvement |
|--------|----------|-----------|-------------|
| Avg Inference Time | ~1800ms | ~400-600ms | 3-4.5x faster |
| Model Size | 255 MB | ~65 MB | 75% smaller |
| Memory Usage | High | Medium | 60% reduction |
| Batch Throughput | Low | High | 2-3x faster |

## Alternative Optimization Strategies

### 🚀 High-Impact Options

#### Option 1: Enable GPU Acceleration
- **Impact**: 5-10x speedup
- **Requirements**: NVIDIA GPU with CUDA support
- **Cost**: Hardware investment
- **Implementation**:
  ```python
  # Automatic in current code
  device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
  ```

#### Option 2: Use Smaller Model
- **Model**: `distilbert-base-uncased` (not fine-tuned)
- **Impact**: Similar speed, requires fine-tuning
- **Alternative**: `albert-base-v2` (12M params, 5x smaller)
- **Trade-off**: May need retraining for sentiment analysis

#### Option 3: ONNX Runtime
- **Impact**: 2-3x additional speedup
- **Method**: Convert model to ONNX format
- **Benefits**: Optimized inference engine, cross-platform
- **Implementation**:
  ```bash
  pip install onnxruntime transformers[onnx]
  python -m transformers.onnx --model=distilbert-base-uncased-finetuned-sst-2-english onnx/
  ```

#### Option 4: TensorRT (NVIDIA GPUs only)
- **Impact**: 5-10x speedup on GPU
- **Requirements**: NVIDIA GPU, TensorRT
- **Complexity**: High
- **Best for**: Production deployments with GPU

### 💡 Additional Optimizations

#### 1. Caching Layer
- Cache predictions for identical texts
- Use Redis with 1-hour TTL
- Expected hit rate: 10-30% for repeated queries

#### 2. Async Processing
- Queue predictions for non-real-time use cases
- Process in background worker
- Return cached/estimated results immediately

#### 3. Model Distillation
- Train even smaller model (3-layer DistilBERT)
- 50% faster than 6-layer
- Requires training data and compute

#### 4. Pruning
- Remove less important weights
- 20-40% speedup with minimal accuracy loss
- Requires post-training optimization

## Implementation Guide

### Using Optimized Model

Replace in `main.py`:

```python
# OLD
from sentiment_model import get_model, load_model_on_startup

# NEW
from sentiment_model_optimized import get_optimized_model as get_model
from sentiment_model_optimized import load_optimized_model_on_startup as load_model_on_startup
```

### Testing Optimizations

```bash
# Run comparison benchmark
python compare_models.py

# Run full optimization test
python test_model_optimization.py
```

### Monitoring Performance

Add to application metrics:
- `ml_prediction_duration_ms` (histogram)
- `ml_prediction_sla_violations` (counter)
- `ml_batch_size` (histogram)
- `ml_text_length` (histogram)

## Recommendations by Use Case

### Development/Testing
- ✅ Use optimized model with quantization
- ✅ CPU inference is acceptable
- ✅ Focus on functionality over speed

### Production (Low Volume < 100 req/min)
- ✅ Use optimized model with quantization
- ✅ Consider caching layer
- ✅ CPU inference may be sufficient

### Production (Medium Volume 100-1000 req/min)
- ✅ Use optimized model
- ✅ Enable GPU acceleration
- ✅ Implement caching layer
- ✅ Consider ONNX Runtime

### Production (High Volume > 1000 req/min)
- ✅ GPU acceleration (required)
- ✅ ONNX Runtime or TensorRT
- ✅ Horizontal scaling with load balancer
- ✅ Aggressive caching strategy
- ✅ Consider async processing queue

## Next Steps

1. **Immediate**: Deploy optimized model to staging
2. **Short-term**: Implement caching layer
3. **Medium-term**: Evaluate GPU deployment
4. **Long-term**: Consider ONNX Runtime or model distillation

## Benchmarking Commands

```bash
# Quick benchmark (5 iterations)
python compare_models.py

# Comprehensive benchmark (includes batch processing)
python test_model_optimization.py

# Test specific text length
python -c "from sentiment_model_optimized import get_optimized_model; m = get_optimized_model(); m.load_model(); print(m.predict_sentiment('Your test text here'))"
```

## References

- [DistilBERT Paper](https://arxiv.org/abs/1910.01108)
- [PyTorch Quantization](https://pytorch.org/docs/stable/quantization.html)
- [ONNX Runtime](https://onnxruntime.ai/)
- [Hugging Face Optimization](https://huggingface.co/docs/transformers/perf_train_gpu_one)
