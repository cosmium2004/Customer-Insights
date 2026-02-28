# ML Service - Sentiment Analysis

This is the Python-based Machine Learning service for the AI-Powered Customer Insights Platform. It provides sentiment analysis capabilities using pre-trained transformer models.

## Features

- **FastAPI Application**: RESTful API with automatic OpenAPI documentation
- **Sentiment Analysis**: Analyzes text and returns sentiment (positive, negative, neutral) with confidence scores
- **Text Preprocessing**: Normalizes text, replaces URLs, emails, and numbers with tokens
- **Batch Processing**: Supports batch predictions for multiple texts (batch size: 32)
- **Performance Monitoring**: Tracks processing time and logs warnings if SLA (500ms) is exceeded
- **Error Handling**: Comprehensive error handling with appropriate HTTP status codes
- **CORS Support**: Configured for frontend integration

## Architecture

### Components

1. **main.py**: FastAPI application with endpoints and middleware
2. **sentiment_model.py**: ML model wrapper for sentiment prediction
3. **preprocessing.py**: Text preprocessing utilities

### Endpoints

- `GET /health`: Health check endpoint
- `GET /`: Service information and available endpoints
- `POST /predict/sentiment`: Single text sentiment prediction
- `POST /predict/sentiment/batch`: Batch sentiment prediction

## API Usage

### Single Prediction

```bash
curl -X POST "http://localhost:8000/predict/sentiment" \
  -H "Content-Type: application/json" \
  -d '{"text": "This product is amazing!"}'
```

Response:
```json
{
  "sentiment": "positive",
  "confidence": 0.9876,
  "scores": {
    "positive": 0.9876,
    "negative": 0.0062,
    "neutral": 0.0062
  },
  "processing_time_ms": 145.23
}
```

### Batch Prediction

```bash
curl -X POST "http://localhost:8000/predict/sentiment/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "texts": [
      "I love this!",
      "This is terrible",
      "It is okay"
    ]
  }'
```

Response:
```json
{
  "predictions": [
    {
      "sentiment": "positive",
      "confidence": 0.95,
      "scores": {"positive": 0.95, "negative": 0.03, "neutral": 0.02},
      "processing_time_ms": 120.5
    },
    {
      "sentiment": "negative",
      "confidence": 0.92,
      "scores": {"positive": 0.04, "negative": 0.92, "neutral": 0.04},
      "processing_time_ms": 118.3
    },
    {
      "sentiment": "neutral",
      "confidence": 0.78,
      "scores": {"positive": 0.11, "negative": 0.11, "neutral": 0.78},
      "processing_time_ms": 115.7
    }
  ],
  "total_processing_time_ms": 354.5
}
```

## Text Preprocessing

The service applies the following preprocessing steps:

1. **Lowercase conversion**: All text is converted to lowercase
2. **URL replacement**: URLs are replaced with `[URL]` token
3. **Email replacement**: Email addresses are replaced with `[EMAIL]` token
4. **Number replacement**: Numbers are replaced with `[NUM]` token
5. **Special character removal**: Special characters (except punctuation) are removed
6. **Whitespace normalization**: Multiple spaces are normalized to single spaces

Example:
```
Input:  "Check out https://example.com! Contact: test@email.com. Price: $99.99"
Output: "check out [URL] contact [EMAIL] price $[NUM]"
```

## Model Information

- **Default Model**: `distilbert-base-uncased-finetuned-sst-2-english`
- **Framework**: Hugging Face Transformers + PyTorch
- **Max Input Length**: 512 tokens
- **Recommended Text Length**: < 1000 characters for 500ms SLA

## Performance

- **Target SLA**: < 500ms for texts under 1000 characters
- **Batch Processing**: Processes up to 32 texts per batch
- **GPU Support**: Automatically uses GPU if available (CUDA)
- **Warning Logging**: Logs warnings when processing exceeds 500ms

## Requirements

### Production Dependencies
- fastapi==0.100.0
- uvicorn[standard]==0.23.0
- pydantic==2.0.0
- torch==2.0.0
- transformers==4.30.0
- scikit-learn==1.3.0
- numpy==1.24.0
- pandas==2.0.0
- redis==4.6.0
- prometheus-client==0.17.0
- sentry-sdk==1.28.0
- nltk==3.8.0

### Development Dependencies
- pytest==7.4.0
- pytest-asyncio==0.21.0
- hypothesis==6.82.0
- black==23.7.0
- flake8==6.0.0
- mypy==1.4.0

## Installation

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
pip install -r requirements-dev.txt  # For development
```

3. Download model (first run will download automatically):
```bash
python -c "from transformers import AutoTokenizer, AutoModelForSequenceClassification; AutoTokenizer.from_pretrained('distilbert-base-uncased-finetuned-sst-2-english'); AutoModelForSequenceClassification.from_pretrained('distilbert-base-uncased-finetuned-sst-2-english')"
```

## Running the Service

### Development
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Production
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Docker
```bash
docker build -t ml-service .
docker run -p 8000:8000 ml-service
```

## Testing

Run tests:
```bash
pytest test_basic.py -v
```

Run with coverage:
```bash
pytest --cov=. --cov-report=html
```

## API Documentation

Once the service is running, access:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## Error Handling

The service returns appropriate HTTP status codes:

- **200**: Success
- **400**: Bad Request (empty text, invalid input)
- **500**: Internal Server Error (prediction failure)
- **503**: Service Unavailable (model not loaded)

## Logging

The service logs:
- Startup events and model loading
- Prediction requests and results
- Warnings when processing exceeds 500ms SLA
- Errors with full stack traces

## Integration with API Gateway

The ML service is called by the Node.js API Gateway for:
1. Real-time sentiment analysis during data ingestion
2. On-demand sentiment predictions via API endpoints
3. Batch processing for historical data analysis

## Future Enhancements

- [ ] Model caching with Redis
- [ ] Multiple model support (different languages, domains)
- [ ] A/B testing for model versions
- [ ] Prometheus metrics export
- [ ] Rate limiting
- [ ] Authentication/authorization
- [ ] Pattern detection endpoints
- [ ] Customer behavior analysis

## Requirements Validation

This implementation satisfies the following requirements:

- **Requirement 3.1**: Predictions return within 500ms for text under 1000 characters
- **Requirement 3.2**: Returns sentiment scores for positive, negative, and neutral
- **Requirement 3.3**: Scores are between 0 and 1
- **Requirement 3.4**: Scores sum to approximately 1.0
- **Requirement 3.5**: Confidence equals highest sentiment score
- **Requirement 3.6**: Text is converted to lowercase and whitespace normalized
- **Requirement 3.7**: URLs replaced with [URL] token
- **Requirement 3.8**: Email addresses replaced with [EMAIL] token
- **Requirement 3.9**: Numbers replaced with [NUM] token
- **Requirement 3.10**: Pre-trained models loaded on startup
- **Requirement 3.11**: Warnings logged when processing exceeds 500ms
- **Requirement 15.7**: Batch prediction endpoint implemented
- **Requirement 15.8**: Batch processing with batch size of 32

## License

Part of the AI-Powered Customer Insights Platform.
