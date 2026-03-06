"""Quick test of optimized model."""
from sentiment_model_optimized import SentimentModelOptimized
import time

print("Loading optimized model...")
m = SentimentModelOptimized()
start = time.time()
m.load_model()
load_time = time.time() - start
print(f"Load time: {load_time:.2f}s")

# Test prediction
print("\nTesting prediction...")
result = m.predict_sentiment("This is great!")
print(f"Prediction: {result['sentiment']} ({result['confidence']:.2f})")
print(f"Processing time: {result['processing_time_ms']:.2f}ms")

# Test a few more
test_texts = [
    "Terrible experience",
    "It's okay, nothing special",
    "Absolutely amazing product!"
]

print("\nTesting multiple predictions:")
for text in test_texts:
    result = m.predict_sentiment(text)
    print(f"  '{text[:30]}...' -> {result['sentiment']} ({result['processing_time_ms']:.0f}ms)")
