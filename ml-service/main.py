from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from typing import Dict, List, Optional
import logging
import time

from sentiment_model import get_model, load_model_on_startup

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="ML Service",
    description="Machine Learning service for sentiment analysis and pattern detection",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # Frontend origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Startup event to load ML models
@app.on_event("startup")
async def startup_event():
    """Load ML models on application startup"""
    logger.info("Starting ML Service...")
    try:
        load_model_on_startup()
        logger.info("ML Service startup complete")
    except Exception as e:
        logger.error(f"Failed to load models on startup: {str(e)}")
        raise


# Pydantic models for request/response validation
class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: float


class PredictionRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to analyze for sentiment")
    model_type: str = Field(default="default", description="Model type to use for prediction")

    @field_validator('text')
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Text cannot be empty or whitespace only")
        return v


class SentimentScores(BaseModel):
    positive: float = Field(..., ge=0.0, le=1.0)
    negative: float = Field(..., ge=0.0, le=1.0)
    neutral: float = Field(..., ge=0.0, le=1.0)


class PredictionResponse(BaseModel):
    sentiment: str = Field(..., description="Sentiment label: positive, negative, or neutral")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    scores: SentimentScores
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


class BatchPredictionRequest(BaseModel):
    texts: List[str] = Field(..., min_length=1, max_length=100, description="List of texts to analyze")
    model_type: str = Field(default="default", description="Model type to use for prediction")

    @field_validator('texts')
    @classmethod
    def texts_not_empty(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("Texts list cannot be empty")
        for text in v:
            if not text or not text.strip():
                raise ValueError("All texts must be non-empty")
        return v


class BatchPredictionResponse(BaseModel):
    predictions: List[PredictionResponse]
    total_processing_time_ms: float


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    timestamp: float


# Error handling middleware
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.error(f"HTTP error: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error=exc.detail or "An error occurred",
            detail=str(exc.detail) if exc.detail else None,
            timestamp=time.time()
        ).model_dump()
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="Internal server error",
            detail="An unexpected error occurred",
            timestamp=time.time()
        ).model_dump()
    )


# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint to verify service is running"""
    return HealthResponse(
        status="ok",
        service="ml-service",
        timestamp=time.time()
    )


@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "ML Service",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "predict_sentiment": "/predict/sentiment",
            "batch_predict": "/predict/sentiment/batch"
        }
    }


@app.post("/predict/sentiment", response_model=PredictionResponse)
async def predict_sentiment(request: PredictionRequest):
    """
    Predict sentiment for a given text.
    
    Args:
        request: PredictionRequest with text and optional model_type
        
    Returns:
        PredictionResponse with sentiment, confidence, scores, and processing time
        
    Raises:
        HTTPException: 400 for empty text, 500 for prediction errors
    """
    try:
        # Validate text is not empty
        if not request.text or not request.text.strip():
            raise HTTPException(
                status_code=400,
                detail="Text cannot be empty or whitespace only"
            )
        
        # Get model instance
        model = get_model()
        
        if not model.is_loaded():
            raise HTTPException(
                status_code=503,
                detail="ML model is not loaded. Service is starting up."
            )
        
        # Call predict_sentiment_workflow
        result = model.predict_sentiment(request.text)
        
        # Return prediction response
        return PredictionResponse(
            sentiment=result['sentiment'],
            confidence=result['confidence'],
            scores=SentimentScores(**result['scores']),
            processing_time_ms=result['processing_time_ms']
        )
        
    except ValueError as e:
        # Validation errors
        logger.warning(f"Validation error in sentiment prediction: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        # Internal errors
        logger.error(f"Prediction error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}"
        )


@app.post("/predict/sentiment/batch", response_model=BatchPredictionResponse)
async def batch_predict_sentiment(request: BatchPredictionRequest):
    """
    Predict sentiment for multiple texts in batches.
    
    Processes predictions in batches of 32 for efficiency.
    
    Args:
        request: BatchPredictionRequest with list of texts and optional model_type
        
    Returns:
        BatchPredictionResponse with array of predictions and total processing time
        
    Raises:
        HTTPException: 400 for invalid input, 500 for prediction errors
    """
    try:
        # Validate texts list is not empty
        if not request.texts:
            raise HTTPException(
                status_code=400,
                detail="Texts list cannot be empty"
            )
        
        # Get model instance
        model = get_model()
        
        if not model.is_loaded():
            raise HTTPException(
                status_code=503,
                detail="ML model is not loaded. Service is starting up."
            )
        
        # Track total processing time
        start_time = time.time()
        
        # Process predictions in batches of 32
        results = model.batch_predict(request.texts, batch_size=32)
        
        # Calculate total processing time
        total_processing_time = (time.time() - start_time) * 1000  # Convert to ms
        
        # Convert results to PredictionResponse objects
        predictions = []
        for result in results:
            if 'error' in result:
                # Skip failed predictions or include with neutral sentiment
                logger.warning(f"Batch prediction error: {result.get('error')}")
            
            predictions.append(
                PredictionResponse(
                    sentiment=result['sentiment'],
                    confidence=result['confidence'],
                    scores=SentimentScores(**result['scores']),
                    processing_time_ms=result['processing_time_ms']
                )
            )
        
        logger.info(
            f"Batch prediction completed: {len(predictions)} texts processed "
            f"in {total_processing_time:.2f}ms"
        )
        
        return BatchPredictionResponse(
            predictions=predictions,
            total_processing_time_ms=total_processing_time
        )
        
    except ValueError as e:
        # Validation errors
        logger.warning(f"Validation error in batch prediction: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        # Internal errors
        logger.error(f"Batch prediction error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Batch prediction failed: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
