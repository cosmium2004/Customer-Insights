#!/usr/bin/env python3
"""
Quick test of optimized ML model in pipeline.
"""

import sys
import os

# Add ml-service to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'ml-service'))

print("="*60)
print("OPTIMIZED MODEL PIPELINE TEST")
print("="*60)
print()

# Test 1: Import optimized model
print("[1/5] Testing optimized model import... ", end="")
try:
    from sentiment_model_optimized import SentimentModelOptimized, get_optimized_model
    print("✓ PASS")
except Exception as e:
    print(f"✗ FAIL: {e}")
    sys.exit(1)

# Test 2: Initialize model
print("[2/5] Testing model initialization... ", end="")
try:
    model = SentimentModelOptimized()
    print("✓ PASS")
except Exception as e:
    print(f"✗ FAIL: {e}")
    sys.exit(1)

# Test 3: Load model
print("[3/5] Testing model loading (this may take a few seconds)... ", end="")
try:
    model.load_model()
    print("✓ PASS")
except Exception as e:
    print(f"✗ FAIL: {e}")
    sys.exit(1)

# Test 4: Single prediction
print("[4/5] Testing single prediction... ", end="")
try:
    result = model.predict_sentiment("This is a great product!")
    assert 'sentiment' in result
    assert 'confidence' in result
    assert 'processing_time_ms' in result
    print(f"✓ PASS ({result['sentiment']}, {result['processing_time_ms']:.0f}ms)")
except Exception as e:
    print(f"✗ FAIL: {e}")
    sys.exit(1)

# Test 5: Batch prediction
print("[5/5] Testing batch prediction... ", end="")
try:
    texts = [
        "Great service!",
        "Terrible experience.",
        "It's okay."
    ]
    results = model.batch_predict(texts, batch_size=16)
    assert len(results) == len(texts)
    avg_time = sum(r['processing_time_ms'] for r in results) / len(results)
    print(f"✓ PASS (avg {avg_time:.0f}ms)")
except Exception as e:
    print(f"✗ FAIL: {e}")
    sys.exit(1)

# Performance summary
print()
print("="*60)
print("PERFORMANCE SUMMARY")
print("="*60)
print(f"Model: {model.model_name}")
print(f"Device: {model.device}")
print(f"Max Length: {model.max_length}")
print(f"Quantization: {model.use_quantization}")
print()

# Test predictions with timing
test_cases = [
    "This is excellent!",
    "Very disappointed with the quality.",
    "Average product, nothing special.",
]

print("Sample Predictions:")
print("-" * 60)
total_time = 0
for text in test_cases:
    result = model.predict_sentiment(text)
    total_time += result['processing_time_ms']
    sla_status = "✓" if result['processing_time_ms'] < 500 else "⚠"
    print(f"{sla_status} '{text[:40]}...'")
    print(f"   → {result['sentiment']} ({result['confidence']:.2f}) - {result['processing_time_ms']:.0f}ms")

avg_time = total_time / len(test_cases)
print()
print(f"Average Time: {avg_time:.0f}ms")
print(f"SLA (500ms): {'✓ PASS' if avg_time < 500 else '⚠ NEAR MISS'}")
print()

if avg_time < 500:
    print("✓ ALL TESTS PASSED - Optimized model meets SLA!")
    sys.exit(0)
else:
    print("⚠ Tests passed but performance near SLA limit")
    print("  Consider GPU acceleration for production")
    sys.exit(0)
