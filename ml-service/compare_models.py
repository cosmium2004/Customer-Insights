"""
Compare original vs optimized model performance.
"""

import time
import statistics
from sentiment_model import SentimentModel
from sentiment_model_optimized import SentimentModelOptimized


TEST_TEXTS = [
    "Great product!",
    "I really enjoyed using this product. The quality is excellent.",
    "This is terrible. Very disappointed with the service.",
    "Not sure how I feel about this. It's okay I guess.",
    "Absolutely fantastic! Exceeded all my expectations. Highly recommend!"
]


def benchmark_model(model, name: str, iterations: int = 5):
    """Benchmark a model with test texts."""
    print(f"\n{'='*60}")
    print(f"Benchmarking: {name}")
    print(f"{'='*60}")
    
    all_times = []
    
    for text in TEST_TEXTS:
        times = []
        for _ in range(iterations):
            result = model.predict_sentiment(text)
            times.append(result['processing_time_ms'])
        
        avg_time = statistics.mean(times)
        all_times.extend(times)
        print(f"Text ({len(text):3d} chars): {avg_time:6.2f}ms avg")
    
    print(f"\nOverall Statistics:")
    print(f"  Mean:   {statistics.mean(all_times):6.2f}ms")
    print(f"  Median: {statistics.median(all_times):6.2f}ms")
    print(f"  Min:    {min(all_times):6.2f}ms")
    print(f"  Max:    {max(all_times):6.2f}ms")
    print(f"  StdDev: {statistics.stdev(all_times):6.2f}ms")
    
    return statistics.mean(all_times)


def main():
    print("Loading models...")
    
    # Load original model
    print("\n1. Loading original model...")
    original = SentimentModel()
    original.load_model()
    
    # Load optimized model
    print("\n2. Loading optimized model...")
    optimized = SentimentModelOptimized()
    optimized.load_model()
    
    # Benchmark both
    original_time = benchmark_model(original, "Original Model")
    optimized_time = benchmark_model(optimized, "Optimized Model")
    
    # Calculate improvement
    improvement = ((original_time - optimized_time) / original_time) * 100
    speedup = original_time / optimized_time
    
    print(f"\n{'='*60}")
    print("COMPARISON RESULTS")
    print(f"{'='*60}")
    print(f"Original Model:  {original_time:6.2f}ms average")
    print(f"Optimized Model: {optimized_time:6.2f}ms average")
    print(f"\nImprovement: {improvement:5.1f}% faster")
    print(f"Speedup:     {speedup:5.2f}x")
    
    if optimized_time < 500:
        print(f"\n✓ Optimized model meets 500ms SLA!")
    else:
        print(f"\n⚠️  Optimized model still exceeds 500ms SLA")
        print(f"   Consider enabling GPU or using a smaller model")


if __name__ == "__main__":
    main()
